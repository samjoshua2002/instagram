'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://instagram-ai-bot-64tf.onrender.com';

const STORAGE_NODES_KEY = 'chatter_social_nodes_v8';
const STORAGE_CONFIG_KEY = 'chatter_persona_config_v8';
const STORAGE_DELETED_KEY = 'chatter_deleted_names_v2';

// Fields whose server-side change must reach the screen on the next background sync
const SYNC_COMPARE_FIELDS = [
  'id', 'name', 'handle', 'senderId', 'profilePic', 'category', 'relationship', 'dob', 'age', 'gender', 'personalNotes',
  'chatsCount', 'reelsCount', 'aiEnabled', 'replyToMessages', 'replyToReelsAndPosts', 'roastiness', 'greetingStyle',
];

// Auth endpoints that answer 401 for a wrong code/password, not for an expired session
const AUTH_401_EXEMPT = [
  '/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/passkey/login-',
  '/api/auth/oneauth',
];

/** Full URL string for a fetch() input: string, URL or Request. */
function fetchInputUrl(input) {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.href;
  if (input && typeof input.url === 'string') return input.url;
  return '';
}

/** Parsed URL when the request goes to our own API server, else null (never send the JWT elsewhere). */
function apiRequestUrl(input) {
  try {
    const target = new URL(fetchInputUrl(input), window.location.href);
    const base = new URL(API_BASE, window.location.href);
    if (target.origin !== base.origin) return null;
    const basePath = base.pathname.replace(/\/+$/, '');
    if (basePath && target.pathname !== basePath && !target.pathname.startsWith(`${basePath}/`)) return null;
    return target;
  } catch {
    return null;
  }
}

function withoutPhoto(record) {
  if (Array.isArray(record)) return record.map(withoutPhoto);
  return record && typeof record === 'object' && record.profilePicUrl ? { ...record, profilePicUrl: '' } : record;
}

/** Saves a user record (or list of them); if storage is full (big photo), saves it without the photo. */
export function storeUserRecord(key, record) {
  try {
    localStorage.setItem(key, JSON.stringify(record));
    return true;
  } catch (e) {
    try {
      localStorage.setItem(key, JSON.stringify(withoutPhoto(record)));
      return true;
    } catch (e2) {
      return false;
    }
  }
}

export function getStorageNodesKey(u) {
  const uid = u?._id || u?.id || u?.username;
  return uid ? `chatter_social_nodes_${uid}` : STORAGE_NODES_KEY;
}

export function getStorageConfigKey(u) {
  const uid = u?._id || u?.id || u?.username;
  return uid ? `chatter_persona_config_${uid}` : STORAGE_CONFIG_KEY;
}

export function getRootNode(user) {
  const name = user ? `${user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : (user.username || 'Account Owner')}` : 'Account Owner';
  const handle = user?.instagramUsername ? (user.instagramUsername.startsWith('@') ? user.instagramUsername : `@${user.instagramUsername}`) : (user?.username ? `@${user.username}` : '@me');
  return {
    id: 'root',
    name,
    handle,
    sub: user?.role === 'superadmin' ? 'Superadmin Platform Owner' : (user?.accountType === 'business' ? 'Business Account' : 'Creator / Core Node'),
    profilePic: user?.profilePicUrl || '',
    isRoot: true,
    relationship: 'Root Persona',
    children: []
  };
}

export const ROOT_NODE = getRootNode(null);

export const DEFAULT_GRAPH_DATA = [ROOT_NODE];

export function deduplicateNodes(nodesList) {
  if (!Array.isArray(nodesList) || nodesList.length === 0) return DEFAULT_GRAPH_DATA;

  const root = nodesList.find(n => n.isRoot) || DEFAULT_GRAPH_DATA[0];
  const listWithoutRoot = nodesList.filter(n => !n.isRoot);

  const merged = [];

  for (const node of listWithoutRoot) {
    const rawName = (node.name || '').trim();
    if (!rawName) continue;

    const cleanSenderId = (node.senderId || '').trim();
    const cleanHandle = (node.handle || '').replace(/^@/, '').toLowerCase().trim();
    const cleanNameLower = rawName.toLowerCase();

    // Find any existing node in merged that matches authoritatively
    const existingIndex = merged.findIndex(m => {
      // 1. Authoritative Sender ID match
      if (cleanSenderId && m.senderId && m.senderId.trim() === cleanSenderId) return true;
      // 2. Authoritative Instagram Handle match
      const mHandle = (m.handle || '').replace(/^@/, '').toLowerCase().trim();
      if (cleanHandle && mHandle && cleanHandle === mHandle) return true;
      // 3. Exact name match
      const mName = (m.name || '').toLowerCase().trim();
      if (cleanNameLower && mName && cleanNameLower === mName) return true;
      return false;
    });

    if (existingIndex === -1) {
      merged.push({ ...node });
    } else {
      const existing = merged[existingIndex];
      // Keep the updated/more specific name
      if (node.name && node.name.trim() && node.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
        existing.name = node.name.trim();
        existing.id = existing.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      }
      // Merge best non-empty attributes
      if (!existing.handle && node.handle) existing.handle = node.handle;
      if (!existing.senderId && node.senderId) existing.senderId = node.senderId;
      if (!existing.profilePic && node.profilePic) existing.profilePic = node.profilePic;
      if (!existing.dob && (node.dob || node.dateOfBirth)) existing.dob = node.dob || node.dateOfBirth;
      if (!existing.category && node.category) existing.category = node.category;
      if (node.personalNotes && (!existing.personalNotes || node.personalNotes.length > existing.personalNotes.length)) {
        existing.personalNotes = node.personalNotes;
      }
      if (typeof node.aiEnabled === 'boolean') existing.aiEnabled = node.aiEnabled;
      if (typeof node.replyToMessages === 'boolean') existing.replyToMessages = node.replyToMessages;
      if (typeof node.replyToReelsAndPosts === 'boolean') existing.replyToReelsAndPosts = node.replyToReelsAndPosts;
      if (typeof node.chatsCount === 'number') existing.chatsCount = node.chatsCount;
      if (typeof node.reelsCount === 'number') existing.reelsCount = node.reelsCount;
      if (typeof node.messageCount === 'number') existing.messageCount = node.messageCount;

      // Merge facts
      const factSet = new Set([...(existing.facts || []), ...(node.facts || [])]);
      existing.facts = Array.from(factSet);

      // Merge lore
      const loreSet = new Set([...(existing.lore || []), ...(node.lore || [])]);
      existing.lore = Array.from(loreSet);

      // Merge connections
      const connTargets = new Set((existing.connections || []).map(c => (c.targetName || '').toLowerCase()));
      (node.connections || []).forEach(c => {
        if (c.targetName && !connTargets.has(c.targetName.toLowerCase())) {
          existing.connections.push(c);
          connTargets.add(c.targetName.toLowerCase());
        }
      });
    }
  }

  const result = [root, ...merged];
  root.children = result.filter(n => !n.isRoot).map(n => n.id);
  return result;
}

const AppContext = createContext(null);

/** Stable function identity that always runs the latest render's version (no stale state). */
function useLatestCallback(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args) => ref.current(...args), []);
}

export function AppProvider({ children }) {
  const [nodes, setNodes] = useState(DEFAULT_GRAPH_DATA);
  const [isSyncingInitial, setIsSyncingInitial] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        // Nodes are cached under a per-user key, so read the same key the app writes
        const cachedUser = JSON.parse(localStorage.getItem('chatter_user_profile') || localStorage.getItem('chatter_remembered_account') || 'null');
        const cached = localStorage.getItem(getStorageNodesKey(cachedUser));
        if (cached && JSON.parse(cached)?.length > 1) return false;
      } catch (e) { }
    }
    return true;
  });
  // Old builds kept an ever-growing list of deleted names here that nothing read; clear it once
  useEffect(() => {
    try { localStorage.removeItem(STORAGE_DELETED_KEY); } catch (e) { }
  }, []);
  // Track names that were saved locally but not yet confirmed by server (prevent sync overwrite)
  const pendingSavedNamesRef = useRef(new Set());
  const lastRoutingEditTimeRef = useRef(0);
  const activeRoutingSavesRef = useRef(0);
  const routingSaveQueueRef = useRef(Promise.resolve());
  const [selectedNode, setSelectedNode] = useState(null);

  // Authentication & Session State
  const [token, setToken] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chatter_jwt_token') || null;
    }
    return null;
  });
  const [user, setUser] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('chatter_user_profile') || localStorage.getItem('chatter_remembered_account');
        return cached ? JSON.parse(cached) : null;
      } catch { return null; }
    }
    return null;
  });
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const [authLoading, setAuthLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      const hasToken = !!localStorage.getItem('chatter_jwt_token');
      const hasUser = !!(localStorage.getItem('chatter_user_profile') || localStorage.getItem('chatter_remembered_account'));
      // If we already have token and user, do NOT block the UI with a full-screen authenticating screen
      return hasToken && !hasUser;
    }
    return false;
  });
  const [isPasskeyModalOpen, setIsPasskeyModalOpen] = useState(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const openOnboardingWizard = useCallback(() => setIsOnboardingModalOpen(true), []);
  const [adminSession, setAdminSession] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('chatter_admin_session');
        return stored ? JSON.parse(stored) : null;
      } catch { return null; }
    }
    return null;
  });
  const isImpersonating = !!adminSession;

  const [routingConfig, setRoutingConfigState] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const currentUser = JSON.parse(localStorage.getItem('chatter_user_profile') || localStorage.getItem('chatter_remembered_account') || 'null');
        const configKey = getStorageConfigKey(currentUser);
        const cached = localStorage.getItem(configKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.chatMode) return parsed;
        }
      } catch (e) { }
    }
    return {
      chatMode: 'everyone',
      excludedContactIds: [],
      includedContactIds: [],
      globalBotActive: true
    };
  });

  const setRoutingConfig = useCallback((updater) => {
    lastRoutingEditTimeRef.current = Date.now();
    setRoutingConfigState(updater);
  }, []);
  // Toast stack: newest last, max 3 visible; each closes itself (errors stay longer)
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  // AI Interview Modal State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState(null);

  // Link Instagram ID Modal State
  const [linkingTargetPerson, setLinkingTargetPerson] = useState(null);

  const dismissToast = useCallback((id) => {
    setToasts(list => list.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((msg, type = 'info', opts = {}) => {
    if (!msg) return;
    const text = String(msg).replace(/[🌀-🧿☀-⛿✀-➿]/gu, '').trim();
    const id = ++toastIdRef.current;
    setToasts(list => {
      // Same message already showing: replace it instead of stacking a copy
      const rest = list.filter(t => t.text !== text);
      return [...rest, { id, text, type, action: opts.action || null }].slice(-3);
    });
    const ms = opts.duration ?? (type === 'error' ? 6000 : 4000);
    if (ms > 0) setTimeout(() => dismissToast(id), ms);
    return id;
  }, [dismissToast]);

  const login = useCallback((jwtToken, userData) => {
    try { localStorage.setItem('chatter_jwt_token', jwtToken); } catch (e) { }
    if (userData) {
      try {
        storeUserRecord('chatter_user_profile', userData);
        storeUserRecord('chatter_remembered_account', userData);

        let saved = [];
        try {
          const stored = localStorage.getItem('chatter_saved_accounts');
          if (stored) saved = JSON.parse(stored);
          if (!Array.isArray(saved)) saved = [];
        } catch (e) { }

        const isConnected = Boolean(userData.hasInstagramToken || userData.isInstagramConnected || userData.instagramPageAccessToken);
        const record = {
          ...userData,
          email: userData.email,
          username: userData.username,
          role: userData.role || 'user',
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          profilePicUrl: userData.profilePicUrl || '',
          hasPasskeys: userData.hasPasskeys ?? true,
          hasInstagramToken: isConnected,
          isInstagramConnected: isConnected,
          instagramUsername: userData.instagramUsername || '',
          instagramAccountId: userData.instagramAccountId || userData.instagramId || '',
          instagramPageAccessToken: undefined, // never keep the Instagram token in browser storage
          lastUsed: Date.now(),
        };
        const filtered = saved.filter(a => a.email !== record.email && a.username !== record.username);
        filtered.unshift(record);
        storeUserRecord('chatter_saved_accounts', filtered);
      } catch (e) { }
    }
    try {
      sessionStorage.setItem('chatter_session_active', 'true');
      localStorage.removeItem('chatter_show_chooser');
      localStorage.removeItem(STORAGE_NODES_KEY);
      localStorage.removeItem(STORAGE_CONFIG_KEY);
      if (typeof sessionStorage !== 'undefined' && userData?._id) {
        sessionStorage.removeItem(`chatter_onboarding_dismissed_${userData._id}`);
        sessionStorage.removeItem('chatter_onboarding_dismissed');
      }
    } catch (e) { }
    setNodes([getRootNode(userData)]);
    setToken(jwtToken);
    setUser(userData);
    setAuthLoading(false);
    showToast?.(`Welcome back, ${userData?.firstName || userData?.username || 'User'}!`, 'success');
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.location.href = '/';
    }
  }, [showToast]);

  const switchAccount = useCallback(() => {
    localStorage.removeItem('chatter_jwt_token');
    localStorage.removeItem('chatter_user_profile');
    localStorage.removeItem('chatter_remembered_account');
    try {
      sessionStorage.removeItem('chatter_session_active');
      localStorage.setItem('chatter_show_chooser', 'true');
      localStorage.removeItem(STORAGE_NODES_KEY);
      localStorage.removeItem(STORAGE_CONFIG_KEY);
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('chatter_persona_cached') || k.startsWith('chatter_social_nodes_') || k.startsWith('chatter_persona_config_')) {
          localStorage.removeItem(k);
        }
      });
      if (typeof sessionStorage !== 'undefined') {
        Object.keys(sessionStorage).forEach(k => {
          if (k.startsWith('chatter_onboarding_dismissed')) sessionStorage.removeItem(k);
        });
      }
    } catch (e) { }
    setNodes(DEFAULT_GRAPH_DATA);
    setToken(null);
    setUser(null);
    setRoutingConfigState({
      chatMode: 'everyone',
      excludedContactIds: [],
      includedContactIds: [],
      globalBotActive: true
    });
    showToast?.('Switching account...', 'info');
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.location.href = '/';
    }
  }, [showToast]);

  // opts.expired: the server said the session is no longer valid (401)
  const logout = useCallback((opts) => {
    const expired = opts?.expired === true;
    localStorage.removeItem('chatter_jwt_token');
    localStorage.removeItem('chatter_user_profile');
    localStorage.removeItem('chatter_remembered_account');
    try {
      localStorage.removeItem('chatter_admin_session');
      localStorage.removeItem(STORAGE_DELETED_KEY);
      sessionStorage.removeItem('chatter_session_active');
      localStorage.removeItem('chatter_show_chooser');
      localStorage.removeItem(STORAGE_NODES_KEY);
      localStorage.removeItem(STORAGE_CONFIG_KEY);
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('chatter_persona_cached') || k.startsWith('chatter_social_nodes_') || k.startsWith('chatter_persona_config_')) {
          localStorage.removeItem(k);
        }
      });
      if (typeof sessionStorage !== 'undefined') {
        Object.keys(sessionStorage).forEach(k => {
          if (k.startsWith('chatter_onboarding_dismissed')) sessionStorage.removeItem(k);
        });
      }
    } catch (e) { }
    setNodes(DEFAULT_GRAPH_DATA);
    setAdminSession(null);
    setToken(null);
    setUser(null);
    setRoutingConfigState({
      chatMode: 'everyone',
      excludedContactIds: [],
      includedContactIds: [],
      globalBotActive: true
    });
    if (expired) {
      showToast?.('Your session expired. Please sign in again.', 'error');
    } else {
      showToast?.('Signed out successfully.', 'info');
    }
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      // The page reload would drop the toast, so show it again after the redirect
      if (expired) {
        try { sessionStorage.setItem('chatter_session_expired', '1'); } catch (e) { }
      }
      window.location.href = '/';
    }
  }, [showToast]);

  // Session-expired note carried over a redirect by logout({ expired: true })
  useEffect(() => {
    try {
      if (sessionStorage.getItem('chatter_session_expired')) {
        sessionStorage.removeItem('chatter_session_expired');
        showToast('Your session expired. Please sign in again.', 'error');
      }
    } catch (e) { }
  }, [showToast]);

  // The fetch interceptor is installed once, so it reads logout through a ref
  const logoutRef = useRef(logout);
  useEffect(() => { logoutRef.current = logout; }, [logout]);
  // Many requests can fail with 401 at once: sign out only once per session
  const sessionExpiredRef = useRef(false);
  useEffect(() => { if (token) sessionExpiredRef.current = false; }, [token]);

  const enterWorkspace = useCallback((creatorToken, creatorUser) => {
    if (typeof window !== 'undefined') {
      if (!adminSession && user?.role === 'superadmin') {
        const sessionRecord = { token, user };
        localStorage.setItem('chatter_admin_session', JSON.stringify(sessionRecord));
        setAdminSession(sessionRecord);
      }
      try {
        localStorage.removeItem(STORAGE_NODES_KEY);
        localStorage.removeItem(STORAGE_CONFIG_KEY);
      } catch (e) { }
      setNodes([getRootNode(creatorUser)]);
      localStorage.setItem('chatter_jwt_token', creatorToken);
      storeUserRecord('chatter_user_profile', creatorUser);
      setToken(creatorToken);
      setUser(creatorUser);
      showToast?.(`Switched to workspace: @${creatorUser.instagramUsername || creatorUser.username}`, 'success');
      window.location.href = '/';
    }
  }, [adminSession, token, user, showToast]);

  const exitWorkspace = useCallback(() => {
    if (typeof window !== 'undefined') {
      let savedSession = adminSession;
      if (!savedSession) {
        try {
          const raw = localStorage.getItem('chatter_admin_session');
          if (raw) savedSession = JSON.parse(raw);
        } catch { }
      }
      if (savedSession) {
        localStorage.setItem('chatter_jwt_token', savedSession.token);
        storeUserRecord('chatter_user_profile', savedSession.user);
        localStorage.removeItem('chatter_admin_session');
        setToken(savedSession.token);
        setUser(savedSession.user);
        setAdminSession(null);
        showToast?.('Returned to Platform Superadmin Console', 'info');
        window.location.href = '/';
      }
    }
  }, [adminSession, showToast]);

  const updateUserProfile = useCallback((updatedUser) => {
    setUser(prev => ({ ...prev, ...updatedUser }));
  }, []);

  // Feature Store (PLAN.md §4): mode + toggles that drive the nav and the reply pipeline
  const [workspaceFeatures, setWorkspaceFeatures] = useState(null);
  const [workspaceFeaturesError, setWorkspaceFeaturesError] = useState(false);
  const [featuresReloadKey, setFeaturesReloadKey] = useState(0);
  const reloadWorkspaceFeatures = useCallback(() => setFeaturesReloadKey(k => k + 1), []);
  const isPureSuperadminUser = user?.role === 'superadmin' && !adminSession;

  useEffect(() => {
    if (!token || !(user?._id || user?.id) || isPureSuperadminUser) {
      setWorkspaceFeatures(null);
      return;
    }
    let cancelled = false;
    setWorkspaceFeaturesError(false);
    fetch(`${API_BASE}/api/workspace/features`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('load failed'))))
      .then(data => { if (!cancelled) setWorkspaceFeatures(data); })
      .catch(() => { if (!cancelled) setWorkspaceFeaturesError(true); });
    return () => { cancelled = true; };
  }, [API_BASE, token, user?._id, user?.id, isPureSuperadminUser, featuresReloadKey]);

  /** PUT a partial change ({ activeMode } or { enabledFeatures: { key: bool } }); returns true on success. */
  const updateWorkspaceFeatures = useCallback(async (changes) => {
    try {
      const res = await fetch(`${API_BASE}/api/workspace/features`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(changes),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save workspace features');
      setWorkspaceFeatures(prev => ({ ...prev, ...data }));
      if (data.accountType) setUser(prev => (prev ? { ...prev, accountType: data.accountType } : prev));
      return true;
    } catch (err) {
      showToast?.(err.message || 'Could not save workspace features', 'error');
      return false;
    }
  }, [API_BASE, token, showToast]);

  // Intercept window.fetch to automatically attach Bearer token and check on load
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch;
    // Every request gets a time limit, so a slow or dropped mobile connection
    // can never leave a button spinning forever. Uploads get longer.
    window.fetch = async (url, options = {}) => {
      const storedToken = localStorage.getItem('chatter_jwt_token');
      let opts = options || {};
      // Only our own API gets the session token; third parties (Giphy, avatars...) never see it
      const apiUrl = apiRequestUrl(url);
      if (storedToken && apiUrl) {
        const baseHeaders = opts.headers || (typeof Request !== 'undefined' && url instanceof Request ? url.headers : {});
        const headers = new Headers(baseHeaders);
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${storedToken}`);
        }
        opts = { ...opts, headers };
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('You are offline. Check your internet connection and try again.');
      }
      const isUpload = typeof FormData !== 'undefined' && opts.body instanceof FormData;
      const limitMs = isUpload ? 120000 : 30000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort('timeout'), limitMs);
      if (opts.signal) {
        if (opts.signal.aborted) controller.abort(opts.signal.reason);
        else opts.signal.addEventListener('abort', () => controller.abort(opts.signal.reason), { once: true });
      }
      try {
        const res = await originalFetch(url, { ...opts, signal: controller.signal });
        if (
          res.status === 401 && apiUrl && storedToken && !sessionExpiredRef.current &&
          !AUTH_401_EXEMPT.some(p => apiUrl.pathname.includes(p)) &&
          localStorage.getItem('chatter_jwt_token') === storedToken
        ) {
          sessionExpiredRef.current = true;
          logoutRef.current?.({ expired: true });
        }
        return res;
      } catch (err) {
        if (controller.signal.reason === 'timeout') {
          throw new Error('The server is taking too long to answer. Please try again.');
        }
        if (err?.name === 'AbortError') throw err;
        throw new Error(navigator.onLine === false
          ? 'You are offline. Check your internet connection and try again.'
          : 'Could not reach the server. Please try again in a moment.');
      } finally {
        clearTimeout(timer);
      }
    };

    const savedToken = localStorage.getItem('chatter_jwt_token');
    if (savedToken) {
      setToken(savedToken);
      originalFetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${savedToken}` }
      })
        .then(async res => {
          if (res.status === 401) {
            // Token is genuinely invalid or expired on server
            localStorage.removeItem('chatter_jwt_token');
            localStorage.removeItem('chatter_user_profile');
            setToken(null);
            setUser(null);
            setAuthLoading(false);
            return null;
          }
          if (res.ok) {
            return res.json();
          }
          // Non-401 error (500, 502, 503, Render spin-up) - keep cached user & token
          return null;
        })
        .then(userData => {
          if (userData) {
            setUser(userData);
            storeUserRecord('chatter_user_profile', userData);
            storeUserRecord('chatter_remembered_account', userData);
          }
          setAuthLoading(false);
        })
        .catch((err) => {
          // Network error, connection reset, or fetch aborted on quick page refresh
          // NEVER log out on network glitch or aborted request!
          console.warn('Network issue during /api/auth/me, keeping cached session:', err?.message);
          setAuthLoading(false);
        });
    } else {
      setAuthLoading(false);
    }

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  // Hydration from LocalStorage with instant deduplication & live polling
  useEffect(() => {
    try {
      const userKey = getStorageNodesKey(user);
      const cachedNodes = localStorage.getItem(userKey);
      if (cachedNodes) {
        const parsed = JSON.parse(cachedNodes);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const deduplicated = deduplicateNodes(parsed);
          setNodes(deduplicated);
        }
      } else if (user) {
        setNodes([getRootNode(user)]);
      }
      const userConfigKey = getStorageConfigKey(user);
      const cachedConfig = localStorage.getItem(userConfigKey);
      if (cachedConfig) {
        try {
          const parsed = JSON.parse(cachedConfig);
          if (parsed && parsed.chatMode) {
            setRoutingConfigState(parsed);
          }
        } catch (e) { }
      } else {
        setRoutingConfigState({
          chatMode: 'everyone',
          excludedContactIds: [],
          includedContactIds: [],
          globalBotActive: true
        });
      }
    } catch (e) {
      console.warn('LocalStorage hydration note:', e);
    }

    syncBackend();

    // Live background polling every 8 seconds to sync chat & reel counts smoothly
    // Skipped while the tab is hidden or offline, so it never competes with button actions
    const interval = setInterval(() => {
      if (document.hidden || navigator.onLine === false) return;
      syncBackend();
    }, 8000);
    const onVisible = () => { if (!document.hidden) syncBackend(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [user?._id || user?.username]);

  const syncInFlightRef = useRef(false);
  const syncBackend = async () => {
    // Signed out (login screen): polling would only collect 401s
    try { if (!localStorage.getItem('chatter_jwt_token')) return; } catch (e) { return; }
    // One sync at a time: on slow mobile data, overlapping syncs pile up and delay button requests
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      // 1. Sync social graph directly from live MongoDB database
      const res = await fetch(`${API_BASE}/api/social-graph`);
      const data = await res.json();
      if (data.success && Array.isArray(data.nodes)) {
        const currentUser = userRef.current;
        const userKey = getStorageNodesKey(currentUser);

        if (data.nodes.length === 0) {
          const root = getRootNode(currentUser);
          const emptyGraph = [root];
          setNodes(emptyGraph);
          try { localStorage.setItem(userKey, JSON.stringify(emptyGraph)); } catch (e) { }
          setIsSyncingInitial(false);
        } else {
          const pendingSaved = pendingSavedNamesRef.current;

          const serverContacts = data.nodes.map(sn => {
            const snName = sn.name || '';
            const snId = snName.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const chatsCount = typeof sn.chatsCount === 'number' ? sn.chatsCount : (sn.messageCount || 0);
            const reelsCount = typeof sn.reelsCount === 'number' ? sn.reelsCount : 0;
            return {
              id: snId,
              _id: sn._id,
              name: snName,
              handle: sn.instagramHandle || '',
              senderId: sn.senderId || '',
              profilePic: sn.profilePic || '',
              aiEnabled: sn.aiEnabled !== false,
              replyToMessages: sn.replyToMessages !== false,
              replyToReelsAndPosts: sn.replyToReelsAndPosts !== false,
              chatsCount,
              reelsCount,
              messageCount: chatsCount,
              relationship: sn.relationshipToSam || 'Friend',
              category: sn.category || 'online_friend',
              dob: sn.dob || '',
              age: Number.isFinite(sn.age) ? sn.age : null,
              gender: sn.gender || 'unknown',
              personalNotes: sn.personalNotes || (sn.lore || []).join('\n'),
              rollingSummary: sn.relationshipToSam || 'Friend in circle',
              conversationStyle: 'Casual banter',
              importantDates: sn.importantDates || [],
              facts: sn.facts || (sn.lore || []),
              lore: sn.lore || [],
              connections: (sn.connections || []).map(c => ({
                targetName: c.targetName || c.name || '',
                rel: c.relationship || c.rel || 'connected'
              })),
              roastStyle: sn.roastStyle || '',
              ...(Number.isFinite(sn.roastiness) ? { roastiness: sn.roastiness } : {}),
              greetingStyle: sn.greetingStyle || '',
              idleHours: 6,
              reminderEligible: false
            };
          });

          setNodes(prev => {
            const root = prev.find(n => n.isRoot) || getRootNode(currentUser);
            root.children = serverContacts.map(n => n.id);

            // If a contact was saved in the last 6s locally, overlay recent edits
            const mergedContacts = serverContacts.map(sn => {
              const local = prev.find(p => !p.isRoot && p.name.toLowerCase() === sn.name.toLowerCase());
              if (local && pendingSaved.has(sn.name.toLowerCase())) {
                return { ...sn, ...local };
              }
              return sn;
            });

            // A person saved moments ago may not be in this server answer yet: keep them instead of wiping them
            const serverNames = new Set(serverContacts.map(sn => sn.name.toLowerCase()));
            const pendingOnly = prev.filter(p =>
              !p.isRoot && pendingSaved.has((p.name || '').toLowerCase()) && !serverNames.has(p.name.toLowerCase())
            );
            root.children = [...root.children, ...pendingOnly.map(p => p.id)];

            const deduplicated = deduplicateNodes([root, ...mergedContacts, ...pendingOnly]);

            // Prevent unnecessary re-render if data has not changed
            if (prev.length === deduplicated.length) {
              let hasChanged = false;
              for (let i = 0; i < prev.length; i++) {
                const p = prev[i];
                const d = deduplicated[i];
                if (
                  SYNC_COMPARE_FIELDS.some(k => p[k] !== d[k]) ||
                  JSON.stringify(p.facts || []) !== JSON.stringify(d.facts || [])
                ) {
                  hasChanged = true;
                  break;
                }
              }
              if (!hasChanged) {
                return prev; // Same reference -> no re-render!
              }
            }

            try { localStorage.setItem(userKey, JSON.stringify(deduplicated)); } catch (e) { }
            return deduplicated;
          });
        }
      }

      // 2. Sync persona config
      const editTimestampBefore = lastRoutingEditTimeRef.current;
      const personaRes = await fetch(`${API_BASE}/api/persona`);
      const pData = await personaRes.json();
      if (pData && (pData.chatMode || pData.globalBotActive !== undefined)) {
        if (activeRoutingSavesRef.current === 0 && lastRoutingEditTimeRef.current === editTimestampBefore && Date.now() - editTimestampBefore > 6000) {
          const nextConfig = {
            chatMode: pData.chatMode || 'everyone',
            excludedContactIds: (pData.excludedContactIds || []).filter(Boolean),
            includedContactIds: (pData.includedContactIds || []).filter(Boolean),
            globalBotActive: pData.globalBotActive !== undefined ? pData.globalBotActive : true
          };
          const nextJson = JSON.stringify(nextConfig);
          // Same answer as last poll -> keep the old object so the whole app does not re-render every 8s
          setRoutingConfigState(prev => (JSON.stringify(prev) === nextJson ? prev : nextConfig));
          const currentUser = userRef.current;
          const userConfigKey = getStorageConfigKey(currentUser);
          localStorage.setItem(userConfigKey, nextJson);
        }
      }
    } catch (e) {
      console.warn('Backend sync note (using cached):', e.message);
    } finally {
      syncInFlightRef.current = false;
      setIsSyncingInitial(false);
    }
  };

  // Optimistic Save Node
  const saveNode = async (accumulatedNode, duplicateNamesToDelete = []) => {
    if (!accumulatedNode?.name) return;

    const cleanName = accumulatedNode.name.trim();
    let oldName = (accumulatedNode.oldName || '').trim();

    // Auto-detect oldName if renaming an existing node
    if (!oldName) {
      const match = nodes.find(n =>
        !n.isRoot && (
          (accumulatedNode.senderId && n.senderId && n.senderId === accumulatedNode.senderId) ||
          (accumulatedNode.id && n.id === accumulatedNode.id) ||
          (accumulatedNode.handle && n.handle && n.handle.replace(/^@/, '').toLowerCase() === (accumulatedNode.handle || accumulatedNode.instagramHandle || '').replace(/^@/, '').toLowerCase())
        )
      );
      if (match && match.name.toLowerCase() !== cleanName.toLowerCase()) {
        oldName = match.name.trim();
      }
    }

    const id = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const toDelete = Array.isArray(duplicateNamesToDelete) ? [...duplicateNamesToDelete] : [...(accumulatedNode.duplicateNamesToDelete || [])];
    if (oldName && oldName.toLowerCase() !== cleanName.toLowerCase() && !toDelete.some(d => d.toLowerCase() === oldName.toLowerCase())) {
      toDelete.push(oldName);
    }

    // Mark as pending save so syncBackend won't overwrite during the save round-trip
    pendingSavedNamesRef.current.add(cleanName.toLowerCase());

    const formattedNode = {
      id,
      name: cleanName,
      handle: accumulatedNode.instagramHandle || accumulatedNode.handle || '',
      senderId: accumulatedNode.senderId || '',
      profilePic: accumulatedNode.profilePic || '',
      relationship: accumulatedNode.relationshipToSam || accumulatedNode.relationship || 'Friend',
      category: accumulatedNode.category || 'online_friend',
      dob: accumulatedNode.dob || accumulatedNode.dateOfBirth || '',
      gender: accumulatedNode.gender || 'unknown',
      personalNotes: accumulatedNode.personalNotes || (accumulatedNode.lore || []).join('\n'),
      rollingSummary: accumulatedNode.rollingSummary || accumulatedNode.relationshipToSam || 'Friend in circle',
      conversationStyle: accumulatedNode.conversationStyle || 'Casual banter',
      importantDates: accumulatedNode.importantDates || [],
      facts: accumulatedNode.facts || accumulatedNode.lore || [],
      lore: accumulatedNode.lore || [],
      connections: (accumulatedNode.connections || []).map(c => ({
        targetName: c.targetName || c.name || '',
        rel: c.relationship || c.rel || 'connected'
      })),
      roastStyle: accumulatedNode.roastStyle || 'Playful natural banter',
      ...(Number.isFinite(accumulatedNode.roastiness) ? { roastiness: accumulatedNode.roastiness } : {}),
      greetingStyle: accumulatedNode.greetingStyle || '',
      aiEnabled: accumulatedNode.aiEnabled !== false,
      replyToMessages: accumulatedNode.replyToMessages !== false,
      replyToReelsAndPosts: accumulatedNode.replyToReelsAndPosts !== false,
      chatsCount: typeof accumulatedNode.chatsCount === 'number' ? accumulatedNode.chatsCount : (accumulatedNode.messageCount || 0),
      reelsCount: typeof accumulatedNode.reelsCount === 'number' ? accumulatedNode.reelsCount : 0,
      messageCount: typeof accumulatedNode.chatsCount === 'number' ? accumulatedNode.chatsCount : (accumulatedNode.messageCount || 0),
      idleHours: 4,
      reminderEligible: true
    };

    setNodes(prev => {
      const toDeleteLower = new Set(toDelete.map(d => d.toLowerCase()));
      if (oldName) toDeleteLower.add(oldName.toLowerCase());

      // Filter out duplicate and old names
      const filtered = prev.filter(n => {
        if (n.isRoot) return true;
        return !toDeleteLower.has((n.name || '').toLowerCase());
      });

      // Match by cleanName, senderId, or id
      const existingIdx = filtered.findIndex(n =>
        !n.isRoot && (
          n.name.toLowerCase() === cleanName.toLowerCase() ||
          (formattedNode.senderId && n.senderId && n.senderId === formattedNode.senderId) ||
          (accumulatedNode.id && n.id === accumulatedNode.id)
        )
      );

      let next;
      if (existingIdx >= 0) {
        next = [...filtered];
        next[existingIdx] = { ...next[existingIdx], ...formattedNode, id, name: cleanName };
      } else {
        next = [...filtered, formattedNode];
      }

      const deduplicated = deduplicateNodes(next);
      try {
        localStorage.setItem(getStorageNodesKey(userRef.current), JSON.stringify(deduplicated));
      } catch (e) { }
      return deduplicated;
    });

    setSelectedNode(formattedNode);
    setIsAiModalOpen(false);

    try {
      const saveRes = await fetch(`${API_BASE}/api/social-graph/node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          oldName: oldName || '',
          duplicateNamesToDelete: toDelete,
          instagramHandle: formattedNode.handle,
          senderId: formattedNode.senderId,
          relationshipToSam: formattedNode.relationship,
          category: formattedNode.category,
          dob: formattedNode.dob,
          personalNotes: formattedNode.personalNotes,
          gender: formattedNode.gender,
          lore: formattedNode.lore,
          roastStyle: formattedNode.roastStyle,
          roastiness: formattedNode.roastiness,
          greetingStyle: formattedNode.greetingStyle,
          connections: formattedNode.connections.map(c => ({
            targetName: c.targetName,
            relationship: c.rel
          }))
        })
      });
      if (!saveRes.ok) {
        const data = await saveRes.json().catch(() => ({}));
        throw new Error(data.error || `server answered ${saveRes.status}`);
      }
      showToast(`Saved ${cleanName} to Knowledge Tree & DB!`, 'success');

      const failedDups = [];
      for (const dup of toDelete) {
        if (dup && dup.trim().toLowerCase() !== cleanName.toLowerCase()) {
          try {
            const dupRes = await fetch(`${API_BASE}/api/social-graph/node/${encodeURIComponent(dup)}?keepMemory=true`, {
              method: 'DELETE'
            });
            if (!dupRes.ok) failedDups.push(dup);
          } catch (e) {
            failedDups.push(dup);
          }
        }
      }
      if (failedDups.length) {
        // The sync below brings the duplicates that are still on the server back on screen
        showToast(`Could not remove old entry: ${failedDups.join(', ')}`, 'error');
      }
      // Pull the saved record (profile pic, Instagram link) right away instead of waiting for the next poll
      syncBackend();
    } catch (err) {
      console.warn('Backend node save error:', err.message);
      showToast(`Could not save ${cleanName}: ${err.message}`, 'error');
    } finally {
      // Keep the local copy protected until a sync that started after the save has landed
      setTimeout(() => {
        pendingSavedNamesRef.current.delete(cleanName.toLowerCase());
      }, 15000);
    }
  };

  // Delete a Person from Knowledge Tree & MongoDB
  const deleteNode = async (nodeOrId) => {
    if (!nodeOrId) return;

    let targetObj = typeof nodeOrId === 'object' ? nodeOrId : null;
    if (!targetObj) {
      targetObj = nodes.find(n =>
        n.id === nodeOrId ||
        n._id === nodeOrId ||
        (n.senderId && n.senderId === nodeOrId) ||
        (n.name && n.name.toLowerCase() === String(nodeOrId).toLowerCase())
      );
    }

    const targetName = targetObj?.name || (typeof nodeOrId === 'string' ? nodeOrId : '');
    const targetSenderId = targetObj?.senderId || '';
    const targetId = targetObj?.id || targetObj?._id || '';

    // Optimistically update local nodes state
    setNodes(prev => {
      const updated = prev.filter(n => {
        if (targetId && (n.id === targetId || n._id === targetId)) return false;
        if (targetSenderId && n.senderId && n.senderId === targetSenderId) return false;
        if (targetName && n.name && n.name.toLowerCase() === targetName.toLowerCase()) return false;
        return true;
      });
      const rootIdx = updated.findIndex(n => n.isRoot);
      if (rootIdx >= 0) {
        updated[rootIdx] = {
          ...updated[rootIdx],
          children: updated.filter(n => !n.isRoot).map(n => n.id)
        };
      }
      try {
        localStorage.setItem(getStorageNodesKey(userRef.current), JSON.stringify(updated));
      } catch (e) { }
      return updated;
    });

    if (selectedNode && (
      (targetId && (selectedNode.id === targetId || selectedNode._id === targetId)) ||
      (targetName && selectedNode.name?.toLowerCase() === targetName.toLowerCase()) ||
      (targetSenderId && selectedNode.senderId === targetSenderId)
    )) {
      setSelectedNode(null);
    }

    try {
      const param = encodeURIComponent(targetName || targetSenderId || targetId);
      const delRes = await fetch(`${API_BASE}/api/social-graph/node/${param}`, {
        method: 'DELETE'
      });
      if (!delRes.ok) {
        const data = await delRes.json().catch(() => ({}));
        throw new Error(data.error || `server answered ${delRes.status}`);
      }
      showToast(`Deleted ${targetName || 'contact'} from Directory`, 'success');
    } catch (err) {
      console.warn('Backend delete node error:', err.message);
      showToast(`Could not delete ${targetName || 'contact'}: ${err.message}`, 'error');
    }
  };

  // Update Per-Person AI Reply Mode (Full AI, Reels Only, Paused / Sam Manual)
  // silent: bulk callers show one summary toast themselves; a failure is then thrown to them
  const updateContactPreferences = async (contactIdOrSenderId, prefs, { silent = false } = {}) => {
    if (!contactIdOrSenderId) return;
    const { aiMode, autoSendReels } = (typeof prefs === 'object' && prefs !== null) ? prefs : { aiMode: prefs };
    let finalAiEnabled;
    let finalReplyMessages;
    let finalReplyReels;

    if (aiMode === 'full_ai') {
      finalAiEnabled = true;
      finalReplyMessages = true;
      finalReplyReels = true;
    } else if (aiMode === 'reels_only') {
      finalAiEnabled = true;
      finalReplyMessages = false;
      finalReplyReels = true;
    } else if (aiMode === 'messages_only') {
      finalAiEnabled = true;
      finalReplyMessages = true;
      finalReplyReels = false;
    } else if (aiMode === 'paused' || aiMode === 'manual') {
      finalAiEnabled = false;
      finalReplyMessages = false;
      finalReplyReels = false;
    }

    let contactName = '';
    let matchedNode = null;
    setNodes(prev => {
      const next = prev.map(n => {
        const matches = (
          n.id === contactIdOrSenderId ||
          n.senderId === contactIdOrSenderId ||
          n.name.toLowerCase() === String(contactIdOrSenderId).toLowerCase() ||
          (n.handle && n.handle.replace(/^@/, '').toLowerCase() === String(contactIdOrSenderId).replace(/^@/, '').toLowerCase())
        );

        if (matches) {
          contactName = n.name;
          matchedNode = n;
          return {
            ...n,
            ...(typeof finalAiEnabled === 'boolean' ? { aiEnabled: finalAiEnabled } : {}),
            ...(typeof finalReplyMessages === 'boolean' ? { replyToMessages: finalReplyMessages } : {}),
            ...(typeof finalReplyReels === 'boolean' ? { replyToReelsAndPosts: finalReplyReels } : {}),
            ...(typeof autoSendReels === 'boolean' ? { autoSendReels } : {})
          };
        }
        return n;
      });
      try {
        const userNodesKey = getStorageNodesKey(userRef.current);
        localStorage.setItem(userNodesKey, JSON.stringify(next));
      } catch (e) { }
      return next;
    });

    if (selectedNode) {
      setSelectedNode(prev => ({
        ...prev,
        ...(typeof finalAiEnabled === 'boolean' ? { aiEnabled: finalAiEnabled } : {}),
        ...(typeof finalReplyMessages === 'boolean' ? { replyToMessages: finalReplyMessages } : {}),
        ...(typeof finalReplyReels === 'boolean' ? { replyToReelsAndPosts: finalReplyReels } : {}),
        ...(typeof autoSendReels === 'boolean' ? { autoSendReels } : {})
      }));
    }

    const nameStr = contactName || contactIdOrSenderId;

    try {
      const prefRes = await fetch(`${API_BASE}/api/social-graph/node/${encodeURIComponent(contactIdOrSenderId)}/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiMode,
          aiEnabled: finalAiEnabled,
          replyToMessages: finalReplyMessages,
          replyToReelsAndPosts: finalReplyReels,
          autoSendReels
        })
      });
      if (!prefRes.ok) {
        const data = await prefRes.json().catch(() => ({}));
        throw new Error(data.error || `server answered ${prefRes.status}`);
      }
      if (silent) return;
      if (typeof autoSendReels === 'boolean') {
        showToast(autoSendReels ? `Auto-Reels ENABLED for ${nameStr}!` : `Auto-Reels PAUSED for ${nameStr}!`);
      } else if (aiMode === 'reels_only') {
        showToast(`${nameStr}: AI will ONLY react to shared Reels!`);
      } else if (aiMode === 'paused' || aiMode === 'manual') {
        showToast(`Stopped AI for ${nameStr}. Manual chat active!`);
      } else if (aiMode) {
        showToast(`Full AI auto-reply enabled for ${nameStr}!`);
      }
    } catch (e) {
      console.warn('Preferences backend sync note:', e.message);
      if (silent) throw e;
      showToast(`Could not update ${nameStr}: ${e.message}`, 'error');
    }
  };

  // Add Custom Fact
  const addFact = async (friendIdOrName, fact) => {
    if (!fact?.trim()) return;
    const cleanFact = fact.trim();

    setNodes(prev => {
      const next = prev.map(n => {
        if (n.id === friendIdOrName || n.name.toLowerCase() === friendIdOrName.toLowerCase()) {
          const updatedFacts = [...(n.facts || []), cleanFact];
          const updatedLore = [...(n.lore || []), cleanFact];
          return { ...n, facts: updatedFacts, lore: updatedLore };
        }
        return n;
      });
      localStorage.setItem(getStorageNodesKey(userRef.current), JSON.stringify(next));
      return next;
    });

    if (selectedNode && (selectedNode.id === friendIdOrName || selectedNode.name.toLowerCase() === friendIdOrName.toLowerCase())) {
      setSelectedNode(prev => ({
        ...prev,
        facts: [...(prev.facts || []), cleanFact],
        lore: [...(prev.lore || []), cleanFact]
      }));
    }

    const target = nodes.find(n => n.id === friendIdOrName || n.name.toLowerCase() === friendIdOrName.toLowerCase());
    if (!target?.senderId) {
      showToast(`Fact added: "${cleanFact}"`);
    } else {
      try {
        const factRes = await fetch(`${API_BASE}/api/conversations/${target.senderId}/fact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fact: cleanFact })
        });
        if (!factRes.ok) {
          const data = await factRes.json().catch(() => ({}));
          throw new Error(data.error || `server answered ${factRes.status}`);
        }
        showToast(`Fact added: "${cleanFact}"`);
      } catch (e) {
        showToast(`Could not save the fact: ${e.message}`, 'error');
      }
    }
  };

  const rollbackRouting = (previousConfig) => {
    setRoutingConfig(previousConfig);
    try {
      localStorage.setItem(getStorageConfigKey(userRef.current || user), JSON.stringify(previousConfig));
    } catch (e) { }
  };

  // Save Routing Rules
  const saveRouting = async (newConfig) => {
    activeRoutingSavesRef.current += 1;
    const previousConfig = routingConfig;
    setRoutingConfig(newConfig);
    try {
      const activeUser = userRef.current || user;
      const userConfigKey = getStorageConfigKey(activeUser);
      localStorage.setItem(userConfigKey, JSON.stringify(newConfig));
      const putOperation = routingSaveQueueRef.current.then(async () => {
        const res = await fetch(`${API_BASE}/api/persona`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newConfig)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
      routingSaveQueueRef.current = putOperation.catch(() => { });
      await putOperation;
      showToast(`Saved chat routing! Mode: ${newConfig.chatMode.toUpperCase()}`);
    } catch (e) {
      // Not saved on the server: put the old rules back so the screen matches what the bot uses
      rollbackRouting(previousConfig);
      showToast(`Could not save chat routing: ${e.message}`, 'error');
    } finally {
      activeRoutingSavesRef.current = Math.max(0, activeRoutingSavesRef.current - 1);
    }
  };

  // Toggle Global Bot
  const toggleGlobalBot = async () => {
    activeRoutingSavesRef.current += 1;
    const nextState = !routingConfig.globalBotActive;
    const previousConfig = routingConfig;
    const nextConfig = { ...routingConfig, globalBotActive: nextState };
    setRoutingConfig(nextConfig);
    try {
      const activeUser = userRef.current || user;
      const userConfigKey = getStorageConfigKey(activeUser);
      localStorage.setItem(userConfigKey, JSON.stringify(nextConfig));
      const putOperation = routingSaveQueueRef.current.then(async () => {
        const res = await fetch(`${API_BASE}/api/persona`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ globalBotActive: nextState })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
      routingSaveQueueRef.current = putOperation.catch(() => { });
      await putOperation;
      showToast(nextState ? 'Global Bot Activated!' : 'Global Bot Paused!');
    } catch (e) {
      rollbackRouting(previousConfig);
      showToast(`Could not ${nextState ? 'start' : 'pause'} the bot: ${e.message}`, 'error');
    } finally {
      activeRoutingSavesRef.current = Math.max(0, activeRoutingSavesRef.current - 1);
    }
  };

  // Start AI Interview
  const startAiInterview = (person = null) => {
    setEditingNode(person);
    setIsAiModalOpen(true);
  };

  // AI Autofill fields for a person based on chat history
  const aiAutofillPerson = async (personName) => {
    if (!personName) return null;
    try {
      const res = await fetch(`${API_BASE}/api/social-graph/node/${encodeURIComponent(personName)}/ai-autofill`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success && data.autofill) {
        return data.autofill;
      }
    } catch (e) {
      console.warn('AI autofill failed:', e.message);
    }
    return null;
  };

  // Link Instagram ID & Merge chatter records
  const linkContactId = async (personName, instagramHandle, senderId) => {
    if (!personName) return false;
    const cleanHandle = instagramHandle ? `@${instagramHandle.replace(/^@/, '').trim()}` : '';

    // Optimistically update local nodes state (snapshot kept to undo on failure)
    let nodesBefore = null;
    const selectedBefore = selectedNode;
    setNodes(prev => {
      nodesBefore = prev;
      const targetLower = personName.toLowerCase();
      // Remove any duplicate node that previously had this handle or senderId
      const filtered = prev.filter(n => {
        if (n.name.toLowerCase() === targetLower) return true;
        if (cleanHandle && n.handle && n.handle.toLowerCase() === cleanHandle.toLowerCase()) return false;
        if (senderId && n.senderId && n.senderId === senderId) return false;
        return true;
      });

      const next = filtered.map(n => {
        if (n.name.toLowerCase() === targetLower) {
          return {
            ...n,
            handle: cleanHandle || n.handle,
            senderId: senderId || n.senderId
          };
        }
        return n;
      });

      try {
        localStorage.setItem(getStorageNodesKey(userRef.current), JSON.stringify(next));
      } catch (e) { }
      return next;
    });

    if (selectedNode && selectedNode.name.toLowerCase() === personName.toLowerCase()) {
      setSelectedNode(prev => ({
        ...prev,
        handle: cleanHandle || prev.handle,
        senderId: senderId || prev.senderId
      }));
    }

    setLinkingTargetPerson(null);

    // Call backend to persist merge and link in MongoDB
    try {
      const res = await fetch(`${API_BASE}/api/social-graph/link-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personName, instagramHandle: cleanHandle, senderId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `server answered ${res.status}`);
      }
      showToast(`Merged & linked ${personName}! AI will recognize them in DMs.`, 'success');
      syncBackend();
      return true;
    } catch (err) {
      console.warn('Backend link error:', err.message);
      // Undo the optimistic link so the screen matches the server
      if (nodesBefore) {
        setNodes(nodesBefore);
        try {
          localStorage.setItem(getStorageNodesKey(userRef.current), JSON.stringify(nodesBefore));
        } catch (e) { }
      }
      if (selectedBefore && selectedBefore.name?.toLowerCase() === personName.toLowerCase()) {
        setSelectedNode(selectedBefore);
      }
      showToast(`Could not link ${personName}: ${err.message}`, 'error');
    }
    return false;
  };

  // Quick lookup of contact in DB by handle or username
  const lookupContact = async (handleOrQuery) => {
    if (!handleOrQuery) return null;
    try {
      const clean = handleOrQuery.replace(/^@/, '').trim();
      const res = await fetch(`${API_BASE}/api/contacts/lookup?handle=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (data.found) return data;
    } catch (e) {
      console.warn('Contact lookup error:', e.message);
    }
    return null;
  };

  // Extract attributes from raw chat text using Azure OpenAI
  const extractFromRawChat = async (chatText, currentPerson = {}, userClarifications = '') => {
    try {
      const res = await fetch(`${API_BASE}/api/social-graph/extract-from-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatText, currentPerson, userClarifications })
      });
      const data = await res.json();
      if (data.success && data.extraction) {
        return data.extraction;
      }
    } catch (e) {
      console.warn('Extract from raw chat error:', e.message);
    }
    return null;
  };

  // Instagram photo links expire after a few days. Cards report a broken photo here; the ids are
  // sent in batches and the fresh links the server returns replace the old ones.
  const photoTried = useRef(new Set());
  const photoQueue = useRef(new Set());
  const photoTimer = useRef(null);
  const requestFreshPhoto = useCallback((senderId) => {
    const id = String(senderId || '');
    if (!id || photoTried.current.has(id)) return;
    photoTried.current.add(id);
    photoQueue.current.add(id);
    clearTimeout(photoTimer.current);
    photoTimer.current = setTimeout(async () => {
      const ids = [...photoQueue.current];
      photoQueue.current.clear();
      for (let i = 0; i < ids.length; i += 25) {
        try {
          const res = await fetch(`${API_BASE}/api/social-graph/refresh-photos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senderIds: ids.slice(i, i + 25) }),
          });
          if (!res.ok) continue;
          const { photos } = await res.json();
          if (!photos || !Object.keys(photos).length) continue;
          setNodes(prev => prev.map(n => (n.senderId && photos[n.senderId] ? { ...n, profilePic: photos[n.senderId] } : n)));
        } catch { /* offline: the card keeps its artwork */ }
      }
    }, 600);
  }, []);

  const saveRoutingStable = useLatestCallback(saveRouting);
  const toggleGlobalBotStable = useLatestCallback(toggleGlobalBot);
  const saveNodeStable = useLatestCallback(saveNode);
  const deleteNodeStable = useLatestCallback(deleteNode);
  const updateContactPreferencesStable = useLatestCallback(updateContactPreferences);
  const addFactStable = useLatestCallback(addFact);
  const startAiInterviewStable = useLatestCallback(startAiInterview);
  const aiAutofillPersonStable = useLatestCallback(aiAutofillPerson);
  const linkContactIdStable = useLatestCallback(linkContactId);
  const lookupContactStable = useLatestCallback(lookupContact);
  const extractFromRawChatStable = useLatestCallback(extractFromRawChat);
  const syncBackendStable = useLatestCallback(syncBackend);

  // One object per real change, so pages that read the context do not all re-render on every parent render
  const contextValue = useMemo(() => ({
    nodes,
    selectedNode,
    setSelectedNode,
    routingConfig,
    setRoutingConfig,
    saveRouting: saveRoutingStable,
    toggleGlobalBot: toggleGlobalBotStable,
    saveNode: saveNodeStable,
    deleteNode: deleteNodeStable,
    updateContactPreferences: updateContactPreferencesStable,
    addFact: addFactStable,
    showToast,
    dismissToast,
    toasts,
    isAiModalOpen,
    setIsAiModalOpen,
    editingNode,
    startAiInterview: startAiInterviewStable,
    aiAutofillPerson: aiAutofillPersonStable,
    linkingTargetPerson,
    setLinkingTargetPerson,
    linkContactId: linkContactIdStable,
    lookupContact: lookupContactStable,
    extractFromRawChat: extractFromRawChatStable,
    syncBackend: syncBackendStable,
    requestFreshPhoto,
    isSyncingInitial,
    API_BASE,
    user,
    token,
    authLoading,
    login,
    logout,
    switchAccount,
    updateUserProfile,
    workspaceFeatures,
    workspaceFeaturesError,
    reloadWorkspaceFeatures,
    updateWorkspaceFeatures,
    isPasskeyModalOpen,
    setIsPasskeyModalOpen,
    isOnboardingModalOpen,
    setIsOnboardingModalOpen,
    openOnboardingWizard,
    adminSession,
    isImpersonating,
    enterWorkspace,
    exitWorkspace,
  }), [nodes, selectedNode, setSelectedNode, routingConfig, setRoutingConfig, saveRoutingStable, toggleGlobalBotStable, saveNodeStable, deleteNodeStable, updateContactPreferencesStable, addFactStable, showToast, dismissToast, toasts, isAiModalOpen, setIsAiModalOpen, editingNode, startAiInterviewStable, aiAutofillPersonStable, linkingTargetPerson, setLinkingTargetPerson, linkContactIdStable, lookupContactStable, extractFromRawChatStable, syncBackendStable, requestFreshPhoto, isSyncingInitial, API_BASE, user, token, authLoading, login, logout, switchAccount, updateUserProfile, workspaceFeatures, workspaceFeaturesError, reloadWorkspaceFeatures, updateWorkspaceFeatures, isPasskeyModalOpen, setIsPasskeyModalOpen, isOnboardingModalOpen, setIsOnboardingModalOpen, openOnboardingWizard, adminSession, isImpersonating, enterWorkspace, exitWorkspace]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );

}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
}
