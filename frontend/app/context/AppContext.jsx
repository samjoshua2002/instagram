'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://instagram-ai-bot-64tf.onrender.com';

const STORAGE_NODES_KEY = 'chatter_social_nodes_v4';
const STORAGE_CONFIG_KEY = 'chatter_persona_config_v4';

export const DEFAULT_GRAPH_DATA = [
  {
    id: 'sam',
    name: 'Sam Joshua',
    handle: '@catovidz',
    sub: 'Creator / Core Node',
    isRoot: true,
    relationship: 'Root Persona',
    children: ['bhavani', 'annie', 'rajveer', 'moksha', 'fami', 'arun', 'roni', 'rubesh']
  },
  {
    id: 'bhavani',
    name: 'Bhavani',
    handle: '@yk_bhavani._.xo',
    senderId: '29005624469042002',
    relationship: 'Closest Online Friend / Medicine Student',
    category: 'close_friend',
    gender: 'female',
    personalNotes: `Bhanvani is one of my closest online friends. Her dad is in the Indian Army, and she is currently studying medicine. We used to send each other reels every day, and she has always been very supportive of me.

Even though we have never met in person, we have become really close over time. We even share a Netflix subscription, and she recently added one of her new friends to our plan as well.

She is genuinely kind, caring, and supportive, but she also loves teasing me and always finds a way to joke around with me. She is currently talking with my sister, Annie, too.

Bhanvani absolutely loves hamsters and is obsessed with reading books. She has a playful personality and enjoys teasing the people she is close to. Overall, she is a very sweet, supportive, caring, and fun-loving online friend who has become a really important person in my life.`,
    rollingSummary: 'Bhavani is a very close online friend studying medicine whose dad is in the Army. She shares a Netflix plan with Sam, loves hamsters and reading, and talks with Sam\'s sister Annie. She loves teasing Sam playfully.',
    conversationStyle: "Uses casual shortcuts like 'u', 'rn', 'fr'; texts in lowercase; playfully teasing; energetic with hamster/book vibes.",
    importantDates: [{ title: 'Birthday', date: 'March 12, 2007', details: 'Born 12th March 2007' }],
    facts: [
      'Her dad is in the Indian Army.',
      'She is currently studying medicine.',
      'Shares a Netflix subscription with Sam (she recently added her friend to it).',
      'Currently talking with Sam\'s sister Annie.',
      'Birthday is on 12th March 2007.',
      'Obsessed with hamsters 🐹 and reading books.'
    ],
    lore: [
      'Dad is in the Indian Army, studying medicine.',
      'Shares a Netflix subscription with Sam.',
      'Talking with Sam\'s sister Annie.',
      'Hamster obsession 🐹 & loves books.',
      'Birthday: 12th March 2007.'
    ],
    connections: [
      { targetName: 'Annie', rel: 'Talking with sister' }
    ],
    roastStyle: 'Gentle playful teasing, no hard insults. Tease about hamster drama or Netflix watchlist.',
    idleHours: 6,
    reminderEligible: true
  },
  {
    id: 'annie',
    name: 'Annie',
    handle: '',
    relationship: 'Sister',
    category: 'relative',
    gender: 'female',
    personalNotes: 'Sam\'s sister. Currently talking and close with Bhavani.',
    rollingSummary: 'Sam\'s sister.',
    facts: ['Sam\'s sister', 'Currently talking with Bhavani'],
    lore: ['Sam\'s sister', 'Currently talking with Bhavani'],
    connections: [{ targetName: 'Bhavani', rel: 'Talking / close with Bhavani' }],
    roastStyle: 'Sisterly teasing and banter.',
    idleHours: 2,
    reminderEligible: false
  },
  {
    id: 'rajveer',
    name: 'Rajveer',
    handle: '@unpredictable_2k26',
    senderId: '877566845441453',
    relationship: 'Day-One Homie / Brother',
    category: 'homie',
    gender: 'male',
    personalNotes: 'Day-one homie. Drama king who trolls Roni uncle about his fake legal team. Texts in Hinglish/Hindi.',
    rollingSummary: 'Rajveer is Sam\'s day-one homie. They constantly banter about Roni uncle and inside jokes.',
    conversationStyle: 'Hinglish slang: bhai, bro, lmao, dramebaaz, uppercase drama.',
    facts: [
      'Drama king of the group',
      'Constantly trolls Roni uncle (fake bank account, legal team)',
      'Threatens to nuke chat'
    ],
    lore: [
      'Drama king of the group',
      'Constantly trolls Roni uncle (fake bank account, legal team)',
      'Threatens to nuke chat'
    ],
    connections: [
      { targetName: 'Roni', rel: 'Favorite trolling victim' },
      { targetName: 'Moksha', rel: 'Close friend / account sharing' },
      { targetName: 'Fami', rel: 'Plots ragebaits against her' }
    ],
    roastStyle: 'Savage Hindi/Hinglish bro banter: "abe chal na lode", "bsdk chup baith".',
    idleHours: 7,
    reminderEligible: true
  },
  {
    id: 'roni',
    name: 'Roni (Roni Uncle)',
    handle: '',
    relationship: 'Group Legend & Running Gag',
    category: 'group_icon',
    gender: 'male',
    personalNotes: 'Legendary group meme friend ("Roni Uncle"). Fake legal team on speed dial, area 51 biryani, axe of justice.',
    rollingSummary: 'Running gag icon of the friend group.',
    facts: [
      'Legendary running gag friend ("Roni Uncle")',
      'Fake legal team on speed dial',
      'Area 51 research & alien biryani',
      'Axe of justice & anime protagonist delusions'
    ],
    lore: [
      'Legendary running gag friend ("Roni Uncle")',
      'Fake legal team on speed dial',
      'Area 51 research & alien biryani',
      'Axe of justice & anime protagonist delusions'
    ],
    connections: [{ targetName: 'Rajveer', rel: 'Trolled constantly by Rajveer' }],
    roastStyle: 'Clown his anime delusions, fake legal team, and axe of justice.',
    idleHours: 14,
    reminderEligible: false
  },
  {
    id: 'moksha',
    name: 'Moksha',
    handle: '@1fyz_2',
    senderId: '1337018008317393',
    relationship: 'Sister Figure / Drama Queen',
    category: 'close_friend',
    gender: 'female',
    personalNotes: 'Close friend & sister figure. High-voltage drama queen. Hardcore Hindi cussing when angry or teasing.',
    rollingSummary: 'Close drama queen friend. Banters in Hindi cussing. Shares account with Rajveer.',
    conversationStyle: 'Rapid-fire Hindi cussing: abey lovde, bkl, mkc, samm, laughing emojis.',
    facts: [
      'High-voltage drama queen',
      'Hardcore Hindi cussing banter (abey lovde, bkl, mkc)',
      'Rajveer texts from her account'
    ],
    lore: [
      'High-voltage drama queen',
      'Hardcore Hindi cussing banter (abey lovde, bkl, mkc)',
      'Rajveer texts from her account'
    ],
    connections: [
      { targetName: 'Rajveer', rel: 'Account sharer & close buddy' },
      { targetName: 'Fami', rel: 'Plots ragebaits against her' }
    ],
    roastStyle: 'Match her Hindi cussing directly: "chup kar chudail", "apni gaand mat phula dramebaaz", "bkl chill kar".',
    idleHours: 8,
    reminderEligible: true
  },
  {
    id: 'fami',
    name: 'Fami',
    handle: '@m4visyzx',
    senderId: '2144547476275057',
    relationship: 'Very Close Friend ("moi")',
    category: 'close_friend',
    gender: 'female',
    personalNotes: 'Goes by Fami (@m4visyzx / moi). High emotional connection. Very easily ragebaited by Rajveer & Moksha.',
    rollingSummary: 'Very close friend of Sam known as "moi".',
    conversationStyle: 'Cute concise texts: "Oyy", "Please reply", "Byy". Sensitive and sweet.',
    facts: [
      'Goes by Fami (Instagram: @m4visyzx, display name "moi")',
      'Easily ragebaited by Rajveer & Moksha',
      'Sends cute texts: "Oyy", "Please reply", "Byy"',
      'Never call her bro/da - speak sweetly'
    ],
    lore: [
      'Goes by Fami (Instagram: @m4visyzx, display name "moi")',
      'Easily ragebaited by Rajveer & Moksha',
      'Sends cute texts: "Oyy", "Please reply", "Byy"',
      'Never call her bro/da - speak sweetly'
    ],
    connections: [
      { targetName: 'Rajveer', rel: 'Gets easily ragebaited' },
      { targetName: 'Moksha', rel: 'Target of inside jokes' }
    ],
    roastStyle: 'Cute playful banter, tease when she gets confused or ragebaited.',
    idleHours: 5.5,
    reminderEligible: true
  },
  {
    id: 'arun',
    name: 'Arun',
    handle: '@graphicsbyarun',
    senderId: '1144338295203170',
    relationship: 'Close Tamil Homie / Designer',
    category: 'homie',
    gender: 'male',
    personalNotes: 'Graphic designer homie. Texts in Tamil & Tanglish. Shipped as a couple with Rubesh as inside joke.',
    rollingSummary: 'Tamil friend who banters with gay lord jokes.',
    conversationStyle: 'Tamil/Tanglish: dei, summa irunga, gay lord, laughing tears.',
    facts: [
      'Texts in Tamil & Tanglish (dei, summa irunga, gay lord)',
      'Shipped with Rubesh as inside joke'
    ],
    lore: [
      'Texts in Tamil & Tanglish (dei, summa irunga, gay lord)',
      'Shipped with Rubesh as inside joke'
    ],
    connections: [{ targetName: 'Rubesh', rel: 'Inside joke gay lover ship' }],
    roastStyle: 'Tamil roast: "dei mooditu poda gomma", "otha summa iru da", "ne tha da periya gay lord".',
    idleHours: 9,
    reminderEligible: true
  },
  {
    id: 'rubesh',
    name: 'Rubesh',
    handle: '',
    relationship: 'Friend in Group',
    category: 'group_icon',
    gender: 'male',
    personalNotes: 'Friend shipped with Arun as inside joke running gag.',
    rollingSummary: 'Running joke couple with Arun.',
    facts: ['Running joke partner with Arun ("U and Rubesh gay lovers breakup ha")'],
    lore: ['Running joke partner with Arun ("U and Rubesh gay lovers breakup ha")'],
    connections: [{ targetName: 'Arun', rel: 'Shipped as a couple with Arun' }],
    roastStyle: 'Bring up the Arun ship joke.',
    idleHours: 20,
    reminderEligible: false
  }
];

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [nodes, setNodes] = useState(DEFAULT_GRAPH_DATA);
  const [selectedNode, setSelectedNode] = useState(null);
  const [routingConfig, setRoutingConfig] = useState({
    chatMode: 'everyone_except',
    excludedContactIds: ['29005624469042002', '877566845441453'], // Bhavani & Rajveer excluded by default for Sam's manual chat
    includedContactIds: [],
    globalBotActive: true
  });
  const [toastMessage, setToastMessage] = useState('');

  // AI Interview Modal State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  }, []);

  // Hydration from LocalStorage
  useEffect(() => {
    try {
      const cachedNodes = localStorage.getItem(STORAGE_NODES_KEY);
      if (cachedNodes) {
        const parsed = JSON.parse(cachedNodes);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setNodes(parsed);
        }
      }
      const cachedConfig = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (cachedConfig) {
        setRoutingConfig(prev => ({ ...prev, ...JSON.parse(cachedConfig) }));
      }
    } catch (e) {
      console.warn('LocalStorage hydration note:', e);
    }

    syncBackend();
  }, []);

  const syncBackend = async () => {
    try {
      // 1. Sync social graph
      const res = await fetch(`${API_BASE}/api/social-graph`);
      const data = await res.json();
      if (data.success && Array.isArray(data.nodes) && data.nodes.length > 0) {
        const root = DEFAULT_GRAPH_DATA[0];
        const serverNodes = data.nodes.map(n => {
          const defaultMatch = DEFAULT_GRAPH_DATA.find(d => d.name.toLowerCase() === n.name.toLowerCase());
          return {
            id: n.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            name: n.name,
            handle: n.instagramHandle || defaultMatch?.handle || '',
            senderId: n.senderId || defaultMatch?.senderId || '',
            relationship: n.relationshipToSam || defaultMatch?.relationship || 'Friend',
            category: defaultMatch?.category || 'close_friend',
            gender: n.gender || defaultMatch?.gender || 'unknown',
            personalNotes: defaultMatch?.personalNotes || (n.lore || []).join('\n'),
            rollingSummary: defaultMatch?.rollingSummary || n.relationshipToSam,
            conversationStyle: defaultMatch?.conversationStyle || 'Casual banter',
            importantDates: defaultMatch?.importantDates || [],
            facts: defaultMatch?.facts || (n.lore || []),
            lore: n.lore || defaultMatch?.lore || [],
            connections: (n.connections || []).map(c => ({
              targetName: c.targetName,
              rel: c.relationship || c.rel || 'connected'
            })),
            roastStyle: n.roastStyle || defaultMatch?.roastStyle || '',
            idleHours: defaultMatch?.idleHours || 6,
            reminderEligible: defaultMatch?.reminderEligible || false
          };
        });

        const merged = [root];
        const existingNames = new Set();
        serverNodes.forEach(sn => {
          merged.push(sn);
          existingNames.add(sn.name.toLowerCase());
        });
        DEFAULT_GRAPH_DATA.forEach(dn => {
          if (!dn.isRoot && !existingNames.has(dn.name.toLowerCase())) {
            merged.push(dn);
          }
        });

        root.children = merged.filter(m => !m.isRoot).map(m => m.id);
        setNodes(merged);
        localStorage.setItem(STORAGE_NODES_KEY, JSON.stringify(merged));
      }

      // 2. Sync persona config
      const personaRes = await fetch(`${API_BASE}/api/persona`);
      const pData = await personaRes.json();
      if (pData && (pData.chatMode || pData.globalBotActive !== undefined)) {
        setRoutingConfig({
          chatMode: pData.chatMode || 'everyone_except',
          excludedContactIds: pData.excludedContactIds || [],
          includedContactIds: pData.includedContactIds || [],
          globalBotActive: pData.globalBotActive !== undefined ? pData.globalBotActive : true
        });
        localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify({
          chatMode: pData.chatMode || 'everyone_except',
          excludedContactIds: pData.excludedContactIds || [],
          includedContactIds: pData.includedContactIds || [],
          globalBotActive: pData.globalBotActive !== undefined ? pData.globalBotActive : true
        }));
      }
    } catch (e) {
      console.warn('Backend sync note (using cached):', e.message);
    }
  };

  // Optimistic Save Node
  const saveNode = async (accumulatedNode) => {
    if (!accumulatedNode?.name) return;

    const cleanName = accumulatedNode.name.trim();
    const id = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_');

    const formattedNode = {
      id,
      name: cleanName,
      handle: accumulatedNode.instagramHandle || accumulatedNode.handle || '',
      senderId: accumulatedNode.senderId || '',
      relationship: accumulatedNode.relationshipToSam || accumulatedNode.relationship || 'Friend',
      category: accumulatedNode.category || 'close_friend',
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
      idleHours: 4,
      reminderEligible: true
    };

    // Instant React state update
    setNodes(prev => {
      const existingIdx = prev.findIndex(n => n.name.toLowerCase() === cleanName.toLowerCase());
      let next;
      if (existingIdx >= 0) {
        next = [...prev];
        next[existingIdx] = { ...next[existingIdx], ...formattedNode };
      } else {
        next = [...prev, formattedNode];
      }

      const rootIdx = next.findIndex(n => n.isRoot);
      if (rootIdx >= 0) {
        next[rootIdx] = {
          ...next[rootIdx],
          children: next.filter(n => !n.isRoot).map(n => n.id)
        };
      }

      try {
        localStorage.setItem(STORAGE_NODES_KEY, JSON.stringify(next));
      } catch (e) {}
      return next;
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
          instagramHandle: formattedNode.handle,
          senderId: formattedNode.senderId,
          relationshipToSam: formattedNode.relationship,
          gender: formattedNode.gender,
          lore: formattedNode.lore,
          roastStyle: formattedNode.roastStyle,
          connections: formattedNode.connections.map(c => ({
            targetName: c.targetName,
            relationship: c.rel
          }))
        })
      });
    } catch (err) {
      console.warn('Backend node save error:', err.message);
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
    setRoutingConfig(newConfig);
    try {
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(newConfig));
      await fetch(`${API_BASE}/api/persona`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      showToast(`💾 Saved chat routing! Mode: ${newConfig.chatMode.toUpperCase()}`);
    } catch (e) {
      showToast(`💾 Saved locally! Mode: ${newConfig.chatMode.toUpperCase()}`);
    }
  };

  // Toggle Global Bot
  const toggleGlobalBot = async () => {
    const nextState = !routingConfig.globalBotActive;
    const nextConfig = { ...routingConfig, globalBotActive: nextState };
    setRoutingConfig(nextConfig);
    try {
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(nextConfig));
      await fetch(`${API_BASE}/api/persona`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globalBotActive: nextState })
      });
      showToast(nextState ? '🟢 Global Bot Activated!' : '⏸️ Global Bot Paused!');
    } catch (e) {
      showToast(nextState ? '🟢 Global Bot Activated!' : '⏸️ Global Bot Paused!');
    }
  };

  // Start AI Interview
  const startAiInterview = (person = null) => {
    setEditingNode(person);
    setIsAiModalOpen(true);
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
        addFact,
        showToast,
        toastMessage,
        isAiModalOpen,
        setIsAiModalOpen,
        editingNode,
        startAiInterview,
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
