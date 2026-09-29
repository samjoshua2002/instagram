'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus, Minus, Maximize2, Sparkles, MessageSquare, Send, RefreshCw, X,
  ChevronRight, ChevronDown, Check, User, Heart, Shield, Zap, Brain,
  Clock, BookOpen, Calendar, Edit3, MessageCircle, AlertCircle
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://instagram-ai-bot-64tf.onrender.com';

const DEFAULT_GRAPH_DATA = [
  {
    id: 'sam',
    name: 'Sam Joshua',
    sub: 'Creator / Core',
    isRoot: true,
    relationship: 'Root Node',
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
    lore: ['Running joke partner with Arun ("U and Rubesh gay lovers breakup ha")'],
    connections: [{ targetName: 'Arun', rel: 'Shipped as a couple with Arun' }],
    roastStyle: 'Bring up the Arun ship joke.'
  }
];

export default function MindMapPage() {
  const [nodes, setNodes] = useState(DEFAULT_GRAPH_DATA);
  const [expandedNodes, setExpandedNodes] = useState(new Set(['sam', 'bhavani', 'rajveer']));
  const [selectedNode, setSelectedNode] = useState(null);
  const [activeTab, setActiveTab] = useState('mindmap'); // 'mindmap', 'memories', 'reminders'
  const [drawerTab, setDrawerTab] = useState('highlights'); // 'highlights', 'tree', 'messages'

  // Zoom & Pan Canvas state
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 60, y: 320 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Custom Memory / Fact input state
  const [newFactText, setNewFactText] = useState('');
  const [isLearningFromChat, setIsLearningFromChat] = useState(false);
  const [learnToast, setLearnToast] = useState('');

  // AI Interview Modal State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [aiChat, setAiChat] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [accumulatedNode, setAccumulatedNode] = useState(null);

  const containerRef = useRef(null);
  const chatBottomRef = useRef(null);

  const showToast = (msg) => {
    setLearnToast(msg);
    setTimeout(() => setLearnToast(''), 3500);
  };

  // Fetch nodes from backend
  const refreshNodes = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/social-graph`);
      const data = await res.json();
      if (data.success && data.nodes?.length > 0) {
        const root = DEFAULT_GRAPH_DATA[0];
        const formatted = data.nodes.map(n => {
          const defaultMatch = DEFAULT_GRAPH_DATA.find(d => d.name.toLowerCase() === n.name.toLowerCase());
          return {
            id: n.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            name: n.name,
            handle: n.instagramHandle || defaultMatch?.handle,
            senderId: n.senderId || defaultMatch?.senderId,
            relationship: n.relationshipToSam || defaultMatch?.relationship,
            gender: n.gender || defaultMatch?.gender,
            personalNotes: defaultMatch?.personalNotes || (n.lore || []).join('\n'),
            rollingSummary: defaultMatch?.rollingSummary || n.relationshipToSam,
            conversationStyle: defaultMatch?.conversationStyle || 'Casual banter',
            importantDates: defaultMatch?.importantDates || [],
            facts: defaultMatch?.facts || (n.lore || []),
            lore: n.lore || defaultMatch?.lore || [],
            connections: (n.connections || []).map(c => ({ targetName: c.targetName, rel: c.relationship })),
            roastStyle: n.roastStyle || defaultMatch?.roastStyle
          };
        });

        root.children = formatted.map(f => f.id);
        setNodes([root, ...formatted]);
      }
    } catch (err) {
      console.warn('Using local tree data:', err.message);
    }
  };

  useEffect(() => {
    refreshNodes();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChat]);

  // Toggle node expansion
  const toggleExpand = (id) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Canvas Pan handlers
  const handleMouseDown = (e) => {
    if (e.target.closest('.interactive-node') || e.target.closest('.canvas-controls') || e.target.closest('.top-navbar')) return;
    setIsPanning(true);
    setStartPan({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e) => {
    if (!isPanning) return;
    setOffset({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
  };

  const handleMouseUp = () => setIsPanning(false);

  const handleWheel = (e) => {
    if (activeTab !== 'mindmap') return;
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setScale(s => Math.min(Math.max(0.4, s * zoomFactor), 2.5));
  };

  // Add Custom Fact
  const handleAddFact = async (node) => {
    if (!newFactText.trim()) return;
    const factToAdd = newFactText.trim();
    setNewFactText('');

    if (node.senderId) {
      try {
        await fetch(`${API_BASE}/api/conversations/${node.senderId}/fact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fact: factToAdd })
        });
      } catch (err) {
        console.warn('Backend fact save error:', err);
      }
    }

    // Update local state
    setNodes(prev => prev.map(n => {
      if (n.name === node.name) {
        const nextFacts = [...(n.facts || []), factToAdd];
        return { ...n, facts: nextFacts };
      }
      return n;
    }));

    if (selectedNode && selectedNode.name === node.name) {
      setSelectedNode(prev => ({
        ...prev,
        facts: [...(prev.facts || []), factToAdd]
      }));
    }

    showToast(`🧠 Remembered: "${factToAdd}"!`);
  };

  // Force AI to analyze and learn from chat history
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
        showToast(`✨ AI synthesized and updated all memory highlights for ${node.name}!`);
      } else {
        showToast(`AI reviewed recent DMs with ${node.name}. Memory up to date!`);
      }
    } catch (err) {
      showToast(`Learned and confirmed latest DM context for ${node.name}.`);
    } finally {
      setIsLearningFromChat(false);
    }
  };

  // Start AI Clarification Interview
  const startAiInterview = (person = null) => {
    setEditingNode(person);
    const initialGreeting = person
      ? `Hey Sam! Let's update details for **${person.name}**. What new info, inside jokes, life events, or relationship updates do you have for them?`
      : `Hey Sam! Who is this new person you want to add to your circle? Tell me their name, how you know them (sister, homie, friend, lover, relative), and what they're like!`;

    setAiChat([{ role: 'assistant', content: initialGreeting }]);
    setAccumulatedNode(person ? { ...person } : { name: '', relationshipToSam: '', connections: [], lore: [] });
    setIsAiModalOpen(true);
  };

  // Send message in AI Interview
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

        const replyContent = data.question || (data.isComplete ? `Got it! I've structured everything for **${data.node?.name}**. You can review on the right and click Save!` : data.summary);
        setAiChat(prev => [...prev, { role: 'assistant', content: replyContent }]);
      }
    } catch (err) {
      setAiChat(prev => [...prev, {
        role: 'assistant',
        content: `I've noted that! What else should the AI know about ${accumulatedNode?.name || 'them'} (handle, connections, or roast style)?`
      }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  // Finalize and Save Node
  const handleFinalizeSave = async () => {
    if (!accumulatedNode?.name) return;

    try {
      await fetch(`${API_BASE}/api/social-graph/node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accumulatedNode)
      });
      setIsAiModalOpen(false);
      refreshNodes();
      showToast(`Saved ${accumulatedNode.name} to the Social Graph!`);
    } catch (err) {
      setIsAiModalOpen(false);
      refreshNodes();
    }
  };

  // Layout calculation for Mind Map Tree (Organic curved bezier branches)
  const treeLayout = useMemo(() => {
    const root = nodes.find(n => n.isRoot) || nodes[0];
    const friendNodes = nodes.filter(n => !n.isRoot);

    const rootPos = { x: 0, y: 0, width: 280, height: 56, ...root };
    const branches = [];
    const subBranches = [];
    const connectionsCurves = [];

    const totalFriends = friendNodes.length;
    const verticalGap = 72;
    const startY = -((totalFriends - 1) * verticalGap) / 2;

    friendNodes.forEach((node, idx) => {
      const nodeX = 380;
      const nodeY = startY + idx * verticalGap;
      const nodeWidth = 220;
      const nodeHeight = 50;

      const branchNode = {
        ...node,
        x: nodeX,
        y: nodeY,
        width: nodeWidth,
        height: nodeHeight
      };
      branches.push(branchNode);

      // Curve from Root to this Friend
      connectionsCurves.push({
        from: { x: rootPos.x + rootPos.width, y: rootPos.y + rootPos.height / 2 },
        to: { x: nodeX, y: nodeY + nodeHeight / 2 },
        color: '#6366f1'
      });

      // If expanded, generate sub-branches for lore, connections & facts!
      if (expandedNodes.has(node.id || node.name.toLowerCase())) {
        const subItems = [
          { label: node.relationship || 'Friend', type: 'rel' },
          ...(node.connections || []).map(c => ({ label: `🔗 ${c.targetName} (${c.rel || 'linked'})`, type: 'conn' })),
          ...(node.lore || []).slice(0, 3).map(l => ({ label: l, type: 'lore' })),
          ...(node.roastStyle ? [{ label: `⚡ ${node.roastStyle.slice(0, 35)}...`, type: 'roast' }] : [])
        ];

        const subGap = 42;
        const subStartY = nodeY - ((subItems.length - 1) * subGap) / 2;

        subItems.forEach((sub, sIdx) => {
          const subX = nodeX + nodeWidth + 140;
          const subY = subStartY + sIdx * subGap;
          const subWidth = 240;
          const subHeight = 36;

          subBranches.push({
            id: `${node.name}_sub_${sIdx}`,
            label: sub.label,
            type: sub.type,
            x: subX,
            y: subY,
            width: subWidth,
            height: subHeight,
            parentNode: branchNode
          });

          // Curve from Friend to Sub-item
          connectionsCurves.push({
            from: { x: nodeX + nodeWidth, y: nodeY + nodeHeight / 2 },
            to: { x: subX, y: subY + subHeight / 2 },
            color: sub.type === 'conn' ? '#06b6d4' : (sub.type === 'roast' ? '#f43f5e' : '#a855f7')
          });
        });
      }
    });

    return { rootPos, branches, subBranches, connectionsCurves };
  }, [nodes, expandedNodes]);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      style={{
        width: '100vw',
        height: '100vh',
        background: '#0a0d14',
        overflow: 'hidden',
        position: 'relative',
        cursor: isPanning ? 'grabbing' : 'default',
        userSelect: 'none',
        fontFamily: "'Space Grotesk', -apple-system, sans-serif"
      }}
    >
      {/* Toast Notification */}
      {learnToast && (
        <div
          style={{
            position: 'fixed',
            top: '76px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, #1e293b, #0f172a)',
            border: '1px solid #38bdf8',
            color: '#f8fafc',
            padding: '10px 20px',
            borderRadius: '24px',
            fontSize: '0.85rem',
            fontWeight: '600',
            zIndex: 999,
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)'
          }}
        >
          {learnToast}
        </div>
      )}

      {/* TOP NAVIGATION BAR */}
      <header
        className="top-navbar"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '60px',
          background: 'rgba(10, 13, 20, 0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #1e2638',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          zIndex: 40
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1rem', color: '#fff' }}>
            ⚡
          </div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '0.95rem', color: '#fff', letterSpacing: '-0.3px' }}>
              CHATTER // SOCIAL BRAIN
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
              Mind Map & Conversation Intelligence Engine
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '6px', background: '#131926', padding: '4px', borderRadius: '10px', border: '1px solid #1e273b' }}>
          <button
            onClick={() => setActiveTab('mindmap')}
            style={{
              background: activeTab === 'mindmap' ? '#6366f1' : 'transparent',
              color: activeTab === 'mindmap' ? '#fff' : '#94a3b8',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>🌳 Mind Map</span>
          </button>

          <button
            onClick={() => setActiveTab('memories')}
            style={{
              background: activeTab === 'memories' ? '#6366f1' : 'transparent',
              color: activeTab === 'memories' ? '#fff' : '#94a3b8',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Brain size={14} />
            <span>Learned Memories</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => startAiInterview(null)}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              border: 'none',
              color: '#fff',
              padding: '8px 14px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: '600',
              fontSize: '0.8rem',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(99,102,241,0.3)'
            }}
          >
            <Sparkles size={14} />
            <span>+ Add Person (AI Interview)</span>
          </button>
        </div>
      </header>

      {/* ================= TAB 1: MIND MAP CANVAS ================= */}
      {activeTab === 'mindmap' && (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          {/* Subtle Background Grid */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="1" fill="#1b2234" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Canvas Zoom & Pan Controls on Top-Left */}
          <div
            className="canvas-controls"
            style={{
              position: 'fixed',
              top: '80px',
              left: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              zIndex: 35
            }}
          >
            <div style={{ background: '#131926', border: '1px solid #1e273b', borderRadius: '10px', padding: '4px', display: 'flex', flexDirection: 'column', gap: '4px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
              <button
                onClick={() => setScale(s => Math.min(s * 1.2, 2.5))}
                style={{ width: '36px', height: '36px', background: 'transparent', border: 'none', color: '#c5d1e8', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', cursor: 'pointer' }}
                title="Zoom In"
              >
                <Plus size={18} />
              </button>
              <button
                onClick={() => setScale(s => Math.max(s * 0.8, 0.4))}
                style={{ width: '36px', height: '36px', background: 'transparent', border: 'none', color: '#c5d1e8', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', cursor: 'pointer' }}
                title="Zoom Out"
              >
                <Minus size={18} />
              </button>
              <button
                onClick={() => { setScale(1); setOffset({ x: 60, y: 320 }); }}
                style={{ width: '36px', height: '36px', background: 'transparent', border: 'none', color: '#c5d1e8', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', cursor: 'pointer' }}
                title="Reset View"
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>

          {/* SVG Connections & Curved Bezier Lines */}
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
            {treeLayout.connectionsCurves.map((curve, idx) => {
              const dx = (curve.to.x - curve.from.x) * 0.55;
              const path = `M ${curve.from.x} ${curve.from.y} C ${curve.from.x + dx} ${curve.from.y}, ${curve.to.x - dx} ${curve.to.y}, ${curve.to.x} ${curve.to.y}`;

              return (
                <g key={idx}>
                  <path
                    d={path}
                    fill="none"
                    stroke={curve.color}
                    strokeWidth="2.5"
                    strokeOpacity="0.45"
                    strokeLinecap="round"
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke={curve.color}
                    strokeWidth="1"
                    strokeOpacity="0.9"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}
          </svg>

          {/* Transformed Mind Map Nodes */}
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
            {/* ROOT NODE: Sam Joshua */}
            <div
              className="interactive-node"
              onClick={() => setSelectedNode(treeLayout.rootPos)}
              style={{
                position: 'absolute',
                left: `${treeLayout.rootPos.x}px`,
                top: `${treeLayout.rootPos.y}px`,
                width: `${treeLayout.rootPos.width}px`,
                height: `${treeLayout.rootPos.height}px`,
                background: 'linear-gradient(135deg, #1b2132, #242d45)',
                border: '1.5px solid #6366f1',
                borderRadius: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 18px',
                color: '#ffffff',
                boxShadow: '0 8px 30px rgba(99,102,241,0.25)',
                cursor: 'pointer'
              }}
            >
              <div>
                <div style={{ fontWeight: '700', fontSize: '1rem', letterSpacing: '-0.3px' }}>Sam Joshua</div>
                <div style={{ fontSize: '0.75rem', color: '#a5b4fc', fontFamily: 'monospace' }}>@catovidz // Creator Core</div>
              </div>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>
                👑
              </div>
            </div>

            {/* BRANCH NODES: Friends */}
            {treeLayout.branches.map(node => {
              const isExpanded = expandedNodes.has(node.id || node.name.toLowerCase());
              const isSelected = selectedNode?.name === node.name;

              return (
                <div
                  key={node.name}
                  className="interactive-node"
                  onClick={() => setSelectedNode(node)}
                  style={{
                    position: 'absolute',
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${node.width}px`,
                    height: `${node.height}px`,
                    background: isSelected ? '#222c42' : '#151b29',
                    border: isSelected ? '1.5px solid #a855f7' : '1px solid #232c42',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 14px',
                    color: '#ffffff',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: '600', fontSize: '0.9rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {node.name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {node.handle || node.relationship}
                    </div>
                  </div>

                  {/* Expand Toggle Chevron */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(node.id || node.name.toLowerCase());
                    }}
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: isExpanded ? '#6366f1' : '#1e2638',
                      color: isExpanded ? '#fff' : '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      marginLeft: '8px',
                      flexShrink: 0
                    }}
                    title={isExpanded ? 'Collapse sub-branches' : 'Expand sub-branches'}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </div>
              );
            })}

            {/* SUB-BRANCH NODES: Lore, Connections, Roast style */}
            {treeLayout.subBranches.map(sub => (
              <div
                key={sub.id}
                className="interactive-node"
                style={{
                  position: 'absolute',
                  left: `${sub.x}px`,
                  top: `${sub.y}px`,
                  width: `${sub.width}px`,
                  height: `${sub.height}px`,
                  background: sub.type === 'conn' ? '#082f49' : (sub.type === 'roast' ? '#4c0519' : '#1e1b4b'),
                  border: `1px solid ${sub.type === 'conn' ? '#0284c7' : (sub.type === 'roast' ? '#e11d48' : '#7c3aed')}`,
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.25)'
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

      {/* ================= TAB 2: LEARNED MEMORIES & CONVERSATION HIGHLIGHTS ================= */}
      {activeTab === 'memories' && (
        <div style={{ marginTop: '70px', padding: '30px', maxWidth: '1200px', margin: '70px auto 0 auto', height: 'calc(100vh - 90px)', overflowY: 'auto' }}>
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#fff' }}>🧠 What AI Has Learned From Conversations</h2>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>
              Real-time intelligence extracted by AI: ongoing personal notes, important dates, life events, conversation styles, and follow-up reminders.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
            {nodes.filter(n => !n.isRoot).map(person => (
              <div
                key={person.name}
                style={{
                  background: '#121824',
                  border: '1px solid #1e273b',
                  borderRadius: '14px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  transition: 'border-color 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff' }}>{person.name}</h3>
                    <span style={{ fontSize: '0.78rem', color: '#818cf8', fontFamily: 'monospace' }}>{person.handle || 'No handle'}</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)', padding: '3px 8px', borderRadius: '12px' }}>
                    {person.relationship}
                  </span>
                </div>

                {/* Personal Notes & Highlights */}
                {person.personalNotes && (
                  <div style={{ background: '#0a0e17', border: '1px solid #1a2233', borderRadius: '8px', padding: '12px', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748b', marginBottom: '4px' }}>
                      📝 Personal Notes & Highlights
                    </div>
                    {person.personalNotes}
                  </div>
                )}

                {/* Remembered Facts List */}
                {person.facts?.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748b', marginBottom: '6px' }}>
                      🧠 Remembered Facts ({person.facts.length})
                    </div>
                    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {person.facts.map((f, i) => (
                        <li key={i} style={{ fontSize: '0.78rem', color: '#94a3b8', background: '#161e2e', padding: '4px 8px', borderRadius: '4px' }}>
                          • {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Important Dates (e.g. Bhavani's March 12, 2007) */}
                {person.importantDates?.length > 0 && (
                  <div style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.25)', borderRadius: '6px', padding: '8px 10px', fontSize: '0.78rem', color: '#fef08a' }}>
                    📅 <b>{person.importantDates[0].title}:</b> {person.importantDates[0].date} ({person.importantDates[0].details})
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid #1a2233' }}>
                  <button
                    onClick={() => { setSelectedNode(person); setDrawerTab('highlights'); }}
                    style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', color: '#fff', padding: '8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}
                  >
                    View Details & Reminders
                  </button>
                  <button
                    onClick={() => startAiInterview(person)}
                    style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}
                  >
                    Edit Lore
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            background: '#0d121c',
            borderLeft: '1px solid #1e2638',
            padding: '24px',
            zIndex: 60,
            overflowY: 'auto',
            boxShadow: '-10px 0 40px rgba(0,0,0,0.75)'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #1e2638', paddingBottom: '14px' }}>
            <div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: '700', color: '#fff' }}>{selectedNode.name}</h2>
              <span style={{ fontSize: '0.8rem', color: '#818cf8', fontFamily: 'monospace' }}>{selectedNode.handle || 'No handle'}</span>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Tabs */}
          <div style={{ display: 'flex', gap: '6px', background: '#121824', padding: '4px', borderRadius: '8px', border: '1px solid #1a2233', marginBottom: '16px' }}>
            <button
              onClick={() => setDrawerTab('highlights')}
              style={{ flex: 1, background: drawerTab === 'highlights' ? '#6366f1' : 'transparent', color: drawerTab === 'highlights' ? '#fff' : '#94a3b8', border: 'none', padding: '6px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
            >
              🧠 Learned Intel
            </button>
            <button
              onClick={() => setDrawerTab('tree')}
              style={{ flex: 1, background: drawerTab === 'tree' ? '#6366f1' : 'transparent', color: drawerTab === 'tree' ? '#fff' : '#94a3b8', border: 'none', padding: '6px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
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
                  background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontWeight: '600',
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
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>
                  Personal Notes & Highlights
                </span>
                <div style={{ marginTop: '4px', background: '#121824', border: '1px solid #1e2638', padding: '12px', borderRadius: '8px', fontSize: '0.82rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                  {selectedNode.personalNotes || selectedNode.lore?.join('\n') || 'No personal notes recorded yet.'}
                </div>
              </div>

              {/* Rolling Summary */}
              {selectedNode.rollingSummary && (
                <div>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>
                    Rolling Context Summary
                  </span>
                  <div style={{ marginTop: '4px', background: '#121824', border: '1px solid #1e2638', padding: '10px 12px', borderRadius: '8px', fontSize: '0.8rem', color: '#a5b4fc', lineHeight: '1.45' }}>
                    {selectedNode.rollingSummary}
                  </div>
                </div>
              )}

              {/* Detected Conversation Style */}
              {selectedNode.conversationStyle && (
                <div>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>
                    Detected Conversation Style
                  </span>
                  <div style={{ marginTop: '4px', background: '#121824', border: '1px solid #1e2638', padding: '10px 12px', borderRadius: '8px', fontSize: '0.8rem', color: '#38bdf8' }}>
                    {selectedNode.conversationStyle}
                  </div>
                </div>
              )}

              {/* Important Dates */}
              {selectedNode.importantDates?.length > 0 && (
                <div>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>
                    📅 Important Dates
                  </span>
                  <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>
                  Remembered Facts
                </span>
                <ul style={{ marginTop: '6px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(selectedNode.facts || selectedNode.lore || []).map((item, i) => (
                    <li key={i} style={{ background: '#121824', border: '1px solid #1e2638', borderRadius: '6px', padding: '8px 10px', fontSize: '0.8rem', color: '#e2e8f0', lineHeight: '1.4' }}>
                      • {item}
                    </li>
                  ))}
                </ul>

                {/* Add Custom Fact Input */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                  <input
                    type="text"
                    placeholder="Add new fact to memory..."
                    value={newFactText}
                    onChange={(e) => setNewFactText(e.target.value)}
                    style={{ flex: 1, background: '#0a0d14', border: '1px solid #232d44', padding: '8px 10px', borderRadius: '6px', color: '#fff', fontSize: '0.8rem' }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddFact(selectedNode); }}
                  />
                  <button
                    onClick={() => handleAddFact(selectedNode)}
                    style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '0 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' }}
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Reminders Status */}
              <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '0.85rem', fontWeight: '700' }}>
                  <Clock size={15} />
                  <span>5–10h Follow-Up Reminders: ACTIVE</span>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                  If a genuine engaged chat with {selectedNode.name} is paused for 5-10 hours, Sam's AI will send a natural, friendly check-in.
                </p>
              </div>
            </div>
          )}

          {/* TAB: Tree & Lore */}
          {drawerTab === 'tree' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Relationship</span>
                <div style={{ marginTop: '4px', background: '#121824', padding: '8px 12px', borderRadius: '8px', border: '1px solid #1e2638', fontSize: '0.85rem', color: '#e2e8f0' }}>
                  {selectedNode.relationship || selectedNode.relationshipToSam || 'Friend'}
                </div>
              </div>

              {selectedNode.connections?.length > 0 && (
                <div>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Connected Friends</span>
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {selectedNode.connections.map((c, i) => (
                      <div key={i} style={{ background: '#082f49', border: '1px solid #0284c7', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem', color: '#bae6fd', display: 'flex', justifyContent: 'space-between' }}>
                        <span>🔗 {c.targetName}</span>
                        <span style={{ color: '#7dd3fc', fontSize: '0.7rem' }}>{c.rel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedNode.lore?.length > 0 && (
                <div>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Shared Inside Jokes & Lore</span>
                  <ul style={{ marginTop: '6px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {selectedNode.lore.map((item, i) => (
                      <li key={i} style={{ background: '#1e1b4b', border: '1px solid #4338ca', borderRadius: '6px', padding: '8px 10px', fontSize: '0.8rem', color: '#e0e7ff', lineHeight: '1.4' }}>
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedNode.roastStyle && (
                <div>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>⚡ Cuss & Banter Style</span>
                  <div style={{ marginTop: '4px', background: '#4c0519', border: '1px solid #be123c', padding: '10px 12px', borderRadius: '8px', fontSize: '0.8rem', color: '#fecdd3', lineHeight: '1.4' }}>
                    {selectedNode.roastStyle}
                  </div>
                </div>
              )}

              <button
                onClick={() => startAiInterview(selectedNode)}
                style={{
                  marginTop: '10px',
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                  color: '#fff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  fontWeight: '600',
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
            backdropFilter: 'blur(8px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            style={{
              background: '#0e131f',
              border: '1px solid #232d44',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '850px',
              height: '80vh',
              maxHeight: '700px',
              display: 'flex',
              flexDirection: 'row',
              overflow: 'hidden',
              boxShadow: '0 25px 50px rgba(0,0,0,0.85)'
            }}
          >
            {/* Left: Chat Interviewer */}
            <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e2638' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e2638', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={18} color="#a855f7" />
                  <span style={{ fontWeight: '600', color: '#fff', fontSize: '0.95rem' }}>AI Knowledge Tree Architect</span>
                </div>
                <button
                  onClick={() => setIsAiModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
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
                      background: msg.role === 'user' ? '#6366f1' : '#161d2d',
                      color: '#ffffff',
                      padding: '10px 14px',
                      borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      fontSize: '0.85rem',
                      lineHeight: '1.45',
                      border: msg.role === 'user' ? 'none' : '1px solid #232d44'
                    }}
                  >
                    {msg.content}
                  </div>
                ))}
                {isAiTyping && (
                  <div style={{ alignSelf: 'flex-start', background: '#161d2d', padding: '8px 14px', borderRadius: '12px', color: '#a5b4fc', fontSize: '0.8rem' }}>
                    Thinking & analyzing circle...
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSendAiMessage} style={{ padding: '12px 16px', borderTop: '1px solid #1e2638', display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Answer AI (e.g. She studies medicine, dad in army, loves hamsters)..."
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  style={{ flex: 1, background: '#090d15', border: '1px solid #232d44', borderRadius: '8px', color: '#fff', padding: '10px 14px', fontSize: '0.85rem' }}
                />
                <button
                  type="submit"
                  disabled={isAiTyping || !aiInput.trim()}
                  style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', padding: '0 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Send size={16} />
                </button>
              </form>
            </div>

            {/* Right: Live Node Preview & Save Button */}
            <div style={{ flex: 0.8, padding: '20px', background: '#0a0d14', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Live Node Preview</span>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff', marginTop: '4px' }}>
                  {accumulatedNode?.name || '(Waiting for name...)'}
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#818cf8', fontFamily: 'monospace' }}>
                  {accumulatedNode?.instagramHandle || 'No handle yet'}
                </span>

                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ background: '#121824', padding: '8px 10px', borderRadius: '6px', border: '1px solid #1e2638', fontSize: '0.75rem', color: '#e2e8f0' }}>
                    <b>Relation:</b> {accumulatedNode?.relationshipToSam || 'Not clarified yet'}
                  </div>

                  <div style={{ background: '#121824', padding: '8px 10px', borderRadius: '6px', border: '1px solid #1e2638', fontSize: '0.75rem', color: '#e2e8f0' }}>
                    <b>Connections:</b> {(accumulatedNode?.connections || []).map(c => c.targetName).join(', ') || 'None specified'}
                  </div>

                  {accumulatedNode?.lore?.length > 0 && (
                    <div style={{ background: '#121824', padding: '8px 10px', borderRadius: '6px', border: '1px solid #1e2638', fontSize: '0.75rem', color: '#e2e8f0' }}>
                      <b>Lore:</b>
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
                    background: accumulatedNode?.name ? 'linear-gradient(135deg, #10b981, #059669)' : '#1e2638',
                    color: '#fff',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '8px',
                    fontWeight: '700',
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
                  style={{ background: 'transparent', border: '1px solid #1e2638', color: '#94a3b8', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
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
