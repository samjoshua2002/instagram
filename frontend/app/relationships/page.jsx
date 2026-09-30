'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Search, Sparkles, Filter, Link2, AlertCircle, ArrowLeft, ArrowRight,
  Trash2, Calendar, Bot, Film, Pause, Check, Save, User,
  Plus, RefreshCw, MessageSquare, Shield, X, Users
} from 'lucide-react';
import ContactAvatar from '../components/ContactAvatar';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Robust timezone-agnostic helper to parse date strings into YYYY-MM-DD
function formatDobForInput(dob) {
  if (!dob) return '';
  const isoMatch = dob.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const mName = MONTH_NAMES[i];
    if (dob.toLowerCase().includes(mName.toLowerCase()) || dob.toLowerCase().includes(mName.slice(0, 3).toLowerCase())) {
      const yearMatch = dob.match(/\b(19|20)\d{2}\b/);
      const dayMatch = dob.match(/\b([1-9]|[12]\d|3[01])\b/);
      if (yearMatch && dayMatch) {
        const y = yearMatch[0];
        const m = String(i + 1).padStart(2, '0');
        const d = String(dayMatch[0]).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
  }
  const d = new Date(dob);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1900) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '';
}

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
    lookupContact,
    extractFromRawChat,
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

  // Pagination state — table
  const TABLE_PAGE_SIZE = 10;
  const [tablePage, setTablePage] = useState(1);

  // Pagination state — facts
  const FACTS_PAGE_SIZE = 8;
  const [factsPage, setFactsPage] = useState(1);

  // Raw Chat Extraction Modal State
  const [isRawChatModalOpen, setIsRawChatModalOpen] = useState(false);
  const [rawChatText, setRawChatText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [userClarification, setUserClarification] = useState('');
  const [knowBirthYear, setKnowBirthYear] = useState(true);

  // Initialize form data ONLY when switching to a different person (not on every node poll)
  // This prevents typing from being reset by the 4s background sync
  useEffect(() => {
    if (selectedPerson) {
      const currentDob = selectedPerson.dob || selectedPerson.importantDates?.[0]?.date || '';
      const hasYear = /\b(19|20)\d{2}\b/.test(currentDob);
      setKnowBirthYear(currentDob ? hasYear : true);

      setFormData({
        name: selectedPerson.name || '',
        handle: selectedPerson.handle || selectedPerson.instagramHandle || '',
        senderId: selectedPerson.senderId || '',
        dob: currentDob,
        gender: selectedPerson.gender || 'unknown',
        category: selectedPerson.category || 'online_friend',
        relationship: selectedPerson.relationship || selectedPerson.relationshipToSam || '',
        personalNotes: selectedPerson.personalNotes || (selectedPerson.lore || []).join('\n'),
        roastStyle: selectedPerson.roastStyle || ''
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPerson?.id, selectedPerson?.name]);

  // Live-refresh: poll server for updated profile every 15s while inner page is open
  // This auto-fills birthday, facts, notes from live DM learning without manual refresh
  useEffect(() => {
    if (!selectedPerson?.senderId) return;
    let cancelled = false;

    const pollMemory = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/conversations/${selectedPerson.senderId}/memory`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!data.memory || cancelled) return;
        const mem = data.memory;

        // Auto-fill birthday if server learned it from DMs and field is still empty
        const bday = (mem.importantDates || []).find(d =>
          d.title?.toLowerCase().includes('birth') || d.title?.toLowerCase().includes('bday')
        );
        const autoDob = mem.dob || bday?.date || '';
        if (autoDob) {
          setFormData(prev => ({ ...prev, dob: prev.dob || autoDob }));
        }

        // Auto-update personal notes if server has richer summary
        if (mem.personalNotes) {
          setFormData(prev => ({
            ...prev,
            personalNotes: (!prev.personalNotes || prev.personalNotes.length < mem.personalNotes.length)
              ? mem.personalNotes
              : prev.personalNotes
          }));
        }

        // Auto-add facts from memory learning
        if (mem.facts?.length > 0 && selectedPerson) {
          mem.facts.forEach(f => addFact(selectedPerson.id, f.fact || f));
        }
      } catch (e) { /* silent */ }
    };

    const interval = setInterval(pollMemory, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedPerson?.senderId, selectedPerson?.id, addFact]);



  // Auto-fetch & live sync intel from DMs when a person is opened
  useEffect(() => {
    if (!selectedPerson) return;
    let isCancelled = false;

    const autoSyncFromDMs = async () => {
      try {
        // Step 1: Trigger server-side memory extraction from live DMs (auto-learn + auto-cleanup)
        if (selectedPerson.senderId) {
          try {
            const learnRes = await fetch(`${API_BASE}/api/conversations/${selectedPerson.senderId}/learn`, { method: 'POST' });
            const learnData = await learnRes.json();

            // Step 2: If server returned updated memory, auto-fill birthday and important dates
            if (learnData.memory && !isCancelled) {
              const mem = learnData.memory;

              // Auto-fill DOB if not already set
              const bdayEntry = (mem.importantDates || []).find(d =>
                d.title?.toLowerCase().includes('birth') || d.title?.toLowerCase().includes('bday')
              );
              const autoDob = mem.dob || bdayEntry?.date || '';
              if (autoDob) {
                setFormData(prev => ({
                  ...prev,
                  dob: prev.dob || autoDob
                }));
              }

              // Auto-fill personal notes from rolling summary if empty
              if (mem.personalNotes && !isCancelled) {
                setFormData(prev => ({
                  ...prev,
                  personalNotes: prev.personalNotes || mem.personalNotes
                }));
              }

              // Auto-fill facts from memory
              if (Array.isArray(mem.facts) && mem.facts.length > 0 && selectedPerson) {
                mem.facts.forEach(f => addFact(selectedPerson.id, f.fact || f));
              }
            }
          } catch (learnErr) {
            // non-critical — continue with AI autofill fallback
          }
        }

        // Step 3: AI autofill from social graph as fallback
        const autofill = await aiAutofillPerson(selectedPerson.name);
        if (autofill && !isCancelled) {
          setFormData(prev => ({
            ...prev,
            category: prev.category === 'online_friend' && autofill.category ? autofill.category : prev.category,
            relationship: !prev.relationship && autofill.relationshipToSam ? autofill.relationshipToSam : prev.relationship,
            dob: !prev.dob && autofill.dob ? autofill.dob : prev.dob,
            personalNotes: prev.personalNotes ? (prev.personalNotes.includes(autofill.personalNotes || '') ? prev.personalNotes : `${prev.personalNotes}\n${autofill.personalNotes || ''}`) : (autofill.personalNotes || ''),
            roastStyle: !prev.roastStyle && autofill.banterStyle ? autofill.banterStyle : prev.roastStyle
          }));

          if (Array.isArray(autofill.facts)) {
            autofill.facts.forEach(f => addFact(selectedPerson.id, f));
          }
        }
      } catch (e) {
        // silent background sync
      }
    };

    autoSyncFromDMs();

    return () => {
      isCancelled = true;
    };
  }, [selectedPerson?.name, selectedPerson?.senderId, aiAutofillPerson, addFact]);


  // Overall Dashboard Metrics
  const dashboardStats = useMemo(() => {
    let totalPeople = 0;
    let totalDMs = 0;
    let totalReels = 0;
    let activeAi = 0;

    nodes.forEach(n => {
      if (n.isRoot) return;
      totalPeople++;
      totalDMs += (n.chatsCount || n.messageCount || 0);
      totalReels += (n.reelsCount || 0);
      if (n.aiEnabled !== false) activeAi++;
    });

    return { totalPeople, totalDMs, totalReels, activeAi };
  }, [nodes]);

  // Unlinked contacts without handle
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
        (n.dob || '').toLowerCase().includes(q) ||
        (n.relationship || '').toLowerCase().includes(q) ||
        (n.personalNotes || '').toLowerCase().includes(q) ||
        (n.facts || []).some(f => f.toLowerCase().includes(q))
      );
    });
  }, [nodes, activeCategory, searchQuery]);

  // Reset table page when filter/search changes
  useEffect(() => { setTablePage(1); }, [activeCategory, searchQuery]);
  // Reset facts page when selected person changes
  useEffect(() => { setFactsPage(1); }, [selectedPerson?.id]);

  // Paginated slices
  const totalTablePages = Math.max(1, Math.ceil(filteredPeople.length / TABLE_PAGE_SIZE));
  const pagedPeople = filteredPeople.slice((tablePage - 1) * TABLE_PAGE_SIZE, tablePage * TABLE_PAGE_SIZE);


  // Autocomplete Suggestions for Friend Connections
  const friendSuggestions = useMemo(() => {
    if (!newConnTarget.trim() || !selectedPerson) return [];
    const q = newConnTarget.toLowerCase().trim();
    return nodes
      .filter(n => !n.isRoot && n.name.toLowerCase() !== selectedPerson.name.toLowerCase())
      .filter(n => n.name.toLowerCase().includes(q) || (n.handle && n.handle.toLowerCase().includes(q)))
      .slice(0, 5);
  }, [nodes, newConnTarget, selectedPerson]);

  // Calculate Knowledge Completeness Score (0 - 100%)
  const knowledgeBreakdown = useMemo(() => {
    if (!selectedPerson) return { score: 0, items: [] };

    const items = [
      { key: 'name', label: 'Full Name', complete: Boolean(formData.name.trim()), points: 15 },
      { key: 'handle', label: 'Instagram Handle', complete: Boolean(formData.handle.trim()), points: 15 },
      { key: 'dob', label: 'Date of Birth', complete: Boolean(formData.dob.trim()), points: 15 },
      { key: 'relation', label: 'Category & Specific Relation', complete: Boolean(formData.relationship.trim() && formData.category), points: 15 },
      { key: 'lore', label: 'Personal Lore & Notes', complete: Boolean(formData.personalNotes.trim().length > 15), points: 20 },
      { key: 'facts', label: 'Synthesized Intel / Facts', complete: (selectedPerson.facts?.length || 0) >= 2, points: 20 }
    ];

    const score = items.reduce((acc, curr) => (curr.complete ? acc + curr.points : acc), 0);
    return { score, items };
  }, [selectedPerson, formData]);

  // Direct Message Automation mode for selectedPerson
  const currentAiMode = useMemo(() => {
    if (!selectedPerson) return 'full_ai';
    if (selectedPerson.aiEnabled === false) return 'paused';
    if (selectedPerson.replyToMessages === false && selectedPerson.replyToReelsAndPosts !== false) return 'reels_only';
    return 'full_ai';
  }, [selectedPerson]);

  // Set AI mode with instant state reflection
  const handleSetAiMode = (mode) => {
    if (!selectedPerson) return;
    const targetKey = selectedPerson.senderId || selectedPerson.id || selectedPerson.name;
    const isPaused = mode === 'paused';
    const isReelsOnly = mode === 'reels_only';
    const isFullAi = mode === 'full_ai';

    setSelectedPerson(prev => ({
      ...prev,
      aiEnabled: !isPaused,
      replyToMessages: isFullAi,
      replyToReelsAndPosts: isFullAi || isReelsOnly
    }));

    updateContactPreferences(targetKey, { aiMode: mode });
  };

  // Save changes from inner page
  const handleSaveInnerForm = async (e) => {
    e?.preventDefault();
    if (!formData.name.trim()) {
      showToast('Name cannot be empty');
      return;
    }

    const cleanHandle = formData.handle.trim() ? (formData.handle.startsWith('@') ? formData.handle.trim() : `@${formData.handle.trim()}`) : '';

    const updated = {
      ...selectedPerson,
      name: formData.name.trim(),
      handle: cleanHandle,
      instagramHandle: cleanHandle,
      senderId: formData.senderId.trim() || selectedPerson.senderId || '',
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

  // Trigger Raw Chat Extraction using AI
  const handleAnalyzeRawChat = async (e) => {
    e?.preventDefault();
    if (!rawChatText.trim()) {
      showToast('Please paste chat text to analyze');
      return;
    }

    setIsExtracting(true);
    try {
      const extraction = await extractFromRawChat(rawChatText, selectedPerson, userClarification);
      if (extraction) {
        setExtractedData(extraction);
        showToast('Chat analyzed! Review extracted attributes & confirm.');
      } else {
        showToast('Failed to analyze chat text. Check server.');
      }
    } catch (err) {
      showToast(`Extraction error: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  // Load recent messages from DB into raw chat textarea
  const handleLoadRecentDms = async () => {
    if (!selectedPerson?.senderId) {
      showToast('No linked sender ID to fetch messages');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${selectedPerson.senderId}/messages`);
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        const text = data.messages.map(m => `${m.role === 'assistant' ? 'Sam' : selectedPerson.name}: ${m.text}`).join('\n');
        setRawChatText(text);
        showToast(`Loaded ${data.messages.length} messages from history`);
      } else {
        showToast('No messages found in history');
      }
    } catch (e) {
      showToast('Could not fetch messages');
    }
  };

  // Confirm and Apply Extracted Attributes
  const handleConfirmExtraction = () => {
    if (!extractedData) return;

    // Merge notes and facts
    const currentNotes = formData.personalNotes.trim();
    const newNotes = extractedData.personalNotes || '';
    const mergedNotes = currentNotes ? `${currentNotes}\n${newNotes}` : newNotes;

    setFormData(prev => ({
      ...prev,
      name: extractedData.name || prev.name,
      handle: extractedData.handle || prev.handle,
      dob: extractedData.dob || prev.dob,
      gender: extractedData.gender || prev.gender,
      category: extractedData.category || prev.category,
      relationship: extractedData.relationshipToSam || prev.relationship,
      personalNotes: mergedNotes,
      roastStyle: extractedData.banterStyle || prev.roastStyle
    }));

    // Add facts if extracted
    if (Array.isArray(extractedData.facts) && selectedPerson) {
      extractedData.facts.forEach(f => {
        addFact(selectedPerson.id, f);
      });
    }

    // Add connections if extracted
    if (Array.isArray(extractedData.connections) && selectedPerson) {
      const currentConns = selectedPerson.connections || [];
      const newConns = [...currentConns];
      extractedData.connections.forEach(c => {
        if (!newConns.some(nc => nc.targetName.toLowerCase() === c.targetName.toLowerCase())) {
          newConns.push(c);
        }
      });
      selectedPerson.connections = newConns;
    }

    setIsRawChatModalOpen(false);
    setExtractedData(null);
    setRawChatText('');
    setUserClarification('');
    showToast('AI pre-filled all profile fields! Review and click Save Changes.');
  };

  // Add custom fact to memory and synchronize with personalNotes
  const handleAddFact = (e) => {
    e?.preventDefault();
    if (!newFactInput.trim() || !selectedPerson) return;
    const factText = newFactInput.trim();
    addFact(selectedPerson.id, factText);

    // Link: also append to personalNotes
    setFormData(prev => ({
      ...prev,
      personalNotes: prev.personalNotes ? `${prev.personalNotes}\n• ${factText}` : `• ${factText}`
    }));

    setNewFactInput('');
    showToast('Fact added & linked to personal lore');
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
    const isPaused = currentAiMode === 'paused';
    const isReelsOnly = currentAiMode === 'reels_only';
    const isFullAi = currentAiMode === 'full_ai';

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
              <ArrowLeft size={26} />
             
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ContactAvatar contact={{ ...selectedPerson, name: formData.name, handle: formData.handle }} size={42} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#09090b', letterSpacing: '-0.5px', margin: 0 }}>
                    {formData.name || selectedPerson.name}
                  </h1>
                  <span style={{ fontSize: '0.68rem', background: '#f4f4f5', border: '1px solid #e4e4e7', color: '#09090b', padding: '2px 8px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
                    {formData.category.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", marginTop: '2px' }}>
                  {formData.handle || 'No handle set'}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Gemini Black Icon for AI Extraction from Raw Chat */}
            <button
              type="button"
              onClick={() => setIsRawChatModalOpen(true)}
              style={{
                background: '#09090b',
                color: '#ffffff',
                border: 'none',
                padding: '9px 16px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '7px'
              }}
            >
              <Sparkles size={14} />
              <span>AI Extract from Raw Chat</span>
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
              <span>Save Profile Changes</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete ${selectedPerson.name} from Database?`)) {
                  deleteNode(selectedPerson);
                  setSelectedPerson(null);
                }
              }}
              title="Delete Person"
              style={{
                background: '#ffffff',
                border: '1px solid #e4e4e7',
                color: '#71717a',
                padding: '9px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* ================= MODAL: AI RAW CHAT EXTRACTION & CLARIFICATION ================= */}
        {isRawChatModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(9, 9, 11, 0.45)',
              backdropFilter: 'blur(4px)',
              zIndex: 110,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e4e4e7',
                borderRadius: '14px',
                width: '100%',
                maxWidth: '750px',
                maxHeight: '88vh',
                overflowY: 'auto',
                boxShadow: '0 20px 45px rgba(0,0,0,0.12)',
                padding: '24px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e4e4e7', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ background: '#09090b', color: '#ffffff', padding: '5px', borderRadius: '6px' }}>
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#09090b', margin: 0 }}>
                      AI Raw Chat Extraction for {formData.name}
                    </h3>
                    <p style={{ fontSize: '0.76rem', color: '#71717a', margin: '2px 0 0 0' }}>
                      Paste conversation logs or notes. AI will extract attributes, ask clarifying questions, and prefill the profile.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsRawChatModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

                {/* Paste Raw Chat */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                    Paste Raw Direct Message Chat or Conversation Notes
                  </label>
                </div>
                <textarea
                  rows={6}
                  value={rawChatText}
                  onChange={(e) => setRawChatText(e.target.value)}
                  placeholder="Paste Instagram DM conversation here (e.g. 'Sam: hey did you finish your exam? Bhavani: yeah 3rd year medicine exam done, going back to hostel...')..."
                  style={{ width: '100%', fontSize: '0.82rem' }}
                />
              </div>

              {/* User Clarification input if needed */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                  Additional Notes or Clarifications for AI (Optional)
                </label>
                <input
                  type="text"
                  value={userClarification}
                  onChange={(e) => setUserClarification(e.target.value)}
                  placeholder="e.g. She is my medicine student friend, not sister. Birthday is in March."
                  style={{ width: '100%', fontSize: '0.82rem' }}
                />
              </div>

              {/* Analyze Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={handleAnalyzeRawChat}
                  disabled={isExtracting || !rawChatText.trim()}
                  style={{
                    background: '#09090b',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: (isExtracting || !rawChatText.trim()) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Sparkles size={14} className={isExtracting ? 'animate-spin' : ''} />
                  <span>{isExtracting ? 'Analyzing Conversation...' : 'Analyze Chat with AI'}</span>
                </button>
              </div>

              {/* Extracted Data Preview & Clarifying Questions */}
              {extractedData && (
                <div style={{ background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '10px', padding: '16px', marginBottom: '18px' }}>
                  <div style={{ fontSize: '0.72rem', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', marginBottom: '8px' }}>
                    AI EXTRACTED ATTRIBUTES
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', padding: '8px 10px', borderRadius: '6px', fontSize: '0.78rem' }}>
                      <span style={{ color: '#71717a', fontWeight: '700' }}>NAME: </span>
                      <span style={{ fontWeight: '600', color: '#09090b' }}>{extractedData.name || 'Not mentioned'}</span>
                    </div>
                    <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', padding: '8px 10px', borderRadius: '6px', fontSize: '0.78rem' }}>
                      <span style={{ color: '#71717a', fontWeight: '700' }}>HANDLE: </span>
                      <span style={{ fontWeight: '600', color: '#09090b' }}>{extractedData.handle || 'Not mentioned'}</span>
                    </div>
                    <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', padding: '8px 10px', borderRadius: '6px', fontSize: '0.78rem' }}>
                      <span style={{ color: '#71717a', fontWeight: '700' }}>DOB: </span>
                      <span style={{ fontWeight: '600', color: '#09090b' }}>{extractedData.dob || 'Not mentioned'}</span>
                    </div>
                    <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', padding: '8px 10px', borderRadius: '6px', fontSize: '0.78rem' }}>
                      <span style={{ color: '#71717a', fontWeight: '700' }}>RELATION: </span>
                      <span style={{ fontWeight: '600', color: '#09090b' }}>{extractedData.relationshipToSam || 'Friend'}</span>
                    </div>
                  </div>

                  {/* Clarifying Questions from AI */}
                  {extractedData.clarifyingQuestions && extractedData.clarifyingQuestions.length > 0 && (
                    <div style={{ background: '#ffffff', border: '1px solid #09090b', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', fontWeight: '800', color: '#09090b', marginBottom: '6px' }}>
                        <AlertCircle size={14} />
                        <span>AI Clarifying Questions (Please check or confirm):</span>
                      </div>
                      <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '0.78rem', color: '#09090b', lineHeight: '1.5' }}>
                        {extractedData.clarifyingQuestions.map((q, idx) => (
                          <li key={idx}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Lore & Facts Preview */}
                  {extractedData.personalNotes && (
                    <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', padding: '10px 12px', borderRadius: '6px', fontSize: '0.78rem', color: '#09090b', marginBottom: '14px' }}>
                      <span style={{ color: '#71717a', fontWeight: '700', display: 'block', marginBottom: '4px' }}>SYNTHESIZED LORE & TOPICS:</span>
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.45' }}>{extractedData.personalNotes}</div>
                    </div>
                  )}

                  {/* Confirm & Apply Button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={handleConfirmExtraction}
                      style={{
                        background: '#09090b',
                        color: '#ffffff',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '8px',
                        fontSize: '0.84rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Check size={14} />
                      <span>Confirm & Prefill Profile Fields</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

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
              onClick={() => handleSetAiMode('full_ai')}
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
                textAlign: 'left',
                transition: 'all 0.15s ease'
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
              onClick={() => handleSetAiMode('reels_only')}
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
                textAlign: 'left',
                transition: 'all 0.15s ease'
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
              onClick={() => handleSetAiMode('paused')}
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
                textAlign: 'left',
                transition: 'all 0.15s ease'
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
            {/* Row 1: Name, Handle */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
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
            </div>

            {/* Row 2: Date of Birth, Gender, Category */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                    Birthday Calendar
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !knowBirthYear;
                      setKnowBirthYear(next);
                      if (!next && formData.dob) {
                        const cleaned = formData.dob.replace(/,?\s*(19|20)\d{2}/, '').replace(/^\d{4}-/, '').trim();
                        setFormData(prev => ({ ...prev, dob: cleaned }));
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#09090b',
                      fontSize: '0.68rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    {knowBirthYear ? "Don't know birth year?" : "Know birth year?"}
                  </button>
                </div>

                {knowBirthYear ? (
                  <div>
                    <input
                      type="date"
                      value={formatDobForInput(formData.dob)}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          setFormData({ ...formData, dob: '' });
                          return;
                        }
                        const [y, m, d] = val.split('-');
                        const monthName = MONTH_NAMES[parseInt(m, 10) - 1] || m;
                        setFormData({ ...formData, dob: `${monthName} ${parseInt(d, 10)}, ${y}` });
                      }}
                      style={{ width: '100%' }}
                    />
                    {formData.dob && (
                      <span style={{ fontSize: '0.72rem', color: '#71717a', display: 'block', marginTop: '4px' }}>
                        Selected: <b>{formData.dob}</b>
                      </span>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select
                        value={(() => {
                          const match = MONTH_NAMES.find(m => formData.dob.toLowerCase().includes(m.toLowerCase()));
                          return match || 'January';
                        })()}
                        onChange={(e) => {
                          const m = e.target.value;
                          const currentDay = (formData.dob.match(/\b([1-9]|[12]\d|3[01])\b/) || [])[0] || '1';
                          setFormData({ ...formData, dob: `${m} ${currentDay}` });
                        }}
                        style={{ flex: 1.2 }}
                      >
                        {MONTH_NAMES.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>

                      <select
                        value={(() => {
                          const match = (formData.dob.match(/\b([1-9]|[12]\d|3[01])\b/) || [])[0];
                          return match || '1';
                        })()}
                        onChange={(e) => {
                          const d = e.target.value;
                          const currentMonth = MONTH_NAMES.find(m => formData.dob.toLowerCase().includes(m.toLowerCase())) || 'January';
                          setFormData({ ...formData, dob: `${currentMonth} ${d}` });
                        }}
                        style={{ flex: 0.8 }}
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                          <option key={day} value={day}>{day}</option>
                        ))}
                      </select>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#71717a', display: 'block', marginTop: '4px' }}>
                      Remembering date & month: <b>{formData.dob || 'Not set'}</b>
                    </span>
                  </div>
                )}
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
                placeholder="e.g. Closest Online Friend / 3rd Year Medicine Student"
              />
            </div>

            {/* Row 4: Personal Notes & Highlights (Linked to facts!) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  Personal Lore, Habits & Synthesized DM Notes
                </label>
                <span style={{ fontSize: '0.7rem', color: '#71717a' }}>Linked to DM Intel</span>
              </div>
              <textarea
                rows={5}
                value={formData.personalNotes}
                onChange={(e) => setFormData({ ...formData, personalNotes: e.target.value })}
                placeholder="Write detailed background information, habits, exams, Netflix shows, inside jokes, and life updates..."
              />
            </div>

            {/* Row 5: Banter Style */}
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                Banter & Conversation Style
              </label>
              <input
                type="text"
                value={formData.roastStyle}
                onChange={(e) => setFormData({ ...formData, roastStyle: e.target.value })}
                placeholder="e.g. Playful teasing, Hindi bro banter, sweet concise shortcuts..."
              />
            </div>

          </form>
        </div>

        {/* ================= CARD 4: SOCIAL CONNECTIONS (WITH SUGGESTIONS) ================= */}
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

          {/* Add Friend Connection Form with Suggestions */}
          <div style={{ position: 'relative' }}>
            <form onSubmit={handleAddConnection} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '180px', position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Friend Name (e.g. Annie, Rajveer, Moksha)"
                  value={newConnTarget}
                  onChange={(e) => setNewConnTarget(e.target.value)}
                  style={{ width: '100%' }}
                />

                {/* Suggestions Dropdown */}
                {friendSuggestions.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: '#ffffff',
                      border: '1px solid #e4e4e7',
                      borderRadius: '8px',
                      marginTop: '4px',
                      zIndex: 20,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      overflow: 'hidden'
                    }}
                  >
                    {friendSuggestions.map((sug) => (
                      <div
                        key={sug.id || sug.name}
                        onClick={() => {
                          setNewConnTarget(sug.name);
                        }}
                        style={{
                          padding: '8px 12px',
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid #f4f4f5'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f4f5')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                      >
                        <span style={{ fontWeight: '700', color: '#09090b' }}>{sug.name}</span>
                        <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                          {sug.handle || sug.relationship}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <input
                type="text"
                placeholder="How they know each other (e.g. Sister, Homie, Classmate)"
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
        </div>

        {/* ================= CARD 5: SYNTHESIZED INTEL (LINKED TO LORE) ================= */}
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }} />
              <span style={{ fontSize: '0.7rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>AUTO-SYNCING FROM DMs</span>
            </div>
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
              placeholder="Add custom remembered fact (automatically syncs with personal notes)..."
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
  // VIEW 2: ALL PEOPLE DIRECTORY (Shadcn Light Monochrome Table & Dashboard)
  // =========================================================================
  return (
    <div style={{ padding: '32px 36px 80px 36px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
            PEOPLE DIRECTORY & INTELLIGENCE
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: '800', letterSpacing: '-0.6px', marginTop: '2px', color: '#09090b' }}>
            All People
          </h1>
          <p style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '4px' }}>
            Unified directory showing profiles, interaction statistics, and automated intelligence rules.
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

      {/* ================= DASHBOARD METRICS SUMMARY ================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '10px',
        marginBottom: '20px'
      }}>
        {[
          { icon: <Users size={16} />, label: 'Total People', value: dashboardStats.totalPeople },
          { icon: <MessageSquare size={16} />, label: 'Total Chats', value: dashboardStats.totalDMs },
          { icon: <Film size={16} />, label: 'Reels Shared', value: dashboardStats.totalReels },
          { icon: <Bot size={16} />, label: 'AI Active', value: dashboardStats.activeAi },
        ].map(({ icon, label, value }) => (
          <div key={label} style={{
            background: '#ffffff',
            border: '1px solid #e4e4e7',
            borderRadius: '10px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{ background: '#f4f4f5', padding: '8px', borderRadius: '7px', color: '#09090b', flexShrink: 0 }}>
              {icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', whiteSpace: 'nowrap' }}>{label}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#09090b', lineHeight: 1.2 }}>{value}</div>
            </div>
          </div>
        ))}
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
            placeholder="Filter people by name, @username, birth date, relation, or lore..."
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
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '850px' }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '1px solid #e4e4e7' }}>
                <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", width: '56px' }}>
                  PROFILE
                </th>
                <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  NAME
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
                <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
                  CHATS
                </th>
                <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
                  REELS
                </th>
                <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", textAlign: 'right' }}>
                  ACTION
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedPeople.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#71717a', fontSize: '0.85rem' }}>
                    {filteredPeople.length === 0 ? 'No people found matching your filters.' : 'No results on this page.'}
                  </td>
                </tr>
              ) : (
                pagedPeople.map((person) => {

                  const hasHandle = Boolean(person.handle || person.instagramHandle);
                  const handleDisplay = person.handle || person.instagramHandle;
                  const dobDisplay = person.dob || person.importantDates?.[0]?.date || '';
                  const chatsCount = person.chatsCount || person.messageCount || 0;
                  const reelsCount = person.reelsCount || 0;

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

                      {/* Column 3: USERNAME */}
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
                            {handleDisplay}
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

                      {/* Column 4: DATE OF BIRTH */}
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

                      {/* Column 5: RELATION */}
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '0.8rem', color: '#09090b', fontWeight: '600' }}>
                            {person.relationship || person.relationshipToSam || 'Friend'}
                          </span>
                          <span style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                            {person.category ? person.category.replace('_', ' ').toUpperCase() : 'ONLINE FRIEND'}
                          </span>
                        </div>
                      </td>

                      {/* Column 6: CHATS COUNT */}
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <span style={{ background: '#f4f4f5', border: '1px solid #e4e4e7', padding: '3px 8px', borderRadius: '4px', fontSize: '0.74rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', color: '#09090b', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <MessageSquare size={11} style={{ color: '#71717a' }} />
                          <span>{chatsCount}</span>
                        </span>
                      </td>

                      {/* Column 7: REELS COUNT */}
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <span style={{ background: '#f4f4f5', border: '1px solid #e4e4e7', padding: '3px 8px', borderRadius: '4px', fontSize: '0.74rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', color: '#09090b', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Film size={11} style={{ color: '#71717a' }} />
                          <span>{reelsCount}</span>
                        </span>
                      </td>

                      {/* Column 8: ACTION (ONLY OPEN AND DELETE) */}
                      <td style={{ padding: '10px 16px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
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
                                deleteNode(person);
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

        {/* Table Pagination */}
        {totalTablePages > 1 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderTop: '1px solid #e4e4e7',
            background: '#fafafa',
            borderBottomLeftRadius: '10px',
            borderBottomRightRadius: '10px'
          }}>
            <span style={{ fontSize: '0.78rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
              {filteredPeople.length} people &nbsp;·&nbsp; Page {tablePage} of {totalTablePages}
            </span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                onClick={() => setTablePage(p => Math.max(1, p - 1))}
                disabled={tablePage === 1}
                style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '6px', padding: '5px 12px', fontSize: '0.78rem', fontWeight: '600', cursor: tablePage === 1 ? 'not-allowed' : 'pointer', opacity: tablePage === 1 ? 0.4 : 1 }}
              >← Prev</button>
              {Array.from({ length: totalTablePages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalTablePages || Math.abs(p - tablePage) <= 1)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) => (
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} style={{ fontSize: '0.78rem', color: '#71717a', padding: '0 4px' }}>…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setTablePage(p)}
                      style={{
                        background: tablePage === p ? '#09090b' : '#ffffff',
                        color: tablePage === p ? '#ffffff' : '#09090b',
                        border: '1px solid ' + (tablePage === p ? '#09090b' : '#e4e4e7'),
                        borderRadius: '6px',
                        padding: '5px 10px',
                        fontSize: '0.78rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        minWidth: '32px'
                      }}
                    >{p}</button>
                  )
                ))}
              <button
                onClick={() => setTablePage(p => Math.min(totalTablePages, p + 1))}
                disabled={tablePage === totalTablePages}
                style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '6px', padding: '5px 12px', fontSize: '0.78rem', fontWeight: '600', cursor: tablePage === totalTablePages ? 'not-allowed' : 'pointer', opacity: tablePage === totalTablePages ? 0.4 : 1 }}
              >Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
