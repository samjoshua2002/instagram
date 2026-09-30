'use client';

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import ContactAvatar from '../components/ContactAvatar';
import {
  Sliders, Search, Check, RefreshCw, Users, Bot, Film, Pause
} from 'lucide-react';

export default function ControlsPage() {
  const {
    nodes,
    routingConfig,
    saveRouting,
    setRoutingConfig,
    updateContactPreferences
  } = useApp();
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
    </div>
  );
}
