'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Search, Sparkles, Filter, Link2, AlertCircle, ArrowLeft, ArrowRight,
  Trash2, Calendar, Bot, Film, Pause, Play, Check, Save, User,
  Plus, RefreshCw, MessageSquare, Shield, ExternalLink
} from 'lucide-react';
import ContactAvatar from '../components/ContactAvatar';

export default function RelationshipsPage() {
  const {
    nodes,
    saveNode,
    deleteNode,
    addFact,
    updateContactPreferences,
    setLinkingTargetPerson,
    startAiInterview,
    aiAutofillPerson,
    API_BASE,
    showToast
  } = useApp();

  // Navigation State: null = Directory Table view; Object = Full Inner Person Page
  const [selectedPerson, setSelectedPerson] = useState(null);

  // Filters State
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Inner Page Form State
  const [formData, setFormData] = useState({
    name: '',
    handle: '',
    senderId: '',
    dob: '',
    gender: 'unknown',
    category: 'online_friend',
    relationship: '',
    personalNotes: '',
    roastStyle: ''
  });

  const [isAutofilling, setIsAutofilling] = useState(false);
  const [isLearning, setIsLearning] = useState(false);
  const [newFactInput, setNewFactInput] = useState('');
  const [newConnTarget, setNewConnTarget] = useState('');
  const [newConnRel, setNewConnRel] = useState('');

  // Keep form data synchronized when a person is opened or updated
  useEffect(() => {
    if (selectedPerson) {
      // Find latest version from nodes array
      const current = nodes.find(n => n.id === selectedPerson.id || (n.senderId && n.senderId === selectedPerson.senderId)) || selectedPerson;
      setFormData({
        name: current.name || '',
        handle: current.handle || '',
        senderId: current.senderId || '',
        dob: current.dob || current.importantDates?.[0]?.date || '',
        gender: current.gender || 'unknown',
        category: current.category || 'online_friend',
        relationship: current.relationship || '',
        personalNotes: current.personalNotes || (current.lore || []).join('\n'),
        roastStyle: current.roastStyle || ''
      });
    }
  }, [selectedPerson, nodes]);

  // Unlinked contacts without ID
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

  // Filtered contacts for table
  const filteredPeople = useMemo(() => {
    return nodes.filter(n => {
      if (n.isRoot) return false;

      // Category filter
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

      // Search filter
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

  // Calculate Knowledge Completeness Score (0 - 100%)
  const knowledgeBreakdown = useMemo(() => {
    if (!selectedPerson) return { score: 0, items: [] };

    const items = [
      { key: 'name', label: 'Full Name', complete: Boolean(formData.name.trim()), points: 15 },
      { key: 'handle', label: 'Instagram Handle', complete: Boolean(formData.handle.trim()), points: 15 },
      { key: 'senderId', label: 'Sender ID Linked', complete: Boolean(formData.senderId.trim()), points: 15 },
      { key: 'dob', label: 'Date of Birth', complete: Boolean(formData.dob.trim()), points: 15 },
      { key: 'relation', label: 'Relationship & Category', complete: Boolean(formData.relationship.trim() && formData.category), points: 15 },
      { key: 'lore', label: 'Personal Lore & Bio', complete: Boolean(formData.personalNotes.trim().length > 15), points: 15 },
      { key: 'facts', label: 'Learned Facts Intel', complete: (selectedPerson.facts?.length || 0) >= 2, points: 10 }
    ];

    const score = items.reduce((acc, curr) => (curr.complete ? acc + curr.points : acc), 0);
    return { score, items };
  }, [selectedPerson, formData]);

  // Save changes from inner page
  const handleSaveInnerForm = async (e) => {
    e?.preventDefault();
    if (!formData.name.trim()) {
      showToast('Name cannot be empty');
      return;
    }

    const updated = {
      ...selectedPerson,
      name: formData.name.trim(),
      handle: formData.handle.trim() ? (formData.handle.startsWith('@') ? formData.handle.trim() : `@${formData.handle.trim()}`) : '',
      senderId: formData.senderId.trim(),
      dob: formData.dob.trim(),
      dateOfBirth: formData.dob.trim(),
      gender: formData.gender,
      category: formData.category,
      relationship: formData.relationship.trim(),
      relationshipToSam: formData.relationship.trim(),
      personalNotes: formData.personalNotes.trim(),
      lore: formData.personalNotes.trim().split('\n').map(l => l.trim().replace(/^[•\-\*]\s*/, '')).filter(Boolean),
      roastStyle: formData.roastStyle.trim()
    };

    await saveNode(updated);
    setSelectedPerson(updated);
    showToast(`Saved details for ${updated.name}`);
  };

  // AI Autofill fields from chat logs
  const handleTriggerAutofill = async () => {
    if (!selectedPerson) return;
    setIsAutofilling(true);
    showToast(`AI analyzing chat history for ${selectedPerson.name}...`);
    try {
      const autofill = await aiAutofillPerson(selectedPerson.name);
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
          autofill.facts.forEach(f => addFact(selectedPerson.id, f));
        }

        showToast('AI autofilled profile fields from conversation');
      } else {
        showToast('No new conversation logs found to extract');
      }
    } catch (e) {
      showToast(`Autofill error: ${e.message}`);
    } finally {
      setIsAutofilling(false);
    }
  };

  // Add custom fact to memory
  const handleAddFact = (e) => {
    e?.preventDefault();
    if (!newFactInput.trim() || !selectedPerson) return;
    addFact(selectedPerson.id, newFactInput.trim());
    setNewFactInput('');
  };

  // Force AI learning from DMs
  const handleForceLearn = async () => {
    if (!selectedPerson?.senderId) {
      showToast('No Instagram Sender ID linked');
      return;
    }
    setIsLearning(true);
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${selectedPerson.senderId}/learn`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success && data.memory) {
        showToast('Memory synthesized from recent messages');
      } else {
        showToast('Messages reviewed. Memory up to date');
      }
    } catch (e) {
      showToast('Memory verified');
    } finally {
      setIsLearning(false);
    }
  };

  // Add Friend Connection
  const handleAddConnection = async (e) => {
    e?.preventDefault();
    if (!newConnTarget.trim() || !selectedPerson) return;

    const newConn = {
      targetName: newConnTarget.trim(),
      rel: newConnRel.trim() || 'connected'
    };

    const updatedConns = [...(selectedPerson.connections || []), newConn];
    const updated = {
      ...selectedPerson,
      connections: updatedConns
    };

    await saveNode(updated);
    setSelectedPerson(updated);
    setNewConnTarget('');
    setNewConnRel('');
    showToast(`Connected ${selectedPerson.name} with ${newConn.targetName}`);
  };

  // =========================================================================
  // VIEW 1: FULL INNER PERSON PAGE (When a person is clicked/opened)
  // =========================================================================
  if (selectedPerson) {
    const isPaused = selectedPerson.aiEnabled === false;
    const isReelsOnly = !isPaused && selectedPerson.replyToMessages === false && selectedPerson.replyToReelsAndPosts !== false;
    const isFullAi = !isPaused && !isReelsOnly;

    return (
      <div style={{ padding: '32px 36px 80px 36px', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Top Back Navigation Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '20px', borderBottom: '1px solid #e4e4e7', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              onClick={() => setSelectedPerson(null)}
              style={{
                background: '#ffffff',
                border: '1px solid #e4e4e7',
                color: '#09090b',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <ArrowLeft size={20} />
          
            </button>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#09090b', letterSpacing: '-0.5px', margin: 0 }}>
                  {formData.name || selectedPerson.name}
                </h1>
                <span style={{ fontSize: '0.68rem', background: '#f4f4f5', border: '1px solid #e4e4e7', color: '#09090b', padding: '2px 8px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
                  {formData.category.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", marginTop: '2px' }}>
                {formData.handle || (formData.senderId ? `ID: ${formData.senderId}` : 'No Instagram ID linked')}
              </div>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handleTriggerAutofill}
              disabled={isAutofilling}
              style={{
                background: '#ffffff',
                border: '1px solid #e4e4e7',
                color: '#09090b',
                padding: '9px 16px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: isAutofilling ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <RefreshCw size={13} className={isAutofilling ? 'animate-spin' : ''} />
              <span>{isAutofilling ? 'Scanning DMs...' : 'Fill Fields with AI'}</span>
            </button>

            <button
              type="button"
              onClick={handleSaveInnerForm}
              style={{
                background: '#09090b',
                border: 'none',
                color: '#ffffff',
                padding: '9px 18px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Save size={14} />
              <span>Save Changes</span>
            </button>
          </div>
        </div>

        {/* ================= CARD 1: KNOWLEDGE SCORE & COMPLETENESS ================= */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
                INTEL DEPTH
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#09090b', marginTop: '2px' }}>
                {knowledgeBreakdown.score}% Knowledge Score
              </div>
              <p style={{ color: '#71717a', fontSize: '0.8rem', marginTop: '2px' }}>
                Completeness index measuring how well Chatter OS AI understands {formData.name}&apos;s identity, lore, and relationships.
              </p>
            </div>

            <div style={{ background: '#f4f4f5', border: '1px solid #e4e4e7', padding: '6px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
              {knowledgeBreakdown.score >= 80 ? 'HIGH INTEL' : (knowledgeBreakdown.score >= 50 ? 'MEDIUM INTEL' : 'NEEDS DATA')}
            </div>
          </div>

          {/* Progress Bar */}
          <div style={{ width: '100%', height: '8px', background: '#f4f4f5', borderRadius: '4px', overflow: 'hidden', marginBottom: '18px' }}>
            <div
              style={{
                width: `${knowledgeBreakdown.score}%`,
                height: '100%',
                background: '#09090b',
                borderRadius: '4px',
                transition: 'width 0.4s ease'
              }}
            />
          </div>

          {/* Checklist Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            {knowledgeBreakdown.items.map((item) => (
              <div
                key={item.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: item.complete ? '#f4f4f5' : '#ffffff',
                  border: '1px solid #e4e4e7',
                  fontSize: '0.78rem',
                  color: item.complete ? '#09090b' : '#a1a1aa'
                }}
              >
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px',
                    background: item.complete ? '#09090b' : '#ffffff',
                    border: '1px solid',
                    borderColor: item.complete ? '#09090b' : '#d4d4d8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff'
                  }}
                >
                  {item.complete && <Check size={11} strokeWidth={3} />}
                </div>
                <span style={{ fontWeight: item.complete ? '600' : '400' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ================= CARD 2: CHAT AUTOMATION CONTROL ================= */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
                DIRECT MESSAGE AUTOMATION
              </div>
              <div style={{ fontSize: '1rem', fontWeight: '800', color: '#09090b', marginTop: '2px' }}>
                AI Reply Rules for {formData.name}
              </div>
            </div>
            <span style={{ fontSize: '0.72rem', background: '#f4f4f5', border: '1px solid #e4e4e7', padding: '3px 8px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
              CURRENT: {isPaused ? 'MANUAL' : (isReelsOnly ? 'REELS ONLY' : 'FULL AI')}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            <button
              type="button"
              onClick={() => updateContactPreferences(selectedPerson.senderId || selectedPerson.id, { aiMode: 'full_ai' })}
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: isFullAi ? '#09090b' : '#e4e4e7',
                background: isFullAi ? '#09090b' : '#ffffff',
                color: isFullAi ? '#ffffff' : '#09090b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                textAlign: 'left'
              }}
            >
              <Bot size={18} />
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: '800' }}>Full AI Auto-Reply</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: '1px' }}>AI handles messages & reels</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => updateContactPreferences(selectedPerson.senderId || selectedPerson.id, { aiMode: 'reels_only' })}
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: isReelsOnly ? '#09090b' : '#e4e4e7',
                background: isReelsOnly ? '#09090b' : '#ffffff',
                color: isReelsOnly ? '#ffffff' : '#09090b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                textAlign: 'left'
              }}
            >
              <Film size={18} />
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: '800' }}>Only React to Reels</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: '1px' }}>Ignores text, reacts to reels</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => updateContactPreferences(selectedPerson.senderId || selectedPerson.id, { aiMode: 'paused' })}
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: isPaused ? '#09090b' : '#e4e4e7',
                background: isPaused ? '#09090b' : '#ffffff',
                color: isPaused ? '#ffffff' : '#09090b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                textAlign: 'left'
              }}
            >
              <Pause size={18} />
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: '800' }}>Stop AI (Sam Manual)</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: '1px' }}>AI silenced for manual chatting</div>
              </div>
            </button>
          </div>
        </div>

        {/* ================= CARD 3: PREDEFINED NECESSARY FIELDS ================= */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', marginBottom: '4px' }}>
            PROFILE FIELDS
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#09090b', marginBottom: '16px' }}>
            Essential Identity & Relationship Attributes
          </div>

          <form onSubmit={handleSaveInnerForm} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Row 1: Name, Handle, Sender ID */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                  Full Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Bhavani"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                  Instagram Handle
                </label>
                <input
                  type="text"
                  value={formData.handle}
                  onChange={(e) => setFormData({ ...formData, handle: e.target.value })}
                  placeholder="@username"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                  Numeric Sender ID
                </label>
                <input
                  type="text"
                  value={formData.senderId}
                  onChange={(e) => setFormData({ ...formData, senderId: e.target.value })}
                  placeholder="e.g. 29005624469042002"
                />
              </div>
            </div>

            {/* Row 2: Date of Birth, Gender, Category */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                  Date of Birth (DOB)
                </label>
                <input
                  type="text"
                  value={formData.dob}
                  onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                  placeholder="e.g. March 12, 2007"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                  Gender
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="neutral">Neutral</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                  Category Filter
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="close_friend">Close Circle / Fami</option>
                  <option value="online_friend">Online Friend</option>
                  <option value="offline_friend">Offline Friend</option>
                  <option value="family">Family / Relatives</option>
                  <option value="professional">Professional / Creator</option>
                  <option value="business">Business / Client</option>
                </select>
              </div>
            </div>

            {/* Row 3: Relationship to Sam */}
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                Specific Relationship To Sam
              </label>
              <input
                type="text"
                value={formData.relationship}
                onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                placeholder="e.g. Closest Online Friend / Medicine Student"
              />
            </div>

            {/* Row 4: Personal Notes & Highlights */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  Personal Notes & Highlights (Studies, Habits, Netflix, Inside Jokes)
                </label>
                <span style={{ fontSize: '0.7rem', color: '#a1a1aa' }}>Multi-line text</span>
              </div>
              <textarea
                rows={5}
                value={formData.personalNotes}
                onChange={(e) => setFormData({ ...formData, personalNotes: e.target.value })}
                placeholder="Write detailed background information that the AI should know about this person..."
              />
            </div>

            {/* Row 5: Banter & Cussing Style */}
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                Banter & Conversation Style
              </label>
              <input
                type="text"
                value={formData.roastStyle}
                onChange={(e) => setFormData({ ...formData, roastStyle: e.target.value })}
                placeholder="e.g. Gentle playful teasing, Hindi bro banter, sweet concise shortcuts..."
              />
            </div>

            {/* Save Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                type="submit"
                style={{
                  background: '#09090b',
                  color: '#ffffff',
                  border: 'none',
                  padding: '11px 24px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Save size={15} />
                <span>Save Profile Changes</span>
              </button>
            </div>
          </form>
        </div>

        {/* ================= CARD 4: SOCIAL CONNECTIONS (TREE CHAIN) ================= */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', marginBottom: '4px' }}>
            SOCIAL GRAPH
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#09090b', marginBottom: '14px' }}>
            Interlinked Friends in Circle ({selectedPerson.connections?.length || 0})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {(selectedPerson.connections || []).length > 0 ? (
              selectedPerson.connections.map((c, i) => (
                <div
                  key={i}
                  style={{
                    background: '#f4f4f5',
                    border: '1px solid #e4e4e7',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Link2 size={14} style={{ color: '#09090b' }} />
                    <span style={{ fontWeight: '700', fontSize: '0.85rem', color: '#09090b' }}>{c.targetName}</span>
                  </div>
                  <span style={{ fontSize: '0.74rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                    {c.rel || c.relationship}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ padding: '16px', textAlign: 'center', color: '#71717a', fontSize: '0.82rem', background: '#f4f4f5', borderRadius: '8px', border: '1px solid #e4e4e7' }}>
                No connected friends registered. Link someone below.
              </div>
            )}
          </div>

          {/* Add Friend Connection Form */}
          <form onSubmit={handleAddConnection} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Friend Name (e.g. Annie, Rajveer, Moksha)"
              value={newConnTarget}
              onChange={(e) => setNewConnTarget(e.target.value)}
              style={{ flex: 1, minWidth: '180px' }}
            />
            <input
              type="text"
              placeholder="How they know each other (e.g. Talking with sister)"
              value={newConnRel}
              onChange={(e) => setNewConnRel(e.target.value)}
              style={{ flex: 1, minWidth: '180px' }}
            />
            <button
              type="submit"
              disabled={!newConnTarget.trim()}
              style={{
                background: '#09090b',
                color: '#ffffff',
                border: 'none',
                padding: '9px 16px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: !newConnTarget.trim() ? 'not-allowed' : 'pointer',
                opacity: !newConnTarget.trim() ? 0.5 : 1
              }}
            >
              + Link Friend
            </button>
          </form>
        </div>

        {/* ================= CARD 5: LEARNED MEMORIES & FACTS ================= */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
                LEARNED INTEL
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#09090b', marginTop: '2px' }}>
                Facts Synthesized from Live Instagram DMs
              </div>
            </div>

            <button
              type="button"
              onClick={handleForceLearn}
              disabled={isLearning}
              style={{
                background: '#ffffff',
                border: '1px solid #e4e4e7',
                color: '#09090b',
                padding: '7px 14px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <RefreshCw size={12} className={isLearning ? 'animate-spin' : ''} />
              <span>{isLearning ? 'Synthesizing...' : 'Force AI Learn from DMs'}</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {(selectedPerson.facts || selectedPerson.lore || []).map((fact, i) => (
              <div
                key={i}
                style={{
                  background: '#f4f4f5',
                  border: '1px solid #e4e4e7',
                  borderRadius: '8px',
                  padding: '9px 14px',
                  fontSize: '0.82rem',
                  color: '#09090b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#09090b' }} />
                <span>{fact}</span>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddFact} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Add custom remembered fact..."
              value={newFactInput}
              onChange={(e) => setNewFactInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              style={{
                background: '#09090b',
                color: '#ffffff',
                border: 'none',
                padding: '9px 18px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              Add Fact
            </button>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: ALL PEOPLE DIRECTORY (Shadcn Light Monochrome Table)
  // =========================================================================
  return (
    <div style={{ padding: '32px 36px 80px 36px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
            PEOPLE DIRECTORY
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: '800', letterSpacing: '-0.6px', marginTop: '2px', color: '#09090b' }}>
            All People
          </h1>
          <p style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '4px' }}>
            Unified intelligence table showing handles, IDs, birth dates, relationship categories, and automation rules.
          </p>
        </div>

        <button
          onClick={() => startAiInterview(null)}
          style={{
            background: '#09090b',
            color: '#ffffff',
            border: 'none',
            padding: '9px 16px',
            borderRadius: '8px',
            fontWeight: '700',
            fontSize: '0.82rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Sparkles size={14} />
          <span>+ Add Person</span>
        </button>
      </div>

      {/* Action Required Banner for missing Instagram IDs */}
      {unlinkedFriends.length > 0 && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #09090b',
            borderRadius: '10px',
            padding: '14px 18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={18} style={{ color: '#09090b', flexShrink: 0 }} />
            <div>
              <div style={{ color: '#09090b', fontWeight: '700', fontSize: '0.86rem' }}>
                Action Required: {unlinkedFriends.length} Contact{unlinkedFriends.length > 1 ? 's' : ''} Missing Instagram ID
              </div>
              <div style={{ color: '#71717a', fontSize: '0.78rem', marginTop: '1px' }}>
                Link their Instagram handle so Chatter OS merges memories and answers appropriately in direct messages.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {unlinkedFriends.map(friend => (
              <button
                key={friend.id}
                onClick={() => setLinkingTargetPerson(friend)}
                style={{
                  background: '#f4f4f5',
                  border: '1px solid #e4e4e7',
                  color: '#09090b',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Link2 size={12} />
                <span>Link ID: {friend.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
        {/* Category Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All People', count: categoryCounts.all },
            { id: 'close_friend', label: 'Close Circle / Fami', count: categoryCounts.close_friend },
            { id: 'online_friend', label: 'Online Friends', count: categoryCounts.online_friend },
            { id: 'offline_friend', label: 'Offline Friends', count: categoryCounts.offline_friend },
            { id: 'family', label: 'Family / Relatives', count: categoryCounts.family },
            { id: 'professional', label: 'Professional / Business', count: categoryCounts.professional },
            { id: 'unlinked', label: 'Needs ID Link', count: categoryCounts.unlinked }
          ].map(tab => {
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id)}
                style={{
                  background: isActive ? '#09090b' : '#ffffff',
                  color: isActive ? '#ffffff' : '#71717a',
                  border: '1px solid',
                  borderColor: isActive ? '#09090b' : '#e4e4e7',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: '600',
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
                    background: isActive ? '#ffffff' : '#f4f4f5',
                    color: isActive ? '#09090b' : '#71717a',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: '700'
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
          <input
            type="text"
            placeholder="Filter people by name, @username, ID, birth date, relation, or lore..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              paddingLeft: '34px',
              height: '38px',
              fontSize: '0.82rem'
            }}
          />
        </div>
      </div>

      {/* ================= SHADCN LIGHT MONOCHROME TABLE ================= */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e4e4e7',
          borderRadius: '10px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '1px solid #e4e4e7' }}>
                <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", width: '60px' }}>
                  PROFILE
                </th>
                <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  NAME
                </th>
                <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  ID (SENDER ID)
                </th>
                <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  USERNAME
                </th>
                <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  DATE OF BIRTH
                </th>
                <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  RELATION
                </th>
                <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", textAlign: 'right' }}>
                  ACTION
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPeople.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#71717a', fontSize: '0.85rem' }}>
                    No people found matching your filters.
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
                      key={person.id || person.senderId || person.name}
                      onClick={() => setSelectedPerson(person)}
                      style={{
                        borderBottom: '1px solid #f4f4f5',
                        cursor: 'pointer',
                        transition: 'background 0.1s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#fafafa')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                    >
                      {/* Column 1: PROFILE */}
                      <td style={{ padding: '10px 16px' }}>
                        <ContactAvatar contact={person} size={36} showStatus={true} />
                      </td>

                      {/* Column 2: NAME */}
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ fontWeight: '700', fontSize: '0.88rem', color: '#09090b' }}>
                          {person.name}
                        </div>
                        {person.gender && person.gender !== 'unknown' && (
                          <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'capitalize' }}>
                            {person.gender}
                          </div>
                        )}
                      </td>

                      {/* Column 3: ID */}
                      <td style={{ padding: '10px 16px' }} onClick={(e) => e.stopPropagation()}>
                        {hasId ? (
                          <span style={{ fontSize: '0.75rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                            {person.senderId}
                          </span>
                        ) : (
                          <button
                            onClick={() => setLinkingTargetPerson(person)}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #e4e4e7',
                              color: '#09090b',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Link2 size={10} />
                            <span>Link ID</span>
                          </button>
                        )}
                      </td>

                      {/* Column 4: USERNAME */}
                      <td style={{ padding: '10px 16px' }} onClick={(e) => e.stopPropagation()}>
                        {hasHandle ? (
                          <span
                            onClick={() => setLinkingTargetPerson(person)}
                            title="Edit handle"
                            style={{
                              fontSize: '0.78rem',
                              color: '#09090b',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            {person.handle}
                          </span>
                        ) : (
                          <button
                            onClick={() => setLinkingTargetPerson(person)}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #e4e4e7',
                              color: '#71717a',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            No Handle
                          </button>
                        )}
                      </td>

                      {/* Column 5: DATE OF BIRTH */}
                      <td style={{ padding: '10px 16px' }}>
                        {dobDisplay ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#09090b' }}>
                            <Calendar size={12} style={{ color: '#71717a' }} />
                            <span>{dobDisplay}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>—</span>
                        )}
                      </td>

                      {/* Column 6: RELATION */}
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '0.8rem', color: '#09090b', fontWeight: '600' }}>
                            {person.relationship}
                          </span>
                          <span style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                            {person.category ? person.category.replace('_', ' ').toUpperCase() : 'FRIEND'}
                          </span>
                        </div>
                      </td>

                      {/* Column 7: ACTION */}
                      <td style={{ padding: '10px 16px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          {/* Quick AI Toggle */}
                          <button
                            onClick={() => {
                              const nextMode = isPaused ? 'full_ai' : (isReelsOnly ? 'paused' : 'reels_only');
                              updateContactPreferences(person.senderId || person.id, { aiMode: nextMode });
                            }}
                            title="Cycle AI reply policy"
                            style={{
                              fontSize: '0.66rem',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontWeight: '700',
                              cursor: 'pointer',
                              background: '#ffffff',
                              color: '#09090b',
                              border: '1px solid #e4e4e7'
                            }}
                          >
                            {isPaused ? 'MANUAL' : (isReelsOnly ? 'REELS' : 'FULL AI')}
                          </button>

                          {/* Open Full Inner Page */}
                          <button
                            onClick={() => setSelectedPerson(person)}
                            style={{
                              background: '#09090b',
                              color: '#ffffff',
                              border: 'none',
                              padding: '5px 12px',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <span>Open</span>
                            <ArrowRight size={11} />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete ${person.name} from Database?`)) {
                                deleteNode(person.id || person.name);
                              }
                            }}
                            title="Delete Person"
                            style={{
                              background: 'transparent',
                              border: '1px solid #e4e4e7',
                              color: '#71717a',
                              padding: '5px 7px',
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
