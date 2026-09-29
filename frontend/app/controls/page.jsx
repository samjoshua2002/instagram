'use client';

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Sliders, Search, Check, RefreshCw, Shield, Users, AlertCircle, Sparkles
} from 'lucide-react';

export default function ControlsPage() {
  const { nodes, routingConfig, saveRouting, setRoutingConfig } = useApp();
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

  const handleToggleExclude = (senderId) => {
    const current = routingConfig.excludedContactIds || [];
    const next = current.includes(senderId)
      ? current.filter(id => id !== senderId)
      : [...current, senderId];
    setRoutingConfig(prev => ({ ...prev, excludedContactIds: next }));
  };

  const handleToggleInclude = (senderId) => {
    const current = routingConfig.includedContactIds || [];
    const next = current.includes(senderId)
      ? current.filter(id => id !== senderId)
      : [...current, senderId];
    setRoutingConfig(prev => ({ ...prev, includedContactIds: next }));
  };

  const handleSelectAll = () => {
    const allIds = friendNodes.filter(n => n.senderId).map(n => n.senderId);
    if (routingConfig.chatMode === 'everyone_except') {
      setRoutingConfig(prev => ({ ...prev, excludedContactIds: allIds }));
    } else {
      setRoutingConfig(prev => ({ ...prev, includedContactIds: allIds }));
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
    ? (routingConfig.excludedContactIds || []).length
    : (routingConfig.chatMode === 'only_selected' ? (routingConfig.includedContactIds || []).length : 0);

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
          Configure who receives automated Instagram AI replies and who is reserved exclusively for Sam&apos;s manual texting.
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

      {/* Contacts Checkbox Grid */}
      {(routingConfig.chatMode === 'everyone_except' || routingConfig.chatMode === 'only_selected') && (
        <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '14px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>
                {routingConfig.chatMode === 'everyone_except' ? 'Checkbox Friends to Exclude' : 'Checkbox Friends to Whitelist'}
              </h3>
              <p style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '2px' }}>
                {routingConfig.chatMode === 'everyone_except'
                  ? 'Checked contacts will NEVER get automated AI replies. Sam can chat with them manually.'
                  : 'Only the checked contacts below will receive AI auto-replies.'}
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
              placeholder="Search contacts by name, handle, or relationship..."
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

          {/* Contact Checkbox Items */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
            {filteredFriends.map(contact => {
              const isChecked = routingConfig.chatMode === 'everyone_except'
                ? (routingConfig.excludedContactIds || []).includes(contact.senderId)
                : (routingConfig.includedContactIds || []).includes(contact.senderId);

              return (
                <div
                  key={contact.id}
                  onClick={() => {
                    if (routingConfig.chatMode === 'everyone_except') {
                      handleToggleExclude(contact.senderId);
                    } else {
                      handleToggleInclude(contact.senderId);
                    }
                  }}
                  style={{
                    background: isChecked ? '#18181b' : '#0e0e11',
                    border: isChecked ? '1px solid #ffffff' : '1px solid #27272a',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
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
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.88rem', color: '#ffffff' }}>
                        {contact.name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                        {contact.handle || contact.relationship}
                      </div>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '0.65rem',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontFamily: "'JetBrains Mono', monospace",
                      background: isChecked
                        ? (routingConfig.chatMode === 'everyone_except' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)')
                        : '#18181b',
                      color: isChecked
                        ? (routingConfig.chatMode === 'everyone_except' ? '#ef4444' : '#10b981')
                        : '#71717a',
                      border: '1px solid',
                      borderColor: isChecked
                        ? (routingConfig.chatMode === 'everyone_except' ? '#ef4444' : '#10b981')
                        : '#27272a'
                    }}
                  >
                    {isChecked
                      ? (routingConfig.chatMode === 'everyone_except' ? 'SAM CHATS (EXCLUDED)' : 'AI REPLIES')
                      : (routingConfig.chatMode === 'everyone_except' ? 'AI AUTO-REPLIES' : 'IGNORED BY AI')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
