'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Search, Sparkles, Filter, Link2, AlertCircle, ArrowLeft, ArrowRight,
  Trash2, Calendar, Bot, Film, Pause, Check, Save, User,
  Plus, RefreshCw, MessageSquare, Shield, X, Users,
  LayoutGrid, List, AlignJustify, Table as TableIcon, Cake
} from 'lucide-react';
import SuperadminWorkspacePrompt from '../components/SuperadminWorkspacePrompt';
import ContactAvatar from '../components/ContactAvatar';
import CountUp from '../components/CountUp';
import { useAmbientImage } from '../components/AmbientBackground';

// Next birthday from a stored DOB ("2002-05-14", "14 May", "May 14, 2002")
function getNextBirthday(dob) {
  if (!dob) return null;
  const hasYear = /\b(19|20)\d{2}\b/.test(dob);
  const parsed = new Date(hasYear ? dob : `${dob} 2000`);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), parsed.getMonth(), parsed.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, parsed.getMonth(), parsed.getDate());
  return {
    days: Math.round((next - today) / 86400000),
    label: next.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }),
    turning: hasYear ? next.getFullYear() - parsed.getFullYear() : null,
  };
}

function formatLastContact(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
import { motion, AnimatePresence } from 'framer-motion';

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

function RelationshipsPageContent() {


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
    showToast,
    isSyncingInitial,
    user,
    isImpersonating
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
    roastStyle: '',
    roastiness: 40,
    greetingStyle: '',
    chatsCount: 0,
    reelsCount: 0
  });

  // Spotify-style inner profile tabs (PLAN.md §15.3)
  const [profileTab, setProfileTab] = useState('identity');
  const [dmPreview, setDmPreview] = useState({ loading: false, messages: [] });

  const [isAutofilling, setIsAutofilling] = useState(false);
  const [isLearning, setIsLearning] = useState(false);
  const [newFactInput, setNewFactInput] = useState('');
  const [newConnTarget, setNewConnTarget] = useState('');
  const [newConnRel, setNewConnRel] = useState('');

  // Pagination state — table
  const TABLE_PAGE_SIZE = 10;
  const [tablePage, setTablePage] = useState(1);

  // Layout switcher state: 'table' | 'grid' | 'dense'
  const [layoutMode, setLayoutMode] = useState(() => {
    if (typeof window === 'undefined') return 'table';
    try {
      return localStorage.getItem('chatter_people_layout') || 'table';
    } catch {
      return 'table';
    }
  });

  const handleSetLayout = (mode) => {
    setLayoutMode(mode);
    try {
      localStorage.setItem('chatter_people_layout', mode);
    } catch {}
  };

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
        roastStyle: selectedPerson.roastStyle || '',
        roastiness: Number.isFinite(selectedPerson.roastiness) ? selectedPerson.roastiness : 40,
        greetingStyle: selectedPerson.greetingStyle || '',
        chatsCount: selectedPerson.chatsCount ?? selectedPerson.messageCount ?? 0,
        reelsCount: selectedPerson.reelsCount ?? 0
      });
      setProfileTab('identity');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPerson?.id, selectedPerson?.name]);

  // Optional background fetch of latest memory on person open (one-shot, non-blocking, no addFact loop)
  useEffect(() => {
    if (!selectedPerson?.senderId) return;
    let isCancelled = false;

    const fetchLatestMemory = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/conversations/${selectedPerson.senderId}/memory`);
        if (!res.ok || isCancelled) return;
        const data = await res.json();
        if (!data.memory || isCancelled) return;
        const mem = data.memory;

        const bday = (mem.importantDates || []).find(d =>
          d.title?.toLowerCase().includes('birth') || d.title?.toLowerCase().includes('bday')
        );
        const autoDob = mem.dob || bday?.date || '';
        if (autoDob && !formData.dob) {
          setFormData(prev => ({ ...prev, dob: prev.dob || autoDob }));
        }
        if (mem.personalNotes && !formData.personalNotes) {
          setFormData(prev => ({ ...prev, personalNotes: prev.personalNotes || mem.personalNotes }));
        }
      } catch (e) {
        // silent
      }
    };

    fetchLatestMemory();
    return () => { isCancelled = true; };
  }, [selectedPerson?.senderId]);


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
      if (cat === 'close_friend') {
        counts.close_friend++;
        counts.online_friend++; // the Online tab lists close friends too, so its count must include them
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
        if (n.category !== 'close_friend') return false;
      } else if (activeCategory === 'online_friend') {
        // A contact without a category counts as an online friend (same rule as the tab counts)
        const cat = n.category || 'online_friend';
        if (cat !== 'online_friend' && cat !== 'close_friend') return false;
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

    const newName = formData.name.trim();
    const oldName = (selectedPerson?.name || '').trim();
    const isRenamed = oldName && oldName.toLowerCase() !== newName.toLowerCase();
    const cleanHandle = formData.handle.trim() ? (formData.handle.startsWith('@') ? formData.handle.trim() : `@${formData.handle.trim()}`) : '';

    const updated = {
      ...selectedPerson,
      name: newName,
      oldName: isRenamed ? oldName : undefined,
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
      roastStyle: formData.roastStyle.trim(),
      roastiness: Number(formData.roastiness),
      greetingStyle: formData.greetingStyle.trim(),
      chatsCount: parseInt(formData.chatsCount, 10) || 0,
      reelsCount: parseInt(formData.reelsCount, 10) || 0,
      messageCount: parseInt(formData.chatsCount, 10) || 0
    };

    await saveNode(updated, isRenamed ? [oldName] : []);
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

  // Remove custom fact from memory and update node
  const handleRemoveFact = async (factToRemove) => {
    if (!selectedPerson) return;
    const currentFacts = (selectedPerson.facts || selectedPerson.lore || []);
    const filtered = currentFacts.filter(f => f !== factToRemove);
    const updated = {
      ...selectedPerson,
      facts: filtered,
      lore: filtered
    };
    await saveNode(updated);
    setSelectedPerson(updated);

    if (selectedPerson.senderId) {
      try {
        await fetch(`${API_BASE}/api/conversations/${selectedPerson.senderId}/facts`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fact: factToRemove })
        });
      } catch (e) {}
    }
    showToast('Fact removed from memory');
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `server answered ${res.status}`);
      if (data.success && data.memory) {
        showToast('Memory synthesized from recent messages');
      } else {
        showToast('Messages reviewed. Memory up to date');
      }
    } catch (e) {
      showToast(`Could not refresh memory: ${e.message}`, 'error');
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

  // Load the recent DM transcript for the profile's history tab and last-contact stat
  useEffect(() => {
    const senderId = selectedPerson?.senderId;
    if (!senderId) {
      setDmPreview({ loading: false, messages: [] });
      return;
    }
    let cancelled = false;
    setDmPreview({ loading: true, messages: [] });
    fetch(`${API_BASE}/api/conversations/${senderId}/messages`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled) return;
        const messages = Array.isArray(data?.messages) ? data.messages.filter(m => m?.text).slice(-12) : [];
        setDmPreview({ loading: false, messages });
      })
      .catch(() => !cancelled && setDmPreview({ loading: false, messages: [] }));
    return () => { cancelled = true; };
  }, [selectedPerson?.senderId, API_BASE]);

  // Tint the whole page from the open contact's photo (PLAN.md §15.3)
  const personRawHandle = (selectedPerson?.handle || selectedPerson?.instagramHandle || '').replace(/^@/, '').trim();
  const personArt = selectedPerson
    ? (selectedPerson.profilePic?.startsWith('http')
      ? selectedPerson.profilePic
      : (personRawHandle ? `https://unavatar.io/instagram/${personRawHandle}?fallback=false` : null))
    : null;
  useAmbientImage(personArt);

  const birthday = useMemo(() => getNextBirthday(formData.dob), [formData.dob]);
  const lastMessage = dmPreview.messages[dmPreview.messages.length - 1];
  const lastContactLabel = formatLastContact(
    lastMessage?.timestamp || lastMessage?.createdAt || selectedPerson?.lastInteraction || selectedPerson?.updatedAt
  );

  // =========================================================================
  // VIEW 1: FULL INNER PERSON PAGE (When a person is clicked/opened)
  // =========================================================================
  if (selectedPerson) {
    const isPaused = currentAiMode === 'paused';
    const isReelsOnly = currentAiMode === 'reels_only';
    const isFullAi = currentAiMode === 'full_ai';

    return (
      <div className="page-container person-page" style={{ maxWidth: '1400px' }}>
        {/* ================= SPOTIFY ARTIST-STYLE HERO (PLAN.md §15.3) ================= */}
        <div className="person-hero">
          <button type="button" className="person-back" onClick={() => setSelectedPerson(null)} aria-label="Back to directory">
            <ArrowLeft size={22} />
          </button>

          <div className="person-hero-body">
            <div className="person-hero-avatar">
              <ContactAvatar contact={{ ...selectedPerson, name: formData.name, handle: formData.handle }} size={120} showStatus={false} />
            </div>

            <div className="person-hero-text">
              <span className="person-tag">
                <span className="person-tag-dot" />
                {formData.relationship || formData.category.replace('_', ' ')}
              </span>
              <h1 className="person-name">{formData.name || selectedPerson.name}</h1>
              <div className="person-handle">
                {formData.handle || 'No handle set'}
                {selectedPerson.senderId ? ' · Instagram linked' : ' · Not linked'}
              </div>

              <div className="person-stats">
                <div>
                  <CountUp value={formData.chatsCount} className="person-stat-value" />
                  <span className="person-stat-label">Total DMs</span>
                </div>
                <div>
                  <CountUp value={formData.reelsCount} className="person-stat-value" />
                  <span className="person-stat-label">Shared Reels</span>
                </div>
                <div>
                  <span className="person-stat-value">{lastContactLabel}</span>
                  <span className="person-stat-label">Last Contact</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating glass action bar */}
        <div className="person-actionbar">
          <motion.button
            type="button"
            className="person-cta"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => startAiInterview(selectedPerson)}
          >
            <Sparkles size={16} />
            <span>Start AI Interview</span>
          </motion.button>

          <div className="person-actions">
            <button type="button" className="person-action" onClick={handleForceLearn} disabled={isLearning}>
              <RefreshCw size={15} className={isLearning ? 'animate-spin' : ''} />
              <span>{isLearning ? 'Learning…' : 'Force Learn DMs'}</span>
            </button>
            <button type="button" className="person-action" onClick={() => setLinkingTargetPerson(selectedPerson)}>
              <Link2 size={15} />
              <span>{selectedPerson.senderId ? 'Relink Instagram' : 'Link Instagram'}</span>
            </button>
            <button type="button" className="person-action" onClick={() => setIsRawChatModalOpen(true)}>
              <MessageSquare size={15} />
              <span>Raw Chat AI Extract</span>
            </button>
            <button type="button" className="person-action" onClick={handleSaveInnerForm}>
              <Save size={15} />
              <span>Save</span>
            </button>
            <button
              type="button"
              className="person-action danger"
              aria-label="Delete contact"
              onClick={() => {
                if (window.confirm(`Delete ${selectedPerson.name}? This removes the contact and their saved profile.`)) {
                  deleteNode(selectedPerson);
                  setSelectedPerson(null);
                }
              }}
            >
              <Trash2 size={15} />
              <span>Delete</span>
            </button>
          </div>
        </div>

        {/* Segmented glass tabs */}
        <div className="person-tabs" role="tablist">
          {[
            { id: 'identity', label: 'Identity & Lore', icon: User },
            { id: 'routing', label: 'AI Routing & Modes', icon: Bot },
            { id: 'memories', label: 'Memories & Facts', icon: Sparkles },
            { id: 'history', label: 'DM History & Tone', icon: MessageSquare },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={profileTab === id}
              className={`person-tab${profileTab === id ? ' active' : ''}`}
              onClick={() => setProfileTab(id)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
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
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '14px',
                width: '100%',
                maxWidth: '750px',
                maxHeight: '88vh',
                overflowY: 'auto',
                boxShadow: '0 20px 45px rgba(0,0,0,0.12)',
                padding: '24px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ background: 'var(--color-text-primary)', color: 'var(--color-surface)', padding: '5px', borderRadius: '6px' }}>
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0 }}>
                      AI Raw Chat Extraction for {formData.name}
                    </h3>
                    <p style={{ fontSize: '0.76rem', color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>
                      Paste conversation logs or notes. AI will extract attributes, ask clarifying questions, and prefill the profile.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsRawChatModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

                {/* Paste Raw Chat */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
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
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
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
                    background: 'var(--color-text-primary)',
                    color: 'var(--color-surface)',
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
                <div style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '16px', marginBottom: '18px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', marginBottom: '8px' }}>
                    AI EXTRACTED ATTRIBUTES
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: '6px', fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--color-text-secondary)', fontWeight: '700' }}>NAME: </span>
                      <span style={{ fontWeight: '600', color: 'var(--color-text-primary)' }}>{extractedData.name || 'Not mentioned'}</span>
                    </div>
                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: '6px', fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--color-text-secondary)', fontWeight: '700' }}>HANDLE: </span>
                      <span style={{ fontWeight: '600', color: 'var(--color-text-primary)' }}>{extractedData.handle || 'Not mentioned'}</span>
                    </div>
                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: '6px', fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--color-text-secondary)', fontWeight: '700' }}>DOB: </span>
                      <span style={{ fontWeight: '600', color: 'var(--color-text-primary)' }}>{extractedData.dob || 'Not mentioned'}</span>
                    </div>
                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: '6px', fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--color-text-secondary)', fontWeight: '700' }}>RELATION: </span>
                      <span style={{ fontWeight: '600', color: 'var(--color-text-primary)' }}>{extractedData.relationshipToSam || 'Friend'}</span>
                    </div>
                  </div>

                  {/* Clarifying Questions from AI */}
                  {extractedData.clarifyingQuestions && extractedData.clarifyingQuestions.length > 0 && (
                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-text-primary)', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                        <AlertCircle size={14} />
                        <span>AI Clarifying Questions (Please check or confirm):</span>
                      </div>
                      <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '0.78rem', color: 'var(--color-text-primary)', lineHeight: '1.5' }}>
                        {extractedData.clarifyingQuestions.map((q, idx) => (
                          <li key={idx}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Lore & Facts Preview */}
                  {extractedData.personalNotes && (
                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '10px 12px', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--color-text-primary)', marginBottom: '14px' }}>
                      <span style={{ color: 'var(--color-text-secondary)', fontWeight: '700', display: 'block', marginBottom: '4px' }}>SYNTHESIZED LORE & TOPICS:</span>
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.45' }}>{extractedData.personalNotes}</div>
                    </div>
                  )}

                  {/* Confirm & Apply Button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={handleConfirmExtraction}
                      style={{
                        background: 'var(--color-text-primary)',
                        color: 'var(--color-surface)',
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

        {profileTab === 'routing' && (
          <>
        {/* ================= CARD 1: KNOWLEDGE SCORE & COMPLETENESS ================= */}
        <div className="person-glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
                INTEL DEPTH
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--color-text-primary)', marginTop: '2px' }}>
                {knowledgeBreakdown.score}% Knowledge Score
              </div>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', marginTop: '2px' }}>
                Completeness index measuring how well Chatter OS AI understands {formData.name}&apos;s identity, lore, and relationships.
              </p>
            </div>

            <div style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)', padding: '6px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
              {knowledgeBreakdown.score >= 80 ? 'HIGH INTEL' : (knowledgeBreakdown.score >= 50 ? 'MEDIUM INTEL' : 'NEEDS DATA')}
            </div>
          </div>

          {/* Progress Bar */}
          <div style={{ width: '100%', height: '8px', background: 'var(--color-surface-hover)', borderRadius: '4px', overflow: 'hidden', marginBottom: '18px' }}>
            <div
              style={{
                width: `${knowledgeBreakdown.score}%`,
                height: '100%',
                background: 'var(--color-text-primary)',
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
                  background: item.complete ? 'var(--color-surface-hover)' : 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  fontSize: '0.78rem',
                  color: item.complete ? 'var(--color-text-primary)' : 'var(--color-text-muted)'
                }}
              >
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px',
                    background: item.complete ? 'var(--color-text-primary)' : 'var(--color-surface)',
                    border: '1px solid',
                    borderColor: item.complete ? 'var(--color-text-primary)' : 'var(--color-border-strong)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-surface)'
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
        <div className="person-glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
                DIRECT MESSAGE AUTOMATION
              </div>
              <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--color-text-primary)', marginTop: '2px' }}>
                AI Reply Rules for {formData.name}
              </div>
            </div>
            <span style={{ fontSize: '0.72rem', background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)', padding: '3px 8px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
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
                borderColor: isFullAi ? 'var(--color-text-primary)' : 'var(--color-border)',
                background: isFullAi ? 'var(--color-text-primary)' : 'var(--color-surface)',
                color: isFullAi ? 'var(--color-surface)' : 'var(--color-text-primary)',
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
                borderColor: isReelsOnly ? 'var(--color-text-primary)' : 'var(--color-border)',
                background: isReelsOnly ? 'var(--color-text-primary)' : 'var(--color-surface)',
                color: isReelsOnly ? 'var(--color-surface)' : 'var(--color-text-primary)',
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
                borderColor: isPaused ? 'var(--color-text-primary)' : 'var(--color-border)',
                background: isPaused ? 'var(--color-text-primary)' : 'var(--color-surface)',
                color: isPaused ? 'var(--color-surface)' : 'var(--color-text-primary)',
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
                <div style={{ fontSize: '0.82rem', fontWeight: '800' }}>Stop AI (Manual Chat)</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: '1px' }}>AI silenced for manual chatting</div>
              </div>
            </button>
          </div>
        </div>
        </>
        )}

        {profileTab === 'identity' && (
          <>
          {/* Birthday countdown */}
          <div className="person-glass-card person-birthday">
            <div className="person-birthday-icon"><Cake size={22} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="person-card-eyebrow">BIRTHDAY</div>
              {birthday ? (
                <div className="person-card-title">
                  {birthday.days === 0
                    ? `It's ${formData.name || selectedPerson.name}'s birthday today`
                    : `${birthday.days} day${birthday.days === 1 ? '' : 's'} to go`}
                </div>
              ) : (
                <div className="person-card-title" style={{ color: 'var(--color-text-secondary)' }}>No birthday saved yet</div>
              )}
              <div className="person-card-sub">
                {birthday ? `${birthday.label}${birthday.turning ? ` · turning ${birthday.turning}` : ''}` : 'Add a date of birth in the fields below'}
              </div>
            </div>
          </div>

        {/* ================= CARD 3: PREDEFINED NECESSARY FIELDS ================= */}
        <div className="person-glass-card">
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', marginBottom: '4px' }}>
            PROFILE FIELDS
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            Essential Identity & Relationship Attributes
          </div>

          <form onSubmit={handleSaveInnerForm} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Row 1: Name, Handle */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
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
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
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
                  <label style={{ fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
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
                      color: 'var(--color-text-primary)',
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
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', display: 'block', marginTop: '4px' }}>
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
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', display: 'block', marginTop: '4px' }}>
                      Remembering date & month: <b>{formData.dob || 'Not set'}</b>
                    </span>
                  </div>
                )}
              </div>


              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
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
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
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

            {/* Row 3: Relationship */}
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                Specific Relationship To You
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
                <label style={{ fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  Personal Lore, Habits & Synthesized DM Notes
                </label>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>Linked to DM Intel</span>
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
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                Banter & Conversation Style
              </label>
              <input
                type="text"
                value={formData.roastStyle}
                onChange={(e) => setFormData({ ...formData, roastStyle: e.target.value })}
                placeholder="e.g. Playful teasing, Hindi bro banter, sweet concise shortcuts..."
              />
            </div>

            {/* Row 6: Lifetime Interaction Statistics (Chats & Reels) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', paddingTop: '10px', borderTop: '1px solid var(--color-surface-hover)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                  Total DMs Exchanged
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.chatsCount}
                  onChange={(e) => setFormData({ ...formData, chatsCount: parseInt(e.target.value, 10) || 0 })}
                  placeholder="0"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}
                />
                <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: '3px', display: 'block' }}>
                  Cumulative lifetime chats (preserved across message cleanups)
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                  Total Reels Shared
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.reelsCount}
                  onChange={(e) => setFormData({ ...formData, reelsCount: parseInt(e.target.value, 10) || 0 })}
                  placeholder="0"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}
                />
                <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: '3px', display: 'block' }}>
                  Cumulative reels shared by this contact
                </span>
              </div>
            </div>

          </form>
        </div>

        {/* ================= CARD 4: SOCIAL CONNECTIONS (WITH SUGGESTIONS) ================= */}
        <div className="person-glass-card">
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', marginBottom: '4px' }}>
            SOCIAL GRAPH
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '14px' }}>
            Interlinked Friends in Circle ({selectedPerson.connections?.length || 0})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {(selectedPerson.connections || []).length > 0 ? (
              selectedPerson.connections.map((c, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--color-surface-hover)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Link2 size={14} style={{ color: 'var(--color-text-primary)' }} />
                    <span style={{ fontWeight: '700', fontSize: '0.85rem', color: 'var(--color-text-primary)' }}>{c.targetName}</span>
                  </div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {c.rel || c.relationship}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.82rem', background: 'var(--color-surface-hover)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
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
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
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
                          borderBottom: '1px solid var(--color-surface-hover)'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-surface)')}
                      >
                        <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{sug.name}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace" }}>
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
                  background: 'var(--color-text-primary)',
                  color: 'var(--color-surface)',
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
        </>
        )}

        {profileTab === 'memories' && (
          <>
        {/* ================= CARD 5: SYNTHESIZED INTEL (LINKED TO LORE) ================= */}
        <div className="person-glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
                LEARNED INTEL
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--color-text-primary)', marginTop: '2px' }}>
                Facts Synthesized from Live Instagram DMs
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)', padding: '2px 8px', borderRadius: '6px', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
                {(selectedPerson.facts || selectedPerson.lore || []).length} Facts Captured
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }} />
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace" }}>AUTO-SYNCING</span>
              </div>
            </div>
          </div>

          {/* Optimized Scrollable Intel Container */}
          <div className="facts-scroll-container" style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '16px' }}>
            {((selectedPerson.facts || selectedPerson.lore || []).length === 0) ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.8rem', border: '1px dashed var(--color-border)', borderRadius: '8px', background: 'var(--color-surface-elevated)' }}>
                No facts captured yet. Chatter OS automatically synthesizes profile intel as you chat in live Instagram DMs.
              </div>
            ) : (
              (selectedPerson.facts || selectedPerson.lore || []).map((fact, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--color-surface-hover)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.82rem',
                    color: 'var(--color-text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--color-text-primary)', flexShrink: 0 }} />
                    <span style={{ wordBreak: 'break-word', lineHeight: '1.4' }}>{fact}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveFact(fact)}
                    title="Remove this fact from memory"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: '4px',
                      flexShrink: 0
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <form onSubmit={handleAddFact} style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '240px' }}>
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
                  background: 'var(--color-text-primary)',
                  color: 'var(--color-surface)',
                  border: 'none',
                  padding: '9px 18px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Add Fact
              </button>
            </form>

            <button
              type="button"
              onClick={handleForceLearn}
              disabled={isLearning}
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
                padding: '9px 14px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <Sparkles size={13} />
              <span>{isLearning ? 'Learning...' : 'Sync DM Memory'}</span>
            </button>
          </div>
        </div>
        </>
        )}

        {profileTab === 'history' && (
          <>
            {/* Tone controls */}
            <div className="person-glass-card">
              <div className="person-card-eyebrow">TONE</div>
              <div className="person-card-title" style={{ marginBottom: '18px' }}>How the AI talks to {formData.name || selectedPerson.name}</div>

              <label className="person-field-label" htmlFor="roastiness">
                <span>Roastiness</span>
                <span className="person-range-value">{formData.roastiness}%</span>
              </label>
              <input
                id="roastiness"
                type="range"
                min="0"
                max="100"
                step="5"
                value={formData.roastiness}
                onChange={e => setFormData(prev => ({ ...prev, roastiness: Number(e.target.value) }))}
                className="person-range"
                style={{ '--range-fill': `${formData.roastiness}%` }}
              />
              <div className="person-range-scale">
                <span>Kind</span>
                <span>Playful</span>
                <span>Savage</span>
              </div>

              <label className="person-field-label" htmlFor="greetingStyle" style={{ marginTop: '20px' }}>
                <span>Greeting style</span>
              </label>
              <input
                id="greetingStyle"
                type="text"
                maxLength={120}
                placeholder='e.g. "yo", "heyy", "macha enna da"'
                value={formData.greetingStyle}
                onChange={e => setFormData(prev => ({ ...prev, greetingStyle: e.target.value }))}
              />
              <div className="person-chip-row">
                {['hey', 'yo', 'heyy', 'wassup', 'bro', 'macha'].map(g => (
                  <button
                    key={g}
                    type="button"
                    className={`person-chip${formData.greetingStyle === g ? ' active' : ''}`}
                    onClick={() => setFormData(prev => ({ ...prev, greetingStyle: g }))}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <button type="button" className="person-cta" style={{ marginTop: '20px' }} onClick={handleSaveInnerForm}>
                <Save size={15} />
                <span>Save tone</span>
              </button>
            </div>

            {/* DM transcript preview */}
            <div className="person-glass-card">
              <div className="person-card-eyebrow">RECENT DMS</div>
              <div className="person-card-title" style={{ marginBottom: '14px' }}>Conversation preview</div>
              {!selectedPerson.senderId ? (
                <div className="person-card-sub">Link their Instagram to see the DM history here.</div>
              ) : dmPreview.loading ? (
                <div className="person-card-sub">Loading messages…</div>
              ) : dmPreview.messages.length === 0 ? (
                <div className="person-card-sub">No messages yet.</div>
              ) : (
                <div className="person-transcript">
                  {dmPreview.messages.map((m, i) => (
                    <div key={m.mid || i} className={`person-bubble ${m.role === 'assistant' ? 'out' : 'in'}`}>
                      {m.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: ALL PEOPLE DIRECTORY (Shadcn Light Monochrome Table & Dashboard)
  // =========================================================================
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="page-container"
      style={{ maxWidth: '1400px' }}
    >
      {/* Top Header */}
      <div className="directory-header-row page-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '24px', width: '100%' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
            PEOPLE DIRECTORY & INTELLIGENCE
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: '800', letterSpacing: '-0.6px', marginTop: '2px', color: 'var(--color-text-primary)', lineHeight: 1.1 }}>
            All People
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem', marginTop: '4px' }}>
            Unified directory showing profiles, interaction statistics, and automated intelligence rules.
          </p>
        </div>
      </div>

      {/* ================= DASHBOARD METRICS SUMMARY ================= */}
      <div className="metrics-summary-grid" style={{
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
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{ background: 'var(--color-surface-hover)', padding: '8px', borderRadius: '7px', color: 'var(--color-text-primary)', flexShrink: 0 }}>
              {icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', whiteSpace: 'nowrap' }}>{label}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--color-text-primary)', lineHeight: 1.2 }}>{value}</div>
            </div>
          </div>
        ))}
      </div>


      {/* Action Required Banner for missing Instagram IDs */}
      {unlinkedFriends.length > 0 && (
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-text-primary)',
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
            <AlertCircle size={18} style={{ color: 'var(--color-text-primary)', flexShrink: 0 }} />
            <div>
              <div style={{ color: 'var(--color-text-primary)', fontWeight: '700', fontSize: '0.86rem' }}>
                Action Required: {unlinkedFriends.length} Contact{unlinkedFriends.length > 1 ? 's' : ''} Missing Instagram ID
              </div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.78rem', marginTop: '1px' }}>
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
                  background: 'var(--color-surface-hover)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
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
                  background: isActive ? 'var(--color-text-primary)' : 'var(--color-surface)',
                  color: isActive ? 'var(--color-surface)' : 'var(--color-text-secondary)',
                  border: '1px solid',
                  borderColor: isActive ? 'var(--color-text-primary)' : 'var(--color-border)',
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
                    background: isActive ? 'var(--color-surface)' : 'var(--color-surface-hover)',
                    color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
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

        {/* Search Input & Layout Mode Switcher */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
            <input
              type="text"
              placeholder="Filter people by name, @username, birth date, relation, or lore..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                paddingLeft: '34px',
                height: '38px',
                fontSize: '0.82rem',
                width: '100%'
              }}
            />
          </div>

          {/* Layout Switcher Icons (Table / Grid / Dense) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            padding: '3px',
            borderRadius: '8px',
            flexShrink: 0
          }}>
            {[
              { id: 'table', label: 'Table', icon: TableIcon },
              { id: 'grid', label: 'Grid', icon: LayoutGrid },
              { id: 'dense', label: 'Dense', icon: AlignJustify }
            ].map(({ id, label, icon: Icon }) => {
              const isActive = layoutMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSetLayout(id)}
                  title={`${label} Layout View`}
                  style={{
                    background: isActive ? 'var(--color-text-primary)' : 'transparent',
                    color: isActive ? 'var(--color-surface)' : 'var(--color-text-secondary)',
                    border: 'none',
                    padding: '6px 11px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.74rem',
                    fontWeight: isActive ? '700' : '500',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Icon size={13} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ================= SHADCN LIGHT MONOCHROME TABLE ================= */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '10px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}
      >
        {/* 1. Table View */}
        {layoutMode === 'table' && (
          <div className="desktop-table-container">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '850px' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-elevated)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", width: '56px' }}>
                    PROFILE
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                    NAME
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                    USERNAME
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                    DATE OF BIRTH
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                    RELATION
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
                    CHATS
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
                    REELS
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: '0.7rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", textAlign: 'right' }}>
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody>
                {isSyncingInitial && pagedPeople.length === 0 ? (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={`skel-${idx}`} style={{ borderBottom: '1px solid var(--color-surface-hover)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div className="skeleton" style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div className="skeleton" style={{ width: '130px', height: '16px', marginBottom: '4px' }} />
                        <div className="skeleton" style={{ width: '60px', height: '11px' }} />
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div className="skeleton" style={{ width: '100px', height: '15px' }} />
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div className="skeleton" style={{ width: '85px', height: '15px' }} />
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div className="skeleton" style={{ width: '90px', height: '15px', marginBottom: '4px' }} />
                        <div className="skeleton" style={{ width: '70px', height: '11px' }} />
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div className="skeleton" style={{ width: '40px', height: '22px', margin: '0 auto' }} />
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div className="skeleton" style={{ width: '40px', height: '22px', margin: '0 auto' }} />
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div className="skeleton" style={{ width: '56px', height: '26px', marginLeft: 'auto' }} />
                      </td>
                    </tr>
                  ))
                ) : pagedPeople.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
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
                          borderBottom: '1px solid var(--color-surface-hover)',
                          cursor: 'pointer',
                          transition: 'background 0.1s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-elevated)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-surface)')}
                      >
                        {/* Column 1: PROFILE */}
                        <td style={{ padding: '10px 16px' }}>
                          <ContactAvatar contact={person} size={36} showStatus={true} />
                        </td>

                        {/* Column 2: NAME */}
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--color-text-primary)' }}>
                            {person.name}
                          </div>
                          {person.gender && person.gender !== 'unknown' && (
                            <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>
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
                                color: 'var(--color-text-primary)',
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
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text-secondary)',
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--color-text-primary)' }}>
                              <Calendar size={12} style={{ color: 'var(--color-text-secondary)' }} />
                              <span>{dobDisplay}</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>—</span>
                          )}
                        </td>

                        {/* Column 5: RELATION */}
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-primary)', fontWeight: '600' }}>
                              {person.relationship || person.relationshipToSam || 'Friend'}
                            </span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace" }}>
                              {person.category ? person.category.replace('_', ' ').toUpperCase() : 'ONLINE FRIEND'}
                            </span>
                          </div>
                        </td>

                        {/* Column 6: CHATS COUNT */}
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          <span style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.74rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', color: 'var(--color-text-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <MessageSquare size={11} style={{ color: 'var(--color-text-secondary)' }} />
                            <span>{chatsCount}</span>
                          </span>
                        </td>

                        {/* Column 7: REELS COUNT */}
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          <span style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.74rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', color: 'var(--color-text-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Film size={11} style={{ color: 'var(--color-text-secondary)' }} />
                            <span>{reelsCount}</span>
                          </span>
                        </td>

                        {/* Column 8: ACTION */}
                        <td style={{ padding: '10px 16px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                            <button
                              onClick={() => setSelectedPerson(person)}
                              style={{
                                background: 'var(--color-text-primary)',
                                color: 'var(--color-surface)',
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

                            <button
                              onClick={() => {
                                if (window.confirm(`Delete ${person.name} from Database?`)) {
                                  deleteNode(person);
                                }
                              }}
                              title="Delete Person"
                              style={{
                                background: 'transparent',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text-secondary)',
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
      )}

      {/* 2. Mobile Compact Table View (screens <= 768px when in table mode) */}
      {layoutMode === 'table' && (
        <div className="mobile-people-cards" style={{ padding: '12px' }}>
          {isSyncingInitial && pagedPeople.length === 0 ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={`m-skel-${idx}`}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '10px',
                  padding: '14px',
                  marginBottom: '10px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div className="skeleton" style={{ width: '42px', height: '42px', borderRadius: '50%' }} />
                  <div>
                    <div className="skeleton" style={{ width: '120px', height: '16px', marginBottom: '4px' }} />
                    <div className="skeleton" style={{ width: '80px', height: '12px' }} />
                  </div>
                </div>
                <div className="skeleton" style={{ width: '100%', height: '36px' }} />
              </div>
            ))
          ) : pagedPeople.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.85rem', background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)', borderRadius: '10px' }}>
              {filteredPeople.length === 0 ? 'No people found matching your filters.' : 'No results on this page.'}
            </div>
          ) : (
            pagedPeople.map((person) => {
              const hasHandle = Boolean(person.handle || person.instagramHandle);
              const handleDisplay = person.handle || person.instagramHandle;
              const dobDisplay = person.dob || person.importantDates?.[0]?.date || '';
              const chatsCount = person.chatsCount || person.messageCount || 0;
              const reelsCount = person.reelsCount || 0;
              const relDisplay = person.relationship || person.relationshipToSam || 'Friend';
              const catDisplay = person.category ? person.category.replace('_', ' ').toUpperCase() : 'ONLINE FRIEND';

              return (
                <div
                  key={person.id || person.senderId || person.name}
                  onClick={() => setSelectedPerson(person)}
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease'
                  }}
                >
                  {/* Card Top Row: Avatar + Name/Handle + Category badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                      <ContactAvatar contact={person} size={42} showStatus={true} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: '700', fontSize: '0.92rem', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {person.name}
                          </span>
                          {person.gender && person.gender !== 'unknown' && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', textTransform: 'capitalize', fontWeight: '500' }}>
                              ({person.gender})
                            </span>
                          )}
                        </div>

                        <div style={{ marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                          {hasHandle ? (
                            <span
                              onClick={() => setLinkingTargetPerson(person)}
                              style={{
                                fontSize: '0.74rem',
                                color: 'var(--color-text-secondary)',
                                fontFamily: "'JetBrains Mono', monospace",
                                fontWeight: '600',
                                cursor: 'pointer',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {handleDisplay}
                            </span>
                          ) : (
                            <button
                              onClick={() => setLinkingTargetPerson(person)}
                              style={{
                                background: 'var(--color-surface-hover)',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text-secondary)',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontSize: '0.65rem',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              + Link Handle
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Category Tag */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{
                        background: 'var(--color-surface-hover)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        padding: '3px 8px',
                        borderRadius: '5px',
                        fontSize: '0.66rem',
                        fontWeight: '700',
                        fontFamily: "'JetBrains Mono', monospace",
                        display: 'inline-block'
                      }}>
                        {catDisplay}
                      </span>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', fontWeight: '500', marginTop: '2px' }}>
                        {relDisplay}
                      </div>
                    </div>
                  </div>

                  {/* Card Middle Info Row: DOB + Chat counts + Reels */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--color-surface-hover)',
                    gap: '8px'
                  }}>
                    {/* Date of Birth */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.74rem', color: dobDisplay ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                      <Calendar size={13} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                      <span style={{ fontWeight: dobDisplay ? '600' : '400' }}>
                        {dobDisplay || 'No birthday set'}
                      </span>
                    </div>

                    {/* Interaction Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        background: 'var(--color-surface-elevated)',
                        border: '1px solid var(--color-border)',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: '700',
                        color: 'var(--color-text-primary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}>
                        <MessageSquare size={11} style={{ color: 'var(--color-text-secondary)' }} />
                        <span>{chatsCount}</span>
                      </span>

                      <span style={{
                        background: 'var(--color-surface-elevated)',
                        border: '1px solid var(--color-border)',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: '700',
                        color: 'var(--color-text-primary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}>
                        <Film size={11} style={{ color: 'var(--color-text-secondary)' }} />
                        <span>{reelsCount}</span>
                      </span>
                    </div>
                  </div>

                  {/* Card Bottom Row: Action Buttons */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '4px',
                      gap: '8px'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setSelectedPerson(person)}
                      style={{
                        flex: 1,
                        background: 'var(--color-text-primary)',
                        color: 'var(--color-surface)',
                        border: 'none',
                        padding: '7px 12px',
                        borderRadius: '6px',
                        fontSize: '0.76rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px'
                      }}
                    >
                      <span>Open Details</span>
                      <ArrowRight size={12} />
                    </button>

                    <button
                      onClick={() => {
                        if (window.confirm(`Delete ${person.name} from Database?`)) {
                          deleteNode(person);
                        }
                      }}
                      title="Delete Person"
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-secondary)',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 3. Grid Cards View */}
      {layoutMode === 'grid' && (
        <motion.div
          key="view-grid"
          layout
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '14px',
            padding: '16px'
          }}
        >
          {pagedPeople.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
              {filteredPeople.length === 0 ? 'No people found matching your filters.' : 'No results on this page.'}
            </div>
          ) : (
            pagedPeople.map((person) => {
              const hasHandle = Boolean(person.handle || person.instagramHandle);
              const handleDisplay = person.handle || person.instagramHandle;
              const dobDisplay = person.dob || person.importantDates?.[0]?.date || '';
              const chatsCount = person.chatsCount || person.messageCount || 0;
              const reelsCount = person.reelsCount || 0;
              const relDisplay = person.relationship || person.relationshipToSam || 'Friend';

              return (
                <motion.div
                  key={person.id || person.senderId || person.name}
                  layout
                  whileHover={{ y: -2, boxShadow: '0 6px 16px rgba(0,0,0,0.06)' }}
                  onClick={() => setSelectedPerson(person)}
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <ContactAvatar contact={person} size={42} showStatus={true} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: '700', fontSize: '0.92rem', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {person.name}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {handleDisplay || 'No handle linked'}
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.66rem', background: 'var(--color-surface-hover)', padding: '2px 7px', borderRadius: '4px', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace", border: '1px solid var(--color-border)' }}>
                      {relDisplay}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--color-text-secondary)', paddingTop: '8px', borderTop: '1px solid var(--color-surface-hover)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={12} />
                      <span>{dobDisplay || 'Birthday not set'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{chatsCount} chats</span>
                      <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{reelsCount} reels</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', paddingTop: '4px' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setSelectedPerson(person)}
                      style={{
                        flex: 1,
                        background: 'var(--color-text-primary)',
                        color: 'var(--color-surface)',
                        border: 'none',
                        padding: '7px 12px',
                        borderRadius: '6px',
                        fontSize: '0.76rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px'
                      }}
                    >
                      <span>Open Details</span>
                      <ArrowRight size={12} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete ${person.name} from Database?`)) {
                          deleteNode(person);
                        }
                      }}
                      title="Delete Person"
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-secondary)',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </motion.div>
              );
            })
          )}
        </motion.div>
      )}

      {/* 4. Dense Minimal Row View */}
      {layoutMode === 'dense' && (
        <motion.div
          key="view-dense"
          layout
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          style={{
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}
        >
          {pagedPeople.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
              {filteredPeople.length === 0 ? 'No people found matching your filters.' : 'No results on this page.'}
            </div>
          ) : (
            pagedPeople.map((person) => {
              const hasHandle = Boolean(person.handle || person.instagramHandle);
              const handleDisplay = person.handle || person.instagramHandle;
              const chatsCount = person.chatsCount || person.messageCount || 0;
              const reelsCount = person.reelsCount || 0;
              const relDisplay = person.relationship || person.relationshipToSam || 'Friend';

              return (
                <motion.div
                  key={person.id || person.senderId || person.name}
                  layout
                  onClick={() => setSelectedPerson(person)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-surface-hover)',
                    cursor: 'pointer',
                    gap: '12px',
                    transition: 'background-color 0.1s ease, border-color 0.1s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-surface-elevated)';
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-surface)';
                    e.currentTarget.style.borderColor = 'var(--color-surface-hover)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                    <ContactAvatar contact={person} size={28} showStatus={true} />
                    <span style={{ fontWeight: '700', fontSize: '0.86rem', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {person.name}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {handleDisplay || '—'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.68rem', background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>
                      {relDisplay}
                    </span>
                    <span style={{ fontSize: '0.72rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', color: 'var(--color-text-secondary)' }}>
                      {chatsCount} chats
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPerson(person);
                      }}
                      style={{
                        background: 'var(--color-text-primary)',
                        color: 'var(--color-surface)',
                        border: 'none',
                        padding: '4px 9px',
                        borderRadius: '5px',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Open →
                    </button>
                  </div>
                </motion.div>
              );
            })
          )}
        </motion.div>
      )}

        {/* Table Pagination */}
        {totalTablePages > 1 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface-elevated)',
            borderBottomLeftRadius: '10px',
            borderBottomRightRadius: '10px'
          }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace" }}>
              {filteredPeople.length} people &nbsp;·&nbsp; Page {tablePage} of {totalTablePages}
            </span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                onClick={() => setTablePage(p => Math.max(1, p - 1))}
                disabled={tablePage === 1}
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '5px 12px', fontSize: '0.78rem', fontWeight: '600', cursor: tablePage === 1 ? 'not-allowed' : 'pointer', opacity: tablePage === 1 ? 0.4 : 1 }}
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
                    <span key={`ellipsis-${i}`} style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', padding: '0 4px' }}>…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setTablePage(p)}
                      style={{
                        background: tablePage === p ? 'var(--color-text-primary)' : 'var(--color-surface)',
                        color: tablePage === p ? 'var(--color-surface)' : 'var(--color-text-primary)',
                        border: '1px solid ' + (tablePage === p ? 'var(--color-text-primary)' : 'var(--color-border)'),
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
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '5px 12px', fontSize: '0.78rem', fontWeight: '600', cursor: tablePage === totalTablePages ? 'not-allowed' : 'pointer', opacity: tablePage === totalTablePages ? 0.4 : 1 }}
              >Next →</button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// The superadmin check lives outside the page so the page's hooks always run in the same order
export default function RelationshipsPage() {
  const { user, isImpersonating } = useApp();
  if (user?.role === 'superadmin' && !isImpersonating) {
    return (
      <SuperadminWorkspacePrompt
        sectionTitle="Creator People Directory"
        sectionCode="02 // RELATIONSHIPS"
        sectionDescription="People directories, relationship tags, and contact memory belong to individual creator workspaces. Choose a creator workspace below to inspect and manage their contact directory."
      />
    );
  }
  return <RelationshipsPageContent />;
}
