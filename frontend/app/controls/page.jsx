'use client';

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import ContactAvatar from '../components/ContactAvatar';
import {
  Sliders, Search, Check, RefreshCw, Shield, Users, AlertCircle, Sparkles, Film, MessageSquare, PauseCircle
} from 'lucide-react';

export default function ControlsPage() {
  const { nodes, routingConfig, saveRouting, setRoutingConfig, updateContactPreferences } = useApp();
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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

  // Reliable unique identifier generator for each contact
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
    } else {
      setRoutingConfig(prev => ({ ...prev, includedContactIds: allKeys }));
    }
  };

  const handleClearAll = () => {
    if (routingConfig.chatMode === 'everyone_except') {
      setRoutingConfig(prev => ({ ...prev, excludedContactIds: [] }));
    } else {
      setRoutingConfig(prev => ({ ...prev, includedContactIds: [] }));
    }
  };

  const onSave = async () => {
    setIsSaving(true);
    await saveRouting(routingConfig);
    setIsSaving(false);
  };

  const activeCount = routingConfig.chatMode === 'everyone_except'
    ? friendNodes.filter(n => isExcluded(n)).length
    : (routingConfig.chatMode === 'only_selected' ? friendNodes.filter(n => isIncluded(n)).length : 0);

  return (
    <div style={{ padding: '36px 32px 60px 32px', maxWidth: '1050px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '0.72rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold' }}>
          // CHAT ROUTING & AUTOMATION POLICIES
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.6px', marginTop: '4px' }}>
          Chat Control Rules
        </h1>
        <p style={{ color: '#a1a1aa', fontSize: '0.88rem', marginTop: '6px' }}>
          Configure who receives automated Instagram AI replies, who is reserved for Sam&apos;s manual texting, and who gets reel-only reactions.
        </p>
      </div>

      {/* Mode Selectors (4 Retro Shadcn Cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '28px' }}>
        {[
          {
            id: 'everyone',
            title: 'Open with Everyone',
            desc: 'AI handles DMs from everyone automatically (followers, strangers, fans).',
            badge: 'GLOBAL'
          },
          {
            id: 'everyone_except',
            title: 'Everyone EXCEPT...',
            desc: 'AI replies to everyone EXCEPT the contacts you checkbox below (for Sam to chat manually).',
            badge: 'RECOMMENDED'
          },
          {
            id: 'only_selected',
            title: 'ONLY Selected',
            desc: 'AI ONLY replies to checked contacts. All other DMs will be ignored by AI.',
            badge: 'WHITELIST'
          },
          {
            id: 'paused',
            title: 'Paused / Silent',
            desc: 'AI is completely silenced. All incoming messages wait for Sam to reply manually.',
            badge: 'STANDBY'
          }
        ].map(mode => {
          const isSelected = routingConfig.chatMode === mode.id;
          return (
            <div
              key={mode.id}
              onClick={() => setRoutingConfig(prev => ({ ...prev, chatMode: mode.id }))}
              style={{
                background: isSelected ? '#121214' : '#09090b',
                border: isSelected ? '1.5px solid #ffffff' : '1px solid #27272a',
                borderRadius: '14px',
                padding: '18px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
                boxShadow: isSelected ? '0 0 25px rgba(255, 255, 255, 0.08)' : 'none'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.65rem', background: isSelected ? '#ffffff' : '#27272a', color: isSelected ? '#000000' : '#a1a1aa', padding: '2px 6px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold' }}>
                    {mode.badge}
                  </span>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: isSelected ? '5px solid #ffffff' : '1.5px solid #52525b' }} />
                </div>
                <h3 style={{ fontSize: '0.98rem', fontWeight: '700', color: '#ffffff' }}>
                  {mode.title}
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#a1a1aa', marginTop: '6px', lineHeight: '1.4' }}>
                  {mode.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Rule Bar */}
      <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span style={{ fontSize: '0.7rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
            ACTIVE SYSTEM POLICY
          </span>
          <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#10b981', marginTop: '2px', fontFamily: "'JetBrains Mono', monospace" }}>
            {routingConfig.chatMode === 'everyone' && '⚡ AI RESPONDS TO EVERYONE'}
            {routingConfig.chatMode === 'everyone_except' && `🛡️ AI RESPONDS TO EVERYONE EXCEPT ${activeCount} CHECKED FRIENDS`}
            {routingConfig.chatMode === 'only_selected' && `🎯 AI ONLY RESPONDS TO ${activeCount} CHECKED CONTACTS`}
            {routingConfig.chatMode === 'paused' && '⏸️ AI COMPLETELY PAUSED (SILENT MODE)'}
          </div>
        </div>

        <button
          onClick={onSave}
          disabled={isSaving}
          style={{
            background: '#ffffff',
            color: '#000000',
            border: 'none',
            padding: '10px 22px',
            borderRadius: '8px',
            fontWeight: '700',
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={16} />}
          <span>Save Routing Rules</span>
        </button>
      </div>

      {/* Contacts Grid & Per-Person Controls */}
      <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '14px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>
              {routingConfig.chatMode === 'everyone_except' ? 'Checkbox Friends to Exclude' : 'All Circle Contacts & AI Reply Modes'}
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '2px' }}>
              Toggle global exclusion checkbox or fine-tune individual AI modes (⚡ Full AI, 🎬 Only Reels, or ⏸️ Sam Manual).
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSelectAll}
              style={{ background: '#18181b', border: '1px solid #27272a', color: '#ffffff', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
            >
              Select All
            </button>
            <button
              onClick={handleClearAll}
              style={{ background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div style={{ marginBottom: '16px', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
          <input
            type="text"
            placeholder="Search contacts by name, handle (@annies_hepsiba), or relationship..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: '#121214',
              border: '1px solid #27272a',
              padding: '10px 14px 10px 36px',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '0.82rem',
              width: '100%',
              outline: 'none'
            }}
          />
        </div>

        {/* Contact Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
          {filteredFriends.map(contact => {
            const isChecked = routingConfig.chatMode === 'everyone_except'
              ? isExcluded(contact)
              : isIncluded(contact);

            const isPaused = contact.aiEnabled === false;
            const isReelsOnly = !isPaused && contact.replyToMessages === false && contact.replyToReelsAndPosts !== false;
            const isFullAi = !isPaused && !isReelsOnly;

            return (
              <div
                key={contact.id || contact.name}
                style={{
                  background: isChecked ? '#141416' : '#0c0c0e',
                  border: isChecked ? '1px solid #52525b' : '1px solid #27272a',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Top Row: Checkbox + DP Avatar + Name + Handle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div
                    onClick={() => {
                      if (routingConfig.chatMode === 'everyone_except') {
                        handleToggleExclude(contact);
                      } else {
                        handleToggleInclude(contact);
                      }
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}
                  >
                    {/* Checkbox */}
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        minWidth: '20px',
                        borderRadius: '5px',
                        background: isChecked ? '#ffffff' : 'transparent',
                        border: isChecked ? '1px solid #ffffff' : '1.5px solid #52525b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#000000'
                      }}
                    >
                      {isChecked && <Check size={14} strokeWidth={3} />}
                    </div>

                    {/* DP Avatar */}
                    <ContactAvatar contact={contact} size={38} showStatus={true} />

                    {/* Info */}
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontWeight: '700', fontSize: '0.88rem', color: '#ffffff', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {contact.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {contact.handle || contact.relationship || 'Friend'}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    style={{
                      fontSize: '0.64rem',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: '700',
                      background: isPaused ? 'rgba(239, 68, 68, 0.15)' : (isReelsOnly ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)'),
                      color: isPaused ? '#ef4444' : (isReelsOnly ? '#f59e0b' : '#10b981'),
                      border: '1px solid',
                      borderColor: isPaused ? '#ef4444' : (isReelsOnly ? '#f59e0b' : '#10b981'),
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {isPaused ? 'SAM MANUAL' : (isReelsOnly ? 'REELS ONLY' : 'FULL AI')}
                  </span>
                </div>

                {/* Bottom Row: Granular Per-Person AI Mode Quick Selector */}
                <div style={{ display: 'flex', gap: '6px', paddingTop: '8px', borderTop: '1px solid #1f1f23' }}>
                  <button
                    onClick={() => updateContactPreferences(contact.senderId || contact.id, { aiMode: 'full_ai' })}
                    title="AI replies to both text messages and shared reels"
                    style={{
                      flex: 1,
                      padding: '5px 8px',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      fontWeight: isFullAi ? '700' : '500',
                      cursor: 'pointer',
                      background: isFullAi ? '#ffffff' : '#18181b',
                      color: isFullAi ? '#000000' : '#a1a1aa',
                      border: isFullAi ? '1px solid #ffffff' : '1px solid #27272a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <Sparkles size={11} />
                    <span>Full AI</span>
                  </button>

                  <button
                    onClick={() => updateContactPreferences(contact.senderId || contact.id, { aiMode: 'reels_only' })}
                    title="Only react when this person shares a reel. Sam chats manually for normal texts."
                    style={{
                      flex: 1,
                      padding: '5px 8px',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      fontWeight: isReelsOnly ? '700' : '500',
                      cursor: 'pointer',
                      background: isReelsOnly ? '#f59e0b' : '#18181b',
                      color: isReelsOnly ? '#000000' : '#a1a1aa',
                      border: isReelsOnly ? '1px solid #f59e0b' : '1px solid #27272a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <Film size={11} />
                    <span>Only Reels</span>
                  </button>

                  <button
                    onClick={() => updateContactPreferences(contact.senderId || contact.id, { aiMode: 'paused' })}
                    title="Stop AI for this person. Sam chats 100% manually."
                    style={{
                      flex: 1,
                      padding: '5px 8px',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      fontWeight: isPaused ? '700' : '500',
                      cursor: 'pointer',
                      background: isPaused ? '#ef4444' : '#18181b',
                      color: isPaused ? '#ffffff' : '#a1a1aa',
                      border: isPaused ? '1px solid #ef4444' : '1px solid #27272a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <PauseCircle size={11} />
                    <span>Stop AI</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
