'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://instagram-ai-bot-64tf.onrender.com';

const STORAGE_NODES_KEY = 'chatter_social_nodes_v8';
const STORAGE_CONFIG_KEY = 'chatter_persona_config_v8';
const STORAGE_DELETED_KEY = 'chatter_deleted_names_v2';

export function getUserId(u) {
  return u?.id || u?._id || '';
}

export function getStorageNodesKey(u) {
  const uid = u?.id || u?._id || u?.username;
  return uid ? `chatter_social_nodes_${uid}` : STORAGE_NODES_KEY;
}

export function getStorageConfigKey(u) {
  const uid = u?.id || u?._id || u?.username;
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

// Cheap signature of the fields the UI shows, used to skip no-op re-renders during polling
function nodeSignature(n) {
  if (!n) return '';
  return JSON.stringify([
    n.id, n.name, n.handle, n.senderId, n.profilePic, n.aiEnabled, n.replyToMessages,
    n.replyToReelsAndPosts, n.chatsCount, n.reelsCount, n.category, n.relationship, n.dob,
    n.personalNotes, n.facts, n.connections
  ]);
}

// Remove every cached graph/persona entry belonging to an account (and the legacy shared keys)
function clearAccountCaches(u) {
  try {
    localStorage.removeItem(STORAGE_NODES_KEY);
    localStorage.removeItem(STORAGE_CONFIG_KEY);
    localStorage.removeItem(STORAGE_DELETED_KEY);
    localStorage.removeItem('chatter_persona_cached');
    if (u) {
      localStorage.removeItem(getStorageNodesKey(u));
      localStorage.removeItem(getStorageConfigKey(u));
      const uid = getUserId(u);
      if (uid) localStorage.removeItem(`chatter_persona_cached_${uid}`);
    }
  } catch (e) {}
}

const AppContext = createContext(null);
const ToastStateContext = createContext({ message: '', type: 'info' });
const ToastActionsContext = createContext(() => {});

// Toast lives in its own provider so showing a toast does not re-render every page
function ToastProvider({ children }) {
  const [toast, setToast] = useState({ message: '', type: 'info' });
  const timerRef = useRef(null);
  const showToast = useCallback((msg, type = 'info') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message: msg, type });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setToast({ message: '', type: 'info' });
    }, 4000);
  }, []);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return (
    <ToastActionsContext.Provider value={showToast}>
      <ToastStateContext.Provider value={toast}>
        {children}
      </ToastStateContext.Provider>
    </ToastActionsContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastStateContext);
}

export function AppProvider({ children }) {
  return (
    <ToastProvider>
      <AppStateProvider>{children}</AppStateProvider>
    </ToastProvider>
  );
}

function AppStateProvider({ children }) {
  const showToast = useContext(ToastActionsContext);
  // Server and the first client render must match: AuthGate renders pages only once mounted
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [nodes, setNodes] = useState(DEFAULT_GRAPH_DATA);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const [isSyncingInitial, setIsSyncingInitial] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cachedUser = JSON.parse(localStorage.getItem('chatter_user_profile') || 'null');
        const cached = localStorage.getItem(getStorageNodesKey(cachedUser));
        if (cached && JSON.parse(cached)?.length > 1) return false;
      } catch (e) {}
    }
    return true;
  });
  // Track names/ids that were explicitly deleted locally so syncBackend never re-adds them
  // Seeded from localStorage so deletes persist across page refreshes
  const deletedNamesRef = useRef(null);
  if (deletedNamesRef.current === null) {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_DELETED_KEY) : null;
      deletedNamesRef.current = stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { deletedNamesRef.current = new Set(); }
  }
  // Helper to persist deleted set to localStorage
  const persistDeletedNames = (set) => {
    try { localStorage.setItem(STORAGE_DELETED_KEY, JSON.stringify([...set])); } catch(e) {}
  };
  // Track names that were saved locally but not yet confirmed by server (prevent sync overwrite)
  const pendingSavedNamesRef = useRef(new Set());
  const lastRoutingEditTimeRef = useRef(0);
  const activeRoutingSavesRef = useRef(0);
  const routingSaveQueueRef = useRef(Promise.resolve());
  const [selectedNode, setSelectedNode] = useState(null);
  const selectedNodeRef = useRef(selectedNode);
  selectedNodeRef.current = selectedNode;
  const unauthorizedHandledRef = useRef(false);
  const logoutRef = useRef(null);
  
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
  userRef.current = user;
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
      } catch (e) {}
    }
    return {
      chatMode: 'everyone',
      excludedContactIds: [],
      includedContactIds: [],
      globalBotActive: true
    };
  });

  const routingConfigRef = useRef(routingConfig);
  routingConfigRef.current = routingConfig;

  const setRoutingConfig = useCallback((updater) => {
    lastRoutingEditTimeRef.current = Date.now();
    setRoutingConfigState(updater);
  }, []);

  // AI Interview Modal State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState(null);

  // Link Instagram ID Modal State
  const [linkingTargetPerson, setLinkingTargetPerson] = useState(null);

  const login = useCallback((jwtToken, userData) => {
    localStorage.setItem('chatter_jwt_token', jwtToken);
    if (userData) {
      try {
        localStorage.setItem('chatter_user_profile', JSON.stringify(userData));
        localStorage.setItem('chatter_remembered_account', JSON.stringify(userData));

        let saved = [];
        try {
          const stored = localStorage.getItem('chatter_saved_accounts');
          if (stored) saved = JSON.parse(stored);
          if (!Array.isArray(saved)) saved = [];
        } catch (e) {}

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
          instagramPageAccessToken: userData.instagramPageAccessToken || '',
          lastUsed: Date.now(),
        };
        const filtered = saved.filter(a => a.email !== record.email && a.username !== record.username);
        filtered.unshift(record);
        localStorage.setItem('chatter_saved_accounts', JSON.stringify(filtered));
      } catch (e) {}
    }
    try {
      sessionStorage.setItem('chatter_session_active', 'true');
      localStorage.removeItem('chatter_show_chooser');
      localStorage.removeItem('chatter_admin_session');
      // Never let the previous account's cached graph/persona leak into this one
      const prevUser = userRef.current;
      clearAccountCaches(prevUser && getUserId(prevUser) !== getUserId(userData) ? prevUser : null);
      deletedNamesRef.current = new Set();
      const newUid = getUserId(userData);
      if (typeof sessionStorage !== 'undefined' && newUid) {
        sessionStorage.removeItem(`chatter_onboarding_dismissed_${newUid}`);
        sessionStorage.removeItem('chatter_onboarding_dismissed');
      }
    } catch (e) {}
    unauthorizedHandledRef.current = false;
    setAdminSession(null);
    setSelectedNode(null);
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
    try {
      sessionStorage.removeItem('chatter_session_active');
      localStorage.setItem('chatter_show_chooser', 'true');
      localStorage.removeItem('chatter_admin_session');
      clearAccountCaches(userRef.current);
      deletedNamesRef.current = new Set();
      if (typeof sessionStorage !== 'undefined') {
        Object.keys(sessionStorage).forEach(k => {
          if (k.startsWith('chatter_onboarding_dismissed')) sessionStorage.removeItem(k);
        });
      }
    } catch (e) {}
    setNodes(DEFAULT_GRAPH_DATA);
    setSelectedNode(null);
    setAdminSession(null);
    setToken(null);
    setUser(null);
    showToast?.('Switching account...', 'info');
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.location.href = '/';
    }
  }, [showToast]);

  const logout = useCallback(() => {
    localStorage.removeItem('chatter_jwt_token');
    localStorage.removeItem('chatter_user_profile');
    try {
      localStorage.removeItem('chatter_admin_session');
      sessionStorage.removeItem('chatter_session_active');
      localStorage.removeItem('chatter_show_chooser');
      clearAccountCaches(userRef.current);
      deletedNamesRef.current = new Set();
      if (typeof sessionStorage !== 'undefined') {
        Object.keys(sessionStorage).forEach(k => {
          if (k.startsWith('chatter_onboarding_dismissed')) sessionStorage.removeItem(k);
        });
      }
    } catch (e) {}
    setNodes(DEFAULT_GRAPH_DATA);
    setSelectedNode(null);
    setAdminSession(null);
    setToken(null);
    setUser(null);
    showToast?.('Signed out successfully.', 'info');
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.location.href = '/';
    }
  }, [showToast]);
  logoutRef.current = logout;

  // Called once when the server says the session is no longer valid (401)
  const handleUnauthorized = useCallback(() => {
    if (unauthorizedHandledRef.current) return;
    if (!localStorage.getItem('chatter_jwt_token')) return;
    unauthorizedHandledRef.current = true;
    logoutRef.current?.();
  }, []);

  const enterWorkspace = useCallback((creatorToken, creatorUser) => {
    if (typeof window !== 'undefined') {
      if (!adminSession && user?.role === 'superadmin') {
        const sessionRecord = { token, user };
        localStorage.setItem('chatter_admin_session', JSON.stringify(sessionRecord));
        setAdminSession(sessionRecord);
      }
      clearAccountCaches(null);
      unauthorizedHandledRef.current = false;
      setSelectedNode(null);
      setNodes([getRootNode(creatorUser)]);
      localStorage.setItem('chatter_jwt_token', creatorToken);
      localStorage.setItem('chatter_user_profile', JSON.stringify(creatorUser));
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
        } catch {}
      }
      if (savedSession) {
        localStorage.setItem('chatter_jwt_token', savedSession.token);
        localStorage.setItem('chatter_user_profile', JSON.stringify(savedSession.user));
        localStorage.removeItem('chatter_admin_session');
        clearAccountCaches(userRef.current);
        unauthorizedHandledRef.current = false;
        setSelectedNode(null);
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

  // Intercept window.fetch to automatically attach Bearer token and check on load
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch;
    window.fetch = async (url, options = {}) => {
      const storedToken = localStorage.getItem('chatter_jwt_token');
      const urlStr = typeof url === 'string' ? url : (url instanceof URL ? url.href : '');
      // Only our own API gets the JWT; third parties (e.g. api.giphy.com) must never see it
      if (storedToken && urlStr && urlStr.startsWith(API_BASE)) {
        const headers = new Headers(options.headers || {});
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${storedToken}`);
        }
        const res = await originalFetch(url, { ...options, headers });
        // Expired session: sign out once (auth endpoints use 401 for wrong credentials, except /me)
        if (res.status === 401 && (!urlStr.includes('/api/auth/') || urlStr.includes('/api/auth/me'))) {
          handleUnauthorized();
        }
        return res;
      }
      return originalFetch(url, options);
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
          try {
            localStorage.setItem('chatter_user_profile', JSON.stringify(userData));
            localStorage.setItem('chatter_remembered_account', JSON.stringify(userData));
          } catch (e) {}
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
        } catch (e) {}
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

    // Logged out: no polling (avoids 401 spam on the login screen)
    if (!token) return;

    syncBackend();

    // Live background polling every 8 seconds to sync chat & reel counts smoothly
    // (paused while the tab is hidden; refreshes at once when it becomes visible again)
    const interval = setInterval(() => {
      if (document.hidden) return;
      syncBackend();
    }, 8000);
    const onVisibility = () => {
      if (!document.hidden) syncBackend();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [getUserId(user) || user?.username, token]);

  const syncBackend = useCallback(async () => {
    if (!localStorage.getItem('chatter_jwt_token')) {
      setIsSyncingInitial(false);
      return;
    }
    try {
      // 1. Sync social graph directly from live MongoDB database
      const res = await fetch(`${API_BASE}/api/social-graph`);
      if (res.status === 401) { handleUnauthorized(); return; }
      const data = await res.json();
      if (data.success && Array.isArray(data.nodes)) {
        const currentUser = userRef.current;
        const userKey = getStorageNodesKey(currentUser);

        if (data.nodes.length === 0) {
          const root = getRootNode(currentUser);
          const emptyGraph = [root];
          setNodes(emptyGraph);
          try { localStorage.setItem(userKey, JSON.stringify(emptyGraph)); } catch(e) {}
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
              idleHours: 6,
              reminderEligible: false
            };
          });

          setNodes(prev => {
            const root = { ...(prev.find(n => n.isRoot) || getRootNode(currentUser)) };
            root.children = serverContacts.map(n => n.id);

            // If a contact was saved in the last 6s locally, overlay recent edits
            const mergedContacts = serverContacts.map(sn => {
              const local = prev.find(p => !p.isRoot && p.name.toLowerCase() === sn.name.toLowerCase());
              if (local && pendingSaved.has(sn.name.toLowerCase())) {
                return { ...sn, ...local };
              }
              return sn;
            });

            const deduplicated = deduplicateNodes([root, ...mergedContacts]);

            // Prevent unnecessary re-render if data has not changed
            if (prev.length === deduplicated.length) {
              let hasChanged = false;
              for (let i = 0; i < prev.length; i++) {
                const p = prev[i];
                const d = deduplicated[i];
                if (nodeSignature(p) !== nodeSignature(d)) {
                  hasChanged = true;
                  break;
                }
              }
              if (!hasChanged) {
                return prev; // Same reference -> no re-render!
              }
            }

            try { localStorage.setItem(userKey, JSON.stringify(deduplicated)); } catch(e) {}
            return deduplicated;
          });
        }
      }

      // 2. Sync persona config
      const editTimestampBefore = lastRoutingEditTimeRef.current;
      const personaRes = await fetch(`${API_BASE}/api/persona`);
      if (personaRes.status === 401) { handleUnauthorized(); return; }
      const pData = await personaRes.json();
      if (pData && (pData.chatMode || pData.globalBotActive !== undefined)) {
        if (activeRoutingSavesRef.current === 0 && lastRoutingEditTimeRef.current === editTimestampBefore && Date.now() - editTimestampBefore > 6000) {
          const mode = pData.chatMode || 'everyone';
          setRoutingConfigState({
            chatMode: mode,
            excludedContactIds: (pData.excludedContactIds || []).filter(Boolean),
            includedContactIds: (pData.includedContactIds || []).filter(Boolean),
            globalBotActive: pData.globalBotActive !== undefined ? pData.globalBotActive : true
          });
          const currentUser = userRef.current;
          const userConfigKey = getStorageConfigKey(currentUser);
          localStorage.setItem(userConfigKey, JSON.stringify({
            chatMode: mode,
            excludedContactIds: (pData.excludedContactIds || []).filter(Boolean),
            includedContactIds: (pData.includedContactIds || []).filter(Boolean),
            globalBotActive: pData.globalBotActive !== undefined ? pData.globalBotActive : true
          }));
        }
      }
    } catch (e) {
      console.warn('Backend sync note (using cached):', e.message);
    } finally {
      setIsSyncingInitial(false);
    }
  }, [handleUnauthorized]);

  // Persist the current graph under this account's own key (never a key shared between accounts)
  const persistNodes = useCallback((list) => {
    try {
      localStorage.setItem(getStorageNodesKey(userRef.current), JSON.stringify(list));
    } catch (e) {}
  }, []);

  // Roll the graph back to a snapshot taken before an optimistic update
  const rollbackNodes = useCallback((snapshot) => {
    setNodes(snapshot);
    persistNodes(snapshot);
  }, [persistNodes]);

  // Optimistic Save Node
  const saveNode = useCallback(async (accumulatedNode, duplicateNamesToDelete = []) => {
    if (!accumulatedNode?.name) return false;
    const nodes = nodesRef.current;
    const snapshot = nodes;
    const prevSelected = selectedNodeRef.current;

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
    if (oldName) {
      deletedNamesRef.current.add(oldName.toLowerCase());
      persistDeletedNames(deletedNamesRef.current);
    }
    // Make sure new cleanName is NOT marked as deleted
    deletedNamesRef.current.delete(cleanName.toLowerCase());
    persistDeletedNames(deletedNamesRef.current);

    setTimeout(() => {
      pendingSavedNamesRef.current.delete(cleanName.toLowerCase());
    }, 6000);

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
      persistNodes(deduplicated);
      return deduplicated;
    });

    setSelectedNode(formattedNode);
    setIsAiModalOpen(false);

    try {
      const res = await fetch(`${API_BASE}/api/social-graph/node`, {
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
          facts: formattedNode.facts,
          roastStyle: formattedNode.roastStyle,
          connections: formattedNode.connections.map(c => ({
            targetName: c.targetName,
            relationship: c.rel
          }))
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      for (const dup of toDelete) {
        if (dup && dup.trim().toLowerCase() !== cleanName.toLowerCase()) {
          await fetch(`${API_BASE}/api/social-graph/node/${encodeURIComponent(dup)}?keepMemory=true`, {
            method: 'DELETE'
          });
        }
      }
      showToast(`✅ Saved ${cleanName} to Knowledge Tree & DB!`, 'success');
      return true;
    } catch (err) {
      console.warn('Backend node save error:', err.message);
      pendingSavedNamesRef.current.delete(cleanName.toLowerCase());
      rollbackNodes(snapshot);
      setSelectedNode(prevSelected);
      showToast(`Could not save ${cleanName}: ${err.message}`, 'error');
      return false;
    }
  }, [showToast, persistNodes, rollbackNodes]);

  // Delete a Person from Knowledge Tree & MongoDB
  const deleteNode = useCallback(async (nodeOrId) => {
    if (!nodeOrId) return false;
    const nodes = nodesRef.current;
    const snapshot = nodes;
    const selectedNode = selectedNodeRef.current;

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

    // Register in deletedNames ref so syncBackend never re-adds this person
    // Persisted to localStorage so it survives page refresh
    if (targetName) deletedNamesRef.current.add(targetName.toLowerCase());
    if (targetId) deletedNamesRef.current.add(String(targetId).toLowerCase());
    persistDeletedNames(deletedNamesRef.current);

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
      persistNodes(updated);
      return updated;
    });

    const wasSelected = !!(selectedNode && (
      (targetId && (selectedNode.id === targetId || selectedNode._id === targetId)) ||
      (targetName && selectedNode.name?.toLowerCase() === targetName.toLowerCase()) ||
      (targetSenderId && selectedNode.senderId === targetSenderId)
    ));
    if (wasSelected) setSelectedNode(null);

    try {
      const param = encodeURIComponent(targetName || targetSenderId || targetId);
      const res = await fetch(`${API_BASE}/api/social-graph/node/${param}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      showToast(`Deleted ${targetName || 'contact'} from Directory`, 'success');
      return true;
    } catch (err) {
      console.warn('Backend delete node error:', err.message);
      if (targetName) deletedNamesRef.current.delete(targetName.toLowerCase());
      if (targetId) deletedNamesRef.current.delete(String(targetId).toLowerCase());
      persistDeletedNames(deletedNamesRef.current);
      rollbackNodes(snapshot);
      if (wasSelected) setSelectedNode(selectedNode);
      showToast(`Could not delete ${targetName || 'contact'}: ${err.message}`, 'error');
      return false;
    }
  }, [showToast, persistNodes, rollbackNodes]);

  // Map an AI mode to the three per-contact switches
  const resolveAiMode = (aiMode) => {
    if (aiMode === 'full_ai') return { aiEnabled: true, replyToMessages: true, replyToReelsAndPosts: true };
    if (aiMode === 'reels_only') return { aiEnabled: true, replyToMessages: false, replyToReelsAndPosts: true };
    if (aiMode === 'messages_only') return { aiEnabled: true, replyToMessages: true, replyToReelsAndPosts: false };
    if (aiMode === 'paused' || aiMode === 'manual') return { aiEnabled: false, replyToMessages: false, replyToReelsAndPosts: false };
    return {};
  };

  const contactMatches = (n, contactIdOrSenderId) => {
    const key = String(contactIdOrSenderId);
    return (
      n.id === contactIdOrSenderId ||
      n.senderId === contactIdOrSenderId ||
      (n.name || '').toLowerCase() === key.toLowerCase() ||
      (n.handle && n.handle.replace(/^@/, '').toLowerCase() === key.replace(/^@/, '').toLowerCase())
    );
  };

  // Update Per-Person AI Reply Mode (Full AI, Reels Only, Paused / Manual)
  const updateContactPreferences = useCallback(async (contactIdOrSenderId, prefs) => {
    if (!contactIdOrSenderId) return false;
    const { aiMode, autoSendReels } = (typeof prefs === 'object' && prefs !== null) ? prefs : { aiMode: prefs };
    const resolved = resolveAiMode(aiMode);
    const finalAiEnabled = resolved.aiEnabled;
    const finalReplyMessages = resolved.replyToMessages;
    const finalReplyReels = resolved.replyToReelsAndPosts;
    const patch = {
      ...(typeof finalAiEnabled === 'boolean' ? { aiEnabled: finalAiEnabled } : {}),
      ...(typeof finalReplyMessages === 'boolean' ? { replyToMessages: finalReplyMessages } : {}),
      ...(typeof finalReplyReels === 'boolean' ? { replyToReelsAndPosts: finalReplyReels } : {}),
      ...(typeof autoSendReels === 'boolean' ? { autoSendReels } : {})
    };

    const snapshot = nodesRef.current;
    const prevSelected = selectedNodeRef.current;
    const matchedNode = snapshot.find(n => contactMatches(n, contactIdOrSenderId));
    const contactName = matchedNode?.name || '';

    setNodes(prev => {
      const next = prev.map(n => (contactMatches(n, contactIdOrSenderId) ? { ...n, ...patch } : n));
      persistNodes(next);
      return next;
    });

    if (prevSelected && contactMatches(prevSelected, contactIdOrSenderId)) {
      setSelectedNode(prev => (prev ? { ...prev, ...patch } : prev));
    }

    const nameStr = contactName || contactIdOrSenderId;

    try {
      const res = await fetch(`${API_BASE}/api/social-graph/node/${encodeURIComponent(contactIdOrSenderId)}/preferences`, {
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
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      if (typeof autoSendReels === 'boolean') {
        showToast(autoSendReels ? `🎬 Auto-Reels ENABLED for ${nameStr}!` : `⏸️ Auto-Reels PAUSED for ${nameStr}!`, 'success');
      } else if (aiMode === 'reels_only') {
        showToast(`🎬 ${nameStr}: AI will ONLY react to shared Reels!`, 'success');
      } else if (aiMode === 'paused' || aiMode === 'manual') {
        showToast(`⏸️ Stopped AI for ${nameStr}. Manual chat active!`, 'success');
      } else if (aiMode) {
        showToast(`⚡ Full AI auto-reply enabled for ${nameStr}!`, 'success');
      }
      return true;
    } catch (e) {
      console.warn('Preferences backend sync note:', e.message);
      // Roll back only this contact so other concurrent edits are kept
      if (matchedNode) {
        setNodes(prev => {
          const next = prev.map(n => (contactMatches(n, contactIdOrSenderId) ? { ...n, ...matchedNode } : n));
          persistNodes(next);
          return next;
        });
      }
      if (prevSelected && contactMatches(prevSelected, contactIdOrSenderId)) setSelectedNode(prevSelected);
      showToast(`Could not update AI mode for ${nameStr}: ${e.message}`, 'error');
      return false;
    }
  }, [showToast, persistNodes]);

  // Bulk AI mode change: ONE optimistic update, parallel requests, ONE summary toast, roll back failures
  const bulkUpdateContactPreferences = useCallback(async (contacts, aiMode) => {
    const list = (contacts || []).filter(Boolean);
    if (list.length === 0) return { ok: 0, failed: 0 };
    const patch = resolveAiMode(aiMode);
    const keyOf = (c) => c.senderId || c.name;
    const originals = new Map();
    nodesRef.current.forEach(n => {
      if (list.some(c => contactMatches(n, keyOf(c)))) originals.set(n.id, n);
    });

    setNodes(prev => {
      const next = prev.map(n => (originals.has(n.id) ? { ...n, ...patch } : n));
      persistNodes(next);
      return next;
    });

    const results = await Promise.allSettled(list.map(async (c) => {
      const res = await fetch(`${API_BASE}/api/social-graph/node/${encodeURIComponent(keyOf(c))}/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiMode, ...patch })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    }));

    const failedContacts = list.filter((c, i) => results[i].status === 'rejected');
    if (failedContacts.length > 0) {
      setNodes(prev => {
        const next = prev.map(n => {
          if (!failedContacts.some(c => contactMatches(n, keyOf(c)))) return n;
          const orig = originals.get(n.id);
          return orig ? { ...n, ...orig } : n;
        });
        persistNodes(next);
        return next;
      });
    }
    const okCount = list.length - failedContacts.length;
    const label = aiMode === 'paused' || aiMode === 'manual' ? 'paused' : 'set to Full AI';
    if (failedContacts.length === 0) {
      showToast(`Updated ${okCount} contact${okCount === 1 ? '' : 's'}: AI ${label}.`, 'success');
    } else {
      showToast(`Updated ${okCount} of ${list.length} contacts; ${failedContacts.length} failed and were reverted.`, 'error');
    }
    return { ok: okCount, failed: failedContacts.length };
  }, [showToast, persistNodes]);

  // Add Custom Fact
  const addFact = useCallback(async (friendIdOrName, fact) => {
    if (!fact?.trim() || !friendIdOrName) return false;
    const cleanFact = fact.trim();
    const matchesFriend = (n) => n.id === friendIdOrName || (n.name || '').toLowerCase() === String(friendIdOrName).toLowerCase();
    const target = nodesRef.current.find(matchesFriend);
    const prevSelected = selectedNodeRef.current;

    const applyFact = (n) => ({ ...n, facts: [...(n.facts || []), cleanFact], lore: [...(n.lore || []), cleanFact] });
    setNodes(prev => {
      const next = prev.map(n => (matchesFriend(n) ? applyFact(n) : n));
      persistNodes(next);
      return next;
    });

    if (prevSelected && matchesFriend(prevSelected)) {
      setSelectedNode(prev => (prev ? applyFact(prev) : prev));
    }

    const rollbackFact = () => {
      const removeFact = (n) => {
        const facts = [...(n.facts || [])];
        const lore = [...(n.lore || [])];
        const fi = facts.lastIndexOf(cleanFact);
        if (fi >= 0) facts.splice(fi, 1);
        const li = lore.lastIndexOf(cleanFact);
        if (li >= 0) lore.splice(li, 1);
        return { ...n, facts, lore };
      };
      setNodes(prev => {
        const next = prev.map(n => (matchesFriend(n) ? removeFact(n) : n));
        persistNodes(next);
        return next;
      });
      if (prevSelected && matchesFriend(prevSelected)) setSelectedNode(prev => (prev ? removeFact(prev) : prev));
    };

    if (target?.senderId) {
      try {
        const res = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(target.senderId)}/fact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fact: cleanFact })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (e) {
        rollbackFact();
        showToast(`Could not save fact: ${e.message}`, 'error');
        return false;
      }
    }
    showToast(`🧠 Fact added: "${cleanFact}"`, 'success');
    return true;
  }, [showToast, persistNodes]);

  // Save Routing Rules
  const saveRouting = useCallback(async (newConfig) => {
    activeRoutingSavesRef.current += 1;
    setRoutingConfig(newConfig);
    try {
      const activeUser = userRef.current;
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
      routingSaveQueueRef.current = putOperation.catch(() => {});
      await putOperation;
      showToast(`💾 Saved chat routing! Mode: ${newConfig.chatMode.toUpperCase()}`, 'success');
    } catch (e) {
      showToast(`Could not save chat routing to the server (${e.message}). Changes are only on this device.`, 'error');
    } finally {
      activeRoutingSavesRef.current = Math.max(0, activeRoutingSavesRef.current - 1);
    }
  }, [showToast, setRoutingConfig]);

  // Toggle Global Bot
  const toggleGlobalBot = useCallback(async () => {
    activeRoutingSavesRef.current += 1;
    const routingConfig = routingConfigRef.current;
    const nextState = !routingConfig.globalBotActive;
    const nextConfig = { ...routingConfig, globalBotActive: nextState };
    setRoutingConfig(nextConfig);
    try {
      const activeUser = userRef.current;
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
      routingSaveQueueRef.current = putOperation.catch(() => {});
      await putOperation;
      showToast(nextState ? '🟢 Global Bot Activated!' : '⏸️ Global Bot Paused!', 'success');
    } catch (e) {
      // Server did not accept the change: roll back so the switch shows the real state
      setRoutingConfig(routingConfig);
      try { localStorage.setItem(getStorageConfigKey(userRef.current), JSON.stringify(routingConfig)); } catch (err) {}
      showToast(`Could not ${nextState ? 'activate' : 'pause'} the bot: ${e.message}`, 'error');
    } finally {
      activeRoutingSavesRef.current = Math.max(0, activeRoutingSavesRef.current - 1);
    }
  }, [showToast, setRoutingConfig]);

  // Start AI Interview
  const startAiInterview = useCallback((person = null) => {
    setEditingNode(person);
    setIsAiModalOpen(true);
  }, []);

  // AI Autofill fields for a person based on chat history
  // Throws on a failed request so callers can show the real error
  const aiAutofillPerson = useCallback(async (personName) => {
    if (!personName) return null;
    const res = await fetch(`${API_BASE}/api/social-graph/node/${encodeURIComponent(personName)}/ai-autofill`, {
      method: 'POST'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
    return data.autofill || null;
  }, []);

  // Link Instagram ID & Merge chatter records
  const linkContactId = useCallback(async (personName, instagramHandle, senderId) => {
    if (!personName) return false;
    const cleanHandle = instagramHandle ? `@${instagramHandle.replace(/^@/, '').trim()}` : '';
    const snapshot = nodesRef.current;
    const prevSelected = selectedNodeRef.current;

    // Optimistically update local nodes state
    setNodes(prev => {
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

      persistNodes(next);
      return next;
    });

    if (prevSelected && prevSelected.name?.toLowerCase() === personName.toLowerCase()) {
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
      if (res.ok && data.success) {
        showToast(`✅ Merged & linked ${personName}! AI will recognize them in DMs.`, 'success');
        syncBackend();
        return true;
      }
      throw new Error(data.error || `HTTP ${res.status}`);
    } catch (err) {
      console.warn('Backend link error:', err.message);
      rollbackNodes(snapshot);
      setSelectedNode(prevSelected);
      showToast(`Could not link ${personName}: ${err.message}`, 'error');
    }
    return false;
  }, [showToast, persistNodes, rollbackNodes, syncBackend]);

  // Re-read the account and persona from the server (e.g. after the Instagram OAuth popup succeeds)
  const refreshAccount = useCallback(async () => {
    let freshUser = null;
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`);
      if (res.ok) {
        freshUser = await res.json();
        if (freshUser && typeof freshUser === 'object') {
          setUser(freshUser);
          try {
            localStorage.setItem('chatter_user_profile', JSON.stringify(freshUser));
            localStorage.setItem('chatter_remembered_account', JSON.stringify(freshUser));
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn('Account refresh failed:', e.message);
    }
    await syncBackend();
    return freshUser;
  }, [syncBackend]);

  // Quick lookup of contact in DB by handle or username
  const lookupContact = useCallback(async (handleOrQuery) => {
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
  }, []);

  // Extract attributes from raw chat text using Azure OpenAI
  // Throws on a failed request so callers can show the real error
  const extractFromRawChat = useCallback(async (chatText, currentPerson = {}, userClarifications = '') => {
    const res = await fetch(`${API_BASE}/api/social-graph/extract-from-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatText, currentPerson, userClarifications })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
    return data.extraction || null;
  }, []);

  const contextValue = useMemo(() => ({
    mounted,
    nodes,
    selectedNode,
    setSelectedNode,
    routingConfig,
    setRoutingConfig,
    saveRouting,
    toggleGlobalBot,
    saveNode,
    deleteNode,
    updateContactPreferences,
    bulkUpdateContactPreferences,
    addFact,
    showToast,
    isAiModalOpen,
    setIsAiModalOpen,
    editingNode,
    startAiInterview,
    aiAutofillPerson,
    linkingTargetPerson,
    setLinkingTargetPerson,
    linkContactId,
    lookupContact,
    extractFromRawChat,
    syncBackend,
    isSyncingInitial,
    API_BASE,
    user,
    token,
    authLoading,
    login,
    logout,
    switchAccount,
    updateUserProfile,
    refreshAccount,
    isPasskeyModalOpen,
    setIsPasskeyModalOpen,
    isOnboardingModalOpen,
    setIsOnboardingModalOpen,
    openOnboardingWizard,
    adminSession,
    isImpersonating,
    enterWorkspace,
    exitWorkspace,
  }), [
    mounted, nodes, selectedNode, routingConfig, setRoutingConfig, saveRouting, toggleGlobalBot, saveNode,
    deleteNode, updateContactPreferences, bulkUpdateContactPreferences, addFact, showToast, isAiModalOpen,
    editingNode, startAiInterview, aiAutofillPerson, linkingTargetPerson, linkContactId, lookupContact,
    extractFromRawChat, syncBackend, isSyncingInitial, user, token, authLoading, login, logout, switchAccount,
    updateUserProfile, refreshAccount, isPasskeyModalOpen, isOnboardingModalOpen, openOnboardingWizard, adminSession,
    isImpersonating, enterWorkspace, exitWorkspace
  ]);

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
