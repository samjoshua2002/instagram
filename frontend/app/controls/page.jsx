'use client';

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import ContactAvatar from '../components/ContactAvatar';
import {
  Sliders, Search, Check, RefreshCw, Users, Bot, Film, Pause,
  Sparkles, Send, ExternalLink, X, Zap, Clock, Share2
} from 'lucide-react';

const INTEREST_KEYWORDS = [
  { label: '🐹 Hamsters & Pets', test: /hamster|pet|guinea|animal|cat|dog/i },
  { label: '🩺 Medicine & Health', test: /mbbs|doctor|medicine|hospital|clinic|health|steth/i },
  { label: '🎭 Tamil Comedy', test: /tamil|vadivelu|goundamani|chennai|tanglish/i },
  { label: '🔥 Hinglish Memes', test: /hindi|hinglish|bhai|delhi|mumbai|meme/i },
  { label: '🎨 Design & UI', test: /design|ui|ux|graphic|figma|art|creative/i },
  { label: '💻 Coding & Tech', test: /code|developer|software|tech|python|javascript|ai|startup/i },
  { label: '🍿 Movies & Netflix', test: /netflix|movie|cinema|series|kdrama|film/i },
  { label: '💪 Fitness & Gym', test: /gym|workout|fitness|diet|muscle|protein/i },
  { label: '🎧 Music & Vibes', test: /music|song|spotify|concert|guitar/i },
  { label: '✈️ Travel & Food', test: /travel|food|biryani|trip|cafe|wander/i },
];

function getContactInterestTags(contact) {
  if (Array.isArray(contact.reelInterests) && contact.reelInterests.length > 0) {
    return contact.reelInterests;
  }
  const text = `${contact.name || ''} ${contact.relationship || ''} ${(contact.facts || []).join(' ')} ${contact.notes || ''}`.toLowerCase();
  const matched = [];
  for (const item of INTEREST_KEYWORDS) {
    if (item.test.test(text)) {
      matched.push(item.label);
    }
  }
  return matched.length > 0 ? matched.slice(0, 3) : ['✨ Friendly Vibes'];
}

export default function ControlsPage() {
  const {
    nodes,
    routingConfig,
    saveRouting,
    setRoutingConfig,
    updateContactPreferences,
    getReelRecommendation,
    sendInterestReel,
    autoDispatchReels,
    showToast
  } = useApp();
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);

  // Reel Preview & Send Modal state
  const [selectedContactForReel, setSelectedContactForReel] = useState(null);
  const [reelRecommendation, setReelRecommendation] = useState(null);
  const [isLoadingReel, setIsLoadingReel] = useState(false);
  const [isSendingReel, setIsSendingReel] = useState(false);
  const [reelCaption, setReelCaption] = useState('');
  const [reelUrl, setReelUrl] = useState('');

  const friendNodes = useMemo(() => nodes.filter(n => !n.isRoot), [nodes]);

  const filteredFriends = useMemo(() => {
    if (!search.trim()) return friendNodes;
    const q = search.toLowerCase();
    return friendNodes.filter(n =>
      n.name.toLowerCase().includes(q) ||
      (n.handle || '').toLowerCase().includes(q) ||
      (n.relationship || '').toLowerCase().includes(q)
    );
  }, [friendNodes, search]);

  const getContactKey = (c) => {
    if (c.senderId && c.senderId.trim()) return c.senderId.trim();
    if (c.handle && c.handle.trim()) return c.handle.replace(/^@/, '').toLowerCase().trim();
    if (c.id && c.id.trim()) return c.id.trim();
    return (c.name || '').toLowerCase().replace(/[^a-z0-9]/g, '_').trim();
  };

  const isExcluded = (contact) => {
    const key = getContactKey(contact);
    const excluded = (routingConfig.excludedContactIds || []).filter(Boolean);
    return (
      excluded.includes(key) ||
      (contact.senderId && excluded.includes(contact.senderId)) ||
      (contact.handle && excluded.includes(contact.handle.replace(/^@/, '').toLowerCase())) ||
      (contact.id && excluded.includes(contact.id)) ||
      contact.aiEnabled === false
    );
  };

  const isIncluded = (contact) => {
    const key = getContactKey(contact);
    const included = (routingConfig.includedContactIds || []).filter(Boolean);
    return (
      included.includes(key) ||
      (contact.senderId && included.includes(contact.senderId)) ||
      (contact.handle && included.includes(contact.handle.replace(/^@/, '').toLowerCase())) ||
      (contact.id && included.includes(contact.id))
    );
  };

  const handleToggleExclude = (contact) => {
    const key = getContactKey(contact);
    const current = (routingConfig.excludedContactIds || []).filter(Boolean);
    const alreadyExcluded = isExcluded(contact);

    let next;
    if (alreadyExcluded) {
      next = current.filter(id =>
        id !== key &&
        id !== contact.senderId &&
        id !== (contact.handle ? contact.handle.replace(/^@/, '').toLowerCase() : '') &&
        id !== contact.id
      );
    } else {
      next = [...current, key];
    }
    setRoutingConfig(prev => ({ ...prev, excludedContactIds: next }));
  };

  const handleToggleInclude = (contact) => {
    const key = getContactKey(contact);
    const current = (routingConfig.includedContactIds || []).filter(Boolean);
    const alreadyIncluded = isIncluded(contact);

    let next;
    if (alreadyIncluded) {
      next = current.filter(id =>
        id !== key &&
        id !== contact.senderId &&
        id !== (contact.handle ? contact.handle.replace(/^@/, '').toLowerCase() : '') &&
        id !== contact.id
      );
    } else {
      next = [...current, key];
    }
    setRoutingConfig(prev => ({ ...prev, includedContactIds: next }));
  };

  const handleSelectAll = () => {
    const allKeys = friendNodes.map(n => getContactKey(n)).filter(Boolean);
    if (routingConfig.chatMode === 'everyone_except') {
      setRoutingConfig(prev => ({ ...prev, excludedContactIds: allKeys }));
    } else if (routingConfig.chatMode === 'only_selected') {
      setRoutingConfig(prev => ({ ...prev, includedContactIds: allKeys }));
    }
  };

  const handleClearAll = () => {
    if (routingConfig.chatMode === 'everyone_except') {
      setRoutingConfig(prev => ({ ...prev, excludedContactIds: [] }));
    } else if (routingConfig.chatMode === 'only_selected') {
      setRoutingConfig(prev => ({ ...prev, includedContactIds: [] }));
    }
  };

  const onSave = async () => {
    setIsSaving(true);
    await saveRouting(routingConfig);
    setIsSaving(false);
  };

  const handleOpenReelModal = async (contact) => {
    setSelectedContactForReel(contact);
    setIsLoadingReel(true);
    setReelRecommendation(null);
    setReelCaption('');
    setReelUrl('');
    try {
      const rec = await getReelRecommendation(contact.senderId || contact.name);
      if (rec && rec.recommendation) {
        setReelRecommendation(rec);
        setReelCaption(rec.recommendation.caption || '');
        setReelUrl(rec.recommendation.reel?.url || '');
      } else {
        showToast('Could not find specific reel recommendation');
      }
    } catch (err) {
      showToast('Error getting reel recommendation: ' + err.message);
    } finally {
      setIsLoadingReel(false);
    }
  };

  const handleSendReel = async () => {
    if (!selectedContactForReel || !reelUrl) return;
    setIsSendingReel(true);
    try {
      const res = await sendInterestReel(
        selectedContactForReel.senderId || selectedContactForReel.name,
        reelCaption,
        reelUrl
      );
      if (res && res.success) {
        showToast(`🎉 Reel sent to ${selectedContactForReel.name}!`);
        setSelectedContactForReel(null);
      } else {
        showToast(res?.message || 'Failed to send reel');
      }
    } catch (err) {
      showToast('Failed to send reel: ' + err.message);
    } finally {
      setIsSendingReel(false);
    }
  };

  const handleTriggerDispatchScan = async () => {
    setIsDispatching(true);
    try {
      const res = await autoDispatchReels();
      if (res && res.success) {
        showToast(`✨ Auto-dispatch completed! ${res.dispatchedCount || 0} reels sent.`);
      }
    } catch (err) {
      showToast('Dispatch error: ' + err.message);
    } finally {
      setIsDispatching(false);
    }
  };

  const activeCount = routingConfig.chatMode === 'everyone_except'
    ? friendNodes.filter(n => isExcluded(n)).length
    : (routingConfig.chatMode === 'only_selected' ? friendNodes.filter(n => isIncluded(n)).length : friendNodes.length);

  return (
    <div style={{ padding: '32px 36px 80px 36px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
          AUTOMATION POLICY
        </div>
        <h1 style={{ fontSize: '1.85rem', fontWeight: '800', letterSpacing: '-0.6px', marginTop: '2px', color: '#09090b' }}>
          Chat Control Rules
        </h1>
        <p style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '4px' }}>
          Configure automated Instagram AI routing: handle everyone, exclude selected contacts for manual chatting, or whitelist specific friends.
        </p>
      </div>

      {/* 3 Main Mode Selector Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {[
          {
            id: 'everyone',
            title: 'Open with Everyone',
            desc: 'AI handles direct messages from everyone automatically (followers, strangers, friends).',
            badge: 'GLOBAL'
          },
          {
            id: 'everyone_except',
            title: 'Everyone EXCEPT...',
            desc: 'AI replies to everyone EXCEPT the contacts you checkbox below (reserved for your manual chat).',
            badge: 'RECOMMENDED'
          },
          {
            id: 'only_selected',
            title: 'ONLY Selected',
            desc: 'AI ONLY replies to checked contacts. All other incoming direct messages will be ignored.',
            badge: 'WHITELIST'
          }
        ].map(mode => {
          const isSelected = routingConfig.chatMode === mode.id;
          return (
            <div
              key={mode.id}
              onClick={() => setRoutingConfig(prev => ({ ...prev, chatMode: mode.id }))}
              style={{
                background: isSelected ? '#09090b' : '#ffffff',
                color: isSelected ? '#ffffff' : '#09090b',
                border: '1px solid',
                borderColor: isSelected ? '#09090b' : '#e4e4e7',
                borderRadius: '12px',
                padding: '20px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
                boxShadow: isSelected ? '0 4px 14px rgba(0, 0, 0, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span
                    style={{
                      fontSize: '0.66rem',
                      background: isSelected ? '#27272a' : '#f4f4f5',
                      color: isSelected ? '#ffffff' : '#71717a',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: '700'
                    }}
                  >
                    {mode.badge}
                  </span>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      border: isSelected ? '5px solid #ffffff' : '1.5px solid #a1a1aa'
                    }}
                  />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: '800', margin: 0 }}>
                  {mode.title}
                </h3>
                <p style={{ fontSize: '0.8rem', opacity: isSelected ? 0.8 : 0.6, marginTop: '6px', lineHeight: '1.4' }}>
                  {mode.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active System Policy Bar */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e4e4e7',
          borderRadius: '10px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div>
          <span style={{ fontSize: '0.7rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
            ACTIVE SYSTEM POLICY
          </span>
          <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#09090b', marginTop: '2px', fontFamily: "'JetBrains Mono', monospace" }}>
            {routingConfig.chatMode === 'everyone' && 'AI RESPONDS TO EVERYONE AUTOMATICALLY'}
            {routingConfig.chatMode === 'everyone_except' && `AI RESPONDS TO EVERYONE EXCEPT ${activeCount} CHECKED FRIENDS`}
            {routingConfig.chatMode === 'only_selected' && `AI ONLY RESPONDS TO ${activeCount} CHECKED CONTACTS`}
          </div>
        </div>

        <button
          onClick={onSave}
          disabled={isSaving}
          style={{
            background: '#09090b',
            color: '#ffffff',
            border: 'none',
            padding: '9px 20px',
            borderRadius: '6px',
            fontWeight: '700',
            fontSize: '0.82rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          {isSaving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={14} />}
          <span>Save Routing Rules</span>
        </button>
      </div>

      {/* Autonomous Interest-Based Reel Sharing Engine Banner & Controls */}
      <div
        style={{
          background: 'linear-gradient(135deg, #09090b 0%, #18181b 100%)',
          color: '#ffffff',
          borderRadius: '14px',
          padding: '24px',
          marginBottom: '24px',
          border: '1px solid #27272a',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ maxWidth: '640px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <div style={{ background: '#ec4899', color: '#ffffff', padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', fontWeight: '800', letterSpacing: '0.5px' }}>
                <Sparkles size={11} />
                <span>AUTONOMOUS REEL ENGINE</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: routingConfig.autoShareReelsEnabled ? '#4ade80' : '#a1a1aa', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
                {routingConfig.autoShareReelsEnabled ? '● ACTIVE & SCANNING' : '○ CURRENTLY DISABLED'}
              </span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '800', margin: '0 0 6px 0', letterSpacing: '-0.3px' }}>
              Interest-Based Reel Sharing
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#a1a1aa', lineHeight: '1.5', margin: 0 }}>
              The bot reads each friend&apos;s synthesized profile, jokes, and facts (e.g. Bhavani&apos;s hamsters, Arun&apos;s Tamil comedy, Rajveer&apos;s Hinglish memes) to proactively drop personalized Instagram Reels into their DMs with natural captions.
            </p>
          </div>

          {/* Master Toggle & Scan Trigger */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '220px' }}>
            <button
              onClick={() => {
                const next = !routingConfig.autoShareReelsEnabled;
                setRoutingConfig(prev => ({ ...prev, autoShareReelsEnabled: next }));
              }}
              style={{
                background: routingConfig.autoShareReelsEnabled ? '#22c55e' : '#27272a',
                color: '#ffffff',
                border: 'none',
                padding: '10px 16px',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
            >
              <Zap size={14} />
              <span>{routingConfig.autoShareReelsEnabled ? 'Autonomous Sharing: ON' : 'Turn ON Auto Reel Sharing'}</span>
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleTriggerDispatchScan}
                disabled={isDispatching}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#ffffff',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.74rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                {isDispatching ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                <span>Run Scan Now</span>
              </button>

              <button
                onClick={onSave}
                disabled={isSaving}
                style={{
                  background: '#ffffff',
                  color: '#09090b',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontSize: '0.74rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>

        {/* Frequency and Curated Topics Bar */}
        <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #27272a', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={13} style={{ color: '#a1a1aa' }} />
            <span style={{ fontSize: '0.74rem', color: '#a1a1aa', fontWeight: '600' }}>Frequency:</span>
            <select
              value={routingConfig.autoShareReelsFrequencyHours || 24}
              onChange={(e) => setRoutingConfig(prev => ({ ...prev, autoShareReelsFrequencyHours: Number(e.target.value) }))}
              style={{
                background: '#18181b',
                color: '#ffffff',
                border: '1px solid #3f3f46',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '0.74rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              <option value={12}>Every 12 Hours (Fast)</option>
              <option value={24}>Every 24 Hours (Daily - Recommended)</option>
              <option value={48}>Every 48 Hours (Relaxed)</option>
              <option value={72}>Every 3 Days (Casual)</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', color: '#71717a', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>SUPPORTED TOPICS:</span>
            {['🐹 Hamsters & Pets', '🎭 Tamil Comedy', '🔥 Hinglish Memes', '🩺 Medicine/MBBS', '🎨 UI & Design', '💻 Tech & Code', '🍿 Cinema & Netflix'].map((topic, i) => (
              <span
                key={i}
                style={{
                  fontSize: '0.66rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: '#27272a',
                  color: '#e4e4e7',
                  border: '1px solid #3f3f46'
                }}
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Contacts List & Policy Controls */}
      <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#09090b', margin: 0 }}>
              {routingConfig.chatMode === 'everyone_except' ? 'Checkbox Contacts to Exclude' : (routingConfig.chatMode === 'only_selected' ? 'Checkbox Contacts to Include' : 'All Contacts (Active)')}
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '2px' }}>
              {routingConfig.chatMode === 'everyone'
                ? 'All contacts receive automated AI replies. Checkboxes are muted. Switch mode above to exclude anyone.'
                : 'Select who to exclude or whitelist, or adjust per-person reply modes (Full AI, Reels Only, Manual).'}
            </p>
          </div>

          {routingConfig.chatMode !== 'everyone' && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={handleSelectAll}
                style={{ background: '#ffffff', border: '1px solid #e4e4e7', color: '#09090b', padding: '5px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
              >
                Select All
              </button>
              <button
                onClick={handleClearAll}
                style={{ background: '#ffffff', border: '1px solid #e4e4e7', color: '#71717a', padding: '5px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div style={{ marginBottom: '16px', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
          <input
            type="text"
            placeholder="Search contacts by name or handle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              paddingLeft: '34px',
              height: '38px',
              fontSize: '0.82rem'
            }}
          />
        </div>

        {/* Contact Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
          {filteredFriends.map(contact => {
            const isEveryoneMode = routingConfig.chatMode === 'everyone';
            const isChecked = isEveryoneMode
              ? true
              : (routingConfig.chatMode === 'everyone_except' ? isExcluded(contact) : isIncluded(contact));

            const isPaused = contact.aiEnabled === false;
            const isReelsOnly = !isPaused && contact.replyToMessages === false && contact.replyToReelsAndPosts !== false;
            const isFullAi = !isPaused && !isReelsOnly;
            const interestTags = getContactInterestTags(contact);

            return (
              <div
                key={contact.id || contact.name}
                style={{
                  background: isChecked && !isEveryoneMode ? '#fafafa' : '#ffffff',
                  border: '1px solid',
                  borderColor: isChecked && !isEveryoneMode ? '#09090b' : '#e4e4e7',
                  borderRadius: '10px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Top Row: Checkbox + DP + Info */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div
                    onClick={() => {
                      if (isEveryoneMode) return;
                      if (routingConfig.chatMode === 'everyone_except') {
                        handleToggleExclude(contact);
                      } else {
                        handleToggleInclude(contact);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: isEveryoneMode ? 'default' : 'pointer',
                      flex: 1,
                      opacity: isEveryoneMode ? 0.75 : 1
                    }}
                  >
                    {/* Checkbox */}
                    <div
                      style={{
                        width: '18px',
                        height: '18px',
                        minWidth: '18px',
                        borderRadius: '4px',
                        background: isChecked ? '#09090b' : '#ffffff',
                        border: '1px solid',
                        borderColor: isChecked ? '#09090b' : '#d4d4d8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff'
                      }}
                    >
                      {isChecked && <Check size={12} strokeWidth={3} />}
                    </div>

                    <ContactAvatar contact={contact} size={36} showStatus={true} />

                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontWeight: '700', fontSize: '0.88rem', color: '#09090b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {contact.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {contact.handle || contact.relationship || 'Friend'}
                      </div>
                    </div>
                  </div>

                  {/* Mode Badge */}
                  <span
                    style={{
                      fontSize: '0.64rem',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: '700',
                      background: '#f4f4f5',
                      color: '#09090b',
                      border: '1px solid #e4e4e7',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {isPaused ? 'MANUAL' : (isReelsOnly ? 'REELS ONLY' : 'FULL AI')}
                  </span>
                </div>

                {/* Interest Badges & Quick Share Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '4px', borderTop: '1px dashed #f4f4f5', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', flex: 1 }}>
                    {interestTags.slice(0, 2).map((tag, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: '0.64rem',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: '#f4f4f5',
                          color: '#52525b',
                          fontWeight: '600',
                          border: '1px solid #e4e4e7'
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <button
                    onClick={() => handleOpenReelModal(contact)}
                    style={{
                      background: '#09090b',
                      color: '#ffffff',
                      border: 'none',
                      padding: '4px 9px',
                      borderRadius: '5px',
                      fontSize: '0.68rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap'
                    }}
                    title={`Send interest-matched Reel to ${contact.name}`}
                  >
                    <Film size={11} />
                    <span>Share Reel</span>
                  </button>
                </div>

                {/* Bottom Row: AI Mode Selector Buttons */}
                <div style={{ display: 'flex', gap: '6px', paddingTop: '8px', borderTop: '1px solid #f4f4f5' }}>
                  <button
                    onClick={() => updateContactPreferences(contact.senderId || contact.id, { aiMode: 'full_ai' })}
                    style={{
                      flex: 1,
                      padding: '6px 4px',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      fontWeight: isFullAi ? '700' : '500',
                      cursor: 'pointer',
                      background: isFullAi ? '#09090b' : '#ffffff',
                      color: isFullAi ? '#ffffff' : '#71717a',
                      border: '1px solid',
                      borderColor: isFullAi ? '#09090b' : '#e4e4e7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <Bot size={11} />
                    <span>Full AI</span>
                  </button>

                  <button
                    onClick={() => updateContactPreferences(contact.senderId || contact.id, { aiMode: 'reels_only' })}
                    style={{
                      flex: 1,
                      padding: '6px 4px',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      fontWeight: isReelsOnly ? '700' : '500',
                      cursor: 'pointer',
                      background: isReelsOnly ? '#09090b' : '#ffffff',
                      color: isReelsOnly ? '#ffffff' : '#71717a',
                      border: '1px solid',
                      borderColor: isReelsOnly ? '#09090b' : '#e4e4e7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <Film size={11} />
                    <span>Reels Only</span>
                  </button>

                  <button
                    onClick={() => updateContactPreferences(contact.senderId || contact.id, { aiMode: 'paused' })}
                    style={{
                      flex: 1,
                      padding: '6px 4px',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      fontWeight: isPaused ? '700' : '500',
                      cursor: 'pointer',
                      background: isPaused ? '#09090b' : '#ffffff',
                      color: isPaused ? '#ffffff' : '#71717a',
                      border: '1px solid',
                      borderColor: isPaused ? '#09090b' : '#e4e4e7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <Pause size={11} />
                    <span>Stop AI</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reel Preview & Send Modal */}
      {selectedContactForReel && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '520px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              border: '1px solid #e4e4e7'
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ContactAvatar contact={selectedContactForReel} size={32} showStatus={false} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#09090b' }}>
                    Send Reel to {selectedContactForReel.name}
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                    {selectedContactForReel.handle || selectedContactForReel.relationship || 'Friend'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedContactForReel(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#71717a', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px' }}>
              {isLoadingReel ? (
                <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#09090b' }} />
                  <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#09090b' }}>
                    Synthesizing Personality & Finding Matching Reel...
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#71717a', marginTop: '4px' }}>
                    Scanning facts for {selectedContactForReel.name} to pick the best viral reel and caption.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Matched Interest Badge */}
                  {reelRecommendation && (
                    <div style={{ background: '#f4f4f5', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e4e4e7' }}>
                      <div style={{ fontSize: '0.68rem', color: '#71717a', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
                        DETECTED INTEREST MATCH
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <span style={{ fontSize: '0.84rem', fontWeight: '800', color: '#09090b' }}>
                          {reelRecommendation.recommendation?.reel?.category?.toUpperCase() || 'GENERAL'}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#71717a' }}>
                          ({reelRecommendation.recommendation?.confidence || 90}% confidence match)
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.74rem', color: '#52525b' }}>
                        {reelRecommendation.recommendation?.reasoning || 'Selected based on synthesized friendship interests and facts.'}
                      </p>
                    </div>
                  )}

                  {/* Reel Link Input */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#09090b', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                      INSTAGRAM REEL URL
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={reelUrl}
                        onChange={(e) => setReelUrl(e.target.value)}
                        placeholder="https://www.instagram.com/reel/..."
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid #e4e4e7',
                          fontSize: '0.8rem',
                          fontFamily: "'JetBrains Mono', monospace"
                        }}
                      />
                      {reelUrl && (
                        <a
                          href={reelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            background: '#f4f4f5',
                            border: '1px solid #e4e4e7',
                            borderRadius: '6px',
                            padding: '0 10px',
                            display: 'flex',
                            alignItems: 'center',
                            color: '#09090b',
                            textDecoration: 'none'
                          }}
                          title="Open on Instagram"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Caption Textarea */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#09090b', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                      NATURAL AI CAPTION (SAM&apos;S VOICE)
                    </label>
                    <textarea
                      value={reelCaption}
                      onChange={(e) => setReelCaption(e.target.value)}
                      rows={3}
                      placeholder="Write a casual comment to accompany the reel..."
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #e4e4e7',
                        fontSize: '0.84rem',
                        lineHeight: '1.4',
                        boxSizing: 'border-box'
                      }}
                    />
                    <span style={{ fontSize: '0.7rem', color: '#71717a', marginTop: '4px', display: 'block' }}>
                      This message and reel will unfurl directly in their Instagram DM inbox as a playable card.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {!isLoadingReel && (
              <div style={{ padding: '14px 20px', borderTop: '1px solid #e4e4e7', background: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  onClick={() => setSelectedContactForReel(null)}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e4e4e7',
                    color: '#71717a',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendReel}
                  disabled={isSendingReel || !reelUrl}
                  style={{
                    background: '#09090b',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 18px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: (isSendingReel || !reelUrl) ? 0.6 : 1
                  }}
                >
                  {isSendingReel ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                  <span>{isSendingReel ? 'Sending to Instagram...' : 'Send Reel to DM'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
