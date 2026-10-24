'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import ContactAvatar from '../components/ContactAvatar';
import SuperadminWorkspacePrompt from '../components/SuperadminWorkspacePrompt';
import BusinessPolicyCard from '../components/BusinessPolicyCard';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sliders, Search, Check, RefreshCw, Users, Bot, Film, Pause, ShieldCheck, CheckCircle2, AlertCircle,
  LayoutGrid, List, AlignJustify
} from 'lucide-react';

export default function ControlsPage() {
  const {
    nodes,
    routingConfig,
    saveRouting,
    setRoutingConfig,
    updateContactPreferences,
    user,
    isImpersonating
  } = useApp();

  // If pure superadmin (not inside an impersonated creator workspace), show creator selector
  if (user?.role === 'superadmin' && !isImpersonating) {
    return (
      <SuperadminWorkspacePrompt
        sectionTitle="Creator Chat Rules & AI Routing"
        sectionCode="03 // CONTROLS"
        sectionDescription="Chat rules, contact exclusion lists, and AI routing logic are configured per individual creator workspace. Choose a creator workspace below to inspect and manage their rules."
      />
    );
  }
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'full_ai' | 'reels_only' | 'manual'

  // Layout switcher state: 'dense' (ultra-compact mobile default) | 'grid' | 'list'
  const [controlsLayout, setControlsLayout] = useState(() => {
    if (typeof window === 'undefined') return 'dense';
    try {
      const saved = localStorage.getItem('chatter_controls_layout');
      if (saved) return saved;
      return window.innerWidth <= 768 ? 'dense' : 'grid';
    } catch {
      return 'dense';
    }
  });

  const handleSetControlsLayout = (mode) => {
    setControlsLayout(mode);
    try {
      localStorage.setItem('chatter_controls_layout', mode);
    } catch { }
  };

  const friendNodes = useMemo(() => {
    const list = nodes.filter(n => !n.isRoot);
    const seen = new Set();
    const result = [];
    for (const n of list) {
      const cleanSenderId = (n.senderId || '').trim();
      const cleanHandle = (n.handle || '').replace(/^@/, '').toLowerCase().trim();
      const cleanName = (n.name || '').toLowerCase().trim();
      const key = cleanSenderId || cleanHandle || cleanName;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (cleanHandle) seen.add(cleanHandle);
      if (cleanSenderId) seen.add(cleanSenderId);
      result.push(n);
    }
    return result;
  }, [nodes]);

  const debounceTimerRef = useRef(null);
  const currentConfigRef = useRef(routingConfig);
  useEffect(() => {
    currentConfigRef.current = routingConfig;
  }, [routingConfig]);

  const queueSave = useCallback((newConfig, immediate = false) => {
    currentConfigRef.current = newConfig;
    // 1. INSTANT 0ms optimistic UI update
    setRoutingConfig(newConfig);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (immediate) {
      return saveRouting(newConfig);
    }

    // 2. Debounce network sync by 350ms so rapid clicking responds instantly without network lag
    debounceTimerRef.current = setTimeout(() => {
      saveRouting(newConfig);
    }, 350);
  }, [saveRouting, setRoutingConfig]);

  const getContactKey = useCallback((c) => {
    if (c.senderId && c.senderId.trim()) return c.senderId.trim();
    if (c.handle && c.handle.trim()) return c.handle.replace(/^@/, '').toLowerCase().trim();
    if (c.id && c.id.trim()) return c.id.trim();
    return (c.name || '').toLowerCase().replace(/[^a-z0-9]/g, '_').trim();
  }, []);

  const getTargetKeys = useCallback((c) => {
    return [
      c.id,
      c.senderId,
      c.handle ? c.handle.replace(/^@/, '').toLowerCase() : '',
      c.name ? c.name.toLowerCase().replace(/[^a-z0-9]/g, '_') : ''
    ].filter(Boolean);
  }, []);

  const isExcluded = useCallback((contact) => {
    const configToUse = currentConfigRef.current || routingConfig;
    const excluded = (configToUse.excludedContactIds || []).filter(Boolean);
    const targetKeys = getTargetKeys(contact);
    return targetKeys.some(k => excluded.includes(k)) || contact.aiEnabled === false;
  }, [routingConfig, getTargetKeys]);

  const isIncluded = useCallback((contact) => {
    const configToUse = currentConfigRef.current || routingConfig;
    const included = (configToUse.includedContactIds || []).filter(Boolean);
    const targetKeys = getTargetKeys(contact);
    return targetKeys.some(k => included.includes(k)) && contact.aiEnabled !== false;
  }, [routingConfig, getTargetKeys]);

  // Determine current AI state of contact
  const getContactMode = useCallback((contact) => {
    const chatMode = routingConfig.chatMode;
    if (chatMode === 'only_selected') {
      const included = isIncluded(contact);
      if (!included || contact.aiEnabled === false) return 'manual';
      if (contact.replyToMessages === false && contact.replyToReelsAndPosts !== false) return 'reels_only';
      return 'full_ai';
    } else if (chatMode === 'everyone_except') {
      const excluded = isExcluded(contact);
      if (excluded || contact.aiEnabled === false) return 'manual';
      if (contact.replyToMessages === false && contact.replyToReelsAndPosts !== false) return 'reels_only';
      return 'full_ai';
    } else {
      // everyone
      if (contact.aiEnabled === false) return 'manual';
      if (contact.replyToMessages === false && contact.replyToReelsAndPosts !== false) return 'reels_only';
      return 'full_ai';
    }
  }, [routingConfig.chatMode, isIncluded, isExcluded]);

  // Synchronized Checkbox Toggle
  const handleToggleContact = useCallback((contact) => {
    const key = getContactKey(contact);
    const targetKeys = getTargetKeys(contact);
    const baseConfig = currentConfigRef.current || routingConfig;
    const chatMode = baseConfig.chatMode;

    if (chatMode === 'only_selected') {
      const currentlyIncluded = isIncluded(contact);
      const currentList = (baseConfig.includedContactIds || []).filter(Boolean);

      if (currentlyIncluded) {
        // UNCHECKING: Immediately remove from whitelist AND set AI mode to 'paused'
        const next = currentList.filter(id => !targetKeys.includes(id));
        const updated = { ...baseConfig, includedContactIds: next };
        queueSave(updated);
        updateContactPreferences(contact.senderId || contact.id, { aiMode: 'paused' });
      } else {
        // CHECKING: Immediately add to whitelist AND set AI mode to 'full_ai'
        const next = [...currentList.filter(id => !targetKeys.includes(id)), key];
        const updated = { ...baseConfig, includedContactIds: next };
        queueSave(updated);
        updateContactPreferences(contact.senderId || contact.id, { aiMode: 'full_ai' });
      }
    } else if (chatMode === 'everyone_except') {
      const currentlyExcluded = isExcluded(contact);
      const currentList = (baseConfig.excludedContactIds || []).filter(Boolean);

      if (currentlyExcluded) {
        // UNCHECKING: Remove from blacklist AND set AI mode to 'full_ai'
        const next = currentList.filter(id => !targetKeys.includes(id));
        const updated = { ...baseConfig, excludedContactIds: next };
        queueSave(updated);
        updateContactPreferences(contact.senderId || contact.id, { aiMode: 'full_ai' });
      } else {
        // CHECKING: Add to blacklist AND set AI mode to 'paused'
        const next = [...currentList.filter(id => !targetKeys.includes(id)), key];
        const updated = { ...baseConfig, excludedContactIds: next };
        queueSave(updated);
        updateContactPreferences(contact.senderId || contact.id, { aiMode: 'paused' });
      }
    }
  }, [routingConfig, getContactKey, getTargetKeys, isIncluded, isExcluded, queueSave, updateContactPreferences]);

  // Direct Button Switcher: Full AI, Reels Only, Stop AI (Instant Two-Way Sync)
  const handleSetMode = useCallback((contact, mode) => {
    const key = getContactKey(contact);
    const targetKeys = getTargetKeys(contact);
    const baseConfig = currentConfigRef.current || routingConfig;
    const chatMode = baseConfig.chatMode;

    // 1. Update contact preferences (nodes)
    updateContactPreferences(contact.senderId || contact.id, { aiMode: mode });

    // 2. Synchronize routingConfig based on active chatMode
    let updated = { ...baseConfig };
    if (chatMode === 'only_selected') {
      const current = (baseConfig.includedContactIds || []).filter(Boolean);
      if (mode === 'full_ai' || mode === 'reels_only') {
        // Must be in whitelist
        if (!current.some(id => targetKeys.includes(id))) {
          updated.includedContactIds = [...current, key];
        }
      } else {
        // Stop AI -> remove from whitelist
        updated.includedContactIds = current.filter(id => !targetKeys.includes(id));
      }
    } else if (chatMode === 'everyone_except') {
      const current = (baseConfig.excludedContactIds || []).filter(Boolean);
      if (mode === 'paused') {
        // Stop AI -> must be in excluded blacklist
        if (!current.some(id => targetKeys.includes(id))) {
          updated.excludedContactIds = [...current, key];
        }
      } else {
        // Full AI or Reels Only -> remove from excluded blacklist
        updated.excludedContactIds = current.filter(id => !targetKeys.includes(id));
      }
    }

    queueSave(updated);
  }, [routingConfig, getContactKey, getTargetKeys, queueSave, updateContactPreferences]);

  // Bulk Actions
  const handleSelectAll = useCallback(() => {
    const allKeys = friendNodes.map(n => getContactKey(n)).filter(Boolean);
    const baseConfig = currentConfigRef.current || routingConfig;
    let updated;
    if (baseConfig.chatMode === 'everyone_except') {
      updated = { ...baseConfig, excludedContactIds: allKeys };
      friendNodes.forEach(f => updateContactPreferences(f.senderId || f.id, { aiMode: 'paused' }));
    } else if (baseConfig.chatMode === 'only_selected') {
      updated = { ...baseConfig, includedContactIds: allKeys };
      friendNodes.forEach(f => updateContactPreferences(f.senderId || f.id, { aiMode: 'full_ai' }));
    }
    if (updated) queueSave(updated);
  }, [friendNodes, routingConfig, getContactKey, queueSave, updateContactPreferences]);

  const handleClearAll = useCallback(() => {
    const baseConfig = currentConfigRef.current || routingConfig;
    let updated;
    if (baseConfig.chatMode === 'everyone_except') {
      updated = { ...baseConfig, excludedContactIds: [] };
      friendNodes.forEach(f => updateContactPreferences(f.senderId || f.id, { aiMode: 'full_ai' }));
    } else if (baseConfig.chatMode === 'only_selected') {
      updated = { ...baseConfig, includedContactIds: [] };
      friendNodes.forEach(f => updateContactPreferences(f.senderId || f.id, { aiMode: 'paused' }));
    }
    if (updated) queueSave(updated);
  }, [friendNodes, routingConfig, queueSave, updateContactPreferences]);

  const onSave = async () => {
    setIsSaving(true);
    try {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      await queueSave(currentConfigRef.current || routingConfig, true);
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered Friends
  const filteredFriends = useMemo(() => {
    if (!search.trim()) return friendNodes;
    const q = search.toLowerCase();
    return friendNodes.filter(n =>
      n.name.toLowerCase().includes(q) ||
      (n.handle || '').toLowerCase().includes(q) ||
      (n.relationship || '').toLowerCase().includes(q)
    );
  }, [friendNodes, search]);

  // Categorize Contacts into the 3 Core Sections
  const fullAiContacts = useMemo(() => {
    return filteredFriends.filter(c => getContactMode(c) === 'full_ai');
  }, [filteredFriends, getContactMode]);

  const reelsOnlyContacts = useMemo(() => {
    return filteredFriends.filter(c => getContactMode(c) === 'reels_only');
  }, [filteredFriends, getContactMode]);

  const manualContacts = useMemo(() => {
    return filteredFriends.filter(c => getContactMode(c) === 'manual');
  }, [filteredFriends, getContactMode]);

  const activeCount = routingConfig.chatMode === 'everyone_except'
    ? friendNodes.filter(n => isExcluded(n)).length
    : (routingConfig.chatMode === 'only_selected' ? friendNodes.filter(n => isIncluded(n)).length : friendNodes.length);

  // Render an Ultra-Compact Mobile-Friendly Contact Row (~42px slim height)
  const renderDenseContactRow = (contact) => {
    const isEveryoneMode = routingConfig.chatMode === 'everyone';
    const isChecked = isEveryoneMode
      ? true
      : (routingConfig.chatMode === 'everyone_except' ? isExcluded(contact) : isIncluded(contact));

    const currentMode = getContactMode(contact);
    const isFullAi = currentMode === 'full_ai';
    const isReelsOnly = currentMode === 'reels_only';
    const isPaused = currentMode === 'manual';

    return (
      <motion.div
        layout
        key={contact._id || contact.senderId || contact.id || contact.name}
        className="control-contact-dense-row"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        style={{
          background: isChecked && !isEveryoneMode ? '#fafafa' : '#ffffff',
          border: '1px solid',
          borderColor: isChecked && !isEveryoneMode ? '#09090b' : '#e4e4e7',
          borderRadius: '8px',
          padding: controlsLayout === 'list' ? '10px 14px' : '6px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          transition: 'border-color 0.15s ease, background-color 0.15s ease',
        }}
      >
        {/* Left: Checkbox + Avatar + Name/Handle */}
        <div
          onClick={() => handleToggleContact(contact)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: isEveryoneMode ? 'default' : 'pointer',
            flex: 1,
            minWidth: 0,
            touchAction: 'manipulation'
          }}
        >
          <div
            style={{
              width: '16px',
              height: '16px',
              minWidth: '16px',
              borderRadius: '4px',
              background: isChecked ? '#09090b' : '#ffffff',
              border: '1px solid',
              borderColor: isChecked ? '#09090b' : '#d4d4d8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              flexShrink: 0
            }}
          >
            {isChecked && <Check size={11} strokeWidth={3} />}
          </div>
          <ContactAvatar contact={contact} size={28} showStatus={true} />
          <div style={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: '700', fontSize: '0.8rem', color: '#09090b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {contact.name}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {contact.handle || contact.relationship || 'Friend'}
            </div>
          </div>
        </div>

        {/* Right: Quick Action Pill Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => handleSetMode(contact, 'full_ai')}
            title="Full AI"
            style={{
              padding: '4px 8px',
              borderRadius: '5px',
              fontSize: '0.67rem',
              fontWeight: isFullAi ? '700' : '500',
              cursor: 'pointer',
              background: isFullAi ? '#09090b' : '#f4f4f5',
              color: isFullAi ? '#ffffff' : '#52525b',
              border: '1px solid',
              borderColor: isFullAi ? '#09090b' : '#e4e4e7',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              touchAction: 'manipulation'
            }}
          >
            <Bot size={11} />
            <span>AI</span>
          </button>

          <button
            type="button"
            onClick={() => handleSetMode(contact, 'reels_only')}
            title="Reels Only"
            style={{
              padding: '4px 8px',
              borderRadius: '5px',
              fontSize: '0.67rem',
              fontWeight: isReelsOnly ? '700' : '500',
              cursor: 'pointer',
              background: isReelsOnly ? '#09090b' : '#f4f4f5',
              color: isReelsOnly ? '#ffffff' : '#52525b',
              border: '1px solid',
              borderColor: isReelsOnly ? '#09090b' : '#e4e4e7',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              touchAction: 'manipulation'
            }}
          >
            <Film size={11} />
            <span>Reels</span>
          </button>

          <button
            type="button"
            onClick={() => handleSetMode(contact, 'paused')}
            title="Manual Chat / Off"
            style={{
              padding: '4px 8px',
              borderRadius: '5px',
              fontSize: '0.67rem',
              fontWeight: isPaused ? '700' : '500',
              cursor: 'pointer',
              background: isPaused ? '#09090b' : '#f4f4f5',
              color: isPaused ? '#ffffff' : '#52525b',
              border: '1px solid',
              borderColor: isPaused ? '#09090b' : '#e4e4e7',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              touchAction: 'manipulation'
            }}
          >
            <Pause size={11} />
            <span>Off</span>
          </button>
        </div>
      </motion.div>
    );
  };

  // Render a Single Contact Card
  const renderContactCard = (contact) => {
    const isEveryoneMode = routingConfig.chatMode === 'everyone';
    const isChecked = isEveryoneMode
      ? true
      : (routingConfig.chatMode === 'everyone_except' ? isExcluded(contact) : isIncluded(contact));

    const currentMode = getContactMode(contact);
    const isFullAi = currentMode === 'full_ai';
    const isReelsOnly = currentMode === 'reels_only';
    const isPaused = currentMode === 'manual';

    return (
      <motion.div
        layout
        key={contact.id || contact.name}
        className="control-contact-card"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        style={{
          background: isChecked && !isEveryoneMode ? '#fafafa' : '#ffffff',
          border: '1px solid',
          borderColor: isChecked && !isEveryoneMode ? '#09090b' : '#e4e4e7',
          borderRadius: '10px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          transition: 'border-color 0.15s ease, background-color 0.15s ease',
          touchAction: 'manipulation'
        }}
      >
        {/* Top Row: Checkbox + Avatar + Info + Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0, width: '100%' }}>
          <div
            onClick={() => handleToggleContact(contact)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: isEveryoneMode ? 'default' : 'pointer',
              flex: 1,
              minWidth: 0,
              opacity: isEveryoneMode ? 0.75 : 1,
              touchAction: 'manipulation'
            }}
          >
            {/* Checkbox */}
            <div
              style={{
                width: '18px',
                height: '18px',
                minWidth: '18px',
                borderRadius: '4px',
                background: isChecked ? '#09090b' : '#ffffff',
                border: '1px solid',
                borderColor: isChecked ? '#09090b' : '#d4d4d8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                flexShrink: 0
              }}
            >
              {isChecked && <Check size={12} strokeWidth={3} />}
            </div>

            <ContactAvatar contact={contact} size={36} showStatus={true} />

            <div style={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: '700', fontSize: '0.88rem', color: '#09090b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {contact.name}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {contact.handle || contact.relationship || 'Friend'}
              </div>
            </div>
          </div>

          {/* Mode Pill */}
          <span
            style={{
              fontSize: '0.64rem',
              padding: '2px 7px',
              borderRadius: '4px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: '700',
              background: isFullAi ? '#09090b' : (isReelsOnly ? '#27272a' : '#f4f4f5'),
              color: (isFullAi || isReelsOnly) ? '#ffffff' : '#71717a',
              border: '1px solid #e4e4e7',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            {isPaused ? 'MANUAL' : (isReelsOnly ? 'REELS ONLY' : 'FULL AI')}
          </span>
        </div>

        {/* Bottom Row: AI Mode Selector Buttons (Touch-optimized) */}
        <div style={{ display: 'flex', gap: '6px', paddingTop: '8px', borderTop: '1px solid #f4f4f5', width: '100%' }}>
          <button
            type="button"
            onClick={() => handleSetMode(contact, 'full_ai')}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '7px 4px',
              borderRadius: '6px',
              fontSize: '0.7rem',
              fontWeight: isFullAi ? '700' : '500',
              cursor: 'pointer',
              background: isFullAi ? '#09090b' : '#ffffff',
              color: isFullAi ? '#ffffff' : '#71717a',
              border: '1px solid',
              borderColor: isFullAi ? '#09090b' : '#e4e4e7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              overflow: 'hidden',
              touchAction: 'manipulation'
            }}
          >
            <Bot size={11} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Full AI</span>
          </button>

          <button
            type="button"
            onClick={() => handleSetMode(contact, 'reels_only')}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '7px 4px',
              borderRadius: '6px',
              fontSize: '0.7rem',
              fontWeight: isReelsOnly ? '700' : '500',
              cursor: 'pointer',
              background: isReelsOnly ? '#09090b' : '#ffffff',
              color: isReelsOnly ? '#ffffff' : '#71717a',
              border: '1px solid',
              borderColor: isReelsOnly ? '#09090b' : '#e4e4e7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              overflow: 'hidden',
              touchAction: 'manipulation'
            }}
          >
            <Film size={11} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Reels Only</span>
          </button>

          <button
            type="button"
            onClick={() => handleSetMode(contact, 'paused')}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '7px 4px',
              borderRadius: '6px',
              fontSize: '0.7rem',
              fontWeight: isPaused ? '700' : '500',
              cursor: 'pointer',
              background: isPaused ? '#09090b' : '#ffffff',
              color: isPaused ? '#ffffff' : '#71717a',
              border: '1px solid',
              borderColor: isPaused ? '#09090b' : '#e4e4e7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              overflow: 'hidden',
              touchAction: 'manipulation'
            }}
          >
            <Pause size={11} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Stop AI</span>
          </button>
        </div>
      </motion.div>
    );
  };

  // Render by layout mode
  const renderContactItem = (contact) => {
    if (controlsLayout === 'dense' || controlsLayout === 'list') {
      return renderDenseContactRow(contact);
    }
    return renderContactCard(contact);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="page-container"
      style={{ maxWidth: '1400px' }}
    >
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
          AUTOMATION POLICY
        </div>
        <h1 style={{ fontSize: '1.85rem', fontWeight: '800', letterSpacing: '-0.6px', marginTop: '2px', color: '#09090b' }}>
          Chat Control Rules
        </h1>
        <p style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '4px' }}>
          Configure automated Instagram AI routing: handle everyone, exclude selected contacts for manual chatting, or whitelist specific friends.
        </p>
      </div>

      {['business', 'agency'].includes(user?.accountType) && <BusinessPolicyCard />}

      {/* 3 Main Mode Selector Cards */}
      <div className="responsive-grid-3" style={{ marginBottom: '24px' }}>
        {[
          {
            id: 'everyone',
            title: 'Open with Everyone',
            desc: 'AI handles direct messages from everyone automatically (followers, strangers, friends).',
            badge: 'GLOBAL'
          },
          {
            id: 'everyone_except',
            title: 'Everyone EXCEPT...',
            desc: 'AI replies to everyone EXCEPT the contacts you checkbox below (reserved for your manual chat).',
            badge: 'RECOMMENDED'
          },
          {
            id: 'only_selected',
            title: 'ONLY Selected',
            desc: 'AI ONLY replies to checked contacts. All other incoming direct messages will be ignored.',
            badge: 'WHITELIST'
          }
        ].map(mode => {
          const isSelected = routingConfig.chatMode === mode.id;
          return (
            <div
              key={mode.id}
              onClick={() => {
                const updated = { ...(currentConfigRef.current || routingConfig), chatMode: mode.id };
                queueSave(updated);
              }}
              style={{
                background: isSelected ? '#09090b' : '#ffffff',
                color: isSelected ? '#ffffff' : '#09090b',
                border: '1px solid',
                borderColor: isSelected ? '#09090b' : '#e4e4e7',
                borderRadius: '12px',
                padding: '20px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
                boxShadow: isSelected ? '0 4px 14px rgba(0, 0, 0, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)',
                touchAction: 'manipulation'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span
                    style={{
                      fontSize: '0.66rem',
                      background: isSelected ? '#27272a' : '#f4f4f5',
                      color: isSelected ? '#ffffff' : '#71717a',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: '700'
                    }}
                  >
                    {mode.badge}
                  </span>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      border: isSelected ? '5px solid #ffffff' : '1.5px solid #a1a1aa'
                    }}
                  />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: '800', margin: 0 }}>
                  {mode.title}
                </h3>
                <p style={{ fontSize: '0.8rem', opacity: isSelected ? 0.8 : 0.6, marginTop: '6px', lineHeight: '1.4' }}>
                  {mode.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active System Policy Bar */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e4e4e7',
          borderRadius: '10px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div>
          <span style={{ fontSize: '0.7rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
            ACTIVE SYSTEM POLICY
          </span>
          <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#09090b', marginTop: '2px', fontFamily: "'JetBrains Mono', monospace" }}>
            {routingConfig.chatMode === 'everyone' && 'AI RESPONDS TO EVERYONE AUTOMATICALLY'}
            {routingConfig.chatMode === 'everyone_except' && `AI RESPONDS TO EVERYONE EXCEPT ${activeCount} CHECKED FRIENDS`}
            {routingConfig.chatMode === 'only_selected' && `AI ONLY RESPONDS TO ${activeCount} CHECKED CONTACTS`}
          </div>
        </div>

        <button
          onClick={onSave}
          disabled={isSaving}
          style={{
            background: '#09090b',
            color: '#ffffff',
            border: 'none',
            padding: '9px 20px',
            borderRadius: '6px',
            fontWeight: '700',
            fontSize: '0.82rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            touchAction: 'manipulation'
          }}
        >
          {isSaving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={14} />}
          <span>Save Routing Rules</span>
        </button>
      </div>

      {/* Contacts List & Policy Controls */}
      <div className="controls-card-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#09090b', margin: 0 }}>
              {routingConfig.chatMode === 'everyone_except' ? 'Checkbox Contacts to Exclude' : (routingConfig.chatMode === 'only_selected' ? 'Checkbox Contacts to Include' : 'All Contacts (Active)')}
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '2px' }}>
              {routingConfig.chatMode === 'only_selected'
                ? 'Only checked contacts will receive AI replies. Contacts in the Manual Chat section are silenced.'
                : (routingConfig.chatMode === 'everyone_except'
                  ? 'Checked contacts are excluded from AI (manual chat). Unchecked contacts receive automated AI replies.'
                  : 'All contacts receive automated AI replies. Switch mode above to exclude anyone.')}
            </p>
          </div>

          {routingConfig.chatMode !== 'everyone' && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={handleSelectAll}
                style={{ background: '#ffffff', border: '1px solid #e4e4e7', color: '#09090b', padding: '5px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', touchAction: 'manipulation' }}
              >
                Select All
              </button>
              <button
                onClick={handleClearAll}
                style={{ background: '#ffffff', border: '1px solid #e4e4e7', color: '#71717a', padding: '5px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', touchAction: 'manipulation' }}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Search Bar + Layout Switcher + 4 Filter Tabs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
              <input
                type="text"
                placeholder="Search contacts by name or handle..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  paddingLeft: '34px',
                  height: '38px',
                  fontSize: '0.82rem',
                  width: '100%'
                }}
              />
            </div>

            {/* Layout View Switcher */}
            <div style={{
              display: 'flex',
              background: '#ffffff',
              border: '1px solid #e4e4e7',
              padding: '3px',
              borderRadius: '8px',
              flexShrink: 0
            }}>
              {[
                { id: 'dense', label: 'Compact', icon: AlignJustify },
                { id: 'grid', label: 'Cards', icon: LayoutGrid },
                { id: 'list', label: 'List', icon: List }
              ].map(({ id, label, icon: Icon }) => {
                const isActive = controlsLayout === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleSetControlsLayout(id)}
                    title={`${label} View`}
                    style={{
                      background: isActive ? '#09090b' : 'transparent',
                      color: isActive ? '#ffffff' : '#71717a',
                      border: 'none',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.74rem',
                      fontWeight: isActive ? '700' : '500',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Icon size={13} />
                    <span className="hidden-on-mobile">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Segment Filter Tabs */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {[
              { id: 'all', label: 'All Contacts', count: filteredFriends.length },
              { id: 'full_ai', label: '⚡ Full AI', count: fullAiContacts.length },
              { id: 'reels_only', label: '🎬 Reels Only', count: reelsOnlyContacts.length },
              { id: 'manual', label: '⏸️ Manual Chat', count: manualContacts.length }
            ].map(tab => {
              const isTabActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    background: isTabActive ? '#09090b' : '#ffffff',
                    color: isTabActive ? '#ffffff' : '#52525b',
                    border: '1px solid',
                    borderColor: isTabActive ? '#09090b' : '#e4e4e7',
                    borderRadius: '7px',
                    padding: '6px 12px',
                    fontSize: '0.75rem',
                    fontWeight: isTabActive ? '700' : '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    touchAction: 'manipulation'
                  }}
                >
                  <span>{tab.label}</span>
                  <span style={{
                    fontSize: '0.65rem',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: isTabActive ? '#27272a' : '#f4f4f5',
                    color: isTabActive ? '#ffffff' : '#71717a',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: '700'
                  }}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3 CORE SECTIONS FOR 'ONLY_SELECTED' & STRUCTURED VIEW */}
        {routingConfig.chatMode === 'only_selected' && activeTab === 'all' ? (
          <motion.div layout style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* SECTION 1: FULL AI ACTIVE */}
            <motion.div layout>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a' }} />
                  <h4 style={{ fontSize: '0.92rem', fontWeight: '800', color: '#09090b', margin: 0 }}>
                    1. Full AI Active (Auto-Replies to Messages & Reels)
                  </h4>
                  <span style={{ fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', background: '#f4f4f5', padding: '2px 6px', borderRadius: '4px' }}>
                    {fullAiContacts.length}
                  </span>
                </div>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#71717a', margin: '0 0 12px 16px' }}>
                AI responds automatically to all text messages and shared reels from these selected contacts.
              </p>
              {fullAiContacts.length > 0 ? (
                <motion.div
                  layout
                  className={controlsLayout === 'grid' ? "responsive-contacts-grid" : ""}
                  style={controlsLayout === 'dense' ? { display: 'flex', flexDirection: 'column', gap: '6px' } : (controlsLayout === 'list' ? { display: 'flex', flexDirection: 'column', gap: '10px' } : undefined)}
                >
                  <AnimatePresence>
                    {fullAiContacts.map(renderContactItem)}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <div style={{ padding: '20px', border: '1px dashed #e4e4e7', borderRadius: '8px', textAlign: 'center', fontSize: '0.78rem', color: '#a1a1aa' }}>
                  No contacts currently selected for Full AI. Check a contact below to activate Full AI.
                </div>
              )}
            </motion.div>

            {/* SECTION 2: REELS ONLY */}
            <motion.div layout>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0284c7' }} />
                  <h4 style={{ fontSize: '0.92rem', fontWeight: '800', color: '#09090b', margin: 0 }}>
                    2. Reels Only (Reacts Exclusively to Shared Reels)
                  </h4>
                  <span style={{ fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', background: '#f4f4f5', padding: '2px 6px', borderRadius: '4px' }}>
                    {reelsOnlyContacts.length}
                  </span>
                </div>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#71717a', margin: '0 0 12px 16px' }}>
                AI only reacts with witty quips or reactions when these contacts share an Instagram Reel or Meme. Direct text chats stay manual.
              </p>
              {reelsOnlyContacts.length > 0 ? (
                <motion.div
                  layout
                  className={controlsLayout === 'grid' ? "responsive-contacts-grid" : ""}
                  style={controlsLayout === 'dense' ? { display: 'flex', flexDirection: 'column', gap: '6px' } : (controlsLayout === 'list' ? { display: 'flex', flexDirection: 'column', gap: '10px' } : undefined)}
                >
                  <AnimatePresence>
                    {reelsOnlyContacts.map(renderContactItem)}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <div style={{ padding: '20px', border: '1px dashed #e4e4e7', borderRadius: '8px', textAlign: 'center', fontSize: '0.78rem', color: '#a1a1aa' }}>
                  No contacts in Reels Only mode.
                </div>
              )}
            </motion.div>

            {/* SECTION 3: MANUAL CHAT / PAUSED (UNSELECTED) */}
            <motion.div layout>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d4d4d8' }} />
                  <h4 style={{ fontSize: '0.92rem', fontWeight: '800', color: '#09090b', margin: 0 }}>
                    3. Manual Chat / Paused (Not Selected)
                  </h4>
                  <span style={{ fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', background: '#f4f4f5', padding: '2px 6px', borderRadius: '4px' }}>
                    {manualContacts.length}
                  </span>
                </div>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#71717a', margin: '0 0 12px 16px' }}>
                AI is completely silenced for these unselected contacts. You chat with them manually on Instagram.
              </p>
              {manualContacts.length > 0 ? (
                <motion.div
                  layout
                  className={controlsLayout === 'grid' ? "responsive-contacts-grid" : ""}
                  style={controlsLayout === 'dense' ? { display: 'flex', flexDirection: 'column', gap: '6px' } : (controlsLayout === 'list' ? { display: 'flex', flexDirection: 'column', gap: '10px' } : undefined)}
                >
                  <AnimatePresence>
                    {manualContacts.map(renderContactItem)}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <div style={{ padding: '20px', border: '1px dashed #e4e4e7', borderRadius: '8px', textAlign: 'center', fontSize: '0.78rem', color: '#a1a1aa' }}>
                  All contacts are currently selected for AI.
                </div>
              )}
            </motion.div>
          </motion.div>
        ) : (
          /* TAB FILTERED OR STANDARD VIEW */
          <motion.div
            layout
            className={controlsLayout === 'grid' ? "responsive-contacts-grid" : ""}
            style={controlsLayout === 'dense' ? { display: 'flex', flexDirection: 'column', gap: '6px' } : (controlsLayout === 'list' ? { display: 'flex', flexDirection: 'column', gap: '10px' } : undefined)}
          >
            <AnimatePresence>
              {activeTab === 'full_ai' && fullAiContacts.map(renderContactItem)}
              {activeTab === 'reels_only' && reelsOnlyContacts.map(renderContactItem)}
              {activeTab === 'manual' && manualContacts.map(renderContactItem)}
              {activeTab === 'all' && filteredFriends.map(renderContactItem)}
            </AnimatePresence>
            {((activeTab === 'full_ai' && fullAiContacts.length === 0) ||
              (activeTab === 'reels_only' && reelsOnlyContacts.length === 0) ||
              (activeTab === 'manual' && manualContacts.length === 0) ||
              (activeTab === 'all' && filteredFriends.length === 0)) && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0', color: '#a1a1aa', fontSize: '0.85rem' }}>
                  No contacts found matching this view.
                </div>
              )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
