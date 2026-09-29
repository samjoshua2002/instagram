'use client';

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Search, Sparkles, Filter, Link2, AlertTriangle, ArrowRight,
  Trash2, ExternalLink, Calendar, ShieldCheck, Film, PauseCircle, Users, Check
} from 'lucide-react';
import ContactAvatar from '../components/ContactAvatar';

export default function RelationshipsPage() {
  const {
    nodes,
    setSelectedNode,
    startAiInterview,
    deleteNode,
    updateContactPreferences,
    setLinkingTargetPerson
  } = useApp();

  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Contacts missing Instagram ID
  const unlinkedFriends = useMemo(() => {
    return nodes.filter(n => !n.isRoot && !n.handle && !n.senderId);
  }, [nodes]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = {
      all: 0,
      close_friend: 0,
      online_friend: 0,
      offline_friend: 0,
      family: 0,
      professional: 0,
      unlinked: unlinkedFriends.length
    };

    nodes.forEach(n => {
      if (n.isRoot) return;
      counts.all++;
      const cat = n.category || 'online_friend';
      if (cat === 'close_friend' || n.id === 'fami' || n.id === 'bhavani' || n.id === 'rajveer' || n.id === 'moksha') {
        counts.close_friend++;
      } else if (cat === 'online_friend') {
        counts.online_friend++;
      } else if (cat === 'offline_friend') {
        counts.offline_friend++;
      } else if (cat === 'family' || cat === 'relative') {
        counts.family++;
      } else if (cat === 'professional' || cat === 'business') {
        counts.professional++;
      }
    });

    return counts;
  }, [nodes, unlinkedFriends]);

  // Filtered contacts based on category pill & search query
  const filteredPeople = useMemo(() => {
    return nodes.filter(n => {
      if (n.isRoot) return false;

      // 1. Category Filter
      if (activeCategory === 'unlinked') {
        if (n.handle || n.senderId) return false;
      } else if (activeCategory === 'close_friend') {
        const isClose = n.category === 'close_friend' || n.id === 'fami' || n.id === 'bhavani' || n.id === 'rajveer' || n.id === 'moksha';
        if (!isClose) return false;
      } else if (activeCategory === 'online_friend') {
        if (n.category !== 'online_friend' && n.category !== 'close_friend') return false;
      } else if (activeCategory === 'offline_friend') {
        if (n.category !== 'offline_friend') return false;
      } else if (activeCategory === 'family') {
        if (n.category !== 'family' && n.category !== 'relative') return false;
      } else if (activeCategory === 'professional') {
        if (n.category !== 'professional' && n.category !== 'business') return false;
      }

      // 2. Search Filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        n.name.toLowerCase().includes(q) ||
        (n.handle || '').toLowerCase().includes(q) ||
        (n.senderId || '').includes(q) ||
        (n.dob || '').toLowerCase().includes(q) ||
        (n.relationship || '').toLowerCase().includes(q) ||
        (n.personalNotes || '').toLowerCase().includes(q) ||
        (n.facts || []).some(f => f.toLowerCase().includes(q))
      );
    });
  }, [nodes, activeCategory, searchQuery]);

  return (
    <div style={{ padding: '36px 32px 60px 32px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold' }}>
            // PEOPLE INTELLIGENCE & SOCIAL REGISTRY
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.6px', marginTop: '4px' }}>
            All People Directory
          </h1>
          <p style={{ color: '#a1a1aa', fontSize: '0.88rem', marginTop: '4px' }}>
            Unified directory showing live Instagram handles, IDs, birth dates, relationship categories, and per-person AI reply rules.
          </p>
        </div>

        <button
          onClick={() => startAiInterview(null)}
          style={{
            background: '#ffffff',
            color: '#000000',
            border: 'none',
            padding: '10px 18px',
            borderRadius: '8px',
            fontWeight: '800',
            fontSize: '0.82rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 14px rgba(255,255,255,0.1)'
          }}
        >
          <Sparkles size={15} />
          <span>+ Add Person (AI)</span>
        </button>
      </div>

      {/* Action Required Banner for missing Instagram IDs */}
      {unlinkedFriends.length > 0 && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1.5px solid #f59e0b',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f59e0b',
                flexShrink: 0
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ color: '#f59e0b', fontWeight: '800', fontSize: '0.92rem' }}>
                Action Required: {unlinkedFriends.length} Contact{unlinkedFriends.length > 1 ? 's' : ''} Missing Instagram ID
              </div>
              <div style={{ color: '#d1d5db', fontSize: '0.8rem', marginTop: '2px' }}>
                The AI clone cannot recognize them in live DMs until linked. Add their Instagram handle or pick them from recent chatters so memory merges and AI answers with their lore!
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {unlinkedFriends.map(friend => (
              <button
                key={friend.id}
                onClick={() => setLinkingTargetPerson(friend)}
                style={{
                  background: '#f59e0b',
                  color: '#000000',
                  border: 'none',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: '800',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Link2 size={13} />
                <span>+ Link ID: {friend.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
        {/* Category Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All People', count: categoryCounts.all },
            { id: 'close_friend', label: 'Close Circle / Fami', count: categoryCounts.close_friend },
            { id: 'online_friend', label: 'Online Friends', count: categoryCounts.online_friend },
            { id: 'offline_friend', label: 'Offline Friends', count: categoryCounts.offline_friend },
            { id: 'family', label: 'Family / Relatives', count: categoryCounts.family },
            { id: 'professional', label: 'Professional / Business', count: categoryCounts.professional },
            { id: 'unlinked', label: 'Needs ID Link ⚠️', count: categoryCounts.unlinked, isWarning: true }
          ].map(tab => {
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id)}
                style={{
                  background: isActive ? '#ffffff' : '#09090b',
                  color: isActive ? '#000000' : (tab.isWarning && tab.count > 0 ? '#f59e0b' : '#a1a1aa'),
                  border: isActive ? '1px solid #ffffff' : (tab.isWarning && tab.count > 0 ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid #27272a'),
                  padding: '7px 14px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    background: isActive ? '#000000' : '#18181b',
                    color: isActive ? '#ffffff' : '#71717a',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontFamily: "'JetBrains Mono', monospace"
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Real-Time Search Bar */}
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
          <input
            type="text"
            placeholder="Search by name, @username, ID, birth date, relation, or bio notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              background: '#09090b',
              border: '1px solid #27272a',
              padding: '12px 14px 12px 42px',
              borderRadius: '10px',
              color: '#ffffff',
              fontSize: '0.85rem',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>
      </div>

      {/* ================= MAIN PEOPLE TABLE ================= */}
      <div
        style={{
          background: '#09090b',
          border: '1px solid #27272a',
          borderRadius: '14px',
          overflow: 'hidden',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '950px' }}>
            <thead>
              <tr style={{ background: '#0c0c0e', borderBottom: '1px solid #27272a' }}>
                <th style={{ padding: '14px 18px', fontSize: '0.7rem', fontWeight: '800', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", width: '70px' }}>
                  PROFILE
                </th>
                <th style={{ padding: '14px 18px', fontSize: '0.7rem', fontWeight: '800', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  NAME
                </th>
                <th style={{ padding: '14px 18px', fontSize: '0.7rem', fontWeight: '800', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  ID (SENDER ID)
                </th>
                <th style={{ padding: '14px 18px', fontSize: '0.7rem', fontWeight: '800', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  USERNAME
                </th>
                <th style={{ padding: '14px 18px', fontSize: '0.7rem', fontWeight: '800', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  DATE OF BIRTH
                </th>
                <th style={{ padding: '14px 18px', fontSize: '0.7rem', fontWeight: '800', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  RELATION
                </th>
                <th style={{ padding: '14px 18px', fontSize: '0.7rem', fontWeight: '800', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", textAlign: 'right' }}>
                  ACTION
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPeople.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#71717a', fontSize: '0.85rem' }}>
                    No people found matching your search and category filter.
                  </td>
                </tr>
              ) : (
                filteredPeople.map((person) => {
                  const hasId = Boolean(person.senderId);
                  const hasHandle = Boolean(person.handle);
                  const isPaused = person.aiEnabled === false;
                  const isReelsOnly = !isPaused && person.replyToMessages === false && person.replyToReelsAndPosts !== false;

                  const dobDisplay = person.dob || person.importantDates?.[0]?.date || '';

                  return (
                    <tr
                      key={person.id}
                      onClick={() => setSelectedNode(person)}
                      style={{
                        borderBottom: '1px solid #18181b',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#121214')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Column 1: PROFILE */}
                      <td style={{ padding: '12px 18px' }}>
                        <ContactAvatar contact={person} size={42} showStatus={true} />
                      </td>

                      {/* Column 2: NAME */}
                      <td style={{ padding: '12px 18px' }}>
                        <div style={{ fontWeight: '800', fontSize: '0.92rem', color: '#ffffff' }}>
                          {person.name}
                        </div>
                        {person.gender && person.gender !== 'unknown' && (
                          <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'capitalize' }}>
                            {person.gender}
                          </div>
                        )}
                      </td>

                      {/* Column 3: ID */}
                      <td style={{ padding: '12px 18px' }} onClick={(e) => e.stopPropagation()}>
                        {hasId ? (
                          <span style={{ fontSize: '0.75rem', color: '#a1a1aa', fontFamily: "'JetBrains Mono', monospace" }}>
                            {person.senderId}
                          </span>
                        ) : (
                          <button
                            onClick={() => setLinkingTargetPerson(person)}
                            style={{
                              background: 'rgba(245, 158, 11, 0.15)',
                              border: '1px solid #f59e0b',
                              color: '#f59e0b',
                              padding: '2px 8px',
                              borderRadius: '5px',
                              fontSize: '0.68rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <AlertTriangle size={10} />
                            <span>+ Link ID</span>
                          </button>
                        )}
                      </td>

                      {/* Column 4: USERNAME */}
                      <td style={{ padding: '12px 18px' }} onClick={(e) => e.stopPropagation()}>
                        {hasHandle ? (
                          <span
                            onClick={() => setLinkingTargetPerson(person)}
                            title="Click to edit handle"
                            style={{
                              fontSize: '0.78rem',
                              color: '#10b981',
                              fontFamily: "'JetBrains Mono', monospace",
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            {person.handle}
                            <Link2 size={11} style={{ opacity: 0.6 }} />
                          </span>
                        ) : (
                          <button
                            onClick={() => setLinkingTargetPerson(person)}
                            style={{
                              background: 'rgba(245, 158, 11, 0.15)',
                              border: '1px solid #f59e0b',
                              color: '#f59e0b',
                              padding: '2px 8px',
                              borderRadius: '5px',
                              fontSize: '0.68rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <AlertTriangle size={10} />
                            <span>No Handle</span>
                          </button>
                        )}
                      </td>

                      {/* Column 5: DATE OF BIRTH */}
                      <td style={{ padding: '12px 18px' }}>
                        {dobDisplay ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#fef08a' }}>
                            <Calendar size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
                            <span>{dobDisplay}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#52525b' }}>—</span>
                        )}
                      </td>

                      {/* Column 6: RELATION */}
                      <td style={{ padding: '12px 18px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '0.8rem', color: '#ffffff', fontWeight: '600' }}>
                            {person.relationship}
                          </span>
                          <span style={{ fontSize: '0.66rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace" }}>
                            {person.category ? person.category.replace('_', ' ').toUpperCase() : 'FRIEND'}
                          </span>
                        </div>
                      </td>

                      {/* Column 7: ACTION */}
                      <td style={{ padding: '12px 18px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          {/* Quick AI Mode Toggle Button */}
                          <button
                            onClick={() => {
                              const nextMode = isPaused ? 'full_ai' : (isReelsOnly ? 'paused' : 'reels_only');
                              updateContactPreferences(person.senderId || person.id, { aiMode: nextMode });
                            }}
                            title="Click to cycle: Full AI ➔ Only Reels ➔ Stop AI"
                            style={{
                              fontSize: '0.66rem',
                              padding: '4px 8px',
                              borderRadius: '5px',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontWeight: '700',
                              cursor: 'pointer',
                              background: isPaused
                                ? 'rgba(239, 68, 68, 0.15)'
                                : (isReelsOnly ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)'),
                              color: isPaused
                                ? '#ef4444'
                                : (isReelsOnly ? '#f59e0b' : '#10b981'),
                              border: '1px solid',
                              borderColor: isPaused
                                ? '#ef4444'
                                : (isReelsOnly ? '#f59e0b' : '#10b981')
                            }}
                          >
                            {isPaused ? '⏸️ MANUAL' : (isReelsOnly ? '🎬 REELS' : '⚡ FULL AI')}
                          </button>

                          {/* Open Inner Profile View */}
                          <button
                            onClick={() => setSelectedNode(person)}
                            style={{
                              background: '#ffffff',
                              color: '#000000',
                              border: 'none',
                              padding: '5px 12px',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: '800',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <span>Open</span>
                            <ArrowRight size={12} />
                          </button>

                          {/* Delete Person */}
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete ${person.name} from Database & Knowledge Tree?`)) {
                                deleteNode(person.id || person.name);
                              }
                            }}
                            title="Delete Person"
                            style={{
                              background: 'transparent',
                              border: '1px solid #3f3f46',
                              color: '#ef4444',
                              padding: '5px 8px',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
