'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  UserCheck, Save, Sparkles, MessageSquare, AlertCircle,
  CheckCircle2, Plus, Trash2, Send, Sliders, Info,
  Code, RefreshCw, Smile, Zap, BookOpen, ShieldAlert, Key, Eye, EyeOff, Instagram,
  Copy, Check
} from 'lucide-react';
import SuperadminWorkspacePrompt from '../components/SuperadminWorkspacePrompt';
import { motion } from 'framer-motion';

export default function SettingsPage() {
  const { API_BASE, token, showToast, user, isImpersonating, updateUserProfile } = useApp();

  // If pure superadmin (not inside an impersonated creator workspace), show creator selector
  if (user?.role === 'superadmin' && !isImpersonating) {
    return (
      <SuperadminWorkspacePrompt
        sectionTitle="Creator Persona & Style"
        sectionCode="04 // SETTINGS"
        sectionDescription="Persona, bio, texting style, tone guidelines, and forbidden words are configured per individual creator workspace. Choose a creator workspace below to inspect and manage their persona."
      />
    );
  }

  const [activeTab, setActiveTab] = useState('about');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    creatorName: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : (user?.username || ''),
    instagramHandle: user?.instagramUsername ? `@${user.instagramUsername.replace(/^@/, '')}` : '',
    instagramPageAccessToken: user?.instagramPageAccessToken || '',
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
      if (event.data?.type === 'INSTAGRAM_OAUTH_SUCCESS') {
        const { instagramUsername: igUser, instagramAccountId: igId, instagramPageAccessToken: igToken } = event.data.payload || {};
        setFormData(prev => ({
          ...prev,
          ...(igUser ? { instagramHandle: `@${igUser.replace(/^@/, '')}` } : {}),
          ...(igId ? { instagramAccountId: igId } : {}),
          ...(igToken ? { instagramPageAccessToken: igToken } : {}),
        }));
        setOauthConnecting(false);
        if (updateUserProfile) {
          updateUserProfile({
            hasInstagramToken: true,
            isInstagramConnected: true,
            instagramPageAccessToken: igToken,
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

  const handleLaunchInstagramOAuth = () => {
    setErrorMsg('');
    setOauthConnecting(true);
    try {
      const clientOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const oauthUrl = `${API_BASE}/api/auth/instagram/connect?origin=${encodeURIComponent(clientOrigin)}&token=${encodeURIComponent(token || '')}`;
      const popup = window.open(oauthUrl, 'instagram_oauth', 'width=620,height=720,left=250,top=100');
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

  // Fetch current persona on mount
  useEffect(() => {
    fetchPersona();
  }, [user?._id]);

  const fetchPersona = async () => {
    const userCacheKey = user?._id ? `chatter_persona_cached_${user._id}` : 'chatter_persona_cached';
    // Only show cached persona if scoped to current user
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(userCacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && (parsed.creatorName || parsed.instagramHandle)) {
            setFormData(prev => ({ ...prev, ...parsed }));
            setLoading(false);
          }
        }
      } catch (e) {
        // ignore localStorage parse error
      }
    }

    try {
      const res = await fetch(`${API_BASE}/api/persona`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        const defaultName = user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : (user?.username || 'Creator');
        const defaultHandle = user?.instagramUsername ? `@${user.instagramUsername.replace(/^@/, '')}` : (user?.username ? `@${user.username}` : '@handle');
        const updated = {
          creatorName: data.creatorName || defaultName,
          instagramHandle: data.instagramHandle || defaultHandle,
          instagramPageAccessToken: data.instagramPageAccessToken || user?.instagramPageAccessToken || '',
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
          giphyApiKey: data.giphyApiKey || '',
        };
        setFormData(updated);
        try {
          localStorage.setItem(userCacheKey, JSON.stringify(updated));
        } catch (e) {}
      }
    } catch (err) {
      console.error('Failed to load persona config:', err);
      setErrorMsg('Could not fetch settings from server. Check your connection.');
    } finally {
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
        showToast('Enter a GIPHY API key first', 'error');
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
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/persona`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setSaveSuccess(true);
        if (typeof window !== 'undefined') {
          const userCacheKey = user?._id ? `chatter_persona_cached_${user._id}` : 'chatter_persona_cached';
          try {
            localStorage.setItem(userCacheKey, JSON.stringify(formData));
          } catch (e) {}
        }

        if (updateUserProfile) {
          updateUserProfile({
            hasInstagramToken: Boolean(formData.instagramPageAccessToken),
            isInstagramConnected: Boolean(formData.instagramPageAccessToken),
            instagramPageAccessToken: formData.instagramPageAccessToken,
            instagramAccountId: formData.instagramAccountId,
            instagramUsername: formData.instagramHandle?.replace(/^@/, ''),
            firstName: formData.creatorName,
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

      const data = await res.json();
      if (data.success && data.reply) {
        setTestMessages(prev => [...prev, { role: 'assistant', text: data.reply }]);
      } else {
        setTestMessages(prev => [...prev, { role: 'assistant', text: '(AI generation error or empty response)' }]);
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
    { id: 'simulator', label: 'Test My Clone', icon: Send },
  ];

  if (loading) {
    return (
      <div className="page-container settings-fullwidth" style={{ maxWidth: '1400px', width: '100%' }}>
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
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '24px', borderBottom: '1px solid #e4e4e7' }}>
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
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
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

          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div className="skeleton" style={{ width: '220px', height: '20px' }} />
              <div className="skeleton" style={{ width: '100px', height: '20px' }} />
            </div>
            <div className="skeleton" style={{ width: '70%', height: '14px', marginBottom: '16px' }} />
            <div className="skeleton" style={{ width: '100%', height: '130px' }} />
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="page-container settings-fullwidth"
      style={{ maxWidth: '1400px', width: '100%' }}
    >
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          
            <span style={{ fontSize: '0.76rem', color: '#71717a', fontWeight: '600' }}>
              AI PERSONA & STYLING ENGINE
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#09090b', letterSpacing: '-0.03em', margin: 0 }}>
            My Persona & Texting Profile
          </h1>
          <p style={{ fontSize: '0.86rem', color: '#71717a', marginTop: '4px', maxWidth: '640px' }}>
            Teach your AI clone who you are, how you text, your characteristics, and reply rules so it talks, banters, and reacts exactly like you.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={fetchPersona}
            className="btn"
            style={{ fontSize: '0.8rem', padding: '8px 14px' }}
            title="Reload settings from server"
          >
            <RefreshCw size={14} />
            <span>Reset</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
            style={{ fontSize: '0.8rem', padding: '8px 18px', background: saveSuccess ? '#16a34a' : '#09090b' }}
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : saveSuccess ? (
              <>
                <CheckCircle2 size={14} />
                <span>Saved ✓</span>
              </>
            ) : (
              <>
                <Save size={14} />
                <span>Save Settings</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error alert if any */}
      {errorMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '8px', color: '#991b1b', marginBottom: '20px', fontSize: '0.85rem' }}>
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '24px', borderBottom: '1px solid #e4e4e7' }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? '#09090b' : 'transparent',
                color: isActive ? '#ffffff' : '#71717a',
                fontSize: '0.84rem',
                fontWeight: isActive ? '700' : '500',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ABOUT ME & PERSONAL DETAILS */}
      {activeTab === 'about' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Identity Header Card */}
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserCheck size={18} />
              <span>Identity & Social Presence</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '20px' }}>
              Your basic name and handle that the AI introduces itself as.
            </p>

            <div className="responsive-form-grid" style={{ marginBottom: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
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
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
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
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
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
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={18} />
                <span>Instagram API &amp; Direct Message Credentials</span>
              </h3>
              <span style={{
                fontSize: '0.72rem',
                background: formData.instagramPageAccessToken ? '#ecfdf5' : '#fef3c7',
                color: formData.instagramPageAccessToken ? '#047857' : '#b45309',
                border: formData.instagramPageAccessToken ? '1px solid #a7f3d0' : '1px solid #fde68a',
                padding: '2px 8px',
                borderRadius: '6px',
                fontWeight: '700',
                fontFamily: "'JetBrains Mono', monospace"
              }}>
                {formData.instagramPageAccessToken ? 'TOKEN CONFIGURED' : 'ACTION REQUIRED: TOKEN MISSING'}
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '20px' }}>
              Your Instagram Page Access Token and Instagram Account ID enable Chatter AI to send and receive messages on your behalf. You can view, copy, or update your credentials directly below.
            </p>

            {/* Meta OAuth Auto-Connect Action */}
            <div style={{
              background: '#fafafa',
              border: '1px solid #e4e4e7',
              borderRadius: '10px',
              padding: '14px 18px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div>
                <div style={{ fontSize: '0.84rem', fontWeight: '700', color: '#09090b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Instagram size={15} />
                  <span>Automatic Token Generation</span>
                </div>
                <div style={{ fontSize: '0.74rem', color: '#71717a', marginTop: '2px' }}>
                  Log in with Meta to auto-fetch and renew your Page Access Token &amp; Account ID without manual copy-pasting.
                </div>
              </div>

              <button
                type="button"
                onClick={handleLaunchInstagramOAuth}
                disabled={oauthConnecting}
                style={{
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 16px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: oauthConnecting ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 3px 10px rgba(124, 58, 237, 0.2)',
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
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                  Instagram Account / Page ID
                </label>
                <input
                  type="text"
                  value={formData.instagramAccountId}
                  onChange={e => setFormData({ ...formData, instagramAccountId: e.target.value })}
                  placeholder="e.g. 17841400000000000"
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                />
                <span style={{ fontSize: '0.72rem', color: '#a1a1aa', marginTop: '4px', display: 'block' }}>
                  The Meta Graph API Instagram Business Account ID.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                  Page Access Token
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showAccessToken ? 'text' : 'password'}
                    value={formData.instagramPageAccessToken}
                    onChange={e => setFormData({ ...formData, instagramPageAccessToken: e.target.value })}
                    placeholder="EAA... (Meta Page Access Token)"
                    style={{
                      fontFamily: 'monospace',
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
                        color: '#71717a',
                        cursor: 'pointer',
                        padding: '4px 6px',
                        display: 'flex',
                        alignItems: 'center',
                        borderRadius: '4px'
                      }}
                      title={showAccessToken ? 'Hide Token' : 'Show Token'}
                    >
                      {showAccessToken ? <EyeOff size={15} /> : <Eye size={15} />}
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
                          color: copiedToken ? '#16a34a' : '#71717a',
                          cursor: 'pointer',
                          padding: '4px 6px',
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: '4px'
                        }}
                        title="Copy Token"
                      >
                        {copiedToken ? <Check size={15} /> : <Copy size={15} />}
                      </button>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#a1a1aa', marginTop: '4px', display: 'block' }}>
                  Click the eye icon to view/edit your token. Click Save Settings in the top right to commit updates.
                </span>
              </div>
            </div>
          </div>

          {/* Deep About Me Card */}
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BookOpen size={18} />
                <span>About Me & Life Background</span>
              </h3>
              <span style={{ fontSize: '0.72rem', background: '#f4f4f5', color: '#71717a', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                AI Brain Context
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '14px' }}>
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
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={18} />
              <span>My Knowledge Base & Frequent Questions</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '14px' }}>
              List specific answers to questions people ask you frequently (collaborations, software, pricing, camera gear, tutorial plans).
            </p>

            <textarea
              rows={5}
              value={formData.customKnowledge}
              onChange={e => setFormData({ ...formData, customKnowledge: e.target.value })}
              placeholder="e.g.&#10;Account: @username&#10;Creator: Full Name&#10;Topics: Creative projects, tech, photography&#10;Location: City / Country&#10;Inquiries: DMs open for collaborations"
              style={{ lineHeight: '1.5', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem' }}
            />
          </div>
        </div>
      )}

      {/* TAB 2: MY CHARACTERISTICS */}
      {activeTab === 'characteristics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Smile size={18} />
              <span>My Personality Traits & Characteristics</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '16px' }}>
              How do you come across to people? Are you witty, chill, humble, sarcastic, enthusiastic? Tell the AI how your inner vibe works.
            </p>

            {/* Quick Trait Chips */}
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
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
                      background: '#f4f4f5',
                      border: '1px solid #e4e4e7',
                      color: '#09090b',
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
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={18} />
              <span>Overall Tone Guidelines & Rules</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '14px' }}>
              Core numbered rules guiding the AI tone across all conversations.
            </p>

            <textarea
              rows={8}
              value={formData.toneGuidelines}
              onChange={e => setFormData({ ...formData, toneGuidelines: e.target.value })}
              placeholder="1. Talk like a real human on Instagram DM: casual, friendly, relatable, and authentic.&#10;2. NO FORMAL PUNCTUATION...&#10;3. USE NATURAL SHORTCUTS & SLANG..."
              style={{ lineHeight: '1.5', resize: 'vertical', fontSize: '0.84rem' }}
            />
          </div>
        </div>
      )}

      {/* TAB 3: HOW TO TEXT */}
      {activeTab === 'texting' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Texting Habits */}
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={18} />
              <span>How I Text (Texting Habits & Grammar Rules)</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '16px' }}>
              Specify your typing quirks: lowercase text, no ending periods, message length, shortcuts (rn, fr, tbh, idk, wbu), and slang usage.
            </p>

            {/* Quick Texting Habits Chips */}
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
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
                      background: '#f4f4f5',
                      border: '1px solid #e4e4e7',
                      color: '#09090b',
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
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={18} style={{ color: '#dc2626' }} />
              <span>Forbidden & Banned Words / Phrases</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '16px' }}>
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
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
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
                    style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                    title="Remove banned phrase"
                  >
                    ×
                  </button>
                </span>
              ))}
              {formData.forbiddenWords.length === 0 && (
                <span style={{ fontSize: '0.82rem', color: '#a1a1aa' }}>No forbidden words added.</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: HOW TO REPLY */}
      {activeTab === 'replying' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} />
              <span>How I Reply (Reaction Rules & Behaviors)</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '16px' }}>
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
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={18} />
              <span>Human Typing Delay & Pacing</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '16px' }}>
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
            <span style={{ fontSize: '0.76rem', color: '#71717a', marginTop: '8px', display: 'block' }}>
              {formData.typingDelaySeconds <= 1
                ? '⚡ Fast response (great for active testing)'
                : formData.typingDelaySeconds <= 2.5
                ? '✨ Natural human speed (recommended for Instagram)'
                : '⏳ Realistic thoughtful pacing'}
            </span>
          </div>
        </div>
      )}

      {/* TAB 5: FEW-SHOT CHAT EXAMPLES */}
      {activeTab === 'examples' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Code size={18} />
              <span>Real Chat Examples (Few-Shot Prompting)</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '20px' }}>
              These message pairs teach the AI exactly how you reply to real DM scenarios. The AI studies these examples to copy your speech rhythm.
            </p>

            {/* Existing Examples List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              {formData.sampleConversations.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#fafafa',
                    border: '1px solid #e4e4e7',
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
                        <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase' }}>
                          Incoming User DM:
                        </span>
                      </div>
                      <p style={{ fontSize: '0.84rem', color: '#09090b', background: '#ffffff', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e4e4e7' }}>
                        "{item.userMessage}"
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveSampleConversation(idx)}
                      style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px', marginLeft: '12px' }}
                      title="Delete example"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#16a34a', textTransform: 'uppercase' }}>
                        How {formData.creatorName} Replies:
                      </span>
                    </div>
                    <p style={{ fontSize: '0.84rem', color: '#09090b', background: '#f0fdf4', padding: '6px 12px', borderRadius: '6px', border: '1px solid #bbf7d0', fontWeight: '500' }}>
                      "{item.myReply}"
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Add New Example Card */}
            <div style={{ background: '#ffffff', border: '1px dashed #d4d4d8', borderRadius: '8px', padding: '16px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#09090b', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                + Add New Chat Example
              </span>
              <div className="responsive-form-grid" style={{ marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#71717a', marginBottom: '4px' }}>
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
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#71717a', marginBottom: '4px' }}>
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
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={18} style={{ color: '#09090b' }} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', margin: 0 }}>
                  GIPHY API & Reaction GIFs
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {giphyStatus === 'success' ? (
                  <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={12} />
                    <span>Connected & Verified</span>
                  </span>
                ) : giphyStatus === 'error' ? (
                  <span style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={12} />
                    <span>Connection Failed</span>
                  </span>
                ) : (
                  <span style={{ fontSize: '0.72rem', background: '#f4f4f5', color: '#09090b', padding: '4px 10px', borderRadius: '20px', fontWeight: '700' }}>
                    Saved in Database
                  </span>
                )}
              </div>
            </div>

            <p style={{ fontSize: '0.84rem', color: '#71717a', marginBottom: '18px', maxWidth: '720px' }}>
              Your Giphy API Key powers instant GIF searches, predefined reactions, and automatically attaches relevant comedic media at 50% priority frequency in Instagram DMs when friends text trigger keywords (e.g., &quot;u sus&quot;, &quot;why chatting like ai&quot;, &quot;lol&quot;).
            </p>

            {/* Input with Show/Hide toggle */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                GIPHY API Key
              </label>
              <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
                <input
                  type={showGiphyKey ? 'text' : 'password'}
                  value={formData.giphyApiKey || ''}
                  onChange={e => setFormData({ ...formData, giphyApiKey: e.target.value })}
                  placeholder="Enter Giphy API Key (from developers.giphy.com)"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
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
                    color: '#71717a',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title={showGiphyKey ? 'Hide Key' : 'Show Key'}
                >
                  {showGiphyKey ? <EyeOff size={16} /> : <Eye size={16} />}
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
            <div style={{ marginTop: '20px', padding: '16px', background: '#fafafa', borderRadius: '8px', border: '1px solid #f4f4f5' }}>
              <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#09090b', textTransform: 'uppercase', marginBottom: '8px' }}>
                How This Key Is Used In Real Chats
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: '#71717a', lineHeight: 1.6 }}>
                <li><strong>50% Priority Attachments:</strong> In ~2 out of 5 DMs, the bot automatically selects a GIF matching the emotional context instead of sending plain text.</li>
                <li><strong>Trigger Words:</strong> Friend says &quot;u sus&quot; or &quot;why like ai&quot; &rarr; Bot automatically replies with side-eye / Chloe / dog doubt GIF.</li>
                <li><strong>Curated & Custom Vault:</strong> Browse, preview, and 1-click import trending reaction GIFs in the Media Vault tab.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: LIVE TEST SIMULATOR */}
      {activeTab === 'simulator' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Send size={18} />
                <span>Test How AI Talks As You</span>
              </h3>
              <span style={{ fontSize: '0.74rem', background: '#f4f4f5', color: '#09090b', padding: '3px 8px', borderRadius: '4px', fontWeight: '700' }}>
                LIVE PREVIEW
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '18px' }}>
              Send any test DM below to verify how your AI clone texts back using your saved persona and reply rules.
            </p>

            {/* Chat Messages Window */}
            <div
              style={{
                background: '#fafafa',
                border: '1px solid #e4e4e7',
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
                    <span style={{ fontSize: '0.7rem', color: '#a1a1aa', marginBottom: '3px', padding: '0 4px' }}>
                      {isUser ? 'Friend / User' : `${formData.creatorName} (AI Clone)`}
                    </span>
                    <div
                      style={{
                        background: isUser ? '#09090b' : '#ffffff',
                        color: isUser ? '#ffffff' : '#09090b',
                        border: isUser ? 'none' : '1px solid #e4e4e7',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#71717a', fontSize: '0.8rem', fontStyle: 'italic', padding: '4px' }}>
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
    </motion.div>
  );
}
