'use client';

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  List, LayoutGrid, Search, Sparkles, ChevronDown, ChevronRight,
  Plus, Users, ArrowRight, Trash2, Film, PauseCircle, Link2, AlertTriangle
} from 'lucide-react';
import ContactAvatar from '../components/ContactAvatar';

export default function RelationshipsPage() {
  const {
    nodes,
    setSelectedNode,
    startAiInterview,
    addFact,
    deleteNode,
    updateContactPreferences,
    setLinkingTargetPerson
  } = useApp();
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'chart'
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState(new Set(['bhavani', 'rajveer', 'fami']));
  const [newFactInput, setNewFactInput] = useState({});

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredFriends = useMemo(() => {
    return nodes.filter(n => {
      if (n.isRoot) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        n.name.toLowerCase().includes(q) ||
        (n.handle || '').toLowerCase().includes(q) ||
        (n.relationship || '').toLowerCase().includes(q) ||
        (n.facts || []).some(f => f.toLowerCase().includes(q))
      );
    });
  }, [nodes, searchQuery]);

  const unlinkedFriends = useMemo(() => {
    return nodes.filter(n => !n.isRoot && !n.handle && !n.senderId);
  }, [nodes]);

  const handleQuickAddFact = (friendId, e) => {
    e?.preventDefault();
    const fact = (newFactInput[friendId] || '').trim();
    if (!fact) return;
    addFact(friendId, fact);
    setNewFactInput(prev => ({ ...prev, [friendId]: '' }));
  };

  return (
    <div style={{ padding: '36px 32px 60px 32px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold' }}>
            // RELATIONSHIP MENU & SOCIAL GRAPH
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.6px', marginTop: '4px' }}>
            Relationships With Each Person
          </h1>
          <p style={{ color: '#a1a1aa', fontSize: '0.88rem', marginTop: '4px' }}>
            Interlinked friend chains, relationship types (sister, bro, homie, lover, relative), shared lore, and banter styles.
          </p>
        </div>

        {/* View Switcher & Add Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', background: '#09090b', border: '1px solid #27272a', padding: '3px', borderRadius: '10px' }}>
            <button
              onClick={() => setViewMode('list')}
              style={{
                background: viewMode === 'list' ? '#ffffff' : 'transparent',
                color: viewMode === 'list' ? '#000000' : '#a1a1aa',
                border: 'none',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <List size={14} />
              <span>List View</span>
            </button>
            <button
              onClick={() => setViewMode('chart')}
              style={{
                background: viewMode === 'chart' ? '#ffffff' : 'transparent',
                color: viewMode === 'chart' ? '#000000' : '#a1a1aa',
                border: 'none',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <LayoutGrid size={14} />
              <span>Hierarchy Chart</span>
            </button>
          </div>

          <button
            onClick={() => startAiInterview(null)}
            style={{
              background: '#ffffff',
              color: '#000000',
              border: 'none',
              padding: '9px 16px',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Sparkles size={14} />
            <span>+ Add Person (AI)</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div style={{ marginBottom: '24px', position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
        <input
          type="text"
          placeholder="Filter friends by name, handle (@m4visyzx), relationship, or lore..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            background: '#09090b',
            border: '1px solid #27272a',
            padding: '12px 14px 12px 42px',
            borderRadius: '10px',
            color: '#ffffff',
            fontSize: '0.85rem',
            width: '100%',
            outline: 'none'
          }}
        />
      </div>

      {/* Unlinked Contacts Warning Banner */}
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
                Chatter OS cannot recognize them when they DM you! Link their @handle or select from recent chats so AI auto-merges memory and answers with their specific lore.
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

      {/* Root Persona Banner: Sam Joshua */}
      <div style={{ background: '#09090b', border: '1.5px solid #ffffff', borderRadius: '14px', padding: '20px 24px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 0 35px rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#ffffff', color: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', fontWeight: 'bold' }}>
            👑
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#ffffff' }}>Sam Joshua</h2>
              <span style={{ fontSize: '0.68rem', background: '#18181b', color: '#10b981', padding: '2px 8px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace", border: '1px solid #27272a' }}>
                ROOT PERSONA
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#a1a1aa', fontFamily: "'JetBrains Mono', monospace", marginTop: '2px' }}>
              @catovidz // Creator Core Node • {filteredFriends.length} Friends Interlinked
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ fontSize: '0.72rem', background: '#121214', color: '#10b981', border: '1px solid #10b981', padding: '6px 12px', borderRadius: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
            Relationship Chains Active
          </span>
        </div>
      </div>

      {/* ================= VIEW 1: STRUCTURED LIST VIEW ================= */}
      {viewMode === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredFriends.map(friend => {
            const isExpanded = expandedIds.has(friend.id);
            const initials = (friend.name || '?').slice(0, 2).toUpperCase();

            return (
              <div
                key={friend.id}
                style={{
                  background: '#09090b',
                  border: isExpanded ? '1px solid #ffffff' : '1px solid #27272a',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  transition: 'border-color 0.15s ease'
                }}
              >
                {/* Main Card Header Bar */}
                <div
                  onClick={() => toggleExpand(friend.id)}
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: isExpanded ? '#121214' : 'transparent',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <ContactAvatar contact={friend} size={42} showStatus={true} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '800', fontSize: '1rem', color: '#ffffff' }}>{friend.name}</span>
                        {friend.handle ? (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setLinkingTargetPerson(friend);
                            }}
                            title="Click to edit or re-link Instagram handle"
                            style={{ fontSize: '0.75rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            {friend.handle}
                            <Link2 size={11} style={{ opacity: 0.7 }} />
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLinkingTargetPerson(friend);
                            }}
                            style={{
                              background: 'rgba(245, 158, 11, 0.15)',
                              border: '1px solid #f59e0b',
                              color: '#f59e0b',
                              padding: '2px 8px',
                              borderRadius: '5px',
                              fontSize: '0.7rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <AlertTriangle size={11} />
                            <span>No ID — [+ Link ID]</span>
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '2px' }}>
                        {friend.relationship}
                      </div>
                    </div>
                  </div>

                  {/* Middle Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Per-Person AI Mode Badge */}
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextMode = friend.aiEnabled === false
                          ? 'full_ai'
                          : (friend.replyToMessages === false && friend.replyToReelsAndPosts !== false ? 'paused' : 'reels_only');
                        updateContactPreferences(friend.senderId || friend.id, { aiMode: nextMode });
                      }}
                      title="Click to toggle: Full AI ➔ Reels Only ➔ Stop AI"
                      style={{
                        fontSize: '0.66rem',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: '700',
                        cursor: 'pointer',
                        background: friend.aiEnabled === false
                          ? 'rgba(239, 68, 68, 0.15)'
                          : (friend.replyToMessages === false && friend.replyToReelsAndPosts !== false
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(16, 185, 129, 0.15)'),
                        color: friend.aiEnabled === false
                          ? '#ef4444'
                          : (friend.replyToMessages === false && friend.replyToReelsAndPosts !== false
                              ? '#f59e0b'
                              : '#10b981'),
                        border: '1px solid',
                        borderColor: friend.aiEnabled === false
                          ? '#ef4444'
                          : (friend.replyToMessages === false && friend.replyToReelsAndPosts !== false
                              ? '#f59e0b'
                              : '#10b981')
                      }}
                    >
                      {friend.aiEnabled === false ? 'SAM MANUAL' : (friend.replyToMessages === false && friend.replyToReelsAndPosts !== false ? '🎬 REELS ONLY' : '⚡ FULL AI')}
                    </span>

                    {(friend.connections || []).map((c, i) => (
                      <span key={i} style={{ fontSize: '0.7rem', background: '#121214', color: '#38bdf8', border: '1px solid #0284c7', padding: '3px 8px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
                        🔗 {c.targetName}
                      </span>
                    ))}
                    {friend.importantDates?.length > 0 && (
                      <span style={{ fontSize: '0.7rem', background: 'rgba(234,179,8,0.1)', color: '#fef08a', border: '1px solid rgba(234,179,8,0.3)', padding: '3px 8px', borderRadius: '4px' }}>
                        🎂 {friend.importantDates[0].date}
                      </span>
                    )}
                    <span style={{ fontSize: '0.7rem', background: '#18181b', color: '#a1a1aa', padding: '3px 8px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
                      {(friend.facts || friend.lore || []).length} Facts
                    </span>
                  </div>

                  {/* Right Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setSelectedNode(friend)}
                      style={{ background: '#18181b', border: '1px solid #27272a', color: '#ffffff', padding: '7px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Inspect
                    </button>
                    <button
                      onClick={() => startAiInterview(friend)}
                      style={{ background: '#ffffff', border: 'none', color: '#000000', padding: '7px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                    >
                      Edit Lore
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete ${friend.name} from Database & Knowledge Tree?`)) {
                          deleteNode(friend.id || friend.name);
                        }
                      }}
                      title="Delete from Database"
                      style={{ background: 'transparent', border: '1px solid #3f3f46', color: '#ef4444', padding: '7px 9px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 size={13} />
                    </button>
                    <button
                      onClick={() => toggleExpand(friend.id)}
                      style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px' }}
                    >
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details Body */}
                {isExpanded && (
                  <div style={{ padding: '20px', borderTop: '1px solid #27272a', background: '#09090b', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    {/* Unlinked Alert in Expanded Card if missing ID */}
                    {(!friend.handle && !friend.senderId) && (
                      <div style={{ gridColumn: '1 / -1', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid #f59e0b', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <AlertTriangle size={18} color="#f59e0b" />
                          <div>
                            <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#f59e0b' }}>
                              Instagram ID Not Linked
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#d1d5db', marginTop: '2px' }}>
                              Add {friend.name}&apos;s @handle or numeric ID so the AI merges their chat log and recognizes them in incoming DMs.
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setLinkingTargetPerson(friend)}
                          style={{
                            background: '#f59e0b',
                            color: '#000000',
                            border: 'none',
                            padding: '7px 14px',
                            borderRadius: '6px',
                            fontSize: '0.76rem',
                            fontWeight: '800',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <Link2 size={13} />
                          <span>Link Instagram ID Now</span>
                        </button>
                      </div>
                    )}

                    {/* Individual AI Behavior Quick Bar */}
                    <div style={{ gridColumn: '1 / -1', background: '#121214', border: '1px solid #27272a', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                          ⚙️ INDIVIDUAL AI REPLY RULE
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#a1a1aa', marginTop: '2px' }}>
                          Set AI behavior specifically for {friend.name}:
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => updateContactPreferences(friend.senderId || friend.id, { aiMode: 'full_ai' })}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: (friend.aiEnabled !== false && friend.replyToMessages !== false) ? '700' : '500',
                            cursor: 'pointer',
                            background: (friend.aiEnabled !== false && friend.replyToMessages !== false) ? '#ffffff' : '#18181b',
                            color: (friend.aiEnabled !== false && friend.replyToMessages !== false) ? '#000000' : '#a1a1aa',
                            border: (friend.aiEnabled !== false && friend.replyToMessages !== false) ? '1px solid #ffffff' : '1px solid #27272a',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Sparkles size={12} />
                          <span>Full AI</span>
                        </button>
                        <button
                          onClick={() => updateContactPreferences(friend.senderId || friend.id, { aiMode: 'reels_only' })}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: (friend.aiEnabled !== false && friend.replyToMessages === false && friend.replyToReelsAndPosts !== false) ? '700' : '500',
                            cursor: 'pointer',
                            background: (friend.aiEnabled !== false && friend.replyToMessages === false && friend.replyToReelsAndPosts !== false) ? '#f59e0b' : '#18181b',
                            color: (friend.aiEnabled !== false && friend.replyToMessages === false && friend.replyToReelsAndPosts !== false) ? '#000000' : '#a1a1aa',
                            border: (friend.aiEnabled !== false && friend.replyToMessages === false && friend.replyToReelsAndPosts !== false) ? '1px solid #f59e0b' : '1px solid #27272a',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Film size={12} />
                          <span>🎬 Only Reels</span>
                        </button>
                        <button
                          onClick={() => updateContactPreferences(friend.senderId || friend.id, { aiMode: 'paused' })}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: friend.aiEnabled === false ? '700' : '500',
                            cursor: 'pointer',
                            background: friend.aiEnabled === false ? '#ef4444' : '#18181b',
                            color: friend.aiEnabled === false ? '#ffffff' : '#a1a1aa',
                            border: friend.aiEnabled === false ? '1px solid #ef4444' : '1px solid #27272a',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <PauseCircle size={12} />
                          <span>⏸️ Stop AI (Sam Manual)</span>
                        </button>
                      </div>
                    </div>

                    {/* Notes */}
                    <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '10px', padding: '14px' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                        📝 PERSONAL NOTES & CONTEXT
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#d4d4d8', lineHeight: '1.5' }}>
                        {friend.personalNotes || friend.lore?.join('\n') || 'No personal notes recorded yet.'}
                      </p>
                    </div>

                    {/* Facts & Quick Add */}
                    <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                        🧠 REMEMBERED FACTS ({(friend.facts || []).length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, maxHeight: '180px', overflowY: 'auto' }}>
                        {(friend.facts || friend.lore || []).map((f, i) => (
                          <div key={i} style={{ fontSize: '0.76rem', color: '#a1a1aa', background: '#09090b', padding: '5px 8px', borderRadius: '4px', border: '1px solid #1f1f23' }}>
                            • {f}
                          </div>
                        ))}
                      </div>

                      <form onSubmit={(e) => handleQuickAddFact(friend.id, e)} style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                        <input
                          type="text"
                          placeholder="Quick add new fact..."
                          value={newFactInput[friend.id] || ''}
                          onChange={(e) => setNewFactInput(prev => ({ ...prev, [friend.id]: e.target.value }))}
                          style={{ flex: 1, background: '#000000', border: '1px solid #27272a', padding: '6px 10px', borderRadius: '6px', color: '#ffffff', fontSize: '0.75rem', outline: 'none' }}
                        />
                        <button
                          type="submit"
                          style={{ background: '#ffffff', color: '#000000', border: 'none', padding: '0 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                        >
                          Add
                        </button>
                      </form>
                    </div>

                    {/* Connections & Banter */}
                    <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                          🔗 CONNECTED FRIENDS (TREE CHAIN)
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {(friend.connections || []).length > 0 ? (
                            friend.connections.map((c, i) => (
                              <span key={i} style={{ fontSize: '0.75rem', background: '#082f49', color: '#38bdf8', border: '1px solid #0284c7', padding: '4px 8px', borderRadius: '4px' }}>
                                🔗 {c.targetName} ({c.rel})
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#71717a' }}>No interlinked friends specified</span>
                          )}
                        </div>
                      </div>

                      {friend.roastStyle && (
                        <div>
                          <div style={{ fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', color: '#f43f5e', marginBottom: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
                            ⚡ CUSS & BANTER STYLE
                          </div>
                          <div style={{ fontSize: '0.76rem', color: '#fecdd3', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.3)', padding: '8px 10px', borderRadius: '6px', lineHeight: '1.4' }}>
                            {friend.roastStyle}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ================= VIEW 2: PROPER HIERARCHY ORG CHART ================= */}
      {viewMode === 'chart' && (
        <div>
          {/* Vertical Tree Connector Lines */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
            <div style={{ width: '2px', height: '30px', background: '#52525b' }} />
            <div style={{ width: '80%', height: '2px', background: '#52525b', position: 'relative' }}>
              <div style={{ position: 'absolute', left: '50%', top: '-4px', transform: 'translateX(-50%)', width: '10px', height: '10px', borderRadius: '50%', background: '#ffffff' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
            {filteredFriends.map(node => (
              <div
                key={node.id}
                style={{
                  background: '#09090b',
                  border: '1px solid #27272a',
                  borderRadius: '12px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                  position: 'relative'
                }}
              >
                <div style={{ position: 'absolute', top: '-16px', left: '50%', width: '2px', height: '16px', background: '#52525b' }} />

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.65rem', background: '#18181b', color: '#10b981', padding: '2px 6px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace", border: '1px solid #27272a' }}>
                      {node.relationship.split('/')[0].trim().toUpperCase()}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                      {(node.facts || []).length} facts
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <ContactAvatar contact={node} size={36} showStatus={true} />
                    <div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#ffffff' }}>
                        {node.name}
                      </h3>
                      {node.handle ? (
                        <div style={{ fontSize: '0.74rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace" }}>
                          {node.handle}
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setLinkingTargetPerson(node);
                          }}
                          style={{
                            background: 'rgba(245, 158, 11, 0.15)',
                            border: '1px solid #f59e0b',
                            color: '#f59e0b',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontSize: '0.65rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            marginTop: '2px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                        >
                          <AlertTriangle size={10} />
                          <span>+ Link ID</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {node.facts?.length > 0 && (
                    <div style={{ marginTop: '10px', fontSize: '0.74rem', color: '#d4d4d8', background: '#121214', padding: '6px 8px', borderRadius: '6px', border: '1px solid #1f1f23' }}>
                      • {node.facts[0]}
                    </div>
                  )}

                  {node.connections?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                      {node.connections.map((c, i) => (
                        <span key={i} style={{ fontSize: '0.65rem', background: '#082f49', color: '#38bdf8', padding: '2px 6px', borderRadius: '3px' }}>
                          🔗 {c.targetName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px', paddingTop: '10px', borderTop: '1px solid #18181b' }}>
                  <button
                    onClick={() => setSelectedNode(node)}
                    style={{ flex: 1, background: '#18181b', border: '1px solid #27272a', color: '#ffffff', padding: '6px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '600', cursor: 'pointer' }}
                  >
                    Inspect
                  </button>
                  <button
                    onClick={() => startAiInterview(node)}
                    style={{ background: '#ffffff', color: '#000000', border: 'none', padding: '6px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
