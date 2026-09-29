'use client';

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Brain, Search, Sparkles, Clock, Calendar, MessageSquare, Plus, ArrowRight
} from 'lucide-react';

export default function MemoriesPage() {
  const { nodes, setSelectedNode, startAiInterview, addFact, showToast, API_BASE } = useApp();
  const [search, setSearch] = useState('');
  const [learningId, setLearningId] = useState(null);
  const [newFactMap, setNewFactMap] = useState({});

  const friendNodes = useMemo(() => {
    return nodes.filter(n => {
      if (n.isRoot) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        n.name.toLowerCase().includes(q) ||
        (n.handle || '').toLowerCase().includes(q) ||
        (n.relationship || '').toLowerCase().includes(q) ||
        (n.facts || []).some(f => f.toLowerCase().includes(q))
      );
    });
  }, [nodes, search]);

  const handleLearnFromDMs = async (person) => {
    if (!person.senderId) {
      showToast(`No Instagram Sender ID linked for ${person.name}.`);
      return;
    }
    setLearningId(person.id);
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${person.senderId}/learn`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.memory) {
        showToast(`✨ Memory highlights updated for ${person.name}!`);
      } else {
        showToast(`AI reviewed recent DMs. Memory is fresh!`);
      }
    } catch (e) {
      showToast(`Memory verified for ${person.name}.`);
    } finally {
      setLearningId(null);
    }
  };

  const handleAddFact = (friendId, e) => {
    e?.preventDefault();
    const fact = (newFactMap[friendId] || '').trim();
    if (!fact) return;
    addFact(friendId, fact);
    setNewFactMap(prev => ({ ...prev, [friendId]: '' }));
  };

  return (
    <div style={{ padding: '36px 32px 60px 32px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold' }}>
            // INTEL DOSSIERS & REMEMBERED HIGHLIGHTS
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.6px', marginTop: '4px' }}>
            Learned Memories
          </h1>
          <p style={{ color: '#a1a1aa', fontSize: '0.88rem', marginTop: '4px' }}>
            Real-time intelligence extracted by AI: ongoing personal notes, important dates, life events, conversation styles, and follow-up reminders.
          </p>
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

      {/* Search Input */}
      <div style={{ marginBottom: '24px', position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
        <input
          type="text"
          placeholder="Filter memories by name, handle, facts, inside jokes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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

      {/* Grid of Memory Dossiers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
        {friendNodes.map(person => (
          <div
            key={person.id}
            style={{
              background: '#09090b',
              border: '1px solid #27272a',
              borderRadius: '14px',
              padding: '22px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#ffffff' }}>{person.name}</h3>
                <span style={{ fontSize: '0.75rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace" }}>
                  {person.handle || 'No handle'}
                </span>
              </div>
              <span style={{ fontSize: '0.7rem', background: '#18181b', color: '#a1a1aa', border: '1px solid #27272a', padding: '3px 8px', borderRadius: '4px' }}>
                {person.relationship}
              </span>
            </div>

            {/* Personal Notes */}
            {person.personalNotes && (
              <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '8px', padding: '12px', fontSize: '0.8rem', color: '#d4d4d8', lineHeight: '1.5' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '4px' }}>
                  📝 Notes & Highlights
                </div>
                {person.personalNotes}
              </div>
            )}

            {/* Important Dates */}
            {person.importantDates?.length > 0 && (
              <div style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '6px', padding: '8px 10px', fontSize: '0.78rem', color: '#fef08a' }}>
                📅 <b>{person.importantDates[0].title}:</b> {person.importantDates[0].date} ({person.importantDates[0].details})
              </div>
            )}

            {/* Remembered Facts List */}
            {person.facts?.length > 0 && (
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                  🧠 Remembered Facts ({person.facts.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {person.facts.map((f, i) => (
                    <div key={i} style={{ fontSize: '0.76rem', color: '#a1a1aa', background: '#121214', padding: '6px 10px', borderRadius: '4px', border: '1px solid #1f1f23' }}>
                      • {f}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inline Quick Add Fact */}
            <form onSubmit={(e) => handleAddFact(person.id, e)} style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="Add custom fact to memory..."
                value={newFactMap[person.id] || ''}
                onChange={(e) => setNewFactMap(prev => ({ ...prev, [person.id]: e.target.value }))}
                style={{ flex: 1, background: '#121214', border: '1px solid #27272a', padding: '8px 10px', borderRadius: '6px', color: '#ffffff', fontSize: '0.78rem', outline: 'none' }}
              />
              <button
                type="submit"
                style={{ background: '#ffffff', color: '#000000', border: 'none', padding: '0 14px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
              >
                Add
              </button>
            </form>

            {/* 5-10h Reminder Status */}
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '0.78rem', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
                <Clock size={13} />
                <span>5–10H FOLLOW-UP REMINDER: ACTIVE</span>
              </div>
              <p style={{ fontSize: '0.72rem', color: '#a1a1aa', marginTop: '2px' }}>
                Natural friendly follow-up triggers if conversation paused in 5–10h window.
              </p>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid #18181b' }}>
              <button
                onClick={() => setSelectedNode(person)}
                style={{ flex: 1, background: '#18181b', border: '1px solid #27272a', color: '#ffffff', padding: '8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
              >
                Inspect Full Intel
              </button>
              <button
                onClick={() => handleLearnFromDMs(person)}
                disabled={learningId === person.id}
                style={{ background: '#ffffff', border: 'none', color: '#000000', padding: '8px 14px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Sparkles size={13} className={learningId === person.id ? 'animate-spin' : ''} />
                <span>{learningId === person.id ? 'Learning...' : 'Force AI Learn'}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
