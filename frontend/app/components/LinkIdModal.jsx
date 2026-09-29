'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { X, Link2, Search, UserCheck } from 'lucide-react';
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
      alert('Please enter an Instagram handle or Sender ID.');
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
        background: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e4e4e7',
          borderRadius: '12px',
          width: '560px',
          maxWidth: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.12)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #e4e4e7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: '#f4f4f5',
                border: '1px solid #e4e4e7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#09090b'
              }}
            >
              <Link2 size={16} />
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace", color: '#71717a', fontWeight: 'bold' }}>
                IDENTITY LINK
              </div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#09090b', margin: 0 }}>
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
              padding: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div
            style={{
              background: '#f4f4f5',
              border: '1px solid #e4e4e7',
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '0.8rem',
              color: '#52525b',
              lineHeight: '1.4'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#09090b', fontWeight: '700', marginBottom: '2px' }}>
              <UserCheck size={14} />
              <span>Link with Live Instagram Direct Messages</span>
            </div>
            Connect this person to their Instagram username so the AI recognizes them in direct messages and replies with their relationship lore.
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                Instagram Handle
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#a1a1aa', fontWeight: '600' }}>@</span>
                <input
                  type="text"
                  placeholder="username"
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value.replace(/^@/, ''))}
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1px solid #e4e4e7',
                    borderRadius: '6px',
                    padding: '9px 12px 9px 30px',
                    color: '#09090b',
                    fontSize: '0.88rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                Numeric Sender ID (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. 1899338324770987"
                value={senderIdInput}
                onChange={(e) => setSenderIdInput(e.target.value)}
                style={{
                  width: '100%',
                  background: '#ffffff',
                  border: '1px solid #e4e4e7',
                  borderRadius: '6px',
                  padding: '9px 12px',
                  color: '#09090b',
                  fontSize: '0.82rem',
                  fontFamily: "'JetBrains Mono', monospace",
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Suggestions from Recent DMs */}
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                Or Pick From Recent Instagram DM Chatters
              </label>

              {unlinkedChatters.length > 5 && (
                <div style={{ position: 'relative', marginBottom: '8px' }}>
                  <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#a1a1aa' }} />
                  <input
                    type="text"
                    placeholder="Search recent chatters..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#ffffff',
                      border: '1px solid #e4e4e7',
                      borderRadius: '6px',
                      padding: '6px 10px 6px 28px',
                      color: '#09090b',
                      fontSize: '0.78rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              )}

              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e4e4e7',
                  borderRadius: '8px',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {isLoadingChatters ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#71717a', fontSize: '0.78rem' }}>
                    Loading recent conversation contacts...
                  </div>
                ) : filteredChatters.length === 0 ? (
                  <div style={{ padding: '14px', textAlign: 'center', color: '#71717a', fontSize: '0.78rem' }}>
                    No recent unlinked chatters. Type username directly above.
                  </div>
                ) : (
                  filteredChatters.map(c => {
                    const isSelected = handleInput && c.username && handleInput.toLowerCase() === c.username.replace(/^@/, '').toLowerCase();

                    return (
                      <div
                        key={c.senderId || c.username}
                        onClick={() => handleSelectChatter(c)}
                        style={{
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid #f4f4f5',
                          cursor: 'pointer',
                          background: isSelected ? '#f4f4f5' : 'transparent'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <ContactAvatar contact={c} size={28} showStatus={false} />
                          <div>
                            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#09090b' }}>
                              {c.name || c.username}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
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
                            background: isSelected ? '#09090b' : '#ffffff',
                            color: isSelected ? '#ffffff' : '#09090b',
                            border: '1px solid',
                            borderColor: isSelected ? '#09090b' : '#e4e4e7',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                        >
                          {isSelected ? 'Selected' : 'Pick'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setLinkingTargetPerson(null)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e4e4e7',
                  color: '#71717a',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
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
                  background: '#09090b',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: (!handleInput.trim() && !senderIdInput.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (!handleInput.trim() && !senderIdInput.trim()) ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Link2 size={13} />
                <span>{isSubmitting ? 'Linking...' : 'Link & Merge'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
