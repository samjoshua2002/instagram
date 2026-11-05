'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import PageSkeleton from '../components/Skeletons';
import { useApp } from '../context/AppContext';
import ContactAvatar from '../components/ContactAvatar';
import SuperadminWorkspacePrompt from '../components/SuperadminWorkspacePrompt';
import BusinessPolicyCard from '../components/BusinessPolicyCard';
import { motion } from 'framer-motion';
import { enterMotion } from '../lib/motion';
import { Search, Bot, Film, Pause, X } from 'lucide-react';
import './controls.css';

// Who the AI answers. Short words so each option fits one line on a phone.
const CHAT_MODES = [
  { id: 'everyone', title: 'Everyone', desc: 'AI replies to every DM' },
  { id: 'everyone_except', title: 'Everyone except…', desc: 'Pick people you reply to yourself' },
  { id: 'only_selected', title: 'Only people I pick', desc: 'AI stays quiet for everyone else' },
];

// One switch per contact
const CONTACT_MODES = [
  { id: 'full_ai', label: 'AI', icon: Bot, hint: 'AI replies to messages and reels' },
  { id: 'reels_only', label: 'Reels', icon: Film, hint: 'AI only reacts to shared reels' },
  { id: 'paused', label: 'Off', icon: Pause, hint: 'You reply yourself' },
];

function ControlsPageContent() {
  const {
    nodes,
    routingConfig,
    saveRouting,
    setRoutingConfig,
    updateContactPreferences,
    showToast,
    user,
    isSyncingInitial,
  } = useApp();

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'full_ai' | 'reels_only' | 'manual'

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

  // Bulk Actions: a few requests at a time and one summary toast, not one request burst + toast per contact
  const bulkSetMode = useCallback(async (contacts, aiMode) => {
    let failed = 0;
    for (let i = 0; i < contacts.length; i += 5) {
      const results = await Promise.allSettled(
        contacts.slice(i, i + 5).map(f => updateContactPreferences(f.senderId || f.id, { aiMode }, { silent: true }))
      );
      failed += results.filter(r => r.status === 'rejected').length;
    }
    if (failed) showToast(`${failed} of ${contacts.length} contacts could not be updated. Please try again.`, 'error');
  }, [updateContactPreferences, showToast]);

  const handleSelectAll = useCallback(() => {
    const allKeys = friendNodes.map(n => getContactKey(n)).filter(Boolean);
    const baseConfig = currentConfigRef.current || routingConfig;
    let updated;
    if (baseConfig.chatMode === 'everyone_except') {
      updated = { ...baseConfig, excludedContactIds: allKeys };
      bulkSetMode(friendNodes, 'paused');
    } else if (baseConfig.chatMode === 'only_selected') {
      updated = { ...baseConfig, includedContactIds: allKeys };
      bulkSetMode(friendNodes, 'full_ai');
    }
    if (updated) queueSave(updated);
  }, [friendNodes, routingConfig, getContactKey, queueSave, bulkSetMode]);

  const handleClearAll = useCallback(() => {
    const baseConfig = currentConfigRef.current || routingConfig;
    let updated;
    if (baseConfig.chatMode === 'everyone_except') {
      updated = { ...baseConfig, excludedContactIds: [] };
      bulkSetMode(friendNodes, 'full_ai');
    } else if (baseConfig.chatMode === 'only_selected') {
      updated = { ...baseConfig, includedContactIds: [] };
      bulkSetMode(friendNodes, 'paused');
    }
    if (updated) queueSave(updated);
  }, [friendNodes, routingConfig, queueSave, bulkSetMode]);

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

  const chatMode = routingConfig.chatMode || 'everyone';
  const aiOnCount = friendNodes.filter(n => getContactMode(n) !== 'manual').length;

  // "All on" / "All off": the same routing lists the old Select All / Clear buttons wrote
  const setEveryoneTo = (on) => {
    const total = friendNodes.length;
    if (!total) return;
    if (!window.confirm(on ? `Turn AI on for all ${total} contacts?` : `Turn AI off for all ${total} contacts? You will reply to them yourself.`)) return;
    if (chatMode === 'everyone_except') return on ? handleClearAll() : handleSelectAll();
    if (chatMode === 'only_selected') return on ? handleSelectAll() : handleClearAll();
    bulkSetMode(friendNodes, on ? 'full_ai' : 'paused');
  };

  const setChatMode = (id) => queueSave({ ...(currentConfigRef.current || routingConfig), chatMode: id });

  const tabs = [
    { id: 'all', label: 'All', list: filteredFriends },
    { id: 'full_ai', label: 'AI', list: fullAiContacts },
    { id: 'reels_only', label: 'Reels', list: reelsOnlyContacts },
    { id: 'manual', label: 'Off', list: manualContacts },
  ];
  const visible = (tabs.find(t => t.id === activeTab) || tabs[0]).list;

  const listHint = chatMode === 'everyone_except'
    ? 'Set someone to Off to reply to them yourself.'
    : chatMode === 'only_selected'
      ? 'Set people to AI or Reels to turn replies on for them.'
      : 'Set someone to Off to stop AI for just that person.';

  const renderRow = (contact) => {
    const current = getContactMode(contact);
    const activeId = current === 'manual' ? 'paused' : current;
    return (
      <li key={contact._id || contact.senderId || contact.id || contact.name} className={`ctl-row is-${activeId}`}>
        <ContactAvatar contact={contact} size={36} showStatus={false} />
        <div className="ctl-row-text">
          <div className="ctl-row-name">{contact.name}</div>
          <div className="ctl-row-sub">{contact.handle || contact.relationship || 'Friend'}</div>
        </div>
        <div className="ctl-seg" role="radiogroup" aria-label={`AI for ${contact.name}`}>
          {CONTACT_MODES.map(({ id, label, icon: Icon, hint }) => {
            const on = activeId === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={label}
                title={hint}
                className={on ? 'is-on' : ''}
                onClick={() => { if (!on) handleSetMode(contact, id); }}
              >
                <Icon size={13} aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </li>
    );
  };

  if (isSyncingInitial && !(nodes || []).some(n => !n.isRoot)) {
    return <PageSkeleton variant="table" label="Loading controls" />;
  }

  return (
    <motion.div {...enterMotion} className="page-container ctl-page">
      <header className="ctl-head">
        <h1>AI Reply Rules</h1>
        <p>Choose who the AI replies to on Instagram. Changes save automatically.</p>
      </header>

      {['business', 'agency'].includes(user?.accountType) && <BusinessPolicyCard />}

      <section className="ctl-card">
        <h2 className="ctl-title">Who gets AI replies</h2>
        <div className="ctl-modes" role="radiogroup" aria-label="Who gets AI replies">
          {CHAT_MODES.map(mode => {
            const on = chatMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={`ctl-mode${on ? ' is-on' : ''}`}
                onClick={() => { if (!on) setChatMode(mode.id); }}
              >
                <span className="ctl-radio" aria-hidden="true" />
                <span className="ctl-mode-text">
                  <strong>{mode.title}</strong>
                  <small>{mode.desc}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div className="ctl-status">
          <span className="ctl-dot" aria-hidden="true" />
          AI is on for <b>{aiOnCount}</b> of {friendNodes.length} contacts
        </div>
      </section>

      <section className="ctl-card">
        <div className="ctl-list-head">
          <div>
            <h2 className="ctl-title">Contacts</h2>
            <p className="ctl-hint">{listHint}</p>
          </div>
          <div className="ctl-bulk">
            <button type="button" onClick={() => setEveryoneTo(true)}>All on</button>
            <button type="button" onClick={() => setEveryoneTo(false)}>All off</button>
          </div>
        </div>

        <div className="ctl-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search name or @handle"
            aria-label="Search contacts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="ctl-tabs" role="tablist" aria-label="Filter contacts">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? 'is-on' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label} <span>{tab.list.length}</span>
            </button>
          ))}
        </div>

        {visible.length > 0 ? (
          <ul className="ctl-list">{visible.map(renderRow)}</ul>
        ) : (
          <div className="ctl-empty">
            {search ? `No contacts match "${search}".` : 'No contacts here yet.'}
          </div>
        )}
      </section>
    </motion.div>
  );
}

// The superadmin check lives outside the page so the page's hooks always run in the same order
export default function ControlsPage() {
  const { user, isImpersonating } = useApp();
  if (user?.role === 'superadmin' && !isImpersonating) {
    return (
      <SuperadminWorkspacePrompt
        sectionTitle="Creator Chat Rules & AI Routing"
        sectionCode="03 // CONTROLS"
        sectionDescription="Chat rules, contact exclusion lists, and AI routing logic are configured per individual creator workspace. Choose a creator workspace below to inspect and manage their rules."
      />
    );
  }
  return <ControlsPageContent />;
}
