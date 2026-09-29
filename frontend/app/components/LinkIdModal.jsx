'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { X, Link2, Sparkles, Check, Search, ArrowRight, UserCheck, AlertCircle } from 'lucide-react';
import ContactAvatar from './ContactAvatar';

export default function LinkIdModal() {
  const { linkingTargetPerson, setLinkingTargetPerson, linkContactId, API_BASE } = useApp();

  const [handleInput, setHandleInput] = useState('');
  const [senderIdInput, setSenderIdInput] = useState('');
  const [unlinkedChatters, setUnlinkedChatters] = useState([]);
  const [isLoadingChatters, setIsLoadingChatters] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');

  useEffect(() => {
    if (linkingTargetPerson) {
      setHandleInput(linkingTargetPerson.handle ? linkingTargetPerson.handle.replace(/^@/, '') : '');
      setSenderIdInput(linkingTargetPerson.senderId || '');
      fetchUnlinkedChatters();
    } else {
      setHandleInput('');
      setSenderIdInput('');
      setFilterQuery('');
    }
  }, [linkingTargetPerson]);

  const fetchUnlinkedChatters = async () => {
    setIsLoadingChatters(true);
    try {
      const res = await fetch(`${API_BASE}/api/social-graph/unlinked-chatters`);
      const data = await res.json();
      if (data.success && Array.isArray(data.chatters)) {
        setUnlinkedChatters(data.chatters);
      }
    } catch (e) {
      console.warn('Could not fetch unlinked chatters:', e.message);
    } finally {
      setIsLoadingChatters(false);
    }
  };

  if (!linkingTargetPerson) return null;

  const handleSelectChatter = (chatter) => {
    if (chatter.username) {
      setHandleInput(chatter.username.replace(/^@/, ''));
    }
    if (chatter.senderId) {
      setSenderIdInput(chatter.senderId);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!handleInput.trim() && !senderIdInput.trim()) {
      alert('Please enter an Instagram @handle or Sender ID, or pick one from the suggestions below.');
      return;
    }

    setIsSubmitting(true);
    try {
      await linkContactId(
        linkingTargetPerson.name,
        handleInput.trim(),
        senderIdInput.trim()
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredChatters = unlinkedChatters.filter(c => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.username || '').toLowerCase().includes(q) ||
      (c.senderId || '').includes(q)
    );
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        style={{
          background: '#09090b',
          border: '1px solid #27272a',
          borderRadius: '16px',
          width: '620px',
          maxWidth: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #27272a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#0c0c0e'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#18181b',
                border: '1px solid #3f3f46',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10b981'
              }}
            >
              <Link2 size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace", color: '#10b981', fontWeight: 'bold' }}>
                // IDENTITY MERGE & DM LINK
              </div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#ffffff', margin: 0 }}>
                Link Instagram ID for {linkingTargetPerson.name}
              </h2>
            </div>
          </div>
          <button
            onClick={() => setLinkingTargetPerson(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#71717a',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Explanation Alert */}
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '10px',
              padding: '14px',
              fontSize: '0.8rem',
              color: '#d1d5db',
              lineHeight: '1.5'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: '700', marginBottom: '4px' }}>
              <UserCheck size={16} />
              <span>Why link an Instagram ID?</span>
            </div>
            Linking an Instagram <code style={{ color: '#10b981' }}>@handle</code> connects this person to live Instagram direct messages. The AI will recognize them when they message you, automatically merge any existing chats, and reply using their specific relationship tone and lore!
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                Instagram @Handle
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71717a', fontWeight: '700' }}>@</span>
                <input
                  type="text"
                  placeholder="e.g. roni_uncle or bhavani_med"
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value.replace(/^@/, ''))}
                  style={{
                    width: '100%',
                    background: '#121214',
                    border: '1px solid #3f3f46',
                    borderRadius: '8px',
                    padding: '10px 12px 10px 32px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                Numeric Sender ID (Optional / Auto-filled from live chat)
              </label>
              <input
                type="text"
                placeholder="e.g. 1337018008317393"
                value={senderIdInput}
                onChange={(e) => setSenderIdInput(e.target.value)}
                style={{
                  width: '100%',
                  background: '#121214',
                  border: '1px solid #27272a',
                  borderRadius: '8px',
                  padding: '9px 12px',
                  color: '#a1a1aa',
                  fontSize: '0.82rem',
                  fontFamily: "'JetBrains Mono', monospace",
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Quick 1-Click Suggestions from Recent DMs */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.76rem', fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  Or Pick From Recent Instagram DM Chatters
                </label>
                <span style={{ fontSize: '0.7rem', color: '#71717a' }}>
                  {unlinkedChatters.length} detected
                </span>
              </div>

              {unlinkedChatters.length > 5 && (
                <div style={{ position: 'relative', marginBottom: '8px' }}>
                  <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
                  <input
                    type="text"
                    placeholder="Search recent chatters..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#121214',
                      border: '1px solid #27272a',
                      borderRadius: '6px',
                      padding: '6px 10px 6px 30px',
                      color: '#ffffff',
                      fontSize: '0.78rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              )}

              <div
                style={{
                  background: '#0c0c0e',
                  border: '1px solid #27272a',
                  borderRadius: '8px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  divideY: '1px solid #18181b'
                }}
              >
                {isLoadingChatters ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#71717a', fontSize: '0.8rem' }}>
                    Scanning recent Instagram conversations...
                  </div>
                ) : filteredChatters.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#71717a', fontSize: '0.8rem' }}>
                    No recent unlinked chatters found. You can type the username directly above!
                  </div>
                ) : (
                  filteredChatters.map(c => {
                    const isSelected = handleInput && c.username && handleInput.toLowerCase() === c.username.replace(/^@/, '').toLowerCase();

                    return (
                      <div
                        key={c.senderId || c.username}
                        onClick={() => handleSelectChatter(c)}
                        style={{
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid #18181b',
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <ContactAvatar contact={c} size={30} showStatus={false} />
                          <div>
                            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#ffffff' }}>
                              {c.name || c.username}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace" }}>
                              {c.username || c.senderId}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectChatter(c);
                          }}
                          style={{
                            background: isSelected ? '#10b981' : '#18181b',
                            color: isSelected ? '#000000' : '#ffffff',
                            border: '1px solid',
                            borderColor: isSelected ? '#10b981' : '#3f3f46',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                        >
                          {isSelected ? '✓ Selected' : 'Pick'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setLinkingTargetPerson(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid #27272a',
                  color: '#a1a1aa',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || (!handleInput.trim() && !senderIdInput.trim())}
                style={{
                  background: (!handleInput.trim() && !senderIdInput.trim()) ? '#27272a' : '#ffffff',
                  color: (!handleInput.trim() && !senderIdInput.trim()) ? '#71717a' : '#000000',
                  border: 'none',
                  padding: '9px 20px',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  fontWeight: '800',
                  cursor: (!handleInput.trim() && !senderIdInput.trim()) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Link2 size={15} />
                <span>{isSubmitting ? 'Linking & Merging...' : 'Link & Merge Person'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
