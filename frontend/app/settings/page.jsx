'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { isFromApi, onPopupClosed, openInstagramConnect } from '../lib/utils';
import {
  UserCheck, Save, Sparkles, MessageSquare, AlertCircle,
  CheckCircle2, Plus, Trash2, Send, Sliders, Info,
  Code, RefreshCw, Smile, Zap, BookOpen, ShieldAlert, Key, Eye, EyeOff, Instagram,
  Copy, Check, BarChart3, ArrowUpRight
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import SuperadminWorkspacePrompt from '../components/SuperadminWorkspacePrompt';
import AiProviderCard from '../components/AiProviderCard';
import { motion } from 'framer-motion';
import { enterMotion } from '../lib/motion';
import PageHero from '../components/PageHero';
import { IconSwap } from '../components/ui/motion';
import '../split.css';

function SettingsPageContent() {
  const { API_BASE, token, showToast, user, isImpersonating, updateUserProfile } = useApp();
  const router = useRouter();


  const [activeTab, setActiveTab] = useState('about');
  const [loading, setLoading] = useState(true);
  // Saving after a failed load would overwrite the real settings with the empty form
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    creatorName: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : (user?.username || ''),
    instagramHandle: user?.instagramUsername ? `@${user.instagramUsername.replace(/^@/, '')}` : '',
    // Secret boxes start empty: empty means "keep the saved value"; only a newly typed value is sent
    instagramPageAccessToken: '',
    instagramAccountId: user?.instagramId || user?.instagramAccountId || '',
    personaBio: '',
    aboutMe: '',
    characteristics: '',
    textingHabits: '',
    replyRules: '',
    toneGuidelines: '',
    customKnowledge: '',
    forbiddenWords: [],
    sampleConversations: [],
    typingDelaySeconds: 1.5,
    giphyApiKey: '',
  });

  // Whether a token/key is already stored on the server (the values themselves are never shown)
  const [secretsSaved, setSecretsSaved] = useState({
    instagram: Boolean(user?.hasInstagramToken || user?.isInstagramConnected),
    giphy: false,
  });
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);

  // Helper to obtain authorization headers
  const getAuthHeaders = () => {
    const currentToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    return {
      'Content-Type': 'application/json',
      ...(currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {})
    };
  };

  // Listen for OAuth postMessage from login popup window
  useEffect(() => {
    const handleOAuthMessage = (event) => {
      if (!isFromApi(event, API_BASE)) return; // only our OAuth popup may set Instagram credentials
      if (event.data?.type === 'INSTAGRAM_OAUTH_SUCCESS') {
        const { instagramUsername: igUser, instagramAccountId: igId, instagramPageAccessToken: igToken } = event.data.payload || {};
        setFormData(prev => ({
          ...prev,
          ...(igUser ? { instagramHandle: `@${igUser.replace(/^@/, '')}` } : {}),
          ...(igId ? { instagramAccountId: igId } : {}),
        }));
        setSecretsSaved(prev => ({ ...prev, instagram: true }));
        setOauthConnecting(false);
        if (updateUserProfile) {
          updateUserProfile({
            hasInstagramToken: true,
            isInstagramConnected: true,
            instagramAccountId: igId,
            instagramUsername: igUser,
          });
        }
        showToast?.(`Instagram connected: @${igUser || 'account'}! Credentials updated.`, 'success');
      } else if (event.data?.type === 'INSTAGRAM_OAUTH_ERROR') {
        setOauthConnecting(false);
        setErrorMsg(event.data.error || 'Instagram connection cancelled or failed.');
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [showToast, updateUserProfile]);

  // Stops the "is the popup closed yet?" check when a new popup opens or this screen goes away
  const popupWatchRef = useRef(null);
  useEffect(() => () => popupWatchRef.current?.(), []);

  const handleLaunchInstagramOAuth = () => {
    setErrorMsg('');
    setOauthConnecting(true);
    try {
      const popup = openInstagramConnect(API_BASE, token);
      popupWatchRef.current?.();
      popupWatchRef.current = onPopupClosed(popup, () => setOauthConnecting(false));
      if (!popup) {
        setOauthConnecting(false);
        setErrorMsg('Popup was blocked by your browser. Please allow popups or enter your credentials below.');
      }
    } catch (e) {
      setOauthConnecting(false);
      setErrorMsg('Failed to open login dialog: ' + e.message);
    }
  };

  // State for Giphy API Key
  const [testingGiphy, setTestingGiphy] = useState(false);
  const [giphyStatus, setGiphyStatus] = useState(null); // 'success' | 'error' | null
  const [showGiphyKey, setShowGiphyKey] = useState(false);

  // State for adding forbidden word
  const [newForbiddenWord, setNewForbiddenWord] = useState('');

  // State for adding sample conversation
  const [newSampleUser, setNewSampleUser] = useState('');
  const [newSampleReply, setNewSampleReply] = useState('');

  // State for Live Test Simulator
  const [testInput, setTestInput] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testMessages, setTestMessages] = useState([
    { role: 'user', text: 'hey love your content!' },
    { role: 'assistant', text: 'appreciate it so much! thanks for reaching out 🙌' }
  ]);

  // Some accounts only carry a username, so it is the last fallback (same as AppContext)
  const userId = user?._id || user?.id || user?.username;
  // True once the server's saved settings have arrived; saving waits for it
  const [loaded, setLoaded] = useState(false);
  // What the form showed before the user typed, so late-arriving data never wipes their typing
  const shownRef = useRef(formData);
  const applyLoaded = (next) => {
    const shown = shownRef.current;
    shownRef.current = { ...shown, ...next };
    setFormData(prev => {
      const merged = { ...prev };
      Object.keys(next).forEach(k => {
        if (prev[k] === shown[k]) merged[k] = next[k];
      });
      return merged;
    });
  };

  // Fetch current persona on mount or when user changes
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetchPersona();
    // A sleeping server can take up to a minute: show the form after 2.5s instead of a blank skeleton
    const showForm = setTimeout(() => setLoading(false), 2500);
    return () => clearTimeout(showForm);
  }, [userId]);

  // A failed load tries again by itself when the tab is shown again, the connection returns, or after 20s
  useEffect(() => {
    if (!loadFailed) return;
    const retry = () => { if (!document.hidden) fetchPersona(); };
    const timer = setTimeout(retry, 20000);
    document.addEventListener('visibilitychange', retry);
    window.addEventListener('online', retry);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', retry);
      window.removeEventListener('online', retry);
    };
  }, [loadFailed]);

  const fetchPersona = async () => {
    if (!userId) return;
    const userCacheKey = `chatter_persona_cached_${userId}`;
    // Only show cached persona if strictly scoped to this user ID
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(userCacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && (parsed.creatorName || parsed.instagramHandle)) {
            // Older builds cached the token and Giphy key here: drop them and rewrite the cache
            const safeCached = stripSecrets(parsed);
            if (parsed.instagramPageAccessToken !== undefined || parsed.giphyApiKey !== undefined) {
              try { localStorage.setItem(userCacheKey, JSON.stringify(safeCached)); } catch (e) { }
            }
            applyLoaded(safeCached);
            setLoading(false);
          }
        }
      } catch (e) {
        // ignore localStorage parse error
      }
    }

    // Give up after a minute (the app's fetch keeps retrying a waking server); the failed-load retry takes over
    const giveUp = new AbortController();
    const giveUpTimer = setTimeout(() => giveUp.abort(), 60000);
    try {
      const res = await fetch(`${API_BASE}/api/persona`, {
        headers: getAuthHeaders(),
        signal: giveUp.signal,
      });
      if (res.ok) {
        const data = await res.json();
        const defaultName = user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : (user?.username || 'Creator');
        const defaultHandle = user?.instagramUsername ? `@${user.instagramUsername.replace(/^@/, '')}` : (user?.username ? `@${user.username}` : '@handle');
        const updated = {
          creatorName: data.creatorName || defaultName,
          instagramHandle: data.instagramHandle || defaultHandle,
          instagramPageAccessToken: '',
          instagramAccountId: data.instagramAccountId || user?.instagramId || user?.instagramAccountId || '',
          personaBio: data.personaBio || '',
          aboutMe: data.aboutMe || '',
          characteristics: data.characteristics || '',
          textingHabits: data.textingHabits || '',
          replyRules: data.replyRules || '',
          toneGuidelines: data.toneGuidelines || '',
          customKnowledge: data.customKnowledge || '',
          forbiddenWords: Array.isArray(data.forbiddenWords) ? data.forbiddenWords : [],
          sampleConversations: Array.isArray(data.sampleConversations) ? data.sampleConversations : [],
          typingDelaySeconds: data.typingDelaySeconds || 1.5,
          giphyApiKey: '',
        };
        // New server sends hasInstagramToken / hasGiphyKey; older one sent the values themselves
        setSecretsSaved({
          instagram: Boolean(data.hasInstagramToken ?? data.instagramPageAccessToken ?? (user?.hasInstagramToken || user?.isInstagramConnected)),
          giphy: Boolean(data.hasGiphyKey ?? data.giphyApiKey),
        });
        applyLoaded(updated);
        setLoaded(true);
        setLoadFailed(false);
        // Drop the old "could not load" banner once the settings arrive
        setErrorMsg(prev => (prev.startsWith('Could not load') || prev.startsWith('Could not fetch') ? '' : prev));
        try {
          localStorage.setItem(userCacheKey, JSON.stringify(stripSecrets(updated)));
        } catch (e) { }
      } else {
        setLoadFailed(true);
        setErrorMsg('Could not load your saved settings. Reload the page before saving.');
      }
    } catch (err) {
      console.error('Failed to load persona config:', err);
      setLoadFailed(true);
      setErrorMsg('Could not fetch settings from server. Check your connection.');
    } finally {
      clearTimeout(giveUpTimer);
      setLoading(false);
    }
  };

  const handleTestGiphyKey = async () => {
    setTestingGiphy(true);
    setGiphyStatus(null);
    try {
      const keyToTest = formData.giphyApiKey?.trim();
      if (!keyToTest) {
        setGiphyStatus('error');
        showToast(secretsSaved.giphy ? 'A key is saved. Type it again to test it.' : 'Enter a GIPHY API key first', 'error');
        return;
      }
      const res = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${keyToTest}&limit=1`);
      const data = await res.json();
      if (res.ok && data.meta?.status === 200) {
        setGiphyStatus('success');
        showToast('GIPHY API key is valid and working!', 'success');
      } else {
        setGiphyStatus('error');
        showToast(data.message || 'GIPHY API key invalid', 'error');
      }
    } catch (e) {
      setGiphyStatus('error');
      showToast('Connection failed to GIPHY', 'error');
    } finally {
      setTestingGiphy(false);
    }
  };

  const handleSave = async () => {
    if (loadFailed) {
      showToast('Settings did not load, so saving is paused to protect your data. Reload the page.', 'error');
      return;
    }
    if (!loaded) {
      showToast('Still loading your saved settings (the server is waking up). Try again in a few seconds.', 'info');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      // Empty secret box = keep what the server has, so the field is left out of the request
      const pastedToken = (formData.instagramPageAccessToken || '').trim();
      const typedGiphyKey = (formData.giphyApiKey || '').trim();
      const payload = stripSecrets(formData);
      if (pastedToken) payload.instagramPageAccessToken = pastedToken;
      if (typedGiphyKey) payload.giphyApiKey = typedGiphyKey;
      const res = await fetch(`${API_BASE}/api/persona`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSaveSuccess(true);
        if (pastedToken || typedGiphyKey) {
          setSecretsSaved(prev => ({ instagram: prev.instagram || !!pastedToken, giphy: prev.giphy || !!typedGiphyKey }));
          setFormData(prev => ({ ...prev, instagramPageAccessToken: '', giphyApiKey: '' }));
        }
        if (typeof window !== 'undefined') {
          const userCacheKey = userId ? `chatter_persona_cached_${userId}` : 'chatter_persona_cached';
          try {
            localStorage.setItem(userCacheKey, JSON.stringify(stripSecrets(formData)));
          } catch (e) { }
        }

        if (updateUserProfile) {
          // A blank token box means "unchanged" (OAuth tokens are never sent back), so it must not mark Instagram disconnected
          const [firstName, ...rest] = (formData.creatorName || '').trim().split(/\s+/);
          updateUserProfile({
            ...(pastedToken ? { hasInstagramToken: true, isInstagramConnected: true } : {}),
            instagramAccountId: formData.instagramAccountId,
            instagramUsername: formData.instagramHandle?.replace(/^@/, ''),
            ...(firstName ? { firstName, lastName: rest.join(' ') } : {}),
          });
        }

        showToast('Settings & Persona saved successfully! AI updated.', 'success');
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to save settings');
      }
    } catch (err) {
      setErrorMsg('Network error while saving settings.');
    } finally {
      setSaving(false);
    }
  };

  // Add / Remove Forbidden Word
  const handleAddForbiddenWord = () => {
    const word = newForbiddenWord.trim().toLowerCase();
    if (!word) return;
    if (formData.forbiddenWords.includes(word)) {
      setNewForbiddenWord('');
      return;
    }
    setFormData(prev => ({
      ...prev,
      forbiddenWords: [...prev.forbiddenWords, word]
    }));
    setNewForbiddenWord('');
  };

  const handleRemoveForbiddenWord = (wordToRemove) => {
    setFormData(prev => ({
      ...prev,
      forbiddenWords: prev.forbiddenWords.filter(w => w !== wordToRemove)
    }));
  };

  // Add / Remove Sample Conversation
  const handleAddSampleConversation = () => {
    if (!newSampleUser.trim() || !newSampleReply.trim()) return;
    setFormData(prev => ({
      ...prev,
      sampleConversations: [
        ...prev.sampleConversations,
        { userMessage: newSampleUser.trim(), myReply: newSampleReply.trim() }
      ]
    }));
    setNewSampleUser('');
    setNewSampleReply('');
  };

  const handleRemoveSampleConversation = (index) => {
    setFormData(prev => ({
      ...prev,
      sampleConversations: prev.sampleConversations.filter((_, i) => i !== index)
    }));
  };

  // Trait chips helper
  const addTraitChip = (traitText) => {
    const current = formData.characteristics || '';
    if (current.toLowerCase().includes(traitText.toLowerCase())) return;
    const updated = current ? `${current}, ${traitText}` : traitText;
    setFormData(prev => ({ ...prev, characteristics: updated }));
  };

  // Texting rule chip helper
  const addTextingRuleChip = (ruleText) => {
    const current = formData.textingHabits || '';
    if (current.toLowerCase().includes(ruleText.toLowerCase())) return;
    const updated = current ? `${current}. ${ruleText}` : ruleText;
    setFormData(prev => ({ ...prev, textingHabits: updated }));
  };

  // Send Test Simulator Message
  const handleSendTestMessage = async (e) => {
    if (e) e.preventDefault();
    const text = testInput.trim();
    if (!text || testSending) return;

    const userMsg = { role: 'user', text };
    setTestMessages(prev => [...prev, userMsg]);
    setTestInput('');
    setTestSending(true);

    try {
      const res = await fetch(`${API_BASE}/api/simulator/chat`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          testSenderId: 'test_friend_user',
          testUsername: 'alex_test',
          messageText: text
        })
      });

      const data = await res.json().catch(() => ({}));
      // /api/simulator/chat answers with { replyText, userMemory }
      if (res.ok && data.replyText) {
        setTestMessages(prev => [...prev, { role: 'assistant', text: data.replyText }]);
      } else {
        setTestMessages(prev => [...prev, { role: 'assistant', text: `(${data.error || 'AI generation error or empty response'})` }]);
      }
    } catch (err) {
      setTestMessages(prev => [...prev, { role: 'assistant', text: '(Connection failed to simulator)' }]);
    } finally {
      setTestSending(false);
    }
  };

  const isSuperadmin = user?.role === 'superadmin';

  const tabs = [
    { id: 'about', label: 'About Me', icon: BookOpen },
    { id: 'characteristics', label: 'My Characteristics', icon: Smile },
    { id: 'texting', label: 'How To Text', icon: MessageSquare },
    { id: 'replying', label: 'How To Reply', icon: Zap },
    { id: 'examples', label: 'Chat Examples', icon: Code },
    ...(isSuperadmin ? [{ id: 'integrations', label: 'API Keys & Giphy', icon: Key }] : []),
    { id: 'ai-provider', label: 'AI Provider', icon: Sparkles },
    { id: 'simulator', label: 'Test My Clone', icon: Send },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics' },
  ];

  if (loading) {
    return (
      <div className="page-container settings-fullwidth">
        {/* Skeleton Page Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div className="skeleton" style={{ width: '82px', height: '22px', borderRadius: '4px' }} />
              <div className="skeleton" style={{ width: '180px', height: '14px', borderRadius: '4px' }} />
            </div>
            <div className="skeleton" style={{ width: '320px', height: '32px', borderRadius: '6px', marginBottom: '10px' }} />
            <div className="skeleton" style={{ width: '480px', maxWidth: '100%', height: '16px', borderRadius: '4px' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="skeleton" style={{ width: '84px', height: '36px', borderRadius: '6px' }} />
            <div className="skeleton" style={{ width: '124px', height: '36px', borderRadius: '6px' }} />
          </div>
        </div>

        {/* Skeleton Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)' }}>
          {[120, 140, 110, 115, 125, 135, 120].map((w, idx) => (
            <div
              key={idx}
              className="skeleton"
              style={{
                width: `${w}px`,
                height: '38px',
                borderRadius: '8px',
                flexShrink: 0
              }}
            />
          ))}
        </div>

        {/* Skeleton Form Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
            <div className="skeleton" style={{ width: '180px', height: '20px', marginBottom: '16px' }} />
            <div className="responsive-form-grid" style={{ marginBottom: '16px' }}>
              <div>
                <div className="skeleton" style={{ width: '100px', height: '14px', marginBottom: '8px' }} />
                <div className="skeleton" style={{ width: '100%', height: '40px' }} />
              </div>
              <div>
                <div className="skeleton" style={{ width: '120px', height: '14px', marginBottom: '8px' }} />
                <div className="skeleton" style={{ width: '100%', height: '40px' }} />
              </div>
            </div>
            <div>
              <div className="skeleton" style={{ width: '160px', height: '14px', marginBottom: '8px' }} />
              <div className="skeleton" style={{ width: '100%', height: '40px' }} />
            </div>
          </div>

          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div className="skeleton" style={{ width: '220px', height: '20px' }} />
              <div className="skeleton" style={{ width: '100px', height: '20px' }} />
            </div>
            <div className="skeleton" style={{ width: '70%', height: '14px', marginBottom: '16px' }} />
            <div className="skeleton" style={{ width: '100%', height: '130px' }} />
          </div>

          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
            <div className="skeleton" style={{ width: '280px', height: '20px', marginBottom: '12px' }} />
            <div className="skeleton" style={{ width: '60%', height: '14px', marginBottom: '16px' }} />
            <div className="skeleton" style={{ width: '100%', height: '110px' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      {...enterMotion}
      className="page-container split-page spx-page has-hero settings-fullwidth settings-split"
    >
      <PageHero
        seed="page-settings"
        icon={<UserCheck size={96} strokeWidth={2} />}
        eyebrow="Persona & AI model"
        title="Persona & AI Studio"
        desc="Teach the AI your voice, texting style and background so its replies sound like you."
      >
          <button
            onClick={() => {
              // Reset throws away edits: treat what is on screen as untouched so the reload replaces every field
              shownRef.current = { ...formData };
              fetchPersona();
            }}
            type="button"
            className="spx-outline"
            title="Reload settings from server"
          >
            <RefreshCw size={14} />
            <span>Reset</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            type="button"
            className="spx-play"
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Saving Changes...</span>
              </>
            ) : saveSuccess ? (
              <>
                <CheckCircle2 size={14} />
                <span>Saved Changes</span>
              </>
            ) : (
              <>
                <Save size={14} />
                <span>Save Persona</span>
              </>
            )}
          </button>
      </PageHero>

      {/* Error alert if any */}
      {!loaded && !loadFailed && (
        <div role="status" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'color-mix(in srgb, var(--color-info) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-info) 30%, transparent)',
          padding: '14px 18px',
          borderRadius: '12px',
          color: 'var(--color-text-primary)',
          fontSize: '0.86rem',
        }}>
          <RefreshCw size={18} className="animate-spin" />
          <span>Loading your saved settings. If the server was asleep this can take up to a minute; saving unlocks when it is done.</span>
        </div>
      )}

      {errorMsg && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'color-mix(in srgb, #ef4444 12%, transparent)',
          border: '1px solid color-mix(in srgb, #ef4444 35%, transparent)',
          padding: '14px 18px',
          borderRadius: '12px',
          color: 'var(--color-danger)',
          fontSize: '0.86rem',
          boxShadow: '0 2px 8px rgba(239,68,68,0.06)'
        }}>
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="split-body">
      <aside className="split-side">
        <nav className="split-card split-nav" aria-label="Persona sections">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={isActive ? 'is-on' : ''}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => (tab.href ? router.push(tab.href) : setActiveTab(tab.id))}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
                {tab.href && <ArrowUpRight size={13} className="split-nav-arrow" />}
              </button>
            );
          })}
        </nav>
        <section className="split-card split-grow split-hide-mobile">
          <p className="split-tip"><b>Tip:</b> fill in About Me and How To Text first. Then use <b>Test My Clone</b> to see how the AI replies. Press <b>Save Persona</b> when you are done.</p>
        </section>
      </aside>

      <div className="split-main settings-main">
      {/* TAB 1: ABOUT ME & PERSONAL DETAILS */}
      {activeTab === 'about' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Identity Header Card */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            padding: '28px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 8px 24px -4px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'var(--color-text-primary)',
                color: 'var(--color-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <UserCheck size={15} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.3px' }}>
                Identity &amp; Social Handle
              </h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
              Your basic name and handle that the AI introduces itself as.
            </p>

            <div className="responsive-form-grid" style={{ marginBottom: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  Creator Full Name
                </label>
                <input
                  type="text"
                  value={formData.creatorName}
                  onChange={e => setFormData({ ...formData, creatorName: e.target.value })}
                  placeholder="e.g. Alex Creator"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  Instagram Handle
                </label>
                <input
                  type="text"
                  value={formData.instagramHandle}
                  onChange={e => setFormData({ ...formData, instagramHandle: e.target.value })}
                  placeholder="e.g. @username"
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                Elevator Bio / One-Liner
              </label>
              <input
                type="text"
                value={formData.personaBio}
                onChange={e => setFormData({ ...formData, personaBio: e.target.value })}
                placeholder="Brief one-line summary of who you are, what you build, and your creator niche."
              />
            </div>
          </div>

          {/* Instagram API & Page Access Token Card */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: 1.3, margin: 0 }}>
                <Key size={18} style={{ marginTop: 2 }} />
                <span>Instagram API &amp; Direct Message Credentials</span>
              </h3>
              <span style={{
                fontSize: '0.72rem',
                background: (formData.instagramPageAccessToken || secretsSaved.instagram) ? 'color-mix(in srgb, #22c55e 12%, transparent)' : 'color-mix(in srgb, #f59e0b 14%, transparent)',
                color: (formData.instagramPageAccessToken || secretsSaved.instagram) ? 'var(--color-success)' : 'var(--color-warning)',
                border: (formData.instagramPageAccessToken || secretsSaved.instagram) ? '1px solid color-mix(in srgb, #22c55e 35%, transparent)' : '1px solid color-mix(in srgb, #f59e0b 35%, transparent)',
                padding: '2px 8px',
                borderRadius: '6px',
                fontWeight: '700',
                fontFamily: "var(--font-label)"
              }}>
                {(formData.instagramPageAccessToken || secretsSaved.instagram) ? 'TOKEN CONFIGURED' : 'ACTION REQUIRED: TOKEN MISSING'}
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
              Your Instagram Page Access Token and Instagram Account ID enable Chatter AI to send and receive messages on your behalf. You can view, copy, or update your credentials directly below.
            </p>

            {/* Meta OAuth Auto-Connect Action */}
            <div style={{
              background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-border)',
              borderRadius: '10px',
              padding: '14px 18px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontSize: '0.84rem', fontWeight: '700', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Instagram size={15} />
                  <span>Automatic Token Generation</span>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  Log in with Meta to auto-fetch and renew your Page Access Token &amp; Account ID without manual copy-pasting.
                </div>
              </div>

              <button
                type="button"
                onClick={handleLaunchInstagramOAuth}
                disabled={oauthConnecting}
                style={{
                  background: 'var(--ambient-dominant)',
                  color: 'var(--on-ambient-dominant, #000)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 16px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: oauthConnecting ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 3px 10px rgba(0, 0, 0, 0.25)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                {oauthConnecting ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Zap size={13} />
                    <span>Connect with Instagram</span>
                  </>
                )}
              </button>
            </div>

            <div className="responsive-form-grid" style={{ marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  Instagram Account / Page ID
                </label>
                <input
                  type="text"
                  value={formData.instagramAccountId}
                  onChange={e => setFormData({ ...formData, instagramAccountId: e.target.value })}
                  placeholder="e.g. 17841400000000000"
                  style={{ fontFamily: 'var(--font-code)', fontSize: '0.85rem' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                  The Meta Graph API Instagram Business Account ID.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  Page Access Token
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showAccessToken ? 'text' : 'password'}
                    value={formData.instagramPageAccessToken}
                    onChange={e => setFormData({ ...formData, instagramPageAccessToken: e.target.value })}
                    placeholder={secretsSaved.instagram ? 'Saved. Leave empty to keep it, or paste a new token' : 'EAA... (Meta Page Access Token)'}
                    style={{
                      fontFamily: 'var(--font-code)',
                      fontSize: '0.85rem',
                      paddingRight: '80px',
                      width: '100%'
                    }}
                  />
                  <div style={{ position: 'absolute', right: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAccessToken(!showAccessToken)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        padding: 0,
                        width: '40px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '8px'
                      }}
                      title={showAccessToken ? 'Hide Token' : 'Show Token'}
                      aria-label={showAccessToken ? 'Hide token' : 'Show token'}
                    >
                      <IconSwap k={showAccessToken ? 'eyeoff' : 'eye'}>{showAccessToken ? <EyeOff size={15} /> : <Eye size={15} />}</IconSwap>
                    </button>
                    {formData.instagramPageAccessToken && (
                      <button
                        type="button"
                        onClick={() => {
                          if (navigator?.clipboard) {
                            navigator.clipboard.writeText(formData.instagramPageAccessToken);
                            setCopiedToken(true);
                            showToast?.('Page Access Token copied to clipboard!', 'success');
                            setTimeout(() => setCopiedToken(false), 2000);
                          }
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: copiedToken ? 'var(--color-success)' : 'var(--color-text-secondary)',
                          cursor: 'pointer',
                          padding: '4px 6px',
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: '4px'
                        }}
                        title="Copy Token"
                      >
                        <IconSwap k={copiedToken ? 'check' : 'copy'}>{copiedToken ? <Check size={15} /> : <Copy size={15} />}</IconSwap>
                      </button>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                  Click the eye icon to view/edit your token. Click Save Persona at the top to save your changes.
                </span>
              </div>
            </div>
          </div>

          {/* Deep About Me Card */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: 1.3, margin: 0 }}>
                <BookOpen size={18} style={{ marginTop: 2 }} />
                <span>About Me & Life Background</span>
              </h3>
              <span style={{ fontSize: '0.72rem', background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                AI Brain Context
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
              Describe everything the AI should know about your real life: where you live, what you study or work on, your hobbies, favorite video games, tech stack, what projects you are currently building, etc.
            </p>

            <textarea
              rows={6}
              value={formData.aboutMe}
              onChange={e => setFormData({ ...formData, aboutMe: e.target.value })}
              placeholder="Describe your background, location, passions, creative tools, hobbies, what you are building, and how you speak to friends and followers..."
              style={{ lineHeight: '1.5', resize: 'vertical' }}
            />
          </div>

          {/* Custom Knowledge & FAQs Card */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: 1.3 }}>
              <Info size={18} style={{ marginTop: 2 }} />
              <span>My Knowledge Base & Frequent Questions</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
              List specific answers to questions people ask you frequently (collaborations, software, pricing, camera gear, tutorial plans).
            </p>

            <textarea
              rows={5}
              value={formData.customKnowledge}
              onChange={e => setFormData({ ...formData, customKnowledge: e.target.value })}
              placeholder="e.g.&#10;Account: @username&#10;Creator: Full Name&#10;Topics: Creative projects, tech, photography&#10;Location: City / Country&#10;Inquiries: DMs open for collaborations"
              style={{ lineHeight: '1.5', fontFamily: 'var(--font-code)' }}
            />
          </div>
        </div>
      )}

      {/* TAB 2: MY CHARACTERISTICS */}
      {activeTab === 'characteristics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Smile size={18} />
              <span>My Personality Traits & Characteristics</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              How do you come across to people? Are you witty, chill, humble, sarcastic, enthusiastic? Tell the AI how your inner vibe works.
            </p>

            {/* Quick Trait Chips */}
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                Quick Click to Add Trait:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  'Chill & Grounded',
                  'Witty & Playful',
                  'Supportive Friend',
                  'Gen-Z Energy',
                  'Humorous Sarcasm',
                  'Humble & Polite',
                  'Sweet with Girls',
                  'Bro Banter with Homies',
                  'Tech Geek',
                  'Creative Mind',
                  'Tanglish Banter'
                ].map(trait => (
                  <button
                    key={trait}
                    type="button"
                    onClick={() => addTraitChip(trait)}
                    style={{
                      background: 'var(--color-surface-hover)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-primary)',
                      padding: '4px 10px',
                      borderRadius: '16px',
                      fontSize: '0.76rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    + {trait}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              rows={6}
              value={formData.characteristics}
              onChange={e => setFormData({ ...formData, characteristics: e.target.value })}
              placeholder="e.g. Chill, witty, humble, friendly, authentic. Never arrogant. Gentle and sweet with girl friends, humorous and teasing banter with boys/homies. Supportive and present when someone shares their problems or asks for advice."
              style={{ lineHeight: '1.5', resize: 'vertical' }}
            />
          </div>

          {/* Overall Tone Guidelines Card */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={18} />
              <span>Overall Tone Guidelines & Rules</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
              Core numbered rules guiding the AI tone across all conversations.
            </p>

            <textarea
              rows={8}
              value={formData.toneGuidelines}
              onChange={e => setFormData({ ...formData, toneGuidelines: e.target.value })}
              placeholder="1. Talk like a real human on Instagram DM: casual, friendly, relatable, and authentic.&#10;2. NO FORMAL PUNCTUATION...&#10;3. USE NATURAL SHORTCUTS & SLANG..."
              style={{ lineHeight: '1.5' }}
            />
          </div>
        </div>
      )}

      {/* TAB 3: HOW TO TEXT */}
      {activeTab === 'texting' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Texting Habits */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={18} />
              <span>How I Text (Texting Habits & Grammar Rules)</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Specify your typing quirks: lowercase text, no ending periods, message length, shortcuts (rn, fr, tbh, idk, wbu), and slang usage.
            </p>

            {/* Quick Texting Habits Chips */}
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                Quick Click to Add Texting Rule:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  'Always casual lowercase',
                  'Never use ending periods (.)',
                  'Use shortcuts: rn, fr, tbh, idk, wbu, haha, yo, ngl',
                  '1 to 2 short lines max',
                  'Mirror the sender language',
                  'Tanglish for Tamil friends (dei, machan, enna da)',
                  'No robotic or formal sentences',
                  'Quick burst texting'
                ].map(rule => (
                  <button
                    key={rule}
                    type="button"
                    onClick={() => addTextingRuleChip(rule)}
                    style={{
                      background: 'var(--color-surface-hover)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-primary)',
                      padding: '4px 10px',
                      borderRadius: '16px',
                      fontSize: '0.76rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    + {rule}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              rows={6}
              value={formData.textingHabits}
              onChange={e => setFormData({ ...formData, textingHabits: e.target.value })}
              placeholder="e.g. Always casual lowercase. Never use stiff ending periods (.). Use casual shortcuts and abbreviations naturally (u, rn, fr, tbh, idk, wbu, haha, lol, yo, ngl). Keep messages concise (1-2 short lines max) in quick human bursts. Match the sender energy and language (Tanglish for Tamil friends, English for others)."
              style={{ lineHeight: '1.5', resize: 'vertical' }}
            />
          </div>

          {/* Forbidden & Banned Words */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={18} style={{ color: 'var(--color-danger)' }} />
              <span>Forbidden & Banned Words / Phrases</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Phrases the AI is strictly prohibited from ever typing (e.g. AI assistant cliches or words you never use).
            </p>

            {/* Input to add */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', maxWidth: '480px' }}>
              <input
                type="text"
                value={newForbiddenWord}
                onChange={e => setNewForbiddenWord(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddForbiddenWord(); } }}
                placeholder="Type word or phrase to ban (e.g. as an ai)..."
              />
              <button
                type="button"
                onClick={handleAddForbiddenWord}
                className="btn btn-primary"
                style={{ flexShrink: 0 }}
              >
                <Plus size={15} />
                <span>Add</span>
              </button>
            </div>

            {/* Word Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {formData.forbiddenWords.map((word, idx) => (
                <span
                  key={idx}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'color-mix(in srgb, #ef4444 12%, transparent)',
                    border: '1px solid color-mix(in srgb, #ef4444 35%, transparent)',
                    color: 'var(--color-danger)',
                    padding: '5px 12px',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: '600'
                  }}
                >
                  <span>"{word}"</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveForbiddenWord(word)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                    title="Remove banned phrase"
                  >
                    ×
                  </button>
                </span>
              ))}
              {formData.forbiddenWords.length === 0 && (
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>No forbidden words added.</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: HOW TO REPLY */}
      {activeTab === 'replying' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} />
              <span>How I Reply (Reaction Rules & Behaviors)</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Specify your rules for replying to different types of Instagram messages (reels, compliments, memes, questions, story replies).
            </p>

            <textarea
              rows={7}
              value={formData.replyRules}
              onChange={e => setFormData({ ...formData, replyRules: e.target.value })}
              placeholder="e.g.&#10;- When someone shares a Reel or Meme: React fast with emojis (😂, 💀, 🔥) or short reaction quips (dei semma, haha no way).&#10;- When someone sends a compliment: Be humble and hype them back.&#10;- When someone asks what I am doing: Tell them I am editing or working on projects.&#10;- When someone texts an emoji alone: React with a matching emoji or casual quip.&#10;- Never send multi-paragraph essays."
              style={{ lineHeight: '1.5', resize: 'vertical' }}
            />
          </div>

          {/* Typing Speed & Latency */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={18} />
              <span>Human Typing Delay & Pacing</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Simulates realistic human typing delay with active Instagram "typing..." status before dispatching replies.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', maxWidth: '400px' }}>
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.5"
                value={formData.typingDelaySeconds}
                onChange={e => setFormData({ ...formData, typingDelaySeconds: parseFloat(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span style={{ fontWeight: '700', fontSize: '0.95rem', minWidth: '60px' }}>
                {formData.typingDelaySeconds}s
              </span>
            </div>
            <span style={{ fontSize: '0.76rem', color: 'var(--color-text-secondary)', marginTop: '8px', display: 'block' }}>
              {formData.typingDelaySeconds <= 1
                ? 'Fast response (great for active testing)'
                : formData.typingDelaySeconds <= 2.5
                  ? 'Natural human speed (recommended for Instagram)'
                  : 'Realistic thoughtful pacing'}
            </span>
          </div>
        </div>
      )}

      {/* TAB 5: FEW-SHOT CHAT EXAMPLES */}
      {activeTab === 'examples' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Code size={18} />
              <span>Real Chat Examples (Few-Shot Prompting)</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
              These message pairs teach the AI exactly how you reply to real DM scenarios. The AI studies these examples to copy your speech rhythm.
            </p>

            {/* Existing Examples List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              {formData.sampleConversations.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--color-surface-elevated)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                          Incoming User DM:
                        </span>
                      </div>
                      <p style={{ fontSize: '0.84rem', color: 'var(--color-text-primary)', background: 'var(--color-surface)', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                        "{item.userMessage}"
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveSampleConversation(idx)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px', marginLeft: '12px' }}
                      title="Delete example"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--color-success)', textTransform: 'uppercase' }}>
                        How {formData.creatorName} Replies:
                      </span>
                    </div>
                    <p style={{ fontSize: '0.84rem', color: 'var(--color-text-primary)', background: 'color-mix(in srgb, #22c55e 12%, transparent)', padding: '6px 12px', borderRadius: '6px', border: '1px solid color-mix(in srgb, #22c55e 35%, transparent)', fontWeight: '500' }}>
                      "{item.myReply}"
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Add New Example Card */}
            <div style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border-strong)', borderRadius: '8px', padding: '16px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--color-text-primary)', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                + Add New Chat Example
              </span>
              <div className="responsive-form-grid" style={{ marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                    User's Message:
                  </label>
                  <input
                    type="text"
                    value={newSampleUser}
                    onChange={e => setNewSampleUser(e.target.value)}
                    placeholder="e.g. what video editor do you use?"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                    Your Real Reply:
                  </label>
                  <input
                    type="text"
                    value={newSampleReply}
                    onChange={e => setNewSampleReply(e.target.value)}
                    placeholder="e.g. Premiere Pro & AE mostly! what are you editing on?"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddSampleConversation}
                className="btn btn-primary"
                style={{ fontSize: '0.8rem', padding: '7px 14px' }}
              >
                <Plus size={14} />
                <span>Add Example</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB: API KEYS & INTEGRATIONS (Superadmin only) */}
      {activeTab === 'integrations' && isSuperadmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* GIPHY Developer Key Card */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={18} style={{ color: 'var(--color-text-primary)' }} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--color-text-primary)', margin: 0 }}>
                  GIPHY API & Reaction GIFs
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {giphyStatus === 'success' ? (
                  <span style={{ fontSize: '0.72rem', background: 'color-mix(in srgb, #22c55e 14%, transparent)', color: 'var(--color-success)', padding: '4px 10px', borderRadius: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={12} />
                    <span>Connected & Verified</span>
                  </span>
                ) : giphyStatus === 'error' ? (
                  <span style={{ fontSize: '0.72rem', background: 'color-mix(in srgb, #ef4444 14%, transparent)', color: 'var(--color-danger)', padding: '4px 10px', borderRadius: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={12} />
                    <span>Connection Failed</span>
                  </span>
                ) : (
                  <span style={{ fontSize: '0.72rem', background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)', padding: '4px 10px', borderRadius: '20px', fontWeight: '700' }}>
                    {secretsSaved.giphy ? 'Saved in Database' : 'Not Saved Yet'}
                  </span>
                )}
              </div>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)', marginBottom: '18px', maxWidth: '720px' }}>
              Your Giphy API Key powers instant GIF searches, predefined reactions, and automatically attaches relevant comedic media at 50% priority frequency in Instagram DMs when friends text trigger keywords (e.g., &quot;u sus&quot;, &quot;why chatting like ai&quot;, &quot;lol&quot;).
            </p>

            {/* Input with Show/Hide toggle */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                GIPHY API Key
              </label>
              <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
                <input
                  type={showGiphyKey ? 'text' : 'password'}
                  value={formData.giphyApiKey || ''}
                  onChange={e => setFormData({ ...formData, giphyApiKey: e.target.value })}
                  placeholder={secretsSaved.giphy ? 'Saved. Leave empty to keep it, or enter a new key' : 'Enter Giphy API Key (from developers.giphy.com)'}
                  style={{
                    fontFamily: "var(--font-label)",
                    fontSize: '0.86rem',
                    letterSpacing: showGiphyKey ? '0.02em' : '0.12em',
                    paddingRight: '40px'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowGiphyKey(!showGiphyKey)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title={showGiphyKey ? 'Hide Key' : 'Show Key'}
                >
                  <IconSwap k={showGiphyKey ? 'eyeoff' : 'eye'}>{showGiphyKey ? <EyeOff size={16} /> : <Eye size={16} />}</IconSwap>
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleTestGiphyKey}
                disabled={testingGiphy}
                className="btn"
                style={{ fontSize: '0.8rem', padding: '8px 16px' }}
              >
                {testingGiphy ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Verifying with Giphy API...</span>
                  </>
                ) : (
                  <>
                    <Zap size={13} />
                    <span>Test GIPHY Connection</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn btn-primary"
                style={{ fontSize: '0.8rem', padding: '8px 18px' }}
              >
                <Save size={13} />
                <span>Save Key to DB</span>
              </button>
            </div>

            {/* Features callout */}
            <div style={{ marginTop: '20px', padding: '16px', background: 'var(--color-surface-elevated)', borderRadius: '8px', border: '1px solid var(--color-surface-hover)' }}>
              <div style={{ fontSize: '0.76rem', fontWeight: '800', color: 'var(--color-text-primary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                How This Key Is Used In Real Chats
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                <li><strong>50% Priority Attachments:</strong> In ~2 out of 5 DMs, the bot automatically selects a GIF matching the emotional context instead of sending plain text.</li>
                <li><strong>Trigger Words:</strong> Friend says &quot;u sus&quot; or &quot;why like ai&quot; &rarr; Bot automatically replies with side-eye / Chloe / dog doubt GIF.</li>
                <li><strong>Curated & Custom Vault:</strong> Browse, preview, and 1-click import trending reaction GIFs in the Media Vault tab.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: LIVE TEST SIMULATOR */}
      {/* AI PROVIDER (BYO-LLM, local models, A2A MCP) */}
      {activeTab === 'ai-provider' && <AiProviderCard />}

      {activeTab === 'simulator' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: 1.3, margin: 0 }}>
                <Send size={18} style={{ marginTop: 2 }} />
                <span>Test How AI Talks As You</span>
              </h3>
              <span style={{ fontSize: '0.74rem', background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)', padding: '3px 8px', borderRadius: '4px', fontWeight: '700' }}>
                LIVE PREVIEW
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '18px' }}>
              Send any test DM below to verify how your AI clone texts back using your saved persona and reply rules.
            </p>

            {/* Chat Messages Window */}
            <div
              style={{
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '16px',
                minHeight: '260px',
                maxHeight: '400px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                marginBottom: '16px'
              }}
            >
              {testMessages.map((msg, i) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isUser ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '3px', padding: '0 4px' }}>
                      {isUser ? 'Friend / User' : `${formData.creatorName} (AI Clone)`}
                    </span>
                    <div
                      style={{
                        background: isUser ? 'var(--color-text-primary)' : 'var(--color-surface)',
                        color: isUser ? 'var(--color-surface)' : 'var(--color-text-primary)',
                        border: isUser ? 'none' : '1px solid var(--color-border)',
                        padding: '9px 14px',
                        borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                        fontSize: '0.85rem',
                        maxWidth: '80%',
                        wordBreak: 'break-word',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                      }}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })}

              {testSending && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)', fontSize: '0.8rem', fontStyle: 'italic', padding: '4px' }}>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>{formData.creatorName} is typing...</span>
                </div>
              )}
            </div>

            {/* Input bar */}
            <form onSubmit={handleSendTestMessage} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={testInput}
                onChange={e => setTestInput(e.target.value)}
                placeholder="Type a test DM to your AI clone (e.g. what editing tools do u use?)..."
                disabled={testSending}
              />
              <button
                type="submit"
                disabled={testSending || !testInput.trim()}
                className="btn btn-primary"
                style={{ flexShrink: 0 }}
              >
                <Send size={15} />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}
      </div>
      </div>
    </motion.div>
  );
}

// The superadmin check lives outside the page so the page's hooks always run in the same order
/** Persona copy without the Instagram token / Giphy key (never cached or re-sent blank). */
function stripSecrets(data) {
  const { instagramPageAccessToken, giphyApiKey, ...rest } = data || {};
  return rest;
}

export default function SettingsPage() {
  const { user, isImpersonating } = useApp();
  if (user?.role === 'superadmin' && !isImpersonating) {
    return (
      <SuperadminWorkspacePrompt
        sectionTitle="Creator Persona & Style"
        sectionCode="04 // SETTINGS"
        sectionDescription="Persona, bio, texting style, tone guidelines, and forbidden words are configured per individual creator workspace. Choose a creator workspace below to inspect and manage their persona."
      />
    );
  }
  return <SettingsPageContent />;
}
