'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://instagram-ai-bot-64tf.onrender.com';

const STORAGE_NODES_KEY = 'chatter_social_nodes_v8';
const STORAGE_CONFIG_KEY = 'chatter_persona_config_v8';
const STORAGE_DELETED_KEY = 'chatter_deleted_names_v2';

export const ROOT_NODE = {
  id: 'sam',
  name: 'Sam Joshua',
  handle: '@catovidz',
  sub: 'Creator / Core Node',
  isRoot: true,
  relationship: 'Root Persona',
  children: []
};

export const DEFAULT_GRAPH_DATA = [ROOT_NODE];

export function deduplicateNodes(nodesList) {
  if (!Array.isArray(nodesList) || nodesList.length === 0) return DEFAULT_GRAPH_DATA;

  const root = nodesList.find(n => n.isRoot) || DEFAULT_GRAPH_DATA[0];
  const listWithoutRoot = nodesList.filter(n => !n.isRoot);

  const merged = [];

  for (const node of listWithoutRoot) {
    const rawName = (node.name || '').trim();
    if (!rawName) continue;

    const cleanSenderId = (node.senderId || '').trim();
    const cleanHandle = (node.handle || '').replace(/^@/, '').toLowerCase().trim();
    const cleanNameLower = rawName.toLowerCase();

    // Find any existing node in merged that matches authoritatively
    const existingIndex = merged.findIndex(m => {
      // 1. Authoritative Sender ID match
      if (cleanSenderId && m.senderId && m.senderId.trim() === cleanSenderId) return true;
      // 2. Authoritative Instagram Handle match
      const mHandle = (m.handle || '').replace(/^@/, '').toLowerCase().trim();
      if (cleanHandle && mHandle && cleanHandle === mHandle) return true;
      // 3. Exact name match
      const mName = (m.name || '').toLowerCase().trim();
      if (cleanNameLower && mName && cleanNameLower === mName) return true;
      return false;
    });

    if (existingIndex === -1) {
      merged.push({ ...node });
    } else {
      const existing = merged[existingIndex];
      // Keep the updated/more specific name
      if (node.name && node.name.trim() && node.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
        existing.name = node.name.trim();
        existing.id = existing.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      }
      // Merge best non-empty attributes
      if (!existing.handle && node.handle) existing.handle = node.handle;
      if (!existing.senderId && node.senderId) existing.senderId = node.senderId;
      if (!existing.profilePic && node.profilePic) existing.profilePic = node.profilePic;
      if (!existing.dob && (node.dob || node.dateOfBirth)) existing.dob = node.dob || node.dateOfBirth;
      if (!existing.category && node.category) existing.category = node.category;
      if (node.personalNotes && (!existing.personalNotes || node.personalNotes.length > existing.personalNotes.length)) {
        existing.personalNotes = node.personalNotes;
      }
      if (typeof node.aiEnabled === 'boolean') existing.aiEnabled = node.aiEnabled;
      if (typeof node.replyToMessages === 'boolean') existing.replyToMessages = node.replyToMessages;
      if (typeof node.replyToReelsAndPosts === 'boolean') existing.replyToReelsAndPosts = node.replyToReelsAndPosts;
      if (typeof node.chatsCount === 'number') existing.chatsCount = node.chatsCount;
      if (typeof node.reelsCount === 'number') existing.reelsCount = node.reelsCount;
      if (typeof node.messageCount === 'number') existing.messageCount = node.messageCount;

      // Merge facts
      const factSet = new Set([...(existing.facts || []), ...(node.facts || [])]);
      existing.facts = Array.from(factSet);

      // Merge lore
      const loreSet = new Set([...(existing.lore || []), ...(node.lore || [])]);
      existing.lore = Array.from(loreSet);

      // Merge connections
      const connTargets = new Set((existing.connections || []).map(c => (c.targetName || '').toLowerCase()));
      (node.connections || []).forEach(c => {
        if (c.targetName && !connTargets.has(c.targetName.toLowerCase())) {
          existing.connections.push(c);
          connTargets.add(c.targetName.toLowerCase());
        }
      });
    }
  }

  const result = [root, ...merged];
  root.children = result.filter(n => !n.isRoot).map(n => n.id);
  return result;
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [nodes, setNodes] = useState(DEFAULT_GRAPH_DATA);
  // Track names/ids that were explicitly deleted locally so syncBackend never re-adds them
  // Seeded from localStorage so deletes persist across page refreshes
  const deletedNamesRef = useRef((() => {
    try {
      const stored = localStorage.getItem(STORAGE_DELETED_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  })());
  // Helper to persist deleted set to localStorage
  const persistDeletedNames = (set) => {
    try { localStorage.setItem(STORAGE_DELETED_KEY, JSON.stringify([...set])); } catch(e) {}
  };
  // Track names that were saved locally but not yet confirmed by server (prevent sync overwrite)
  const pendingSavedNamesRef = useRef(new Set());
  const lastRoutingEditTimeRef = useRef(0);
  const activeRoutingSavesRef = useRef(0);
  const routingSaveQueueRef = useRef(Promise.resolve());
  const [selectedNode, setSelectedNode] = useState(null);
  const [routingConfig, setRoutingConfigState] = useState({
    chatMode: 'everyone_except',
    excludedContactIds: ['29005624469042002', '877566845441453'], // Bhavani & Rajveer excluded by default for Sam's manual chat
    includedContactIds: [],
    globalBotActive: true
  });

  const setRoutingConfig = useCallback((updater) => {
    lastRoutingEditTimeRef.current = Date.now();
    setRoutingConfigState(updater);
  }, []);
  const [toastMessage, setToastMessage] = useState('');

  // AI Interview Modal State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState(null);

  // Link Instagram ID Modal State
  const [linkingTargetPerson, setLinkingTargetPerson] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  }, []);

  // Hydration from LocalStorage with instant deduplication & live polling
  useEffect(() => {
    try {
      const cachedNodes = localStorage.getItem(STORAGE_NODES_KEY);
      if (cachedNodes) {
        const parsed = JSON.parse(cachedNodes);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const deduplicated = deduplicateNodes(parsed);
          setNodes(deduplicated);
        }
      }
      const cachedConfig = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (cachedConfig) {
        setRoutingConfigState(prev => ({ ...prev, ...JSON.parse(cachedConfig) }));
      }
    } catch (e) {
      console.warn('LocalStorage hydration note:', e);
    }

    syncBackend();

    // Live background polling every 8 seconds to sync chat & reel counts smoothly
    const interval = setInterval(() => {
      syncBackend();
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  const syncBackend = async () => {
    try {
      // 1. Sync social graph directly from live MongoDB database
      const res = await fetch(`${API_BASE}/api/social-graph`);
      const data = await res.json();
      if (data.success && Array.isArray(data.nodes) && data.nodes.length > 0) {
        const pendingSaved = pendingSavedNamesRef.current;

        const serverContacts = data.nodes.map(sn => {
          const snName = sn.name || '';
          const snId = snName.toLowerCase().replace(/[^a-z0-9]/g, '_');
          const chatsCount = typeof sn.chatsCount === 'number' ? sn.chatsCount : (sn.messageCount || 0);
          const reelsCount = typeof sn.reelsCount === 'number' ? sn.reelsCount : 0;
          return {
            id: snId,
            _id: sn._id,
            name: snName,
            handle: sn.instagramHandle || '',
            senderId: sn.senderId || '',
            profilePic: sn.profilePic || '',
            aiEnabled: sn.aiEnabled !== false,
            replyToMessages: sn.replyToMessages !== false,
            replyToReelsAndPosts: sn.replyToReelsAndPosts !== false,
            chatsCount,
            reelsCount,
            messageCount: chatsCount,
            relationship: sn.relationshipToSam || 'Friend',
            category: sn.category || 'online_friend',
            dob: sn.dob || '',
            gender: sn.gender || 'unknown',
            personalNotes: sn.personalNotes || (sn.lore || []).join('\n'),
            rollingSummary: sn.relationshipToSam || 'Friend in circle',
            conversationStyle: 'Casual banter',
            importantDates: sn.importantDates || [],
            facts: sn.facts || (sn.lore || []),
            lore: sn.lore || [],
            connections: (sn.connections || []).map(c => ({
              targetName: c.targetName || c.name || '',
              rel: c.relationship || c.rel || 'connected'
            })),
            roastStyle: sn.roastStyle || '',
            idleHours: 6,
            reminderEligible: false
          };
        });

        setNodes(prev => {
          const root = prev.find(n => n.isRoot) || ROOT_NODE;
          root.children = serverContacts.map(n => n.id);

          // If a contact was saved in the last 6s locally, overlay recent edits
          const mergedContacts = serverContacts.map(sn => {
            const local = prev.find(p => !p.isRoot && p.name.toLowerCase() === sn.name.toLowerCase());
            if (local && pendingSaved.has(sn.name.toLowerCase())) {
              return { ...sn, ...local };
            }
            return sn;
          });

          const deduplicated = deduplicateNodes([root, ...mergedContacts]);

          // Prevent unnecessary re-render if data has not changed
          if (prev.length === deduplicated.length) {
            let hasChanged = false;
            for (let i = 0; i < prev.length; i++) {
              const p = prev[i];
              const d = deduplicated[i];
              if (
                p.id !== d.id ||
                p.chatsCount !== d.chatsCount ||
                p.reelsCount !== d.reelsCount ||
                p.aiEnabled !== d.aiEnabled ||
                (p.facts || []).length !== (d.facts || []).length
              ) {
                hasChanged = true;
                break;
              }
            }
            if (!hasChanged) {
              return prev; // Same reference -> no re-render!
            }
          }

          try { localStorage.setItem(STORAGE_NODES_KEY, JSON.stringify(deduplicated)); } catch(e) {}
          return deduplicated;
        });
      }

      // 2. Sync persona config
      const editTimestampBefore = lastRoutingEditTimeRef.current;
      const personaRes = await fetch(`${API_BASE}/api/persona`);
      const pData = await personaRes.json();
      if (pData && (pData.chatMode || pData.globalBotActive !== undefined)) {
        if (activeRoutingSavesRef.current === 0 && lastRoutingEditTimeRef.current === editTimestampBefore && Date.now() - editTimestampBefore > 6000) {
          setRoutingConfigState({
            chatMode: pData.chatMode || 'everyone_except',
            excludedContactIds: (pData.excludedContactIds || []).filter(Boolean),
            includedContactIds: (pData.includedContactIds || []).filter(Boolean),
            globalBotActive: pData.globalBotActive !== undefined ? pData.globalBotActive : true
          });
          localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify({
            chatMode: pData.chatMode || 'everyone_except',
            excludedContactIds: (pData.excludedContactIds || []).filter(Boolean),
            includedContactIds: (pData.includedContactIds || []).filter(Boolean),
            globalBotActive: pData.globalBotActive !== undefined ? pData.globalBotActive : true
          }));
        }
      }
    } catch (e) {
      console.warn('Backend sync note (using cached):', e.message);
    }
  };

  // Optimistic Save Node
  const saveNode = async (accumulatedNode, duplicateNamesToDelete = []) => {
    if (!accumulatedNode?.name) return;

    const cleanName = accumulatedNode.name.trim();
    let oldName = (accumulatedNode.oldName || '').trim();

    // Auto-detect oldName if renaming an existing node
    if (!oldName) {
      const match = nodes.find(n =>
        !n.isRoot && (
          (accumulatedNode.senderId && n.senderId && n.senderId === accumulatedNode.senderId) ||
          (accumulatedNode.id && n.id === accumulatedNode.id) ||
          (accumulatedNode.handle && n.handle && n.handle.replace(/^@/, '').toLowerCase() === (accumulatedNode.handle || accumulatedNode.instagramHandle || '').replace(/^@/, '').toLowerCase())
        )
      );
      if (match && match.name.toLowerCase() !== cleanName.toLowerCase()) {
        oldName = match.name.trim();
      }
    }

    const id = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const toDelete = Array.isArray(duplicateNamesToDelete) ? [...duplicateNamesToDelete] : [...(accumulatedNode.duplicateNamesToDelete || [])];
    if (oldName && oldName.toLowerCase() !== cleanName.toLowerCase() && !toDelete.some(d => d.toLowerCase() === oldName.toLowerCase())) {
      toDelete.push(oldName);
    }

    // Mark as pending save so syncBackend won't overwrite during the save round-trip
    pendingSavedNamesRef.current.add(cleanName.toLowerCase());
    if (oldName) {
      deletedNamesRef.current.add(oldName.toLowerCase());
      persistDeletedNames(deletedNamesRef.current);
    }
    // Make sure new cleanName is NOT marked as deleted
    deletedNamesRef.current.delete(cleanName.toLowerCase());
    persistDeletedNames(deletedNamesRef.current);

    setTimeout(() => {
      pendingSavedNamesRef.current.delete(cleanName.toLowerCase());
    }, 6000);

    const formattedNode = {
      id,
      name: cleanName,
      handle: accumulatedNode.instagramHandle || accumulatedNode.handle || '',
      senderId: accumulatedNode.senderId || '',
      profilePic: accumulatedNode.profilePic || '',
      relationship: accumulatedNode.relationshipToSam || accumulatedNode.relationship || 'Friend',
      category: accumulatedNode.category || 'online_friend',
      dob: accumulatedNode.dob || accumulatedNode.dateOfBirth || '',
      gender: accumulatedNode.gender || 'unknown',
      personalNotes: accumulatedNode.personalNotes || (accumulatedNode.lore || []).join('\n'),
      rollingSummary: accumulatedNode.rollingSummary || accumulatedNode.relationshipToSam || 'Friend in circle',
      conversationStyle: accumulatedNode.conversationStyle || 'Casual banter',
      importantDates: accumulatedNode.importantDates || [],
      facts: accumulatedNode.facts || accumulatedNode.lore || [],
      lore: accumulatedNode.lore || [],
      connections: (accumulatedNode.connections || []).map(c => ({
        targetName: c.targetName || c.name || '',
        rel: c.relationship || c.rel || 'connected'
      })),
      roastStyle: accumulatedNode.roastStyle || 'Playful natural banter',
      aiEnabled: accumulatedNode.aiEnabled !== false,
      replyToMessages: accumulatedNode.replyToMessages !== false,
      replyToReelsAndPosts: accumulatedNode.replyToReelsAndPosts !== false,
      chatsCount: typeof accumulatedNode.chatsCount === 'number' ? accumulatedNode.chatsCount : (accumulatedNode.messageCount || 0),
      reelsCount: typeof accumulatedNode.reelsCount === 'number' ? accumulatedNode.reelsCount : 0,
      messageCount: typeof accumulatedNode.chatsCount === 'number' ? accumulatedNode.chatsCount : (accumulatedNode.messageCount || 0),
      idleHours: 4,
      reminderEligible: true
    };

    setNodes(prev => {
      const toDeleteLower = new Set(toDelete.map(d => d.toLowerCase()));
      if (oldName) toDeleteLower.add(oldName.toLowerCase());

      // Filter out duplicate and old names
      const filtered = prev.filter(n => {
        if (n.isRoot) return true;
        return !toDeleteLower.has((n.name || '').toLowerCase());
      });

      // Match by cleanName, senderId, or id
      const existingIdx = filtered.findIndex(n =>
        !n.isRoot && (
          n.name.toLowerCase() === cleanName.toLowerCase() ||
          (formattedNode.senderId && n.senderId && n.senderId === formattedNode.senderId) ||
          (accumulatedNode.id && n.id === accumulatedNode.id)
        )
      );

      let next;
      if (existingIdx >= 0) {
        next = [...filtered];
        next[existingIdx] = { ...next[existingIdx], ...formattedNode, id, name: cleanName };
      } else {
        next = [...filtered, formattedNode];
      }

      const deduplicated = deduplicateNodes(next);
      try {
        localStorage.setItem(STORAGE_NODES_KEY, JSON.stringify(deduplicated));
      } catch (e) {}
      return deduplicated;
    });

    setSelectedNode(formattedNode);
    setIsAiModalOpen(false);
    showToast(`✅ Saved ${cleanName} to Knowledge Tree & DB!`);

    try {
      await fetch(`${API_BASE}/api/social-graph/node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          oldName: oldName || '',
          duplicateNamesToDelete: toDelete,
          instagramHandle: formattedNode.handle,
          senderId: formattedNode.senderId,
          relationshipToSam: formattedNode.relationship,
          category: formattedNode.category,
          dob: formattedNode.dob,
          personalNotes: formattedNode.personalNotes,
          gender: formattedNode.gender,
          lore: formattedNode.lore,
          roastStyle: formattedNode.roastStyle,
          connections: formattedNode.connections.map(c => ({
            targetName: c.targetName,
            relationship: c.rel
          }))
        })
      });

      for (const dup of toDelete) {
        if (dup && dup.trim().toLowerCase() !== cleanName.toLowerCase()) {
          await fetch(`${API_BASE}/api/social-graph/node/${encodeURIComponent(dup)}?keepMemory=true`, {
            method: 'DELETE'
          });
        }
      }
    } catch (err) {
      console.warn('Backend node save error:', err.message);
    }
  };

  // Delete a Person from Knowledge Tree & MongoDB
  const deleteNode = async (nodeOrId) => {
    if (!nodeOrId) return;

    let targetObj = typeof nodeOrId === 'object' ? nodeOrId : null;
    if (!targetObj) {
      targetObj = nodes.find(n =>
        n.id === nodeOrId ||
        n._id === nodeOrId ||
        (n.senderId && n.senderId === nodeOrId) ||
        (n.name && n.name.toLowerCase() === String(nodeOrId).toLowerCase())
      );
    }

    const targetName = targetObj?.name || (typeof nodeOrId === 'string' ? nodeOrId : '');
    const targetSenderId = targetObj?.senderId || '';
    const targetId = targetObj?.id || targetObj?._id || '';

    // Register in deletedNames ref so syncBackend never re-adds this person
    // Persisted to localStorage so it survives page refresh
    if (targetName) deletedNamesRef.current.add(targetName.toLowerCase());
    if (targetId) deletedNamesRef.current.add(targetId.toLowerCase());
    persistDeletedNames(deletedNamesRef.current);

    // Optimistically update local nodes state
    setNodes(prev => {
      const updated = prev.filter(n => {
        if (targetId && (n.id === targetId || n._id === targetId)) return false;
        if (targetSenderId && n.senderId && n.senderId === targetSenderId) return false;
        if (targetName && n.name && n.name.toLowerCase() === targetName.toLowerCase()) return false;
        return true;
      });
      const rootIdx = updated.findIndex(n => n.isRoot);
      if (rootIdx >= 0) {
        updated[rootIdx] = {
          ...updated[rootIdx],
          children: updated.filter(n => !n.isRoot).map(n => n.id)
        };
      }
      try {
        localStorage.setItem(STORAGE_NODES_KEY, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    if (selectedNode && (
      (targetId && (selectedNode.id === targetId || selectedNode._id === targetId)) ||
      (targetName && selectedNode.name?.toLowerCase() === targetName.toLowerCase()) ||
      (targetSenderId && selectedNode.senderId === targetSenderId)
    )) {
      setSelectedNode(null);
    }

    showToast(`Deleted ${targetName || 'contact'} from Directory`);

    try {
      const param = encodeURIComponent(targetName || targetSenderId || targetId);
      await fetch(`${API_BASE}/api/social-graph/node/${param}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.warn('Backend delete node error:', err.message);
    }
  };

  // Update Per-Person AI Reply Mode (Full AI, Reels Only, Paused / Sam Manual)
  const updateContactPreferences = async (contactIdOrSenderId, prefs) => {
    if (!contactIdOrSenderId) return;
    const { aiMode, autoSendReels } = (typeof prefs === 'object' && prefs !== null) ? prefs : { aiMode: prefs };
    let finalAiEnabled;
    let finalReplyMessages;
    let finalReplyReels;

    if (aiMode === 'full_ai') {
      finalAiEnabled = true;
      finalReplyMessages = true;
      finalReplyReels = true;
    } else if (aiMode === 'reels_only') {
      finalAiEnabled = true;
      finalReplyMessages = false;
      finalReplyReels = true;
    } else if (aiMode === 'messages_only') {
      finalAiEnabled = true;
      finalReplyMessages = true;
      finalReplyReels = false;
    } else if (aiMode === 'paused' || aiMode === 'manual') {
      finalAiEnabled = false;
      finalReplyMessages = false;
      finalReplyReels = false;
    }

    let contactName = '';
    setNodes(prev => {
      const next = prev.map(n => {
        const matches = (
          n.id === contactIdOrSenderId ||
          n.senderId === contactIdOrSenderId ||
          n.name.toLowerCase() === String(contactIdOrSenderId).toLowerCase() ||
          (n.handle && n.handle.replace(/^@/, '').toLowerCase() === String(contactIdOrSenderId).replace(/^@/, '').toLowerCase())
        );

        if (matches) {
          contactName = n.name;
          return {
            ...n,
            ...(typeof finalAiEnabled === 'boolean' ? { aiEnabled: finalAiEnabled } : {}),
            ...(typeof finalReplyMessages === 'boolean' ? { replyToMessages: finalReplyMessages } : {}),
            ...(typeof finalReplyReels === 'boolean' ? { replyToReelsAndPosts: finalReplyReels } : {}),
            ...(typeof autoSendReels === 'boolean' ? { autoSendReels } : {})
          };
        }
        return n;
      });
      try {
        localStorage.setItem(STORAGE_NODES_KEY, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    if (selectedNode) {
      setSelectedNode(prev => ({
        ...prev,
        ...(typeof finalAiEnabled === 'boolean' ? { aiEnabled: finalAiEnabled } : {}),
        ...(typeof finalReplyMessages === 'boolean' ? { replyToMessages: finalReplyMessages } : {}),
        ...(typeof finalReplyReels === 'boolean' ? { replyToReelsAndPosts: finalReplyReels } : {}),
        ...(typeof autoSendReels === 'boolean' ? { autoSendReels } : {})
      }));
    }

    const nameStr = contactName || contactIdOrSenderId;
    if (typeof autoSendReels === 'boolean') {
      showToast(autoSendReels ? `🎬 Auto-Reels ENABLED for ${nameStr}!` : `⏸️ Auto-Reels PAUSED for ${nameStr}!`);
    } else if (aiMode === 'reels_only') {
      showToast(`🎬 ${nameStr}: AI will ONLY react to shared Reels!`);
    } else if (aiMode === 'paused' || aiMode === 'manual') {
      showToast(`⏸️ Stopped AI for ${nameStr}. Sam will chat manually!`);
    } else if (aiMode) {
      showToast(`⚡ Full AI auto-reply enabled for ${nameStr}!`);
    }

    try {
      await fetch(`${API_BASE}/api/social-graph/node/${encodeURIComponent(contactIdOrSenderId)}/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiMode,
          aiEnabled: finalAiEnabled,
          replyToMessages: finalReplyMessages,
          replyToReelsAndPosts: finalReplyReels,
          autoSendReels
        })
      });
    } catch (e) {
      console.warn('Preferences backend sync note:', e.message);
    }
  };

  // Add Custom Fact
  const addFact = async (friendIdOrName, fact) => {
    if (!fact?.trim()) return;
    const cleanFact = fact.trim();

    setNodes(prev => {
      const next = prev.map(n => {
        if (n.id === friendIdOrName || n.name.toLowerCase() === friendIdOrName.toLowerCase()) {
          const updatedFacts = [...(n.facts || []), cleanFact];
          const updatedLore = [...(n.lore || []), cleanFact];
          return { ...n, facts: updatedFacts, lore: updatedLore };
        }
        return n;
      });
      localStorage.setItem(STORAGE_NODES_KEY, JSON.stringify(next));
      return next;
    });

    if (selectedNode && (selectedNode.id === friendIdOrName || selectedNode.name.toLowerCase() === friendIdOrName.toLowerCase())) {
      setSelectedNode(prev => ({
        ...prev,
        facts: [...(prev.facts || []), cleanFact],
        lore: [...(prev.lore || []), cleanFact]
      }));
    }

    showToast(`🧠 Fact added: "${cleanFact}"`);

    const target = nodes.find(n => n.id === friendIdOrName || n.name.toLowerCase() === friendIdOrName.toLowerCase());
    if (target?.senderId) {
      try {
        await fetch(`${API_BASE}/api/conversations/${target.senderId}/fact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fact: cleanFact })
        });
      } catch (e) {}
    }
  };

  // Save Routing Rules
  const saveRouting = async (newConfig) => {
    activeRoutingSavesRef.current += 1;
    setRoutingConfig(newConfig);
    try {
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(newConfig));
      const putOperation = routingSaveQueueRef.current.then(async () => {
        const res = await fetch(`${API_BASE}/api/persona`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newConfig)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
      routingSaveQueueRef.current = putOperation.catch(() => {});
      await putOperation;
      showToast(`💾 Saved chat routing! Mode: ${newConfig.chatMode.toUpperCase()}`);
    } catch (e) {
      showToast(`💾 Saved locally! Mode: ${newConfig.chatMode.toUpperCase()}`);
    } finally {
      activeRoutingSavesRef.current = Math.max(0, activeRoutingSavesRef.current - 1);
    }
  };

  // Toggle Global Bot
  const toggleGlobalBot = async () => {
    activeRoutingSavesRef.current += 1;
    const nextState = !routingConfig.globalBotActive;
    const nextConfig = { ...routingConfig, globalBotActive: nextState };
    setRoutingConfig(nextConfig);
    try {
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(nextConfig));
      const putOperation = routingSaveQueueRef.current.then(async () => {
        const res = await fetch(`${API_BASE}/api/persona`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ globalBotActive: nextState })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
      routingSaveQueueRef.current = putOperation.catch(() => {});
      await putOperation;
      showToast(nextState ? '🟢 Global Bot Activated!' : '⏸️ Global Bot Paused!');
    } catch (e) {
      showToast(`⚠️ Saved locally (offline): ${nextState ? 'Global Bot Active' : 'Global Bot Paused'}`);
    } finally {
      activeRoutingSavesRef.current = Math.max(0, activeRoutingSavesRef.current - 1);
    }
  };

  // Start AI Interview
  const startAiInterview = (person = null) => {
    setEditingNode(person);
    setIsAiModalOpen(true);
  };

  // AI Autofill fields for a person based on chat history
  const aiAutofillPerson = async (personName) => {
    if (!personName) return null;
    try {
      const res = await fetch(`${API_BASE}/api/social-graph/node/${encodeURIComponent(personName)}/ai-autofill`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success && data.autofill) {
        return data.autofill;
      }
    } catch (e) {
      console.warn('AI autofill failed:', e.message);
    }
    return null;
  };

  // Link Instagram ID & Merge chatter records
  const linkContactId = async (personName, instagramHandle, senderId) => {
    if (!personName) return false;
    const cleanHandle = instagramHandle ? `@${instagramHandle.replace(/^@/, '').trim()}` : '';

    // Optimistically update local nodes state
    setNodes(prev => {
      const targetLower = personName.toLowerCase();
      // Remove any duplicate node that previously had this handle or senderId
      const filtered = prev.filter(n => {
        if (n.name.toLowerCase() === targetLower) return true;
        if (cleanHandle && n.handle && n.handle.toLowerCase() === cleanHandle.toLowerCase()) return false;
        if (senderId && n.senderId && n.senderId === senderId) return false;
        return true;
      });

      const next = filtered.map(n => {
        if (n.name.toLowerCase() === targetLower) {
          return {
            ...n,
            handle: cleanHandle || n.handle,
            senderId: senderId || n.senderId
          };
        }
        return n;
      });

      try {
        localStorage.setItem(STORAGE_NODES_KEY, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    if (selectedNode && selectedNode.name.toLowerCase() === personName.toLowerCase()) {
      setSelectedNode(prev => ({
        ...prev,
        handle: cleanHandle || prev.handle,
        senderId: senderId || prev.senderId
      }));
    }

    showToast(`🔗 Linked ${personName} with ${cleanHandle || senderId}!`);
    setLinkingTargetPerson(null);

    // Call backend to persist merge and link in MongoDB
    try {
      const res = await fetch(`${API_BASE}/api/social-graph/link-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personName, instagramHandle: cleanHandle, senderId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ Merged & linked ${personName}! AI will recognize them in DMs.`);
        syncBackend();
        return true;
      } else {
        showToast(`⚠️ Link warning: ${data.error || 'Check server connection'}`);
      }
    } catch (err) {
      console.warn('Backend link error:', err.message);
    }
    return false;
  };

  // Quick lookup of contact in DB by handle or username
  const lookupContact = async (handleOrQuery) => {
    if (!handleOrQuery) return null;
    try {
      const clean = handleOrQuery.replace(/^@/, '').trim();
      const res = await fetch(`${API_BASE}/api/contacts/lookup?handle=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (data.found) return data;
    } catch (e) {
      console.warn('Contact lookup error:', e.message);
    }
    return null;
  };

  // Extract attributes from raw chat text using Azure OpenAI
  const extractFromRawChat = async (chatText, currentPerson = {}, userClarifications = '') => {
    try {
      const res = await fetch(`${API_BASE}/api/social-graph/extract-from-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatText, currentPerson, userClarifications })
      });
      const data = await res.json();
      if (data.success && data.extraction) {
        return data.extraction;
      }
    } catch (e) {
      console.warn('Extract from raw chat error:', e.message);
    }
    return null;
  };

  return (
    <AppContext.Provider
      value={{
        nodes,
        selectedNode,
        setSelectedNode,
        routingConfig,
        setRoutingConfig,
        saveRouting,
        toggleGlobalBot,
        saveNode,
        deleteNode,
        updateContactPreferences,
        addFact,
        showToast,
        toastMessage,
        isAiModalOpen,
        setIsAiModalOpen,
        editingNode,
        startAiInterview,
        aiAutofillPerson,
        linkingTargetPerson,
        setLinkingTargetPerson,
        linkContactId,
        lookupContact,
        extractFromRawChat,
        syncBackend,
        API_BASE
      }}
    >
      {children}
    </AppContext.Provider>
  );

}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
}
