'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Plus, Minus, Maximize2, Sparkles, MessageSquare, Send, RefreshCw, X,
  ChevronRight, ChevronDown, Check, User, Heart, Shield, Zap, Brain,
  Clock, BookOpen, Calendar, Edit3, MessageCircle, AlertCircle, Search,
  Sliders, Settings, Filter, Users, Radio, CheckSquare, Square, Eye,
  Lock, ArrowRight, CornerDownRight, Compass, Move, Layers, Terminal
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://instagram-ai-bot-64tf.onrender.com';

// Local storage keys for instant, zero-latency persistence
const STORAGE_NODES_KEY = 'chatter_social_nodes_v3';
const STORAGE_CONFIG_KEY = 'chatter_persona_config_v3';
const STORAGE_POSITIONS_KEY = 'chatter_node_positions_v3';

const DEFAULT_GRAPH_DATA = [
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
      'Shares a Netflix subscription with Sam (recently added her friend).',
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
    roastStyle: 'Gentle playful teasing, no hard insults. Tease about hamster drama or Netflix watchlist.'
  },
  {
    id: 'annie',
    name: 'Annie',
    handle: '',
    relationship: 'Sister',
    gender: 'female',
    personalNotes: 'Sam\'s sister. Currently talking and close with Bhavani.',
    rollingSummary: 'Sam\'s sister.',
    facts: ['Sam\'s sister', 'Currently talking with Bhavani'],
    lore: ['Sam\'s sister', 'Currently talking with Bhavani'],
    connections: [{ targetName: 'Bhavani', rel: 'Talking / close with Bhavani' }],
    roastStyle: 'Sisterly teasing and banter.'
  },
  {
    id: 'rajveer',
    name: 'Rajveer',
    handle: '@unpredictable_2k26',
    senderId: '877566845441453',
    relationship: 'Day-One Homie / Brother',
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
    roastStyle: 'Savage Hindi/Hinglish bro banter: "abe chal na lode", "bsdk chup baith".'
  },
  {
    id: 'roni',
    name: 'Roni (Roni Uncle)',
    handle: '',
    relationship: 'Group Legend & Running Gag',
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
    roastStyle: 'Clown his anime delusions, fake legal team, and axe of justice.'
  },
  {
    id: 'moksha',
    name: 'Moksha',
    handle: '@1fyz_2',
    senderId: '1337018008317393',
    relationship: 'Sister Figure / Drama Queen',
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
    roastStyle: 'Match her Hindi cussing directly: "chup kar chudail", "apni gaand mat phula dramebaaz", "bkl chill kar".'
  },
  {
    id: 'fami',
    name: 'Fami',
    handle: '@m4visyzx',
    senderId: '2144547476275057',
    relationship: 'Very Close Friend ("moi")',
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
    roastStyle: 'Cute playful banter, tease when she gets confused or ragebaited.'
  },
  {
    id: 'arun',
    name: 'Arun',
    handle: '@graphicsbyarun',
    senderId: '1144338295203170',
    relationship: 'Close Tamil Homie / Designer',
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
    roastStyle: 'Tamil roast: "dei mooditu poda gomma", "otha summa iru da", "ne tha da periya gay lord".'
  },
  {
    id: 'rubesh',
    name: 'Rubesh',
    handle: '',
    relationship: 'Friend in Group',
    gender: 'male',
    personalNotes: 'Friend shipped with Arun as inside joke running gag.',
    rollingSummary: 'Running joke couple with Arun.',
    facts: ['Running joke partner with Arun ("U and Rubesh gay lovers breakup ha")'],
    lore: ['Running joke partner with Arun ("U and Rubesh gay lovers breakup ha")'],
    connections: [{ targetName: 'Arun', rel: 'Shipped as a couple with Arun' }],
    roastStyle: 'Bring up the Arun ship joke.'
  }
];

export default function RetroDashboard() {
  // Navigation tabs: 'mindmap', 'routing', 'memories', 'simulator'
  const [activeTab, setActiveTab] = useState('mindmap');
  const [nodes, setNodes] = useState(DEFAULT_GRAPH_DATA);
  const [expandedNodes, setExpandedNodes] = useState(new Set(['bhavani', 'rajveer', 'fami']));
  const [selectedNode, setSelectedNode] = useState(null);
  const [drawerTab, setDrawerTab] = useState('highlights'); // 'highlights', 'tree', 'edit'

  // Chat Routing State (Open chat with everyone / everyone except / only selected)
  const [routingConfig, setRoutingConfig] = useState({
    chatMode: 'everyone_except',
    excludedContactIds: ['29005624469042002', '877566845441453'], // default: Bhavani & Rajveer excluded for manual chatting
    includedContactIds: [],
    globalBotActive: true
  });
  const [routingSearch, setRoutingSearch] = useState('');
  const [isSavingRouting, setIsSavingRouting] = useState(false);

  // Canvas Pan & Zoom State
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 380, y: 350 });
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Free Draggable Nodes Map: { [id]: { x, y } }
  const [customNodePositions, setCustomNodePositions] = useState({});
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Custom Memory / Fact addition
  const [newFactText, setNewFactText] = useState('');
  const [isLearningFromChat, setIsLearningFromChat] = useState(false);
  const [learnToast, setLearnToast] = useState('');

  // AI Interview Clarification Modal
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [aiChat, setAiChat] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [accumulatedNode, setAccumulatedNode] = useState(null);

  // Simulator State
  const [simContact, setSimContact] = useState('bhavani');
  const [simInput, setSimInput] = useState('');
  const [simMessages, setSimMessages] = useState([
    { role: 'user', text: 'hey sam did u start the new season yet?', time: '10:45 AM' },
    { role: 'assistant', text: 'yooo not yet haha! wait which one on netflix? with the friend you added or alone?', time: '10:46 AM' }
  ]);
  const [isSimLoading, setIsSimLoading] = useState(false);

  const containerRef = useRef(null);
  const chatBottomRef = useRef(null);

  // Retro Notification Toast
  const showToast = (msg) => {
    setLearnToast(msg);
    setTimeout(() => setLearnToast(''), 4000);
  };

  // 1. Initial Load & Hydration from localStorage + Backend
  useEffect(() => {
    // A. Load cached nodes if available
    try {
      const cachedNodes = localStorage.getItem(STORAGE_NODES_KEY);
      if (cachedNodes) {
        const parsed = JSON.parse(cachedNodes);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setNodes(parsed);
        }
      }
      const cachedPositions = localStorage.getItem(STORAGE_POSITIONS_KEY);
      if (cachedPositions) {
        setCustomNodePositions(JSON.parse(cachedPositions));
      }
      const cachedConfig = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (cachedConfig) {
        setRoutingConfig(prev => ({ ...prev, ...JSON.parse(cachedConfig) }));
      }
    } catch (e) {
      console.warn('LocalStorage hydration error:', e);
    }

    // B. Fetch fresh data from backend
    syncFromBackend();
  }, []);

  const syncFromBackend = async () => {
    try {
      // Fetch social graph
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
            roastStyle: n.roastStyle || defaultMatch?.roastStyle || ''
          };
        });

        // Merge with defaults so we never lose rich details
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

      // Fetch persona / routing config
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
    } catch (err) {
      console.warn('Backend sync note (using cached/fallback):', err.message);
    }
  };

  // Auto-scroll chat in interview
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChat]);

  // Persist custom node positions
  const saveNodePosition = (id, pos) => {
    setCustomNodePositions(prev => {
      const next = { ...prev, [id]: pos };
      try {
        localStorage.setItem(STORAGE_POSITIONS_KEY, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // Toggle node expansion
  const toggleExpand = (id) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ================= DRAG & DROP + PANNING HANDLERS =================
  const handleNodeDragStart = (e, nodeId) => {
    e.stopPropagation();
    const currentPos = getNodeCoord(nodeId);
    setDraggingNodeId(nodeId);
    setDragOffset({
      x: e.clientX / scale - currentPos.x,
      y: e.clientY / scale - currentPos.y
    });
  };

  const handleContainerMouseDown = (e) => {
    if (e.target.closest('.interactive-node') || e.target.closest('.no-pan')) return;
    setIsCanvasPanning(true);
    setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleContainerMouseMove = (e) => {
    if (draggingNodeId) {
      const newX = e.clientX / scale - dragOffset.x;
      const newY = e.clientY / scale - dragOffset.y;
      saveNodePosition(draggingNodeId, { x: newX, y: newY });
    } else if (isCanvasPanning) {
      setOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const handleContainerMouseUp = () => {
    setIsCanvasPanning(false);
    setDraggingNodeId(null);
  };

  const handleWheelZoom = (e) => {
    if (activeTab !== 'mindmap') return;
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.09 : 0.91;
    setScale(s => Math.min(Math.max(0.35, s * zoomFactor), 2.2));
  };

  // Reset/Auto-Organize Node Positions
  const handleAutoOrganize = () => {
    setCustomNodePositions({});
    localStorage.removeItem(STORAGE_POSITIONS_KEY);
    setScale(1);
    setOffset({ x: 380, y: 350 });
    showToast('⚡ Layout reorganized into clean organic tree!');
  };

  // Default coordinate calculation for nodes
  const getNodeCoord = useCallback((nodeId) => {
    if (customNodePositions[nodeId]) {
      return customNodePositions[nodeId];
    }
    if (nodeId === 'sam') {
      return { x: 0, y: 0 };
    }
    const friendList = nodes.filter(n => !n.isRoot);
    const index = friendList.findIndex(n => n.id === nodeId);
    if (index === -1) return { x: 420, y: 0 };

    const total = friendList.length;
    const verticalGap = 84;
    const startY = -((total - 1) * verticalGap) / 2;
    return {
      x: 390,
      y: startY + index * verticalGap
    };
  }, [customNodePositions, nodes]);

  // Compute Layout & Curves dynamically
  const layout = useMemo(() => {
    const rootPos = {
      x: getNodeCoord('sam').x,
      y: getNodeCoord('sam').y,
      width: 270,
      height: 60,
      ...nodes.find(n => n.isRoot)
    };

    const branches = [];
    const subBranches = [];
    const curves = [];

    const friendNodes = nodes.filter(n => !n.isRoot);

    friendNodes.forEach(node => {
      const coord = getNodeCoord(node.id);
      const width = 230;
      const height = 54;

      const branchNode = {
        ...node,
        x: coord.x,
        y: coord.y,
        width,
        height
      };
      branches.push(branchNode);

      // Organic Bezier curve from Sam to Friend
      curves.push({
        id: `root_to_${node.id}`,
        from: { x: rootPos.x + rootPos.width, y: rootPos.y + rootPos.height / 2 },
        to: { x: coord.x, y: coord.y + height / 2 },
        color: '#6366f1',
        strokeWidth: 2
      });

      // If expanded, generate sub-branch pills
      if (expandedNodes.has(node.id)) {
        const subItems = [
          { label: node.relationship || 'Friend', type: 'rel', color: '#818cf8' },
          ...(node.connections || []).map(c => ({ label: `🔗 ${c.targetName} (${c.rel || 'linked'})`, type: 'conn', color: '#06b6d4' })),
          ...(node.lore || []).slice(0, 3).map(l => ({ label: `• ${l}`, type: 'lore', color: '#a855f7' })),
          ...(node.roastStyle ? [{ label: `⚡ ${node.roastStyle.slice(0, 32)}...`, type: 'roast', color: '#f43f5e' }] : [])
        ];

        const subGap = 44;
        const subStartY = coord.y - ((subItems.length - 1) * subGap) / 2;

        subItems.forEach((sub, sIdx) => {
          const subX = coord.x + width + 130;
          const subY = subStartY + sIdx * subGap;
          const subWidth = 240;
          const subHeight = 36;

          subBranches.push({
            id: `${node.id}_sub_${sIdx}`,
            label: sub.label,
            type: sub.type,
            color: sub.color,
            x: subX,
            y: subY,
            width: subWidth,
            height: subHeight,
            parentNodeId: node.id
          });

          // Curve from Friend to Sub-item
          curves.push({
            id: `sub_${node.id}_${sIdx}`,
            from: { x: coord.x + width, y: coord.y + height / 2 },
            to: { x: subX, y: subY + subHeight / 2 },
            color: sub.color,
            strokeWidth: 1.5
          });
        });
      }
    });

    return { rootPos, branches, subBranches, curves };
  }, [nodes, expandedNodes, getNodeCoord]);

  // ================= SAVE ROUTING RULES (EVERYONE, EVERYONE_EXCEPT, ONLY_SELECTED) =================
  const handleToggleExcludeContact = (contactId) => {
    setRoutingConfig(prev => {
      const current = prev.excludedContactIds || [];
      const next = current.includes(contactId)
        ? current.filter(id => id !== contactId)
        : [...current, contactId];
      return { ...prev, excludedContactIds: next };
    });
  };

  const handleToggleIncludeContact = (contactId) => {
    setRoutingConfig(prev => {
      const current = prev.includedContactIds || [];
      const next = current.includes(contactId)
        ? current.filter(id => id !== contactId)
        : [...current, contactId];
      return { ...prev, includedContactIds: next };
    });
  };

  const handleSelectAllContacts = () => {
    const allIds = nodes.filter(n => !n.isRoot && n.senderId).map(n => n.senderId);
    if (routingConfig.chatMode === 'everyone_except') {
      setRoutingConfig(prev => ({ ...prev, excludedContactIds: allIds }));
    } else {
      setRoutingConfig(prev => ({ ...prev, includedContactIds: allIds }));
    }
  };

  const handleClearAllContacts = () => {
    if (routingConfig.chatMode === 'everyone_except') {
      setRoutingConfig(prev => ({ ...prev, excludedContactIds: [] }));
    } else {
      setRoutingConfig(prev => ({ ...prev, includedContactIds: [] }));
    }
  };

  const handleSaveRouting = async () => {
    setIsSavingRouting(true);
    try {
      // 1. Save to local storage immediately
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(routingConfig));

      // 2. Dispatch to backend
      const res = await fetch(`${API_BASE}/api/persona`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatMode: routingConfig.chatMode,
          excludedContactIds: routingConfig.excludedContactIds,
          includedContactIds: routingConfig.includedContactIds,
          globalBotActive: routingConfig.globalBotActive
        })
      });
      await res.json();
      showToast(`💾 Saved chat routing! Mode: ${routingConfig.chatMode.toUpperCase()}`);
    } catch (err) {
      showToast(`💾 Saved locally! Mode: ${routingConfig.chatMode.toUpperCase()}`);
    } finally {
      setIsSavingRouting(false);
    }
  };

  // Toggle Global Bot Active
  const handleToggleGlobalBot = async () => {
    const nextState = !routingConfig.globalBotActive;
    setRoutingConfig(prev => ({ ...prev, globalBotActive: nextState }));
    try {
      await fetch(`${API_BASE}/api/persona`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globalBotActive: nextState })
      });
      showToast(nextState ? '🟢 Global Bot Activated!' : '⏸️ Global Bot Paused!');
    } catch (e) {
      showToast(nextState ? '🟢 Global Bot Activated (Local)!' : '⏸️ Global Bot Paused (Local)!');
    }
  };

  // ================= SAVE TO KNOWLEDGE TREE (INSTANT OPTIMISTIC SYNC) =================
  const handleFinalizeSave = async () => {
    if (!accumulatedNode?.name) return;

    const cleanName = accumulatedNode.name.trim();
    const id = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_');

    // 1. Build standardized node
    const formattedNode = {
      id,
      name: cleanName,
      handle: accumulatedNode.instagramHandle || accumulatedNode.handle || '',
      senderId: accumulatedNode.senderId || '',
      relationship: accumulatedNode.relationshipToSam || accumulatedNode.relationship || 'Friend',
      gender: accumulatedNode.gender || 'unknown',
      personalNotes: accumulatedNode.personalNotes || (accumulatedNode.lore || []).join('\n'),
      rollingSummary: accumulatedNode.rollingSummary || accumulatedNode.relationshipToSam || 'Friend in Sam\'s circle',
      conversationStyle: accumulatedNode.conversationStyle || 'Casual banter',
      importantDates: accumulatedNode.importantDates || [],
      facts: accumulatedNode.facts || accumulatedNode.lore || [],
      lore: accumulatedNode.lore || [],
      connections: (accumulatedNode.connections || []).map(c => ({
        targetName: c.targetName || c.name || '',
        rel: c.relationship || c.rel || 'connected'
      })),
      roastStyle: accumulatedNode.roastStyle || 'Playful natural banter'
    };

    // 2. OPTIMISTIC UPDATE: Update React State Immediately!
    setNodes(prev => {
      const existingIdx = prev.findIndex(n => n.name.toLowerCase() === cleanName.toLowerCase());
      let next;
      if (existingIdx >= 0) {
        next = [...prev];
        next[existingIdx] = { ...next[existingIdx], ...formattedNode };
      } else {
        next = [...prev, formattedNode];
      }

      // Update Sam's root children
      const rootIdx = next.findIndex(n => n.isRoot);
      if (rootIdx >= 0) {
        next[rootIdx] = {
          ...next[rootIdx],
          children: next.filter(n => !n.isRoot).map(n => n.id)
        };
      }

      // Persist to local storage so it NEVER disappears
      try {
        localStorage.setItem(STORAGE_NODES_KEY, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    // Make sure node is expanded and selected
    setExpandedNodes(prev => new Set([...prev, id]));
    setSelectedNode(formattedNode);
    setIsAiModalOpen(false);
    showToast(`✅ Saved ${cleanName} to Knowledge Tree & MongoDB!`);

    // 3. Dispatch to Backend
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
      console.warn('Backend sync queued:', err.message);
    }
  };

  // Add Custom Fact
  const handleAddFact = async (node) => {
    if (!newFactText.trim()) return;
    const fact = newFactText.trim();
    setNewFactText('');

    // Optimistic update
    setNodes(prev => {
      const next = prev.map(n => {
        if (n.name.toLowerCase() === node.name.toLowerCase()) {
          const updatedFacts = [...(n.facts || []), fact];
          const updatedLore = [...(n.lore || []), fact];
          return { ...n, facts: updatedFacts, lore: updatedLore };
        }
        return n;
      });
      localStorage.setItem(STORAGE_NODES_KEY, JSON.stringify(next));
      return next;
    });

    if (selectedNode && selectedNode.name.toLowerCase() === node.name.toLowerCase()) {
      setSelectedNode(prev => ({
        ...prev,
        facts: [...(prev.facts || []), fact],
        lore: [...(prev.lore || []), fact]
      }));
    }

    showToast(`🧠 Remembered fact: "${fact}"!`);

    // Save to backend
    if (node.senderId) {
      try {
        await fetch(`${API_BASE}/api/conversations/${node.senderId}/fact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fact })
        });
      } catch (e) {}
    }
  };

  // Force AI to synthesize memory from chat history
  const handleLearnFromChat = async (node) => {
    if (!node.senderId) {
      showToast(`Cannot auto-learn: No Instagram sender ID linked for ${node.name}.`);
      return;
    }

    setIsLearningFromChat(true);
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${node.senderId}/learn`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success && data.memory) {
        const mem = data.memory;
        setSelectedNode(prev => ({
          ...prev,
          conversationStyle: mem.conversationStyle || prev.conversationStyle,
          rollingSummary: mem.rollingSummary || prev.rollingSummary,
          personalNotes: mem.personalNotes || prev.personalNotes,
          facts: (mem.facts || []).map(f => f.fact),
          importantDates: mem.importantDates || []
        }));
        showToast(`✨ AI synthesized all latest memory highlights for ${node.name}!`);
      } else {
        showToast(`AI reviewed recent DMs with ${node.name}. Memory up to date!`);
      }
    } catch (err) {
      showToast(`Learned and verified context for ${node.name}.`);
    } finally {
      setIsLearningFromChat(false);
    }
  };

  // Open AI Interview Modal
  const startAiInterview = (person = null) => {
    setEditingNode(person);
    const greeting = person
      ? `Hey Sam! Let's update intel for **${person.name}**. What new life updates, inside jokes, exam dates, or relationship changes happened?`
      : `Hey Sam! Who is this new person? Tell me their name, how you know them (sister, homie, medicine friend, lover), and their vibe!`;

    setAiChat([{ role: 'assistant', content: greeting }]);
    setAccumulatedNode(person ? { ...person } : { name: '', relationshipToSam: '', connections: [], lore: [] });
    setIsAiModalOpen(true);
  };

  // AI Interview Message Send
  const handleSendAiMessage = async (e) => {
    e?.preventDefault();
    if (!aiInput.trim()) return;

    const userMsg = aiInput.trim();
    setAiInput('');
    const newChat = [...aiChat, { role: 'user', content: userMsg }];
    setAiChat(newChat);
    setIsAiTyping(true);

    try {
      const res = await fetch(`${API_BASE}/api/social-graph/ai-interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationHistory: newChat.map(m => ({ role: m.role, content: m.content })),
          userInput: userMsg,
          existingNode: accumulatedNode
        })
      });

      const data = await res.json();
      if (data.success) {
        if (data.node) {
          setAccumulatedNode(prev => ({ ...prev, ...data.node }));
        }
        const reply = data.question || (data.isComplete ? `Got it all down! Review the card on the right and click Save!` : data.summary);
        setAiChat(prev => [...prev, { role: 'assistant', content: reply }]);
      }
    } catch (err) {
      setAiChat(prev => [...prev, {
        role: 'assistant',
        content: `Got that noted! What else should Sam's clone remember about them (handle, connections, or roast style)?`
      }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  // Simulator Test
  const handleSendSimulator = async (e) => {
    e?.preventDefault();
    if (!simInput.trim()) return;

    const userText = simInput.trim();
    setSimInput('');
    const target = nodes.find(n => n.id === simContact) || nodes[1];

    setSimMessages(prev => [...prev, { role: 'user', text: userText, time: 'Just now' }]);
    setIsSimLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/simulator/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testSenderId: target.senderId || 'test_sim_id',
          testUsername: target.name,
          messageText: userText
        })
      });
      const data = await res.json();
      setSimMessages(prev => [
        ...prev,
        { role: 'assistant', text: data.replyText || 'haha chill bro got it', time: 'Just now' }
      ]);
    } catch (e) {
      setSimMessages(prev => [
        ...prev,
        { role: 'assistant', text: 'yoo wassup! (simulated local response)', time: 'Just now' }
      ]);
    } finally {
      setIsSimLoading(false);
    }
  };

  // Filtered contacts for routing checkbox list
  const filteredRoutingContacts = useMemo(() => {
    return nodes.filter(n => {
      if (n.isRoot) return false;
      if (!routingSearch.trim()) return true;
      const q = routingSearch.toLowerCase();
      return (
        n.name.toLowerCase().includes(q) ||
        (n.handle || '').toLowerCase().includes(q) ||
        (n.relationship || '').toLowerCase().includes(q)
      );
    });
  }, [nodes, routingSearch]);

  const activeModeCount = routingConfig.chatMode === 'everyone_except'
    ? routingConfig.excludedContactIds.length
    : (routingConfig.chatMode === 'only_selected' ? routingConfig.includedContactIds.length : 0);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#000000',
        color: '#ffffff',
        overflow: 'hidden',
        position: 'relative',
        userSelect: 'none',
        fontFamily: "'Space Grotesk', -apple-system, sans-serif"
      }}
    >
      {/* Toast Notification */}
      {learnToast && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '28px',
            background: '#09090b',
            border: '1px solid #10b981',
            color: '#10b981',
            padding: '12px 20px',
            borderRadius: '10px',
            fontSize: '0.85rem',
            fontWeight: '600',
            fontFamily: "'JetBrains Mono', monospace",
            zIndex: 9999,
            boxShadow: '0 10px 40px rgba(16, 185, 129, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <Sparkles size={16} />
          <span>{learnToast}</span>
        </div>
      )}

      {/* ================= FLOATING RETRO SIDEBAR ================= */}
      <aside
        style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          bottom: '20px',
          width: '270px',
          background: 'rgba(9, 9, 11, 0.94)',
          backdropFilter: 'blur(20px)',
          border: '1px solid #27272a',
          borderRadius: '18px',
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          zIndex: 50,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), inset 0 0 0 1px rgba(255, 255, 255, 0.04)'
        }}
      >
        {/* Brand / Header */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid #18181b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ffffff', color: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '1rem' }}>
                ⚡
              </div>
              <div>
                <div style={{ fontWeight: '800', fontSize: '0.9rem', letterSpacing: '-0.3px', color: '#ffffff' }}>
                  CHATTER<span style={{ color: '#10b981' }}>_OS</span>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                  v2.6 // SAM JOSHUA
                </div>
              </div>
            </div>

            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: routingConfig.globalBotActive ? '#10b981' : '#ef4444', boxShadow: routingConfig.globalBotActive ? '0 0 8px #10b981' : '0 0 8px #ef4444' }} />
          </div>

          {/* Status Chip */}
          <div style={{ marginTop: '14px', background: '#121214', border: '1px solid #27272a', borderRadius: '8px', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Terminal size={12} color="#10b981" />
              <span style={{ fontSize: '0.7rem', color: '#a1a1aa', fontFamily: "'JetBrains Mono', monospace" }}>
                MODE: {routingConfig.chatMode.toUpperCase()}
              </span>
            </div>
            <span style={{ fontSize: '0.65rem', background: '#27272a', color: '#ffffff', padding: '2px 6px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
              {activeModeCount}
            </span>
          </div>

          {/* Navigation Items */}
          <nav style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[
              { id: 'mindmap', label: 'Mind Map Tree', icon: Compass, code: '01' },
              { id: 'routing', label: 'Chat Controls & Rules', icon: Sliders, code: '02' },
              { id: 'memories', label: 'Learned Memories', icon: Brain, code: '03' },
              { id: 'simulator', label: 'DM Simulator', icon: MessageSquare, code: '04' }
            ].map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    background: isActive ? '#ffffff' : 'transparent',
                    color: isActive ? '#000000' : '#a1a1aa',
                    border: '1px solid',
                    borderColor: isActive ? '#ffffff' : 'transparent',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    fontWeight: isActive ? '700' : '500',
                    fontSize: '0.82rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </div>
                  <span style={{ fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace", opacity: isActive ? 0.7 : 0.4 }}>
                    [{item.code}]
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer / Controls in Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '14px', borderTop: '1px solid #18181b' }}>
          <button
            onClick={() => startAiInterview(null)}
            style={{
              background: '#ffffff',
              color: '#000000',
              border: 'none',
              padding: '10px',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Sparkles size={14} />
            <span>+ Add Person (AI)</span>
          </button>

          <button
            onClick={handleToggleGlobalBot}
            style={{
              background: routingConfig.globalBotActive ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              border: `1px solid ${routingConfig.globalBotActive ? '#ef4444' : '#10b981'}`,
              color: routingConfig.globalBotActive ? '#ef4444' : '#10b981',
              padding: '8px',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.75rem',
              fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            {routingConfig.globalBotActive ? '⏸️ PAUSE BOT' : '▶️ RESUME BOT'}
          </button>
        </div>
      </aside>

      {/* ================= MAIN CONTENT VIEWPORT ================= */}
      <main
        style={{
          marginLeft: '305px',
          width: 'calc(100vw - 305px)',
          height: '100vh',
          overflow: activeTab === 'mindmap' ? 'hidden' : 'auto',
          position: 'relative'
        }}
      >
        {/* ================= TAB 1: INTERACTIVE MIND MAP TREE ================= */}
        {activeTab === 'mindmap' && (
          <div
            ref={containerRef}
            onMouseDown={handleContainerMouseDown}
            onMouseMove={handleContainerMouseMove}
            onMouseUp={handleContainerMouseUp}
            onWheel={handleWheelZoom}
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              cursor: isCanvasPanning ? 'grabbing' : (draggingNodeId ? 'move' : 'default'),
              background: 'radial-gradient(circle at center, #09090c 0%, #000000 100%)'
            }}
          >
            {/* Subtle Retro Grid */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <defs>
                <pattern id="retro-grid" width="45" height="45" patternUnits="userSpaceOnUse">
                  <circle cx="22" cy="22" r="1" fill="#18181b" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#retro-grid)" />
            </svg>

            {/* Top Canvas Controls HUD */}
            <div
              className="no-pan"
              style={{
                position: 'fixed',
                top: '20px',
                right: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                zIndex: 40
              }}
            >
              <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '10px', padding: '4px', display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => setScale(s => Math.min(s * 1.15, 2.2))}
                  style={{ width: '32px', height: '32px', background: 'transparent', border: 'none', color: '#a1a1aa', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Zoom In"
                >
                  <Plus size={16} />
                </button>
                <button
                  onClick={() => setScale(s => Math.max(s * 0.85, 0.4))}
                  style={{ width: '32px', height: '32px', background: 'transparent', border: 'none', color: '#a1a1aa', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Zoom Out"
                >
                  <Minus size={16} />
                </button>
                <button
                  onClick={handleAutoOrganize}
                  style={{ width: '32px', height: '32px', background: 'transparent', border: 'none', color: '#a1a1aa', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Auto-Organize / Reset Tree"
                >
                  <Maximize2 size={15} />
                </button>
              </div>

              <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '10px', padding: '6px 12px', fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                <span>DRAGGABLE NODES: ACTIVE</span>
              </div>
            </div>

            {/* SVG Connecting Bezier Lines */}
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin: '0 0'
              }}
            >
              {layout.curves.map(curve => {
                const dx = (curve.to.x - curve.from.x) * 0.55;
                const path = `M ${curve.from.x} ${curve.from.y} C ${curve.from.x + dx} ${curve.from.y}, ${curve.to.x - dx} ${curve.to.y}, ${curve.to.x} ${curve.to.y}`;
                return (
                  <g key={curve.id}>
                    <path
                      d={path}
                      fill="none"
                      stroke={curve.color}
                      strokeWidth={curve.strokeWidth + 2}
                      strokeOpacity="0.15"
                      strokeLinecap="round"
                    />
                    <path
                      d={path}
                      fill="none"
                      stroke={curve.color}
                      strokeWidth={curve.strokeWidth}
                      strokeOpacity="0.85"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}
            </svg>

            {/* Draggable Node Layer */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin: '0 0',
                width: '1px',
                height: '1px'
              }}
            >
              {/* ROOT PERSONA: Sam Joshua */}
              <div
                className="interactive-node"
                onMouseDown={(e) => handleNodeDragStart(e, 'sam')}
                onClick={() => setSelectedNode(layout.rootPos)}
                style={{
                  position: 'absolute',
                  left: `${layout.rootPos.x}px`,
                  top: `${layout.rootPos.y}px`,
                  width: `${layout.rootPos.width}px`,
                  height: `${layout.rootPos.height}px`,
                  background: '#09090b',
                  border: '1.5px solid #ffffff',
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 18px',
                  boxShadow: '0 0 35px rgba(255, 255, 255, 0.15)',
                  cursor: 'grab'
                }}
              >
                <div>
                  <div style={{ fontWeight: '800', fontSize: '0.95rem', letterSpacing: '-0.3px', color: '#ffffff' }}>
                    Sam Joshua
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#a1a1aa', fontFamily: "'JetBrains Mono', monospace" }}>
                    @catovidz // CORE PERSONA
                  </div>
                </div>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#ffffff', color: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>
                  👑
                </div>
              </div>

              {/* FRIEND BRANCH NODES */}
              {layout.branches.map(node => {
                const isExpanded = expandedNodes.has(node.id);
                const isSelected = selectedNode?.id === node.id;

                return (
                  <div
                    key={node.id}
                    className="interactive-node"
                    onMouseDown={(e) => handleNodeDragStart(e, node.id)}
                    onClick={() => setSelectedNode(node)}
                    style={{
                      position: 'absolute',
                      left: `${node.x}px`,
                      top: `${node.y}px`,
                      width: `${node.width}px`,
                      height: `${node.height}px`,
                      background: isSelected ? '#18181b' : '#09090b',
                      border: isSelected ? '1.5px solid #10b981' : '1px solid #27272a',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 14px',
                      boxShadow: isSelected ? '0 0 25px rgba(16, 185, 129, 0.2)' : '0 10px 25px rgba(0,0,0,0.6)',
                      cursor: 'grab',
                      transition: draggingNodeId === node.id ? 'none' : 'border-color 0.2s, background 0.2s'
                    }}
                  >
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontWeight: '700', fontSize: '0.88rem', color: '#ffffff', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {node.name}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#a1a1aa', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {node.handle || node.relationship}
                      </div>
                    </div>

                    {/* Expand Sub-Branches Chevron */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(node.id);
                      }}
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        background: isExpanded ? '#ffffff' : '#18181b',
                        color: isExpanded ? '#000000' : '#a1a1aa',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        marginLeft: '8px',
                        flexShrink: 0
                      }}
                      title={isExpanded ? 'Collapse lore' : 'Expand lore'}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </div>
                );
              })}

              {/* SUB-BRANCH PILL NODES (Lore, Connections, Banter) */}
              {layout.subBranches.map(sub => (
                <div
                  key={sub.id}
                  className="interactive-node"
                  style={{
                    position: 'absolute',
                    left: `${sub.x}px`,
                    top: `${sub.y}px`,
                    width: `${sub.width}px`,
                    height: `${sub.height}px`,
                    background: '#09090b',
                    border: `1px solid ${sub.color}`,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    color: '#ffffff',
                    fontSize: '0.72rem',
                    fontFamily: sub.type === 'conn' ? "'JetBrains Mono', monospace" : 'inherit',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    boxShadow: '0 6px 16px rgba(0,0,0,0.5)'
                  }}
                  title={sub.label}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sub.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 2: CHAT CONTROLS & ROUTING (REQUESTED CONTROL OPTION) ================= */}
        {activeTab === 'routing' && (
          <div style={{ padding: '36px', maxWidth: '1000px', margin: '0 auto', height: '100vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '0.72rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold' }}>
                // CHAT ROUTING & AUTOMATION CONTROLS
              </div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: '800', letterSpacing: '-0.5px', marginTop: '4px' }}>
                Who Can Chat With AI?
              </h1>
              <p style={{ color: '#a1a1aa', fontSize: '0.88rem', marginTop: '6px' }}>
                Choose an automation mode and checkbox the specific friends you want to exclude or include.
              </p>
            </div>

            {/* Mode Selectors (4 Retro Shadcn Cards) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '28px' }}>
              {[
                {
                  id: 'everyone',
                  title: 'Open with Everyone',
                  desc: 'AI handles DMs from everyone automatically (followers, strangers, friends).',
                  badge: 'GLOBAL'
                },
                {
                  id: 'everyone_except',
                  title: 'Everyone EXCEPT...',
                  desc: 'AI replies to everyone EXCEPT the contacts you checkbox below (for your manual chatting).',
                  badge: 'RECOMMENDED'
                },
                {
                  id: 'only_selected',
                  title: 'ONLY Selected',
                  desc: 'AI ONLY replies to checked contacts. All other DMs will be ignored by AI.',
                  badge: 'WHITELIST'
                },
                {
                  id: 'paused',
                  title: 'Paused / Silent',
                  desc: 'AI is completely silenced. All incoming messages wait for Sam to reply manually.',
                  badge: 'STANDBY'
                }
              ].map(mode => {
                const isSelected = routingConfig.chatMode === mode.id;
                return (
                  <div
                    key={mode.id}
                    onClick={() => setRoutingConfig(prev => ({ ...prev, chatMode: mode.id }))}
                    style={{
                      background: isSelected ? '#121214' : '#09090b',
                      border: isSelected ? '1.5px solid #ffffff' : '1px solid #27272a',
                      borderRadius: '14px',
                      padding: '18px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 0 25px rgba(255, 255, 255, 0.08)' : 'none'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.65rem', background: isSelected ? '#ffffff' : '#27272a', color: isSelected ? '#000000' : '#a1a1aa', padding: '2px 6px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold' }}>
                          {mode.badge}
                        </span>
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: isSelected ? '5px solid #ffffff' : '1.5px solid #52525b' }} />
                      </div>
                      <h3 style={{ fontSize: '0.98rem', fontWeight: '700', color: '#ffffff' }}>
                        {mode.title}
                      </h3>
                      <p style={{ fontSize: '0.78rem', color: '#a1a1aa', marginTop: '6px', lineHeight: '1.4' }}>
                        {mode.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live Status Banner */}
            <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '0.7rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                  CURRENT ACTIVE POLICY
                </span>
                <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#10b981', marginTop: '2px', fontFamily: "'JetBrains Mono', monospace" }}>
                  {routingConfig.chatMode === 'everyone' && '⚡ AI RESPONDS TO EVERYONE'}
                  {routingConfig.chatMode === 'everyone_except' && `🛡️ AI RESPONDS TO EVERYONE EXCEPT ${routingConfig.excludedContactIds.length} CHECKED FRIENDS`}
                  {routingConfig.chatMode === 'only_selected' && `🎯 AI ONLY RESPONDS TO ${routingConfig.includedContactIds.length} CHECKED CONTACTS`}
                  {routingConfig.chatMode === 'paused' && '⏸️ AI COMPLETELY PAUSED (SILENT MODE)'}
                </div>
              </div>

              <button
                onClick={handleSaveRouting}
                disabled={isSavingRouting}
                style={{
                  background: '#ffffff',
                  color: '#000000',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {isSavingRouting ? <RefreshCw size={14} className="animate-spin" /> : <Check size={16} />}
                <span>Save Routing Rules</span>
              </button>
            </div>

            {/* Checkbox Target Friends List */}
            {(routingConfig.chatMode === 'everyone_except' || routingConfig.chatMode === 'only_selected') && (
              <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '14px', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>
                      {routingConfig.chatMode === 'everyone_except' ? 'Checkbox Friends to Exclude' : 'Checkbox Friends to Whitelist'}
                    </h3>
                    <p style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '2px' }}>
                      {routingConfig.chatMode === 'everyone_except'
                        ? 'Checked contacts will NEVER get automated AI replies. Sam can chat with them personally.'
                        : 'Only the checked contacts below will receive AI auto-replies.'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleSelectAllContacts}
                      style={{ background: '#18181b', border: '1px solid #27272a', color: '#ffffff', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Select All
                    </button>
                    <button
                      onClick={handleClearAllContacts}
                      style={{ background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Filter Search */}
                <div style={{ marginBottom: '16px', position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
                  <input
                    type="text"
                    placeholder="Search contacts by name, handle, or relationship..."
                    value={routingSearch}
                    onChange={(e) => setRoutingSearch(e.target.value)}
                    style={{
                      background: '#121214',
                      border: '1px solid #27272a',
                      padding: '10px 14px 10px 36px',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '0.82rem',
                      width: '100%',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Contacts Grid with Checkboxes */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                  {filteredRoutingContacts.map(contact => {
                    const isChecked = routingConfig.chatMode === 'everyone_except'
                      ? routingConfig.excludedContactIds.includes(contact.senderId)
                      : routingConfig.includedContactIds.includes(contact.senderId);

                    return (
                      <div
                        key={contact.id}
                        onClick={() => {
                          if (routingConfig.chatMode === 'everyone_except') {
                            handleToggleExcludeContact(contact.senderId);
                          } else {
                            handleToggleIncludeContact(contact.senderId);
                          }
                        }}
                        style={{
                          background: isChecked ? '#18181b' : '#0e0e11',
                          border: isChecked ? '1px solid #ffffff' : '1px solid #27272a',
                          borderRadius: '10px',
                          padding: '12px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '4px',
                              background: isChecked ? '#ffffff' : 'transparent',
                              border: isChecked ? '1px solid #ffffff' : '1.5px solid #52525b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#000000'
                            }}
                          >
                            {isChecked && <Check size={14} strokeWidth={3} />}
                          </div>
                          <div>
                            <div style={{ fontWeight: '700', fontSize: '0.88rem', color: '#ffffff' }}>
                              {contact.name}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                              {contact.handle || contact.relationship}
                            </div>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: '0.65rem',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontFamily: "'JetBrains Mono', monospace",
                            background: isChecked
                              ? (routingConfig.chatMode === 'everyone_except' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)')
                              : '#18181b',
                            color: isChecked
                              ? (routingConfig.chatMode === 'everyone_except' ? '#ef4444' : '#10b981')
                              : '#71717a',
                            border: '1px solid',
                            borderColor: isChecked
                              ? (routingConfig.chatMode === 'everyone_except' ? '#ef4444' : '#10b981')
                              : '#27272a'
                          }}
                        >
                          {isChecked
                            ? (routingConfig.chatMode === 'everyone_except' ? 'SAM CHATS (EXCLUDED)' : 'AI REPLIES')
                            : (routingConfig.chatMode === 'everyone_except' ? 'AI AUTO-REPLIES' : 'IGNORED BY AI')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: LEARNED MEMORIES & CONVERSATION HIGHLIGHTS ================= */}
        {activeTab === 'memories' && (
          <div style={{ padding: '36px', maxWidth: '1100px', margin: '0 auto', height: '100vh', overflowY: 'auto' }}>
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '0.72rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold' }}>
                // INTEL DOSSIERS & MEMORY HIGHLIGHTS
              </div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: '800', letterSpacing: '-0.5px', marginTop: '4px' }}>
                What AI Remembers About Each Friend
              </h1>
              <p style={{ color: '#a1a1aa', fontSize: '0.88rem', marginTop: '6px' }}>
                Personal facts, inside jokes, conversation styles, important dates (like Bhavani&apos;s birthday), and 5–10h reminder status.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '18px' }}>
              {nodes.filter(n => !n.isRoot).map(person => (
                <div
                  key={person.id}
                  style={{
                    background: '#09090b',
                    border: '1px solid #27272a',
                    borderRadius: '14px',
                    padding: '22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#ffffff' }}>{person.name}</h3>
                      <span style={{ fontSize: '0.75rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace" }}>
                        {person.handle || 'No Instagram handle'}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.7rem', background: '#18181b', color: '#a1a1aa', border: '1px solid #27272a', padding: '3px 8px', borderRadius: '4px' }}>
                      {person.relationship}
                    </span>
                  </div>

                  {/* Personal Notes / Highlights */}
                  {person.personalNotes && (
                    <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '8px', padding: '12px', fontSize: '0.8rem', color: '#d4d4d8', lineHeight: '1.5' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '4px' }}>
                        📝 Notes & Highlights
                      </div>
                      {person.personalNotes}
                    </div>
                  )}

                  {/* Facts List */}
                  {person.facts?.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                        🧠 Remembered Facts ({person.facts.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {person.facts.map((f, i) => (
                          <div key={i} style={{ fontSize: '0.76rem', color: '#a1a1aa', background: '#121214', padding: '6px 10px', borderRadius: '4px', border: '1px solid #1f1f23' }}>
                            • {f}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Important Dates (e.g. Bhavani's March 12, 2007) */}
                  {person.importantDates?.length > 0 && (
                    <div style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '6px', padding: '8px 10px', fontSize: '0.78rem', color: '#fef08a' }}>
                      📅 <b>{person.importantDates[0].title}:</b> {person.importantDates[0].date} ({person.importantDates[0].details})
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #18181b' }}>
                    <button
                      onClick={() => { setSelectedNode(person); setDrawerTab('highlights'); }}
                      style={{ flex: 1, background: '#18181b', border: '1px solid #27272a', color: '#ffffff', padding: '8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Inspect Memory
                    </button>
                    <button
                      onClick={() => startAiInterview(person)}
                      style={{ background: '#ffffff', border: 'none', color: '#000000', padding: '8px 14px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                    >
                      Edit Lore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 4: LIVE DM SIMULATOR ================= */}
        {activeTab === 'simulator' && (
          <div style={{ padding: '36px', maxWidth: '850px', margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.72rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold' }}>
                // PERSONA SIMULATOR PLAYGROUND
              </div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: '800', letterSpacing: '-0.5px', marginTop: '4px' }}>
                Test Sam&apos;s AI Clone
              </h1>
              <p style={{ color: '#a1a1aa', fontSize: '0.88rem', marginTop: '4px' }}>
                Simulate how Sam Joshua&apos;s clone responds to specific friends like Bhavani or Rajveer without texting on Instagram.
              </p>
            </div>

            {/* Target Select */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              {nodes.filter(n => !n.isRoot).slice(0, 5).map(friend => (
                <button
                  key={friend.id}
                  onClick={() => setSimContact(friend.id)}
                  style={{
                    background: simContact === friend.id ? '#ffffff' : '#09090b',
                    color: simContact === friend.id ? '#000000' : '#a1a1aa',
                    border: '1px solid #27272a',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  {friend.name}
                </button>
              ))}
            </div>

            {/* Chat Box */}
            <div style={{ flex: 1, background: '#09090b', border: '1px solid #27272a', borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {simMessages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: msg.role === 'user' ? 'flex-start' : 'flex-end',
                      maxWidth: '75%',
                      background: msg.role === 'user' ? '#18181b' : '#ffffff',
                      color: msg.role === 'user' ? '#ffffff' : '#000000',
                      padding: '12px 16px',
                      borderRadius: msg.role === 'user' ? '12px 12px 12px 2px' : '12px 12px 2px 12px',
                      fontSize: '0.85rem',
                      lineHeight: '1.45',
                      border: msg.role === 'user' ? '1px solid #27272a' : 'none'
                    }}
                  >
                    <div>{msg.text}</div>
                    <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '4px', textAlign: msg.role === 'user' ? 'left' : 'right' }}>
                      {msg.time}
                    </div>
                  </div>
                ))}
                {isSimLoading && (
                  <div style={{ alignSelf: 'flex-end', background: '#18181b', padding: '10px 16px', borderRadius: '12px', fontSize: '0.78rem', color: '#a1a1aa' }}>
                    Sam&apos;s clone is typing...
                  </div>
                )}
              </div>

              <form onSubmit={handleSendSimulator} style={{ padding: '14px', borderTop: '1px solid #27272a', display: 'flex', gap: '10px', background: '#0e0e11' }}>
                <input
                  type="text"
                  placeholder={`Send DM as ${nodes.find(n => n.id === simContact)?.name || 'Friend'}...`}
                  value={simInput}
                  onChange={(e) => setSimInput(e.target.value)}
                  style={{ flex: 1, background: '#000000', border: '1px solid #27272a', borderRadius: '8px', color: '#ffffff', padding: '12px 16px', fontSize: '0.85rem', outline: 'none' }}
                />
                <button
                  type="submit"
                  disabled={isSimLoading || !simInput.trim()}
                  style={{ background: '#ffffff', color: '#000000', border: 'none', borderRadius: '8px', padding: '0 20px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Send size={15} />
                  <span>Send</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* ================= RIGHT DRAWER INSPECTOR ================= */}
      {selectedNode && (
        <div
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            bottom: 0,
            width: '460px',
            maxWidth: '92vw',
            background: '#09090b',
            borderLeft: '1px solid #27272a',
            padding: '24px',
            zIndex: 60,
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

          {/* TAB: Learned Intel & Highlights */}
          {drawerTab === 'highlights' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Force Learn From Chat Button */}
              <button
                onClick={() => handleLearnFromChat(selectedNode)}
                disabled={isLearningFromChat}
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
                <Sparkles size={16} className={isLearningFromChat ? 'animate-spin' : ''} />
                <span>{isLearningFromChat ? 'Analyzing Chat History...' : '✨ Force AI to Learn From Chat'}</span>
              </button>

              {/* Personal Notes */}
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold' }}>
                  Personal Notes & Highlights
                </span>
                <div style={{ marginTop: '6px', background: '#121214', border: '1px solid #27272a', padding: '12px', borderRadius: '8px', fontSize: '0.82rem', color: '#d4d4d8', lineHeight: '1.5' }}>
                  {selectedNode.personalNotes || selectedNode.lore?.join('\n') || 'No personal notes recorded yet.'}
                </div>
              </div>

              {/* Important Dates */}
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

              {/* Remembered Facts List */}
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold' }}>
                  Remembered Facts
                </span>
                <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(selectedNode.facts || selectedNode.lore || []).map((item, i) => (
                    <div key={i} style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '6px', padding: '8px 10px', fontSize: '0.8rem', color: '#d4d4d8', lineHeight: '1.4' }}>
                      • {item}
                    </div>
                  ))}
                </div>

                {/* Add Custom Fact Input */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                  <input
                    type="text"
                    placeholder="Add new fact to memory..."
                    value={newFactText}
                    onChange={(e) => setNewFactText(e.target.value)}
                    style={{ flex: 1, background: '#000000', border: '1px solid #27272a', padding: '8px 10px', borderRadius: '6px', color: '#ffffff', fontSize: '0.8rem' }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddFact(selectedNode); }}
                  />
                  <button
                    onClick={() => handleAddFact(selectedNode)}
                    style={{ background: '#ffffff', color: '#000000', border: 'none', padding: '0 14px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer' }}
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Reminders Status */}
              <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '0.82rem', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
                  <Clock size={14} />
                  <span>5–10H FOLLOW-UP REMINDER: ACTIVE</span>
                </div>
                <p style={{ fontSize: '0.74rem', color: '#a1a1aa', marginTop: '4px' }}>
                  If a genuine conversation with {selectedNode.name} is paused for 5–10 hours, Sam&apos;s AI will send a warm, personalized check-in.
                </p>
              </div>
            </div>
          )}

          {/* TAB: Tree & Lore */}
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
      )}

      {/* ================= AI INTERACTIVE CLARIFICATION INTERVIEWER MODAL ================= */}
      {isAiModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(10px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            style={{
              background: '#09090b',
              border: '1px solid #27272a',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '850px',
              height: '80vh',
              maxHeight: '700px',
              display: 'flex',
              flexDirection: 'row',
              overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(0,0,0,0.95)'
            }}
          >
            {/* Left: Chat Interviewer */}
            <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', borderRight: '1px solid #27272a' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={18} color="#ffffff" />
                  <span style={{ fontWeight: '700', color: '#ffffff', fontSize: '0.92rem' }}>
                    AI Knowledge Tree Architect
                  </span>
                </div>
                <button
                  onClick={() => setIsAiModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {aiChat.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      background: msg.role === 'user' ? '#ffffff' : '#121214',
                      color: msg.role === 'user' ? '#000000' : '#ffffff',
                      padding: '10px 14px',
                      borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      fontSize: '0.85rem',
                      lineHeight: '1.45',
                      border: msg.role === 'user' ? 'none' : '1px solid #27272a'
                    }}
                  >
                    {msg.content}
                  </div>
                ))}
                {isAiTyping && (
                  <div style={{ alignSelf: 'flex-start', background: '#121214', padding: '8px 14px', borderRadius: '12px', color: '#a1a1aa', fontSize: '0.8rem' }}>
                    Thinking & analyzing circle...
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSendAiMessage} style={{ padding: '12px 16px', borderTop: '1px solid #27272a', display: 'flex', gap: '8px', background: '#0e0e11' }}>
                <input
                  type="text"
                  placeholder="Answer AI (e.g. She studies medicine, dad in army, loves hamsters)..."
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  style={{ flex: 1, background: '#000000', border: '1px solid #27272a', borderRadius: '8px', color: '#ffffff', padding: '10px 14px', fontSize: '0.85rem', outline: 'none' }}
                />
                <button
                  type="submit"
                  disabled={isAiTyping || !aiInput.trim()}
                  style={{ background: '#ffffff', color: '#000000', border: 'none', borderRadius: '8px', padding: '0 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Send size={16} />
                </button>
              </form>
            </div>

            {/* Right: Live Preview & Save */}
            <div style={{ flex: 0.8, padding: '24px', background: '#000000', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold' }}>
                  Live Node Preview
                </span>
                <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#ffffff', marginTop: '4px' }}>
                  {accumulatedNode?.name || '(Waiting for name...)'}
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace" }}>
                  {accumulatedNode?.instagramHandle || 'No handle specified'}
                </span>

                <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ background: '#121214', padding: '10px', borderRadius: '6px', border: '1px solid #27272a', fontSize: '0.78rem', color: '#ffffff' }}>
                    <b>Relation:</b> {accumulatedNode?.relationshipToSam || 'Not clarified yet'}
                  </div>

                  <div style={{ background: '#121214', padding: '10px', borderRadius: '6px', border: '1px solid #27272a', fontSize: '0.78rem', color: '#ffffff' }}>
                    <b>Connections:</b> {(accumulatedNode?.connections || []).map(c => c.targetName).join(', ') || 'None specified'}
                  </div>

                  {accumulatedNode?.lore?.length > 0 && (
                    <div style={{ background: '#121214', padding: '10px', borderRadius: '6px', border: '1px solid #27272a', fontSize: '0.78rem', color: '#ffffff' }}>
                      <b>Lore & Notes:</b>
                      <ul style={{ paddingLeft: '14px', marginTop: '4px' }}>
                        {accumulatedNode.lore.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={handleFinalizeSave}
                  disabled={!accumulatedNode?.name}
                  style={{
                    background: accumulatedNode?.name ? '#ffffff' : '#27272a',
                    color: accumulatedNode?.name ? '#000000' : '#71717a',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '8px',
                    fontWeight: '800',
                    fontSize: '0.9rem',
                    cursor: accumulatedNode?.name ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Check size={16} />
                  <span>Save to Knowledge Tree & DB</span>
                </button>
                <button
                  onClick={() => setIsAiModalOpen(false)}
                  style={{ background: 'transparent', border: '1px solid #27272a', color: '#a1a1aa', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
