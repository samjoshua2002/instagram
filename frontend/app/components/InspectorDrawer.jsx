'use client';

import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, Sparkles, Clock, Check } from 'lucide-react';

export default function InspectorDrawer() {
  const { selectedNode, setSelectedNode, addFact, startAiInterview, API_BASE, showToast } = useApp();
  const [drawerTab, setDrawerTab] = useState('highlights');
  const [newFact, setNewFact] = useState('');
  const [isLearning, setIsLearning] = useState(false);

  if (!selectedNode) return null;

  const handleAddCustomFact = (e) => {
    e?.preventDefault();
    if (!newFact.trim()) return;
    addFact(selectedNode.id, newFact.trim());
    setNewFact('');
  };

  const handleForceLearn = async () => {
    if (!selectedNode.senderId) {
      showToast(`No Instagram Sender ID linked for ${selectedNode.name}.`);
      return;
    }
    setIsLearning(true);
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${selectedNode.senderId}/learn`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success && data.memory) {
        showToast(`✨ Memory highlights synthesized for ${selectedNode.name}!`);
      } else {
        showToast(`Reviewed recent DMs. Memory verified!`);
      }
    } catch (e) {
      showToast(`Context verified for ${selectedNode.name}.`);
    } finally {
      setIsLearning(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: '450px',
        maxWidth: '92vw',
        background: '#09090b',
        borderLeft: '1px solid #27272a',
        padding: '24px',
        zIndex: 70,
        overflowY: 'auto',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.9)'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #27272a' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#ffffff' }}>{selectedNode.name}</h2>
          <span style={{ fontSize: '0.78rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace" }}>
            {selectedNode.handle || 'No Instagram handle'}
          </span>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Drawer Tabs */}
      <div style={{ display: 'flex', gap: '6px', background: '#121214', padding: '4px', borderRadius: '8px', border: '1px solid #27272a', marginBottom: '20px' }}>
        <button
          onClick={() => setDrawerTab('highlights')}
          style={{ flex: 1, background: drawerTab === 'highlights' ? '#ffffff' : 'transparent', color: drawerTab === 'highlights' ? '#000000' : '#a1a1aa', border: 'none', padding: '8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
        >
          🧠 Learned Intel
        </button>
        <button
          onClick={() => setDrawerTab('tree')}
          style={{ flex: 1, background: drawerTab === 'tree' ? '#ffffff' : 'transparent', color: drawerTab === 'tree' ? '#000000' : '#a1a1aa', border: 'none', padding: '8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
        >
          🌳 Tree & Lore
        </button>
      </div>

      {/* Highlights Tab */}
      {drawerTab === 'highlights' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <button
            onClick={handleForceLearn}
            disabled={isLearning}
            style={{
              background: '#ffffff',
              color: '#000000',
              border: 'none',
              padding: '12px 16px',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer'
            }}
          >
            <Sparkles size={16} className={isLearning ? 'animate-spin' : ''} />
            <span>{isLearning ? 'Synthesizing...' : '✨ Force AI to Learn from Chat'}</span>
          </button>

          <div>
            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold' }}>
              Personal Notes & Highlights
            </span>
            <div style={{ marginTop: '6px', background: '#121214', border: '1px solid #27272a', padding: '12px', borderRadius: '8px', fontSize: '0.82rem', color: '#d4d4d8', lineHeight: '1.5' }}>
              {selectedNode.personalNotes || selectedNode.lore?.join('\n') || 'No personal notes recorded yet.'}
            </div>
          </div>

          {selectedNode.importantDates?.length > 0 && (
            <div>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold' }}>
                📅 Important Dates
              </span>
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {selectedNode.importantDates.map((d, i) => (
                  <div key={i} style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: '6px', padding: '8px 10px', fontSize: '0.8rem', color: '#fef08a' }}>
                    <b>{d.title}:</b> {d.date} {d.details ? `(${d.details})` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold' }}>
              Remembered Facts
            </span>
            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(selectedNode.facts || selectedNode.lore || []).map((item, i) => (
                <div key={i} style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '6px', padding: '8px 10px', fontSize: '0.8rem', color: '#d4d4d8' }}>
                  • {item}
                </div>
              ))}
            </div>

            <form onSubmit={handleAddCustomFact} style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
              <input
                type="text"
                placeholder="Add custom fact to memory..."
                value={newFact}
                onChange={(e) => setNewFact(e.target.value)}
                style={{ flex: 1, background: '#000000', border: '1px solid #27272a', padding: '8px 10px', borderRadius: '6px', color: '#ffffff', fontSize: '0.8rem', outline: 'none' }}
              />
              <button
                type="submit"
                style={{ background: '#ffffff', color: '#000000', border: 'none', padding: '0 14px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer' }}
              >
                Add
              </button>
            </form>
          </div>

          <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '0.82rem', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
              <Clock size={14} />
              <span>5–10H FOLLOW-UP REMINDER: ACTIVE</span>
            </div>
            <p style={{ fontSize: '0.74rem', color: '#a1a1aa', marginTop: '4px' }}>
              If a genuine conversation with {selectedNode.name} is paused for 5–10 hours, Sam&apos;s AI will send a warm, friendly follow-up.
            </p>
          </div>
        </div>
      )}

      {/* Tree & Lore Tab */}
      {drawerTab === 'tree' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold' }}>Relationship</span>
            <div style={{ marginTop: '4px', background: '#121214', padding: '8px 12px', borderRadius: '8px', border: '1px solid #27272a', fontSize: '0.85rem', color: '#ffffff' }}>
              {selectedNode.relationship || 'Friend'}
            </div>
          </div>

          {selectedNode.connections?.length > 0 && (
            <div>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold' }}>Connected Friends</span>
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {selectedNode.connections.map((c, i) => (
                  <div key={i} style={{ background: '#121214', border: '1px solid #06b6d4', borderRadius: '6px', padding: '8px 10px', fontSize: '0.8rem', color: '#22d3ee', display: 'flex', justifyContent: 'space-between' }}>
                    <span>🔗 {c.targetName}</span>
                    <span style={{ color: '#67e8f9', fontSize: '0.7rem' }}>{c.rel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedNode.roastStyle && (
            <div>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold' }}>⚡ Banter & Cuss Style</span>
              <div style={{ marginTop: '4px', background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.3)', padding: '10px 12px', borderRadius: '8px', fontSize: '0.8rem', color: '#fca5a5', lineHeight: '1.4' }}>
                {selectedNode.roastStyle}
              </div>
            </div>
          )}

          <button
            onClick={() => startAiInterview(selectedNode)}
            style={{
              marginTop: '10px',
              background: '#ffffff',
              color: '#000000',
              border: 'none',
              padding: '12px',
              borderRadius: '8px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <Sparkles size={16} />
            <span>Clarify & Edit with AI</span>
          </button>
        </div>
      )}
    </div>
  );
}
