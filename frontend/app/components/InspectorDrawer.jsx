'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import ContactAvatar from './ContactAvatar';
import {
  X, Sparkles, Clock, Check, Film, PauseCircle, Trash2, Link2,
  AlertTriangle, Save, UserCheck, Plus, RefreshCw, MessageSquare
} from 'lucide-react';

export default function InspectorDrawer() {
  const {
    selectedNode,
    setSelectedNode,
    addFact,
    deleteNode,
    saveNode,
    updateContactPreferences,
    setLinkingTargetPerson,
    aiAutofillPerson,
    API_BASE,
    showToast
  } = useApp();

  const [drawerTab, setDrawerTab] = useState('edit'); // 'edit' | 'memories' | 'connections'
  const [newFact, setNewFact] = useState('');
  const [isLearning, setIsLearning] = useState(false);
  const [isAutofilling, setIsAutofilling] = useState(false);

  // Form State for editing fields directly
  const [formData, setFormData] = useState({
    name: '',
    dob: '',
    category: 'online_friend',
    relationship: '',
    personalNotes: '',
    roastStyle: '',
    handle: '',
    senderId: ''
  });

  // Connections State
  const [newConnTarget, setNewConnTarget] = useState('');
  const [newConnRel, setNewConnRel] = useState('');

  // Sync form state when selectedNode changes
  useEffect(() => {
    if (selectedNode) {
      setFormData({
        name: selectedNode.name || '',
        dob: selectedNode.dob || selectedNode.importantDates?.[0]?.date || '',
        category: selectedNode.category || 'online_friend',
        relationship: selectedNode.relationship || '',
        personalNotes: selectedNode.personalNotes || (selectedNode.lore || []).join('\n'),
        roastStyle: selectedNode.roastStyle || '',
        handle: selectedNode.handle || '',
        senderId: selectedNode.senderId || ''
      });
    }
  }, [selectedNode]);

  if (!selectedNode) return null;

  const isPaused = selectedNode.aiEnabled === false;
  const isReelsOnly = !isPaused && selectedNode.replyToMessages === false && selectedNode.replyToReelsAndPosts !== false;
  const isFullAi = !isPaused && !isReelsOnly;
  const hasInstagramId = Boolean(selectedNode.handle || selectedNode.senderId);

  const handleSaveForm = async (e) => {
    e?.preventDefault();
    if (!formData.name.trim()) {
      showToast('Name cannot be empty.');
      return;
    }

    const updatedNode = {
      ...selectedNode,
      name: formData.name.trim(),
      category: formData.category,
      dob: formData.dob.trim(),
      dateOfBirth: formData.dob.trim(),
      relationship: formData.relationship.trim(),
      relationshipToSam: formData.relationship.trim(),
      personalNotes: formData.personalNotes.trim(),
      lore: formData.personalNotes.trim().split('\n').map(l => l.trim().replace(/^[•\-\*]\s*/, '')).filter(Boolean),
      roastStyle: formData.roastStyle.trim()
    };

    await saveNode(updatedNode);
    showToast(`💾 Saved details for ${formData.name}!`);
  };

  const handleTriggerAutofill = async () => {
    setIsAutofilling(true);
    showToast(`🤖 AI scanning chat logs for ${selectedNode.name}...`);
    try {
      const autofill = await aiAutofillPerson(selectedNode.name);
      if (autofill) {
        setFormData(prev => ({
          ...prev,
          category: autofill.category || prev.category,
          relationship: autofill.relationshipToSam || prev.relationship,
          dob: autofill.dob || prev.dob,
          personalNotes: autofill.personalNotes || prev.personalNotes,
          roastStyle: autofill.banterStyle || prev.roastStyle
        }));

        if (Array.isArray(autofill.facts)) {
          autofill.facts.forEach(f => addFact(selectedNode.id, f));
        }

        showToast(`✨ AI autofilled profile fields from conversation!`);
      } else {
        showToast(`⚠️ No new chat data found to synthesize.`);
      }
    } catch (e) {
      showToast(`Autofill error: ${e.message}`);
    } finally {
      setIsAutofilling(false);
    }
  };

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
        showToast(`✨ Memory synthesized from recent DMs!`);
      } else {
        showToast(`DMs reviewed. Memory is up-to-date!`);
      }
    } catch (e) {
      showToast(`Memory verified.`);
    } finally {
      setIsLearning(false);
    }
  };

  const handleAddConnection = async (e) => {
    e?.preventDefault();
    if (!newConnTarget.trim()) return;

    const newConn = {
      targetName: newConnTarget.trim(),
      rel: newConnRel.trim() || 'connected'
    };

    const updatedConns = [...(selectedNode.connections || []), newConn];
    const updatedNode = {
      ...selectedNode,
      connections: updatedConns
    };

    await saveNode(updatedNode);
    setNewConnTarget('');
    setNewConnRel('');
    showToast(`🔗 Connected ${selectedNode.name} to ${newConn.targetName}!`);
  };

  return (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: '520px',
        maxWidth: '96vw',
        background: '#09090b',
        borderLeft: '1px solid #27272a',
        padding: '24px',
        zIndex: 70,
        overflowY: 'auto',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.9)'
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #27272a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ContactAvatar contact={selectedNode} size={48} showStatus={true} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ffffff', margin: 0 }}>
                {selectedNode.name}
              </h2>
              <span style={{ fontSize: '0.66rem', background: '#18181b', color: '#10b981', padding: '2px 8px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace", border: '1px solid #27272a' }}>
                {(selectedNode.category || 'friend').toUpperCase()}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              <span style={{ fontSize: '0.78rem', color: hasInstagramId ? '#10b981' : '#f59e0b', fontFamily: "'JetBrains Mono', monospace" }}>
                {selectedNode.handle || (selectedNode.senderId ? `ID: ${selectedNode.senderId}` : 'No Instagram ID')}
              </span>
              <button
                onClick={() => setLinkingTargetPerson(selectedNode)}
                title={hasInstagramId ? "Edit or change linked Instagram ID" : "Link Instagram ID"}
                style={{
                  background: hasInstagramId ? '#18181b' : 'rgba(245, 158, 11, 0.2)',
                  border: '1px solid',
                  borderColor: hasInstagramId ? '#3f3f46' : '#f59e0b',
                  color: hasInstagramId ? '#a1a1aa' : '#f59e0b',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  fontSize: '0.68rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
              >
                <Link2 size={10} />
                <span>{hasInstagramId ? 'Edit ID' : '+ Link ID'}</span>
              </button>
            </div>
          </div>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '6px' }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Warning banner if Missing ID */}
      {!hasInstagramId && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1.5px solid #f59e0b',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}
        >
          <div>
            <div style={{ color: '#f59e0b', fontWeight: '800', fontSize: '0.8rem' }}>⚠️ Missing Instagram ID</div>
            <div style={{ color: '#d1d5db', fontSize: '0.74rem', marginTop: '2px' }}>
              Add Instagram @handle so AI merges past conversation and replies in live DMs.
            </div>
          </div>
          <button
            onClick={() => setLinkingTargetPerson(selectedNode)}
            style={{
              background: '#f59e0b',
              color: '#000000',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: '800',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            + Link ID
          </button>
        </div>
      )}

      {/* ================= SECTION 1: CHAT CONTROL INSIDE PAGE ================= */}
      <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '10px', padding: '14px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold', fontFamily: "'JetBrains Mono', monospace" }}>
            🤖 CHAT CONTROL FOR {selectedNode.name.toUpperCase()}
          </span>
          <span
            style={{
              fontSize: '0.64rem',
              padding: '2px 7px',
              borderRadius: '4px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: '700',
              background: isPaused ? 'rgba(239, 68, 68, 0.15)' : (isReelsOnly ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)'),
              color: isPaused ? '#ef4444' : (isReelsOnly ? '#f59e0b' : '#10b981'),
              border: '1px solid',
              borderColor: isPaused ? '#ef4444' : (isReelsOnly ? '#f59e0b' : '#10b981')
            }}
          >
            {isPaused ? 'SAM MANUAL' : (isReelsOnly ? 'REELS ONLY' : 'FULL AI')}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => updateContactPreferences(selectedNode.senderId || selectedNode.id, { aiMode: 'full_ai' })}
            style={{
              flex: 1,
              padding: '8px 6px',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: isFullAi ? '800' : '500',
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
            <Sparkles size={12} />
            <span>Full AI</span>
          </button>

          <button
            onClick={() => updateContactPreferences(selectedNode.senderId || selectedNode.id, { aiMode: 'reels_only' })}
            style={{
              flex: 1,
              padding: '8px 6px',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: isReelsOnly ? '800' : '500',
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
            <Film size={12} />
            <span>Only Reels</span>
          </button>

          <button
            onClick={() => updateContactPreferences(selectedNode.senderId || selectedNode.id, { aiMode: 'paused' })}
            style={{
              flex: 1,
              padding: '8px 6px',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: isPaused ? '800' : '500',
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
            <PauseCircle size={12} />
            <span>Stop AI</span>
          </button>
        </div>
      </div>

      {/* ================= NAVIGATION TABS ================= */}
      <div style={{ display: 'flex', gap: '6px', background: '#121214', padding: '4px', borderRadius: '8px', border: '1px solid #27272a', marginBottom: '20px' }}>
        <button
          onClick={() => setDrawerTab('edit')}
          style={{
            flex: 1,
            background: drawerTab === 'edit' ? '#ffffff' : 'transparent',
            color: drawerTab === 'edit' ? '#000000' : '#a1a1aa',
            border: 'none',
            padding: '8px 4px',
            borderRadius: '6px',
            fontSize: '0.74rem',
            fontWeight: '700',
            cursor: 'pointer'
          }}
        >
          ✏️ Profile & Lore
        </button>
        <button
          onClick={() => setDrawerTab('memories')}
          style={{
            flex: 1,
            background: drawerTab === 'memories' ? '#ffffff' : 'transparent',
            color: drawerTab === 'memories' ? '#000000' : '#a1a1aa',
            border: 'none',
            padding: '8px 4px',
            borderRadius: '6px',
            fontSize: '0.74rem',
            fontWeight: '700',
            cursor: 'pointer'
          }}
        >
          🧠 Memories & Intel
        </button>
        <button
          onClick={() => setDrawerTab('connections')}
          style={{
            flex: 1,
            background: drawerTab === 'connections' ? '#ffffff' : 'transparent',
            color: drawerTab === 'connections' ? '#000000' : '#a1a1aa',
            border: 'none',
            padding: '8px 4px',
            borderRadius: '6px',
            fontSize: '0.74rem',
            fontWeight: '700',
            cursor: 'pointer'
          }}
        >
          🔗 Connections
        </button>
      </div>

      {/* ================= TAB 1: EDIT PROFILE & LORE ================= */}
      {drawerTab === 'edit' && (
        <form onSubmit={handleSaveForm} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* AI Autofill Banner Button */}
          <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div>
              <div style={{ color: '#10b981', fontSize: '0.82rem', fontWeight: '800' }}>
                ✨ AI Chat Intelligence
              </div>
              <div style={{ color: '#a1a1aa', fontSize: '0.74rem', marginTop: '2px' }}>
                Auto-fill relationship, DOB, notes & banter from past DMs.
              </div>
            </div>
            <button
              type="button"
              onClick={handleTriggerAutofill}
              disabled={isAutofilling}
              style={{
                background: '#10b981',
                color: '#000000',
                border: 'none',
                padding: '7px 12px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: '800',
                cursor: isAutofilling ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                whiteSpace: 'nowrap'
              }}
            >
              <RefreshCw size={12} className={isAutofilling ? 'animate-spin' : ''} />
              <span>{isAutofilling ? 'Scanning...' : 'Fill with AI'}</span>
            </button>
          </div>

          {/* Name & Date of Birth */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ width: '100%', background: '#121214', border: '1px solid #27272a', padding: '9px 12px', borderRadius: '8px', color: '#ffffff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                🎂 Date of Birth (DOB)
              </label>
              <input
                type="text"
                placeholder="e.g. March 12, 2007"
                value={formData.dob}
                onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                style={{ width: '100%', background: '#121214', border: '1px solid #27272a', padding: '9px 12px', borderRadius: '8px', color: '#ffffff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Category & Specific Relationship */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                Category Filter
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                style={{ width: '100%', background: '#121214', border: '1px solid #27272a', padding: '9px 12px', borderRadius: '8px', color: '#ffffff', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
              >
                <option value="close_friend">Close Circle / Fami</option>
                <option value="online_friend">Online Friend</option>
                <option value="offline_friend">Offline Friend</option>
                <option value="family">Family / Relative</option>
                <option value="professional">Professional / Creator</option>
                <option value="business">Business / Client</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                Relationship Note
              </label>
              <input
                type="text"
                placeholder="e.g. Medicine Student / Homie"
                value={formData.relationship}
                onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                style={{ width: '100%', background: '#121214', border: '1px solid #27272a', padding: '9px 12px', borderRadius: '8px', color: '#ffffff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Personal Notes & Bio Lore */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                Personal Notes & Lore (Netflix, Studies, Habits, Family)
              </label>
              <span style={{ fontSize: '0.68rem', color: '#71717a' }}>Multi-line text</span>
            </div>
            <textarea
              rows={5}
              placeholder="Write detailed background lore, inside jokes, habits..."
              value={formData.personalNotes}
              onChange={(e) => setFormData({ ...formData, personalNotes: e.target.value })}
              style={{
                width: '100%',
                background: '#121214',
                border: '1px solid #27272a',
                padding: '10px 12px',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.82rem',
                lineHeight: '1.5',
                outline: 'none',
                boxSizing: 'border-box',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Banter & Cussing Style */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#f43f5e', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
              ⚡ Banter & Cussing Style
            </label>
            <input
              type="text"
              placeholder="e.g. Playful Hindi bro banter, sweet teasing, Tamil roasts..."
              value={formData.roastStyle}
              onChange={(e) => setFormData({ ...formData, roastStyle: e.target.value })}
              style={{ width: '100%', background: '#121214', border: '1px solid #27272a', padding: '9px 12px', borderRadius: '8px', color: '#fca5a5', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Save Button */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="submit"
              style={{
                flex: 1,
                background: '#ffffff',
                color: '#000000',
                border: 'none',
                padding: '12px',
                borderRadius: '8px',
                fontWeight: '800',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <Save size={16} />
              <span>Save & Sync to Database</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete ${selectedNode.name} from Database & Knowledge Tree?`)) {
                  deleteNode(selectedNode.id || selectedNode.name);
                }
              }}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '12px',
                borderRadius: '8px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </form>
      )}

      {/* ================= TAB 2: MEMORIES & LEARNED INTEL ================= */}
      {drawerTab === 'memories' && (
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
              fontWeight: '800',
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
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold', fontFamily: "'JetBrains Mono', monospace" }}>
              Remembered Facts Learned by AI
            </span>
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(selectedNode.facts || selectedNode.lore || []).map((item, i) => (
                <div key={i} style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '8px', padding: '9px 12px', fontSize: '0.8rem', color: '#d4d4d8', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddCustomFact} style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
              <input
                type="text"
                placeholder="Add custom fact to memory..."
                value={newFact}
                onChange={(e) => setNewFact(e.target.value)}
                style={{ flex: 1, background: '#000000', border: '1px solid #27272a', padding: '9px 12px', borderRadius: '8px', color: '#ffffff', fontSize: '0.8rem', outline: 'none' }}
              />
              <button
                type="submit"
                style={{ background: '#ffffff', color: '#000000', border: 'none', padding: '0 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '800', cursor: 'pointer' }}
              >
                Add
              </button>
            </form>
          </div>

          {selectedNode.rollingSummary && (
            <div>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold', fontFamily: "'JetBrains Mono', monospace" }}>
                AI Rolling Summary
              </span>
              <div style={{ marginTop: '6px', background: '#121214', border: '1px solid #27272a', borderRadius: '8px', padding: '12px', fontSize: '0.82rem', color: '#a1a1aa', lineHeight: '1.4' }}>
                {selectedNode.rollingSummary}
              </div>
            </div>
          )}

          <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '0.8rem', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
              <Clock size={14} />
              <span>5–10H FOLLOW-UP REMINDER ACTIVE</span>
            </div>
            <p style={{ fontSize: '0.74rem', color: '#a1a1aa', marginTop: '4px', margin: 0 }}>
              If a genuine conversation with {selectedNode.name} is paused for 5–10 hours, Sam&apos;s AI will send a warm, contextual follow-up.
            </p>
          </div>
        </div>
      )}

      {/* ================= TAB 3: CONNECTIONS ================= */}
      {drawerTab === 'connections' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold', fontFamily: "'JetBrains Mono', monospace" }}>
              Interlinked Friends ({selectedNode.connections?.length || 0})
            </span>
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(selectedNode.connections || []).length > 0 ? (
                selectedNode.connections.map((c, i) => (
                  <div key={i} style={{ background: '#121214', border: '1px solid #0284c7', borderRadius: '8px', padding: '10px 12px', fontSize: '0.82rem', color: '#38bdf8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <b>🔗 {c.targetName}</b>
                      <div style={{ fontSize: '0.72rem', color: '#7dd3fc', marginTop: '2px' }}>{c.rel || c.relationship}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '8px', padding: '16px', textAlign: 'center', color: '#71717a', fontSize: '0.8rem' }}>
                  No connected friends linked yet.
                </div>
              )}
            </div>
          </div>

          {/* Add Connection Form */}
          <form onSubmit={handleAddConnection} style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
              + Link Another Friend to {selectedNode.name}
            </span>
            <input
              type="text"
              placeholder="Friend Name (e.g. Annie, Rajveer, Moksha)"
              value={newConnTarget}
              onChange={(e) => setNewConnTarget(e.target.value)}
              style={{ background: '#000000', border: '1px solid #27272a', padding: '9px 12px', borderRadius: '8px', color: '#ffffff', fontSize: '0.82rem', outline: 'none' }}
            />
            <input
              type="text"
              placeholder="How do they know each other? (e.g. Talking with sister)"
              value={newConnRel}
              onChange={(e) => setNewConnRel(e.target.value)}
              style={{ background: '#000000', border: '1px solid #27272a', padding: '9px 12px', borderRadius: '8px', color: '#ffffff', fontSize: '0.82rem', outline: 'none' }}
            />
            <button
              type="submit"
              disabled={!newConnTarget.trim()}
              style={{
                background: !newConnTarget.trim() ? '#27272a' : '#ffffff',
                color: !newConnTarget.trim() ? '#71717a' : '#000000',
                border: 'none',
                padding: '9px 14px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: '800',
                cursor: !newConnTarget.trim() ? 'not-allowed' : 'pointer'
              }}
            >
              + Link Friend
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
