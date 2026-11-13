'use client';

import React, { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../context/DialogContext';
import {
  Search, Sparkles, Filter, Link2, AlertCircle, ArrowLeft, ArrowRight,
  Trash2, Calendar, Bot, Film, Pause, Check, Save, User,
  Plus, RefreshCw, MessageSquare, Shield, X, Users,
  LayoutGrid, List, AlignJustify, Table as TableIcon, Cake, Pencil,
  ChevronLeft, MoreHorizontal
} from 'lucide-react';
import SuperadminWorkspacePrompt from '../components/SuperadminWorkspacePrompt';
import { isAiOnFor } from '../lib/aiReply';
import ContactAvatar from '../components/ContactAvatar';
import CountUp from '../components/CountUp';
import { useAmbientImage, prefetchAmbientImages } from '../components/AmbientBackground';
import UnsplashBanner from '../components/UnsplashBanner';
import PageHero from '../components/PageHero';
import '../split.css';
import { useBanner, bannerSrc } from '../lib/banners';
import { personArtUrl, savedPhotoUrl } from '../lib/utils';
import PageSkeleton, { Sk } from '../components/Skeletons';

// Before paint on the client (no flash of the directory when deep-linking to a person)
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
import { enterMotion, swapMotion } from '../lib/motion';
import { SegIndicator } from '../components/ui/motion';
import { useHeroCollapse, useRevealOnce } from '../lib/scrollMotion';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Person page: built-in greeting chips, labels for the Details grid, and the People-in-their-life groups
const DEFAULT_GREETINGS = ['hey', 'heyy', 'oyy', 'hii', 'yo'];
const CATEGORY_LABELS = {
  close_friend: 'Close friend',
  online_friend: 'Online friend',
  offline_friend: 'Offline friend',
  family: 'Family',
  professional: 'Professional / creator',
  business: 'Business / client',
};
const GENDER_LABELS = { female: 'Female', male: 'Male', neutral: 'Neutral', unknown: 'Not set' };
const PEOPLE_GROUPS = [
  { id: 'friends', label: 'Friends', rel: 'friend' },
  { id: 'family', label: 'Family', rel: 'family' },
  { id: 'mentioned', label: 'Mentioned', rel: 'mentioned' },
];
const FAMILY_REL = /\b(sis|sister|brother|mom|mum|mother|amma|dad|father|appa|parent|cousin|aunt|aunty|uncle|grand\w*|niece|nephew|family|relative|wife|husband|son|daughter|in-law)\b/i;
function connectionGroup(c) {
  const rel = String(c?.rel || c?.relationship || '').trim();
  if (!rel || /^(connected|mentioned|unknown)$/i.test(rel)) return 'mentioned';
  return FAMILY_REL.test(rel) ? 'family' : 'friends';
}
function connectionLabel(c) {
  const rel = String(c?.rel || c?.relationship || '').trim();
  if (!rel || /^(connected|unknown)$/i.test(rel)) return 'Mentioned';
  return rel.charAt(0).toUpperCase() + rel.slice(1);
}

// Drop broken years (e.g. "0002" from a half-typed date picker) so only day + month show
function cleanDob(dob) {
  if (!dob) return "";
  return String(dob).replace(/^0\d{3}-/, "").replace(/,?\s*0\d{3}\b/, "").trim();
}

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
    isImpersonating,
    routingConfig
  } = useApp();
  const confirm = useConfirm();
  const confirmDelete = (name, extra = 'Their contact and saved profile will be removed.') =>
    confirm({ title: `Delete ${name}?`, message: extra, confirmLabel: 'Delete', tone: 'danger' });


  // Navigation State: null = Directory Table view; Object = Full Inner Person Page
  const [selectedPerson, setSelectedPerson] = useState(null);

  // Deep link from Home: /relationships?person=<node id> opens that person's page once people load
  const deepLinkDoneRef = useRef(false);
  // True while a linked person is still on its way from the first sync: show their page skeleton
  const [deepLinkPending, setDeepLinkPending] = useState(false);
  useIsoLayoutEffect(() => {
    if (deepLinkDoneRef.current || typeof window === 'undefined') return;
    const wanted = new URLSearchParams(window.location.search).get('person');
    if (!wanted) { deepLinkDoneRef.current = true; return; }
    const match = (nodes || []).find(n => !n.isRoot && (n.id === wanted || n._id === wanted || n.senderId === wanted));
    if (match) {
      deepLinkDoneRef.current = true;
      setDeepLinkPending(false);
      setSelectedPerson(match);
    } else {
      setDeepLinkPending(Boolean(isSyncingInitial));
    }
  }, [nodes, isSyncingInitial]);

  // Filters State
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');

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
    greetingOptions: [],
    avoidWords: [],
    chatsCount: 0,
    reelsCount: 0
  });

  // Person page UI (one scrolling page, no tabs)
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [saveState, setSaveState] = useState('saved'); // saved | pending | saving | error
  const [saveTick, setSaveTick] = useState(0);
  const autosaveTimer = useRef(null);
  const [factSearch, setFactSearch] = useState('');
  const [peopleSearch, setPeopleSearch] = useState('');
  const [peopleTab, setPeopleTab] = useState('friends');
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [newGreeting, setNewGreeting] = useState('');
  const [newAvoidWord, setNewAvoidWord] = useState('');
  const [isAddingAvoid, setIsAddingAvoid] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [editDraft, setEditDraft] = useState({ value: '', month: '', day: '', year: '' });
  const [dmPreview, setDmPreview] = useState({ loading: false, messages: [] });

  const [isAutofilling, setIsAutofilling] = useState(false);
  const [isLearning, setIsLearning] = useState(false);
  const [newFactInput, setNewFactInput] = useState('');
  const [newConnTarget, setNewConnTarget] = useState('');
  const [newConnRel, setNewConnRel] = useState('');

  // Pagination state — table
  // Table view fits as many rows as the panel height allows (no empty space under the table)
  const [fitPageSize, setFitPageSize] = useState(10);
  const [tablePage, setTablePage] = useState(1);
  const tableScrollRef = useRef(null);

  // Layout switcher state: 'table' | 'grid' | 'dense'
  const [layoutMode, setLayoutMode] = useState(() => {
    if (typeof window === 'undefined') return 'grid';
    try {
      return localStorage.getItem('chatter_people_layout') || 'grid';
    } catch {
      return 'grid';
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
  // Which person the raw-chat tool is open for: a slow result for someone else is dropped
  const rawChatPersonRef = useRef('');
  const [knowBirthYear, setKnowBirthYear] = useState(true);
  const [dobFocused, setDobFocused] = useState(false);
  // Last server values shown in the form; a field that still equals this is not being edited
  const serverSnapshot = useRef({});

  // Initialize form data ONLY when switching to a different person (not on every node poll)
  // This prevents typing from being reset by the 4s background sync
  useEffect(() => {
    if (selectedPerson) {
      const currentDob = selectedPerson.dob || (selectedPerson.importantDates || []).find(d => /birth|bday/i.test(d?.title || ''))?.date || '';
      const hasYear = /\b(19|20)\d{2}\b/.test(currentDob);
      setKnowBirthYear(currentDob ? hasYear : true);
      serverSnapshot.current = {
        name: selectedPerson.name || '',
        dob: currentDob,
        gender: selectedPerson.gender || 'unknown',
        personalNotes: selectedPerson.personalNotes || (selectedPerson.lore || []).join('\n'),
      };

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
        greetingOptions: Array.isArray(selectedPerson.greetingOptions) ? selectedPerson.greetingOptions : [],
        avoidWords: Array.isArray(selectedPerson.avoidWords) ? selectedPerson.avoidWords : [],
        chatsCount: selectedPerson.chatsCount ?? selectedPerson.messageCount ?? 0,
        reelsCount: selectedPerson.reelsCount ?? 0
      });
      // Open on the first group that has anyone in it
      const groups = (selectedPerson.connections || []).map(connectionGroup);
      setPeopleTab(PEOPLE_GROUPS.find(g => groups.includes(g.id))?.id || 'friends');
      setFactSearch('');
      setPeopleSearch('');
      setShowAllPeople(false);
      setIsAddingPerson(false);
      setIsAddingAvoid(false);
      setEditingField(null);
      setIsMenuOpen(false);
      setSaveState('saved');
    }
    // A different person: drop any half-finished raw chat extraction (and close its window)
    rawChatPersonRef.current = selectedPerson?.id || '';
    setExtractedData(null);
    setRawChatText('');
    setUserClarification('');
    setIsRawChatModalOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPerson?.id]);

  // Live profile: the open person follows the 8s background sync, so a name, birthday, age or
  // fact learned from DMs shows up without leaving the page. Fields you are editing are kept.
  useEffect(() => {
    if (!selectedPerson) return;
    // A rename gives the saved node a new id (made from the name), so also match by sender id or name
    const fresh = nodes.find(n => !n.isRoot && n.id === selectedPerson.id)
      || nodes.find(n => !n.isRoot && selectedPerson.senderId && n.senderId === selectedPerson.senderId)
      || nodes.find(n => !n.isRoot && (n.name || '').toLowerCase() === (selectedPerson.name || '').toLowerCase());
    if (!fresh) return;
    const watched = ['name', 'dob', 'age', 'gender', 'personalNotes', 'facts', 'lore', 'chatsCount', 'reelsCount', 'messageCount', 'handle', 'profilePic', 'aiEnabled', 'replyToMessages'];
    if (!watched.some(k => JSON.stringify(fresh[k] ?? null) !== JSON.stringify(selectedPerson[k] ?? null))) return;

    // Keep the open id so the person-switch effect (keyed on id) does not reset the page
    setSelectedPerson(prev => (prev && prev.id === selectedPerson.id ? { ...prev, ...fresh, id: prev.id } : prev));
    const snap = serverSnapshot.current;
    const incoming = {
      name: fresh.name || '',
      dob: fresh.dob || '',
      gender: fresh.gender || 'unknown',
      personalNotes: fresh.personalNotes || (fresh.lore || []).join('\n'),
    };
    const changed = Object.keys(incoming)
      .filter(field => incoming[field] !== snap[field])
      .map(field => ({ field, oldValue: snap[field], value: incoming[field] }));
    changed.forEach(({ field, value }) => { snap[field] = value; });
    setFormData(prev => {
      const next = { ...prev, chatsCount: fresh.chatsCount ?? prev.chatsCount, reelsCount: fresh.reelsCount ?? prev.reelsCount };
      for (const { field, oldValue, value } of changed) {
        if (prev[field] === oldValue || !prev[field]) next[field] = value;
      }
      return next;
    });
    const dobChange = changed.find(c => c.field === 'dob');
    if (dobChange?.value) setKnowBirthYear(/\b(19|20)\d{2}\b/.test(dobChange.value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

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
      if (isAiOnFor(n, routingConfig)) activeAi++;
    });

    return { totalPeople, totalDMs, totalReels, activeAi };
  }, [nodes, routingConfig]);

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
    const timeOf = n => new Date(n.lastInteraction || n.updatedAt || n.createdAt || 0).getTime() || 0;
    const sorters = {
      newest: (a, b) => timeOf(b) - timeOf(a),
      oldest: (a, b) => timeOf(a) - timeOf(b),
      most: (a, b) => (b.chatsCount || b.messageCount || 0) - (a.chatsCount || a.messageCount || 0),
      az: (a, b) => (a.name || '').localeCompare(b.name || ''),
    };
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
    }).sort(sorters[sortOrder] || sorters.newest);
  }, [nodes, activeCategory, searchQuery, sortOrder]);

  // Reset table page when filter/search/sort changes
  useEffect(() => { setTablePage(1); }, [activeCategory, searchQuery, sortOrder]);
  // Reset facts page when selected person changes
  useEffect(() => { setFactsPage(1); }, [selectedPerson?.id]);

  // Paginated slices
  const TABLE_PAGE_SIZE = layoutMode === 'table' ? fitPageSize : 10;
  const totalTablePages = Math.max(1, Math.ceil(filteredPeople.length / TABLE_PAGE_SIZE));
  const pagedPeople = filteredPeople.slice((tablePage - 1) * TABLE_PAGE_SIZE, tablePage * TABLE_PAGE_SIZE);

  // Work out how many table rows fit in the panel, so the table fills it with no empty gap
  useLayoutEffect(() => {
    const el = tableScrollRef.current;
    if (!el || layoutMode !== 'table') return;
    const measure = () => {
      // Only on desktop, where the panel has a fixed height and scrolls inside
      if (getComputedStyle(el).overflowY !== 'auto') { setFitPageSize(10); return; }
      const results = el.querySelector('.people-results');
      const tbody = el.querySelector('.spx-table tbody');
      const row = tbody?.querySelector('tr');
      if (!results || !tbody || !row) return;
      const rowH = row.getBoundingClientRect().height;
      if (!rowH) return;
      const pager = el.querySelector('.people-pager');
      const pagerH = pager ? 0 : 58; // room for the pager when it is not shown yet
      const cs = getComputedStyle(el);
      const fixed = results.getBoundingClientRect().height - tbody.getBoundingClientRect().height
        + parseFloat(getComputedStyle(results).marginTop || 0)
        + parseFloat(cs.paddingTop || 0) + parseFloat(cs.paddingBottom || 0) + pagerH;
      const n = Math.max(5, Math.floor((el.clientHeight - fixed) / rowH));
      setFitPageSize(prev => (prev === n ? prev : n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layoutMode, pagedPeople.length, isSyncingInitial]);

  // Keep the current page valid when the page size changes
  useEffect(() => {
    if (tablePage > totalTablePages) setTablePage(totalTablePages);
  }, [tablePage, totalTablePages]);


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
    if (selectedPerson.aiEnabled === false || selectedPerson.replyToMessages === false) return 'paused';
    return 'full_ai';
  }, [selectedPerson]);

  // Set AI mode with instant state reflection
  const handleSetAiMode = async (mode) => {
    if (!selectedPerson) return;
    const targetKey = selectedPerson.senderId || selectedPerson.id || selectedPerson.name;
    const isPaused = mode === 'paused';
    const isFullAi = mode === 'full_ai';
    const prev = selectedPerson;

    setSelectedPerson(p => ({
      ...p,
      aiEnabled: !isPaused,
      replyToMessages: isFullAi,
      replyToReelsAndPosts: false
    }));

    try {
      // silent: errors are thrown back here so the switch can be put back
      await updateContactPreferences(targetKey, { aiMode: mode }, { silent: true });
      showToast(isPaused ? `Stopped AI for ${prev.name}. Manual chat active!` : `Full AI auto-reply enabled for ${prev.name}!`);
    } catch (e) {
      setSelectedPerson(p => (p && p.id === prev.id ? { ...p, aiEnabled: prev.aiEnabled, replyToMessages: prev.replyToMessages, replyToReelsAndPosts: prev.replyToReelsAndPosts } : p));
      showToast(`Could not update ${prev.name}: ${e.message}`, 'error');
    }
  };

  // Save changes from inner page
  const handleSaveInnerForm = async (e, { quiet = false } = {}) => {
    e?.preventDefault?.();
    if (!formData.name.trim()) {
      setSaveState('error');
      showToast('Name cannot be empty');
      return;
    }

    const newName = formData.name.trim();
    const oldName = (selectedPerson?.name || '').trim();
    const isRenamed = oldName && oldName.toLowerCase() !== newName.toLowerCase();
    const cleanHandle = formData.handle.trim() ? (formData.handle.startsWith('@') ? formData.handle.trim() : `@${formData.handle.trim()}`) : '';

    const formFields = {
      name: newName,
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
      greetingOptions: formData.greetingOptions || [],
      avoidWords: formData.avoidWords || [],
      chatsCount: parseInt(formData.chatsCount, 10) || 0,
      reelsCount: parseInt(formData.reelsCount, 10) || 0,
      messageCount: parseInt(formData.chatsCount, 10) || 0
    };
    const updated = { ...selectedPerson, ...formFields, oldName: isRenamed ? oldName : undefined };

    setSaveState('saving');
    const ok = await saveNode(updated, isRenamed ? [oldName] : [], { quiet: true });
    // Only the saved form fields, and only if this person is still open (never reopen someone you left)
    setSelectedPerson(prev => (prev && prev.id === updated.id ? { ...prev, ...formFields } : prev));
    // A newer edit waiting in the autosave timer keeps the label on "Unsaved changes"
    if (!autosaveTimer.current) setSaveState(ok === false ? 'error' : 'saved');
    if (!quiet && ok !== false) showToast(`Saved details for ${updated.name}`);
  };

  // Every change on the person page saves itself (short wait so a dragged slider saves once)
  const editProfile = (patch, delay = 700) => {
    setFormData(prev => ({ ...prev, ...patch }));
    setSaveState('pending');
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      setSaveTick(t => t + 1);
    }, delay);
  };

  useEffect(() => {
    if (!saveTick || !selectedPerson) return;
    handleSaveInnerForm(null, { quiet: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveTick]);

  // Save a waiting change before leaving the page or opening someone else
  const flushAutosave = async () => {
    if (!autosaveTimer.current) return;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = null;
    await handleSaveInnerForm(null, { quiet: true });
  };
  const leavePerson = async () => {
    await flushAutosave();
    setSelectedPerson(null);
  };
  const openPerson = async (node) => {
    await flushAutosave();
    setSelectedPerson(node);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  };

  // Leaving the page with a save still waiting: save it now instead of dropping it
  const saveInnerFormRef = useRef(handleSaveInnerForm);
  saveInnerFormRef.current = handleSaveInnerForm;
  useEffect(() => () => {
    if (!autosaveTimer.current) return;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = null;
    saveInnerFormRef.current(null, { quiet: true });
  }, []);

  // The ... menu closes on an outside click, Escape or scroll (the hero fades its top bar
  // while scrolling, which would leave an open menu half see-through)
  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setIsMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setIsMenuOpen(false); };
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) setIsMenuOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [isMenuOpen]);

  const handleAddGreeting = (e) => {
    e.preventDefault();
    const g = newGreeting.trim();
    if (!g) return;
    const known = [...DEFAULT_GREETINGS, ...(formData.greetingOptions || [])].find(x => x.toLowerCase() === g.toLowerCase());
    editProfile({
      greetingStyle: known || g,
      ...(known ? {} : { greetingOptions: [...(formData.greetingOptions || []), g].slice(-20) }),
    }, 0);
    setNewGreeting('');
  };

  const handleAddAvoidWord = (e) => {
    e.preventDefault();
    const current = formData.avoidWords || [];
    const words = newAvoidWord.split(',').map(w => w.trim()).filter(Boolean)
      .filter((w, i, arr) => arr.findIndex(x => x.toLowerCase() === w.toLowerCase()) === i)
      .filter(w => !current.some(x => x.toLowerCase() === w.toLowerCase()));
    if (words.length) editProfile({ avoidWords: [...current, ...words].slice(0, 30) }, 0);
    setNewAvoidWord('');
    setIsAddingAvoid(false);
  };

  const startEditDetail = (key) => {
    if (key === 'dob') {
      const dob = formData.dob || '';
      const iso = formatDobForInput(dob);
      let month = '';
      let day = '';
      let year = '';
      if (iso) {
        const [y, m, d] = iso.split('-');
        month = MONTH_NAMES[parseInt(m, 10) - 1] || '';
        day = String(parseInt(d, 10));
        // Browsers invent a year (2001) for "May 30": keep a year only when the saved date has one
        year = /\b(19|20)\d{2}\b/.test(dob) && parseInt(y, 10) >= 1900 ? y : '';
      } else if (dob) {
        month = MONTH_NAMES.find(m => dob.toLowerCase().includes(m.slice(0, 3).toLowerCase())) || '';
        day = (dob.match(/\b([1-9]|[12]\d|3[01])\b/) || [])[0] || '';
      }
      setEditDraft({ value: '', month, day, year });
    } else {
      setEditDraft({ value: formData[key] ?? '', month: '', day: '', year: '' });
    }
    setEditingField(key);
  };

  const saveDetail = (e) => {
    e?.preventDefault();
    const key = editingField;
    if (!key) return;
    if (key === 'dob') {
      const { month, day, year } = editDraft;
      if (!month || !day) { showToast('Pick a month and a day'); return; }
      if (year && !/^(19|20)\d{2}$/.test(year)) { showToast('Year should look like 2002, or leave it empty'); return; }
      editProfile({ dob: year ? `${month} ${day}, ${year}` : `${month} ${day}` }, 0);
    } else if (key === 'name') {
      if (!String(editDraft.value).trim()) { showToast('Name cannot be empty'); return; }
      editProfile({ name: String(editDraft.value).trim() }, 0);
    } else {
      editProfile({ [key]: typeof editDraft.value === 'string' ? editDraft.value.trim() : editDraft.value }, 0);
    }
    setEditingField(null);
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
          autofill.facts.forEach(f => addFact(selectedPerson.name, f));
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
    const startedFor = selectedPerson?.id || '';
    try {
      const extraction = await extractFromRawChat(rawChatText, selectedPerson, userClarification);
      if (rawChatPersonRef.current !== startedFor) return;
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
      const startedFor = selectedPerson?.id || '';
      const res = await fetch(`${API_BASE}/api/conversations/${selectedPerson.senderId}/messages`);
      const data = await res.json();
      if (rawChatPersonRef.current !== startedFor) return;
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
    let mergedNotes = currentNotes ? `${currentNotes}\n${newNotes}` : newNotes;
    // Facts go into the notes too: autosave turns note lines into lore, which the profile reads back
    const newFacts = (Array.isArray(extractedData.facts) ? extractedData.facts : [])
      .map(f => String(f || '').trim()).filter(Boolean);
    newFacts.forEach(f => {
      if (!mergedNotes.split('\n').some(l => l.trim().replace(/^[•\-\*]\s*/, '') === f)) {
        mergedNotes = mergedNotes ? `${mergedNotes}\n• ${f}` : `• ${f}`;
      }
    });

    // Add connections if extracted (saved together with the rest by autosave)
    if (Array.isArray(extractedData.connections) && selectedPerson) {
      const currentConns = selectedPerson.connections || [];
      const newConns = [...currentConns];
      extractedData.connections.forEach(c => {
        const target = (c?.targetName || '').trim().toLowerCase();
        if (!target) return;
        if (!newConns.some(nc => (nc.targetName || '').toLowerCase() === target)) {
          newConns.push(c);
        }
      });
      setSelectedPerson(prev => (prev && prev.id === selectedPerson.id ? { ...prev, connections: newConns } : prev));
      saveNode({ ...selectedPerson, connections: newConns }, [], { quiet: true });
    }

    editProfile({
      name: extractedData.name || formData.name,
      handle: extractedData.handle || formData.handle,
      dob: extractedData.dob || formData.dob,
      gender: extractedData.gender || formData.gender,
      category: extractedData.category || formData.category,
      relationship: extractedData.relationshipToSam || formData.relationship,
      personalNotes: mergedNotes,
      roastStyle: extractedData.banterStyle || formData.roastStyle
    });

    // Add facts if extracted
    if (selectedPerson) {
      newFacts.forEach(f => {
        addFact(selectedPerson.name, f);
      });
    }

    setIsRawChatModalOpen(false);
    setExtractedData(null);
    setRawChatText('');
    setUserClarification('');
    showToast('AI filled in the profile from the chat. Changes save automatically.');
  };

  // Add custom fact to memory and synchronize with personalNotes
  const handleAddFact = (e) => {
    e?.preventDefault();
    if (!newFactInput.trim() || !selectedPerson) return;
    const factText = newFactInput.trim();
    addFact(selectedPerson.name, factText);

    // Link: also append to personalNotes (autosave turns note lines into lore, so it is kept)
    editProfile({
      personalNotes: formData.personalNotes ? `${formData.personalNotes}\n• ${factText}` : `• ${factText}`
    });

    setNewFactInput('');
    showToast('Fact added & linked to personal lore');
  };

  // Remove custom fact from memory and update node
  const handleRemoveFact = async (factToRemove) => {
    if (!selectedPerson) return;
    // facts and lore are separate lists (lore also holds lines from personal notes):
    // remove only this fact from each, never replace lore with the facts list
    // Also drop its line from the notes, or autosave rebuilds lore from them and the fact comes back
    const stripFact = (notes) => String(notes || '').split('\n')
      .filter(l => l.trim().replace(/^[•\-\*]\s*/, '') !== String(factToRemove).trim()).join('\n');
    const updated = {
      ...selectedPerson,
      facts: (selectedPerson.facts || selectedPerson.lore || []).filter(f => f !== factToRemove),
      lore: (selectedPerson.lore || []).filter(l => l !== factToRemove),
      personalNotes: stripFact(selectedPerson.personalNotes)
    };
    const original = selectedPerson;
    setFormData(prev => ({ ...prev, personalNotes: stripFact(prev.personalNotes) }));
    serverSnapshot.current.personalNotes = stripFact(serverSnapshot.current.personalNotes);
    await saveNode(updated);
    setSelectedPerson(prev => (prev && prev.id === updated.id ? { ...prev, facts: updated.facts, lore: updated.lore, personalNotes: updated.personalNotes } : prev));

    if (selectedPerson.senderId) {
      try {
        const res = await fetch(`${API_BASE}/api/conversations/${selectedPerson.senderId}/facts`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fact: factToRemove })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `server answered ${res.status}`);
        }
      } catch (e) {
        // The AI memory still has the fact: put it back on the profile too
        setSelectedPerson(original);
        await saveNode(original);
        showToast(`Could not remove the fact: ${e.message}`, 'error');
        return;
      }
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
      rel: newConnRel.trim() || PEOPLE_GROUPS.find(g => g.id === peopleTab)?.rel || 'friend'
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
    setIsAddingPerson(false);
    setPeopleTab(connectionGroup(newConn));
    showToast(`Connected ${selectedPerson.name} with ${newConn.targetName}`);
  };

  const handleRemoveConnection = async (index) => {
    if (!selectedPerson) return;
    const updated = { ...selectedPerson, connections: (selectedPerson.connections || []).filter((_, i) => i !== index) };
    setSelectedPerson(updated);
    await saveNode(updated, [], { quiet: true });
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

  // Work out every contact's colours in the background as soon as the list loads,
  // so opening a person tints the page on the first frame (no wait).
  useEffect(() => {
    prefetchAmbientImages((nodes || []).filter(n => !n.isRoot).map(savedPhotoUrl));
  }, [nodes]);

  // Tint the whole screen from the open contact's photo (Apple Music style, PLAN.md §15.3)
  // No photo: the contact's Unsplash banner gives the colours instead of a plain green wash
  const personArt = personArtUrl(selectedPerson);
  // People list: the page's own cover photo (PageCover seed "page-people") gives the colours
  const personBanner = useBanner(selectedPerson ? (selectedPerson.name || selectedPerson.id) : 'page-people');
  useAmbientImage(personArt || bannerSrc(personBanner, 400), { strong: Boolean(selectedPerson) });

  const birthday = useMemo(() => getNextBirthday(formData.dob), [formData.dob]);
  const lastMessage = dmPreview.messages[dmPreview.messages.length - 1];
  const lastContactLabel = formatLastContact(
    lastMessage?.timestamp || lastMessage?.createdAt || selectedPerson?.lastInteraction || selectedPerson?.updatedAt
  );

  // Scroll motion: the hero shrinks into a sticky band; sections rise in once (lib/scrollMotion.js)
  const pageRef = useRef(null);
  const motionView = selectedPerson
    ? `person:${selectedPerson.id || selectedPerson.senderId || selectedPerson.name}`
    : deepLinkPending ? 'loading' : `people:${unlinkedFriends.length > 0}`;
  useHeroCollapse(
    pageRef,
    selectedPerson
      ? { hero: '.person-hero', media: '.person-hero-avatar', title: '.person-name', fade: '.person-handle, .person-stats, .person-hero-actions, .person-save-state', pin: '.person-back', pinEnd: '.person-menu-wrap' }
      : { hero: '.spx-hero', media: '.spx-cover', title: '.spx-title', fade: '.spx-eyebrow, .spx-desc, .spx-meta', stack: '.people-filters' },
    [motionView]
  );
  useRevealOnce(
    pageRef,
    selectedPerson ? [{ sel: '.person-ai-bar' }] : [{ sel: '.spx-stats', children: true }, { sel: '.people-results' }],
    [motionView]
  );

  // =========================================================================
  // VIEW 1: FULL INNER PERSON PAGE (When a person is clicked/opened)
  // =========================================================================
  if (!selectedPerson && deepLinkPending) {
    return <PageSkeleton variant="person" label="Opening profile" />;
  }

  if (selectedPerson) {
    const isPaused = currentAiMode === 'paused';
    const isFullAi = currentAiMode === 'full_ai';

    const personName = formData.name || selectedPerson.name;
    const pron = formData.gender === 'female' ? 'her' : formData.gender === 'male' ? 'him' : 'them';
    const pronPos = formData.gender === 'female' ? 'her' : formData.gender === 'male' ? 'his' : 'their';
    const toneValue = Number(formData.roastiness) || 0;
    const toneName = toneValue >= 67 ? 'Savage' : toneValue >= 34 ? 'Playful' : 'Sweet';
    const activeGreeting = formData.greetingStyle.trim();
    const greetingChoices = [...new Set([...DEFAULT_GREETINGS, ...(formData.greetingOptions || []), ...(activeGreeting ? [activeGreeting] : [])])];
    const sampleOpen = activeGreeting || 'heyy';
    const sampleReply = toneName === 'Savage'
      ? `${sampleOpen} so impatient, fine I'm here`
      : toneName === 'Playful'
        ? `${sampleOpen} relax relax, I'm here now`
        : `${sampleOpen} sorry sorry, I'm here now`;
    const allFacts = selectedPerson.facts || selectedPerson.lore || [];
    const factQuery = factSearch.trim().toLowerCase();
    const shownFacts = factQuery ? allFacts.filter(f => String(f).toLowerCase().includes(factQuery)) : allFacts;
    const connections = selectedPerson.connections || [];
    const groupCounts = connections.reduce((acc, c) => { acc[connectionGroup(c)] += 1; return acc; }, { friends: 0, family: 0, mentioned: 0 });
    const peopleQuery = peopleSearch.trim().toLowerCase();
    const groupPeople = connections
      .map((c, index) => ({ ...c, index }))
      .filter(c => connectionGroup(c) === peopleTab)
      .filter(c => !peopleQuery || (c.targetName || '').toLowerCase().includes(peopleQuery) || connectionLabel(c).toLowerCase().includes(peopleQuery));
    const visiblePeople = showAllPeople ? groupPeople : groupPeople.slice(0, 8);
    const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'pending' ? 'Unsaved changes' : saveState === 'error' ? 'Not saved' : 'All changes saved';
    const birthdayLabel = formData.dob
      ? (birthday ? `${birthday.label}${birthday.days === 0 ? ' · today' : ` · in ${birthday.days} day${birthday.days === 1 ? '' : 's'}`}` : formData.dob)
      : 'Not set';
    const detailRows = [
      { key: 'name', label: 'Name', value: personName },
      { key: 'handle', label: 'Instagram', value: formData.handle || 'Not set' },
      { key: 'dob', label: 'Birthday', value: birthdayLabel },
      { key: 'relationship', label: 'Relationship to you', value: formData.relationship || 'Not set' },
      { key: 'category', label: `Show ${pron} under`, value: CATEGORY_LABELS[formData.category] || 'Not set' },
      { key: 'gender', label: 'Gender', value: GENDER_LABELS[formData.gender] || 'Not set' },
    ];

    return (
      <div ref={pageRef} className="page-container person-page">
        {/* ================= HERO: Unsplash cover, name, stats, two actions ================= */}
        <div className="person-hero">
          <UnsplashBanner seed={selectedPerson.name || selectedPerson.id} matchImage={personArt} className="person-cover" />
          <span className="hero-surface" aria-hidden="true" />

          <div className="person-topbar">
            <button type="button" className="person-back" onClick={leavePerson} aria-label="Back to People">
              <ChevronLeft size={18} />
              <span>People</span>
            </button>
            <div className="person-topbar-right">
              <span className={`person-save-state${saveState === 'error' ? ' is-error' : ''}`} aria-live="polite">{saveLabel}</span>
              <div className="person-menu-wrap" ref={menuRef}>
                <button
                  type="button"
                  className="person-more"
                  aria-label="More options"
                  aria-haspopup="menu"
                  aria-expanded={isMenuOpen}
                  onClick={() => setIsMenuOpen(o => !o)}
                >
                  <MoreHorizontal size={18} />
                </button>
                {isMenuOpen && (
                  <div className="person-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setIsMenuOpen(false); setLinkingTargetPerson(selectedPerson); }}>
                      <Link2 size={15} />
                      <span>{selectedPerson.senderId ? 'Relink Instagram' : 'Link Instagram'}</span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setIsMenuOpen(false); setIsRawChatModalOpen(true); }}>
                      <MessageSquare size={15} />
                      <span>Paste a chat for the AI</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="danger"
                      onClick={async () => {
                        setIsMenuOpen(false);
                        if (await confirmDelete(selectedPerson.name)) {
                          deleteNode(selectedPerson);
                          setSelectedPerson(null);
                        }
                      }}
                    >
                      <Trash2 size={15} />
                      <span>Delete contact</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="person-hero-body">
            <div className="person-hero-avatar">
              <ContactAvatar contact={{ ...selectedPerson, name: formData.name, handle: formData.handle }} size={104} showStatus={false} />
            </div>

            <div className="person-hero-text">
              <h1 className="person-name">{personName}</h1>
              <div className="person-handle">
                {[formData.handle || (selectedPerson.senderId ? 'Instagram linked' : 'Instagram not linked'), formData.relationship].filter(Boolean).join(' · ')}
              </div>
              <div className="person-hero-actions">
                <button type="button" className="person-cta" onClick={() => startAiInterview(selectedPerson)}>
                  <Sparkles size={15} />
                  <span>Start AI interview</span>
                </button>
                <button type="button" className="person-ghost-btn" onClick={handleForceLearn} disabled={isLearning}>
                  <RefreshCw size={15} className={isLearning ? 'animate-spin' : ''} />
                  <span>{isLearning ? 'Learning…' : 'Learn from DMs'}</span>
                </button>
              </div>
            </div>

            <div className="person-stats">
              <div>
                <CountUp value={formData.chatsCount} className="person-stat-value" />
                <span className="person-stat-label">Messages</span>
              </div>
              <div>
                <CountUp value={formData.reelsCount} className="person-stat-value" />
                <span className="person-stat-label">Reels shared</span>
              </div>
              <div>
                <span className="person-stat-value">{lastContactLabel}</span>
                <span className="person-stat-label">Last talked</span>
              </div>
            </div>
          </div>
        </div>

        {/* ================= AI REPLY MODE ================= */}
        <div className="person-ai-bar">
          <div className="person-ai-text">
            <div className="person-ai-title">{isPaused ? `AI is off for ${personName}` : `AI is replying to ${personName}`}</div>
            <div className="person-ai-sub">{isPaused ? 'You reply yourself. The AI stays quiet.' : 'Replies go out automatically in your voice.'}</div>
          </div>
          <div className="person-seg" role="radiogroup" aria-label="AI reply mode">
            <button type="button" role="radio" aria-checked={isFullAi} className={isFullAi ? 'active' : ''} onClick={() => handleSetAiMode('full_ai')}>Full AI</button>
            <button type="button" role="radio" aria-checked={isPaused} className={isPaused ? 'active' : ''} onClick={() => handleSetAiMode('paused')}>Off</button>
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
                  <label style={{ fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "var(--font-label)" }}>
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
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "var(--font-label)" }}>
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
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontFamily: "var(--font-label)", fontWeight: '700', marginBottom: '8px' }}>
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

        <div className="person-grid">
          {/* ================= HOW THE AI TALKS ================= */}
          <section className="person-glass-card">
            <h2 className="person-card-title">How the AI talks to {pron}</h2>

            <label className="person-field-label person-tone-label" htmlFor="roastiness">
              <span>Tone</span>
              <span className="person-range-value">{toneName} · {toneValue}%</span>
            </label>
            <input
              id="roastiness"
              type="range"
              min="0"
              max="100"
              step="5"
              value={toneValue}
              onChange={e => editProfile({ roastiness: Number(e.target.value) })}
              className="person-range"
              style={{ '--range-fill': `${toneValue}%` }}
            />
            <div className="person-range-scale">
              <span>Sweet</span>
              <span>Playful</span>
              <span>Savage</span>
            </div>

            <div className="person-tone-preview" aria-label="Example of how the AI replies">
              <div className="person-bubble in">oyy please reply</div>
              <div className="person-bubble out">{sampleReply}</div>
            </div>

            <div className="person-field-label person-sub-label">Greets {pron} with</div>
            <div className="person-chip-row" role="radiogroup" aria-label="Greeting">
              {greetingChoices.map(g => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={activeGreeting === g}
                  className={`person-chip${activeGreeting === g ? ' active' : ''}`}
                  onClick={() => editProfile({ greetingStyle: activeGreeting === g ? '' : g }, 0)}
                >
                  {g}
                </button>
              ))}
            </div>
            <form className="person-inline-form" onSubmit={handleAddGreeting}>
              <input
                type="text"
                maxLength={40}
                placeholder="Add your own, e.g. macha"
                aria-label="Add your own greeting"
                value={newGreeting}
                onChange={e => setNewGreeting(e.target.value)}
              />
              <button type="submit" className="person-soft-btn" disabled={!newGreeting.trim()}>Add</button>
            </form>

            <div className="person-field-label person-sub-label">Never calls {pron}</div>
            <div className="person-chip-row">
              {(formData.avoidWords || []).map(w => (
                <button
                  key={w}
                  type="button"
                  className="person-chip avoid"
                  title={`Remove "${w}"`}
                  aria-label={`Remove ${w}`}
                  onClick={() => editProfile({ avoidWords: formData.avoidWords.filter(x => x !== w) }, 0)}
                >
                  <span>{w}</span>
                  <X size={12} />
                </button>
              ))}
              {isAddingAvoid ? (
                <form className="person-chip-form" onSubmit={handleAddAvoidWord}>
                  <input
                    autoFocus
                    type="text"
                    maxLength={40}
                    placeholder="e.g. bro"
                    aria-label="Word the AI should never use"
                    value={newAvoidWord}
                    onChange={e => setNewAvoidWord(e.target.value)}
                    onBlur={() => { if (!newAvoidWord.trim()) setIsAddingAvoid(false); }}
                    onKeyDown={e => { if (e.key === 'Escape') { setNewAvoidWord(''); setIsAddingAvoid(false); } }}
                  />
                </form>
              ) : (
                <button type="button" className="person-chip dashed" onClick={() => setIsAddingAvoid(true)}>+ Add</button>
              )}
            </div>
          </section>

          {/* ================= WHAT THE AI KNOWS ================= */}
          <section className="person-glass-card">
            <h2 className="person-card-title">What the AI knows</h2>
            <div className="person-card-sub person-live">
              <span className="person-live-dot" aria-hidden="true" />
              {allFacts.length.toLocaleString()} fact{allFacts.length === 1 ? '' : 's'} · auto-syncing
            </div>

            <input
              type="search"
              className="person-search"
              placeholder={`Search ${allFacts.length.toLocaleString()} facts`}
              aria-label="Search facts"
              value={factSearch}
              onChange={e => setFactSearch(e.target.value)}
            />

            <div className="person-facts">
              {allFacts.length === 0 ? (
                <div className="person-empty">No facts yet. The AI learns them from your DMs, or add one below.</div>
              ) : shownFacts.length === 0 ? (
                <div className="person-empty">No facts match “{factSearch.trim()}”.</div>
              ) : (
                shownFacts.map((fact, i) => (
                  <div key={`${i}-${fact}`} className="person-fact">
                    <span>{fact}</span>
                    <button type="button" className="person-x" onClick={() => handleRemoveFact(fact)} aria-label="Remove this fact" title="Remove this fact">
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <form className="person-inline-form" onSubmit={handleAddFact}>
              <input
                type="text"
                placeholder={`Tell the AI something new about ${personName}`}
                aria-label="New fact"
                value={newFactInput}
                onChange={e => setNewFactInput(e.target.value)}
              />
              <button type="submit" className="person-light-btn" disabled={!newFactInput.trim()}>Add</button>
            </form>
          </section>
        </div>

        {/* ================= PEOPLE IN THEIR LIFE ================= */}
        <section className="person-glass-card person-people">
          <div className="person-card-head">
            <div>
              <h2 className="person-card-title">People in {pronPos} life</h2>
              <div className="person-card-sub">Found in your DMs. The AI uses these names when they come up.</div>
            </div>
            <div className="person-seg small" role="tablist" aria-label="Group">
              {PEOPLE_GROUPS.map(g => (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={peopleTab === g.id}
                  className={peopleTab === g.id ? 'active' : ''}
                  onClick={() => { setPeopleTab(g.id); setShowAllPeople(false); }}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <input
            type="search"
            className="person-search"
            placeholder={`Search ${connections.length.toLocaleString()} ${connections.length === 1 ? 'person' : 'people'}`}
            aria-label="Search people"
            value={peopleSearch}
            onChange={e => setPeopleSearch(e.target.value)}
          />

          {visiblePeople.length === 0 ? (
            <div className="person-empty">
              {peopleQuery ? `No one matches “${peopleSearch.trim()}”.` : `No ${PEOPLE_GROUPS.find(g => g.id === peopleTab)?.label.toLowerCase()} yet.`}
            </div>
          ) : (
            <div className="person-people-grid">
              {visiblePeople.map(c => {
                const match = (nodes || []).find(n => !n.isRoot && (n.name || '').toLowerCase() === (c.targetName || '').toLowerCase());
                return (
                  <div key={`${c.index}-${c.targetName}`} className="person-mini">
                    <button
                      type="button"
                      className="person-mini-main"
                      disabled={!match}
                      onClick={() => match && openPerson(match)}
                      title={match ? `Open ${c.targetName}` : undefined}
                    >
                      <span className="person-mini-avatar" aria-hidden="true">{(c.targetName || '?').trim().charAt(0).toUpperCase()}</span>
                      <span className="person-mini-text">
                        <span className="person-mini-name">{c.targetName}</span>
                        <span className="person-mini-rel">{connectionLabel(c)}</span>
                      </span>
                    </button>
                    <button type="button" className="person-x" onClick={() => handleRemoveConnection(c.index)} aria-label={`Remove ${c.targetName}`} title="Remove">
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {isAddingPerson && (
            <form className="person-add-person" onSubmit={handleAddConnection}>
              <div className="person-add-name">
                <input
                  autoFocus
                  type="text"
                  placeholder="Name, e.g. Rajveer"
                  aria-label="Name"
                  value={newConnTarget}
                  onChange={e => setNewConnTarget(e.target.value)}
                />
                {friendSuggestions.length > 0 && (
                  <div className="person-suggest" role="listbox">
                    {friendSuggestions.map(sug => (
                      <button key={sug.id || sug.name} type="button" role="option" aria-selected="false" onClick={() => setNewConnTarget(sug.name)}>
                        <span>{sug.name}</span>
                        <small>{sug.handle || sug.relationship}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="text"
                placeholder={`How they know ${pron}, e.g. ${peopleTab === 'family' ? 'Sister' : 'Friend'}`}
                aria-label="Relationship"
                value={newConnRel}
                onChange={e => setNewConnRel(e.target.value)}
              />
              <button type="submit" className="person-light-btn" disabled={!newConnTarget.trim()}>Add</button>
              <button type="button" className="person-soft-btn" onClick={() => { setIsAddingPerson(false); setNewConnTarget(''); setNewConnRel(''); }}>Cancel</button>
            </form>
          )}

          <div className="person-people-foot">
            {groupPeople.length > 8 ? (
              <button type="button" className="person-link-btn" onClick={() => setShowAllPeople(s => !s)}>
                {showAllPeople ? 'Show less' : `Show all ${groupPeople.length.toLocaleString()}`}
              </button>
            ) : <span />}
            {!isAddingPerson && (
              <button type="button" className="person-chip dashed" onClick={() => setIsAddingPerson(true)}>+ Add someone</button>
            )}
          </div>
        </section>

        {/* ================= DETAILS ================= */}
        <h2 className="person-details-title">Details</h2>
        <div className="person-details">
          {detailRows.map(row => (
            <div key={row.key} className={`person-detail${editingField === row.key ? ' is-editing' : ''}`}>
              {editingField === row.key ? (
                <form className="person-detail-form" onSubmit={saveDetail} onKeyDown={e => { if (e.key === 'Escape') setEditingField(null); }}>
                  <label className="person-detail-label" htmlFor={`detail-${row.key}`}>{row.label}</label>
                  {row.key === 'gender' ? (
                    <select id={`detail-${row.key}`} autoFocus value={editDraft.value} onChange={e => setEditDraft({ ...editDraft, value: e.target.value })}>
                      {Object.entries(GENDER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ) : row.key === 'category' ? (
                    <select id={`detail-${row.key}`} autoFocus value={editDraft.value} onChange={e => setEditDraft({ ...editDraft, value: e.target.value })}>
                      {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ) : row.key === 'dob' ? (
                    <div className="person-dob-edit">
                      <select id={`detail-${row.key}`} autoFocus aria-label="Month" value={editDraft.month} onChange={e => setEditDraft({ ...editDraft, month: e.target.value })}>
                        <option value="">Month</option>
                        {MONTH_NAMES.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <select aria-label="Day" value={editDraft.day} onChange={e => setEditDraft({ ...editDraft, day: e.target.value })}>
                        <option value="">Day</option>
                        {Array.from({ length: 31 }, (_, i) => String(i + 1)).map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <input type="text" inputMode="numeric" maxLength={4} placeholder="Year" aria-label="Year (optional)" value={editDraft.year} onChange={e => setEditDraft({ ...editDraft, year: e.target.value.replace(/\D/g, '') })} />
                    </div>
                  ) : (
                    <input
                      id={`detail-${row.key}`}
                      autoFocus
                      type="text"
                      maxLength={row.key === 'relationship' ? 80 : 60}
                      placeholder={row.key === 'handle' ? '@username' : row.key === 'relationship' ? 'e.g. Very close friend' : ''}
                      value={editDraft.value}
                      onChange={e => setEditDraft({ ...editDraft, value: e.target.value })}
                    />
                  )}
                  <div className="person-detail-actions">
                    {row.key === 'dob' && formData.dob && (
                      <button type="button" className="person-link-btn" onClick={() => { editProfile({ dob: '' }, 0); setEditingField(null); }}>Clear</button>
                    )}
                    <button type="button" className="person-soft-btn" onClick={() => setEditingField(null)}>Cancel</button>
                    <button type="submit" className="person-light-btn">Save</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="person-detail-text">
                    <div className="person-detail-label">{row.label}</div>
                    <div className={`person-detail-value${row.value === 'Not set' ? ' muted' : ''}`}>{row.value}</div>
                  </div>
                  <button type="button" className="person-soft-btn" onClick={() => startEditDetail(row.key)} aria-label={`Edit ${row.label}`}>
                    {row.value === 'Not set' ? 'Add' : 'Edit'}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: ALL PEOPLE DIRECTORY (Shadcn Light Monochrome Table & Dashboard)
  // =========================================================================
  return (
    <motion.div
      ref={pageRef}
      {...enterMotion}
      className="page-container split-page spx-page has-hero spx-blue people-split"
    >
      <PageHero
        seed="page-people"
        tint={false}
        collapse={false}
        icon={<Users size={96} strokeWidth={2} />}
        eyebrow="People directory"
        title="All People"
        desc="Everyone you chat with on Instagram. Click someone to open their profile."
        meta={`${dashboardStats.totalPeople.toLocaleString()} people · ${dashboardStats.totalDMs.toLocaleString()} chats`}
      />

      <div className="split-body">
      <aside className="split-side">
      {/* Overview numbers */}
      <section className="split-card">
        <h2>Overview</h2>
        <div className="spx-stats people-stats">
          {[
            { icon: <Users size={16} />, label: 'People', value: dashboardStats.totalPeople, tone: 1 },
            { icon: <MessageSquare size={16} />, label: 'Chats', value: dashboardStats.totalDMs, tone: 2 },
            { icon: <Film size={16} />, label: 'Reels', value: dashboardStats.totalReels, tone: 3 },
            { icon: <Bot size={16} />, label: 'AI on', value: dashboardStats.activeAi, tone: 4 },
          ].map(({ icon, label, value, tone }) => (
            <div key={label} className="spx-stat">
              <div className={`spx-stat-icon people-tone-${tone}`}>{icon}</div>
              <div style={{ minWidth: 0 }}>
                <div className="spx-stat-value"><CountUp value={value} /></div>
                <div className="spx-stat-label">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Groups (were tabs across the top) */}
      <section className="split-card split-grow">
        <h2>Groups</h2>
        <div className="people-pills spx-pills people-groups" role="tablist" aria-label="Filter people by group">
          {[
            { id: 'all', label: 'All People', count: categoryCounts.all },
            { id: 'close_friend', label: 'Close Circle / Family', count: categoryCounts.close_friend },
            { id: 'online_friend', label: 'Online Friends', count: categoryCounts.online_friend },
            { id: 'offline_friend', label: 'Offline Friends', count: categoryCounts.offline_friend },
            { id: 'family', label: 'Family / Relatives', count: categoryCounts.family },
            { id: 'professional', label: 'Professional / Business', count: categoryCounts.professional },
            { id: 'unlinked', label: 'Needs ID Link', count: categoryCounts.unlinked }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeCategory === tab.id}
              onClick={() => setActiveCategory(tab.id)}
              className={`people-pill spx-pill${activeCategory === tab.id ? ' active' : ''}`}
            >
              {activeCategory === tab.id && <SegIndicator id="seg-people-category" />}
              <span>{tab.label}</span>
              <span className="spx-pill-count">{tab.count}</span>
            </button>
          ))}
        </div>
      </section>

      {/* People without an Instagram ID */}
      {unlinkedFriends.length > 0 && (
        <section className="split-card people-unlinked">
          <div className="people-unlinked-head">
            <AlertCircle size={16} />
            <h2>{unlinkedFriends.length} need an Instagram ID</h2>
          </div>
          <p className="split-card-sub">Link their handle so the AI can match their DMs and memories.</p>
          <div className="people-unlinked-list">
            {unlinkedFriends.map(friend => (
              <button key={friend.id} type="button" className="spx-outline" onClick={() => setLinkingTargetPerson(friend)}>
                <Link2 size={13} />
                <span>{friend.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      </aside>

      <section className="split-card split-panel split-main people-panel">
        {/* Search, sort and layout switch */}
        <div className="people-toolbar spx-toolbar">
          <div className="people-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search name, @username, birthday or relation"
              aria-label="Search people"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Sort order */}
          <select
            aria-label="Sort people"
            className="people-sort"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="newest">Newest messages</option>
            <option value="oldest">Oldest</option>
            <option value="most">Most chats</option>
            <option value="az">A–Z</option>
          </select>

          {/* Layout Switcher Icons (Table / Grid / Dense) */}
          <div className="people-layout-switch">
            {[
              { id: 'table', label: 'Table', icon: TableIcon },
              { id: 'grid', label: 'Grid', icon: LayoutGrid },
              { id: 'dense', label: 'Dense', icon: AlignJustify }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleSetLayout(id)}
                className={`people-layout-btn${layoutMode === id ? ' active' : ''}`}
                title={`${label} view`}
                aria-pressed={layoutMode === id}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="split-scroll" ref={tableScrollRef}>

      {/* ================= SHADCN LIGHT MONOCHROME TABLE ================= */}
      <div
        className="people-results"
        style={layoutMode !== 'dense' ? { background: 'transparent', marginTop: '8px' } : {
          marginTop: '20px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '10px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}
      >
        {/* 1. Table View (Spotify track list) */}
        {layoutMode === 'table' && (
          <div className="desktop-table-container spx-table-wrap">
            <div style={{ overflowX: 'auto' }}>
              <table className="card-table spx-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Date of birth</th>
                  <th>Relation</th>
                  <th style={{ textAlign: 'center' }}>Chats</th>
                  <th style={{ textAlign: 'center' }}>Reels</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody className="stagger-in">
                {isSyncingInitial && pagedPeople.length === 0 ? (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={`skel-${idx}`}>
                      <td className="spx-idx-cell"><div className="skeleton" style={{ width: '14px', height: '16px' }} /></td>
                      <td className="ct-title">
                        <div className="spx-who">
                          <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                          <div className="skeleton" style={{ width: '120px', height: '16px' }} />
                        </div>
                      </td>
                      <td><div className="skeleton" style={{ width: '90px', height: '14px' }} /></td>
                      <td><div className="skeleton" style={{ width: '80px', height: '14px' }} /></td>
                      <td><div className="skeleton" style={{ width: '80px', height: '22px', borderRadius: '9999px' }} /></td>
                      <td><div className="skeleton" style={{ width: '32px', height: '14px', margin: '0 auto' }} /></td>
                      <td><div className="skeleton" style={{ width: '32px', height: '14px', margin: '0 auto' }} /></td>
                      <td><div className="skeleton" style={{ width: '64px', height: '24px', marginLeft: 'auto' }} /></td>
                    </tr>
                  ))
                ) : pagedPeople.length === 0 ? (
                  <tr>
                    <td className="ct-full spx-table-empty" colSpan={8}>
                      {filteredPeople.length === 0 ? 'No people found matching your filters.' : 'No results on this page.'}
                    </td>
                  </tr>
                ) : (
                  pagedPeople.map((person, idx) => {
                    const hasHandle = Boolean(person.handle || person.instagramHandle);
                    const handleDisplay = person.handle || person.instagramHandle;
                    const dobDisplay = cleanDob(person.dob || person.importantDates?.[0]?.date || '');
                    const chatsCount = person.chatsCount || person.messageCount || 0;
                    const reelsCount = person.reelsCount || 0;
                    const aiOn = isAiOnFor(person, routingConfig);

                    return (
                      <tr
                        key={person.id || person.senderId || person.name}
                        onClick={() => setSelectedPerson(person)}
                      >
                        {/* Column 1: # */}
                        <td className="spx-idx-cell"><span className="spx-idx">{(tablePage - 1) * TABLE_PAGE_SIZE + idx + 1}</span></td>

                        {/* Column 2: NAME (avatar + AI state) */}
                        <td className="ct-title">
                          <div className="spx-who">
                            <ContactAvatar contact={person} size={40} showStatus={false} />
                            <div style={{ minWidth: 0 }}>
                              <div className="spx-who-name">{person.name}</div>
                              <div className={`spx-ai${aiOn ? ' on' : ''}`}>{aiOn ? 'AI on' : 'AI off'}</div>
                            </div>
                          </div>
                        </td>

                        {/* Column 3: USERNAME */}
                        <td data-label="Username" onClick={(e) => e.stopPropagation()}>
                          {hasHandle ? (
                            <button type="button" className="spx-handle" onClick={() => setLinkingTargetPerson(person)} title="Edit handle">
                              {String(handleDisplay).startsWith('@') ? handleDisplay : `@${handleDisplay}`}
                            </button>
                          ) : (
                            <button type="button" className="spx-outline spx-link-btn" onClick={() => setLinkingTargetPerson(person)}>
                              <Link2 size={12} /> Link ID
                            </button>
                          )}
                        </td>

                        {/* Column 4: DATE OF BIRTH */}
                        <td data-label="Birthday">{dobDisplay || '—'}</td>

                        {/* Column 5: RELATION */}
                        <td data-label="Relation">
                          <span className="spx-rel">{person.relationship || person.relationshipToSam || 'Friend'}</span>
                        </td>

                        {/* Column 6-7: COUNTS */}
                        <td data-label="Chats" className="spx-num">{chatsCount.toLocaleString?.() ?? chatsCount}</td>
                        <td data-label="Reels" className="spx-num">{reelsCount.toLocaleString?.() ?? reelsCount}</td>

                        {/* Column 8: ACTION */}
                        <td className="ct-aside" onClick={(e) => e.stopPropagation()}>
                          <div className="spx-row-actions">
                            <button type="button" className="spx-icon-btn" onClick={() => setSelectedPerson(person)} title="Open person" aria-label={`Open ${person.name}`}>
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              className="spx-icon-btn"
                              onClick={async () => {
                                if (await confirmDelete(person.name)) {
                                  deleteNode(person);
                                }
                              }}
                              title="Delete Person"
                              aria-label={`Delete ${person.name}`}
                            >
                              <Trash2 size={16} />
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

      {/* 3. Grid Cards View */}
      {layoutMode === 'grid' && (
        <motion.div
          key="view-grid"
          layout
          className="stagger-in"
          {...swapMotion}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px',
            padding: 0
          }}
        >
          {isSyncingInitial && pagedPeople.length === 0 ? (
            Array.from({ length: 6 }, (_, i) => (
              <div key={`g-skel-${i}`} className="sk-card sk-row" style={{ gap: 14 }}>
                <Sk w={56} h={56} r={999} />
                <div className="sk-col" style={{ gap: 8, flex: 1 }}>
                  <Sk w={`${55 + (i % 3) * 10}%`} h={15} />
                  <Sk w="40%" h={11} />
                  <Sk w={70} h={20} r={999} />
                </div>
              </div>
            ))
          ) : pagedPeople.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
              {filteredPeople.length === 0 ? 'No people found matching your filters.' : 'No results on this page.'}
            </div>
          ) : (
            pagedPeople.map((person) => {
              const hasHandle = Boolean(person.handle || person.instagramHandle);
              const handleDisplay = person.handle || person.instagramHandle;
              const dobDisplay = cleanDob(person.dob || person.importantDates?.[0]?.date || '');
              const chatsCount = person.chatsCount || person.messageCount || 0;
              const reelsCount = person.reelsCount || 0;
              const relDisplay = person.relationship || person.relationshipToSam || 'Friend';

              return (
                <motion.div
                  key={person.id || person.senderId || person.name}
                  layout
                  whileHover={{ y: -2, boxShadow: '0 6px 16px rgba(0,0,0,0.06)' }}
                  onClick={() => setSelectedPerson(person)}
                  className="people-grid-card"
                  style={{
                    background: 'var(--color-surface-elevated)',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <ContactAvatar contact={person} size={48} showStatus={true} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {person.name}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontFamily: "var(--font-label)", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {handleDisplay ? `@${String(handleDisplay).replace(/^@/, '')}` : 'No handle linked'}
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', background: 'var(--color-surface-hover)', padding: '4px 8px', borderRadius: '6px', fontWeight: '600', fontFamily: "var(--font-label)", border: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {relDisplay}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', color: 'var(--color-text-secondary)', paddingTop: '12px', borderTop: '1px solid var(--color-surface-hover)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={12} />
                      <span>{dobDisplay || 'Birthday not set'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{Number(chatsCount).toLocaleString('en-US')} chats</span>
                      <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{Number(reelsCount).toLocaleString('en-US')} reels</span>
                    </div>
                  </div>

                  <div className="people-grid-actions" style={{ display: 'flex', gap: '6px', paddingTop: '4px' }} onClick={(e) => e.stopPropagation()}>
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
                      onClick={async () => {
                        if (await confirmDelete(person.name)) {
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
          {...swapMotion}
          style={{
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}
        >
          {isSyncingInitial && pagedPeople.length === 0 ? (
            Array.from({ length: 8 }, (_, i) => (
              <div key={`d-skel-${i}`} className="sk-row" style={{ gap: 12, padding: '8px 6px' }}>
                <Sk w={32} h={32} r={999} />
                <Sk w={`${30 + (i % 4) * 8}%`} h={13} />
                <Sk w={60} h={18} r={999} style={{ marginLeft: 'auto' }} />
              </div>
            ))
          ) : pagedPeople.length === 0 ? (
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
                    <span style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', fontFamily: "var(--font-label)", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {handleDisplay || '—'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.68rem', background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>
                      {relDisplay}
                    </span>
                    <span style={{ fontSize: '0.72rem', fontFamily: "var(--font-label)", fontWeight: '700', color: 'var(--color-text-secondary)' }}>
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
          <div className="people-pager" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface-elevated)',
            borderBottomLeftRadius: '10px',
            borderBottomRightRadius: '10px'
          }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontFamily: "var(--font-label)" }}>
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
        </div>
      </section>
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
