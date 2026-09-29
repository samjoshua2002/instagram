'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Minus, Download, Maximize2, Sparkles, MessageSquare, Send, RefreshCw, X, ChevronRight, ChevronDown, Check, User, Heart, Shield, Zap } from 'lucide-react';

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
    relationship: 'Closest Online Friend',
    gender: 'female',
    lore: [
      'Dad is in the Indian Army',
      'Studying medicine',
      'Shares Netflix subscription',
      'Hamster obsession 🐹 & loves books',
      'Birthday: 12th March 2007'
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
    lore: [
      'Sam\'s sister',
      'Currently talking with Bhavani'
    ],
    connections: [
      { targetName: 'Bhavani', rel: 'Talking / close with Bhavani' }
    ],
    roastStyle: 'Sisterly teasing and banter.'
  },
  {
    id: 'rajveer',
    name: 'Rajveer',
    handle: '@unpredictable_2k26',
    relationship: 'Day-One Homie / Brother',
    gender: 'male',
    lore: [
      'Drama king of the group',
      'Constantly trolls Roni uncle',
      'Speaks Hindi/Hinglish (bhai, bro, lmao)'
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
    lore: [
      'Legendary running gag friend ("Roni Uncle")',
      'Fake legal team on speed dial',
      'Area 51 research & alien biryani',
      'Axe of justice & anime protagonist delusions'
    ],
    connections: [
      { targetName: 'Rajveer', rel: 'Trolled constantly by Rajveer' }
    ],
    roastStyle: 'Clown his anime delusions, fake legal team, and axe of justice.'
  },
  {
    id: 'moksha',
    name: 'Moksha',
    handle: '@1fyz_2',
    relationship: 'Sister Figure / Drama Queen',
    gender: 'female',
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
    relationship: 'Very Close Friend ("moi")',
    gender: 'female',
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
    relationship: 'Close Tamil Homie / Designer',
    gender: 'male',
    lore: [
      'Texts in Tamil & Tanglish (dei, summa irunga, gay lord)',
      'Shipped with Rubesh as inside joke'
    ],
    connections: [
      { targetName: 'Rubesh', rel: 'Inside joke gay lover ship' }
    ],
    roastStyle: 'Tamil roast: "dei mooditu poda gomma", "otha summa iru da", "ne tha da periya gay lord".'
  },
  {
    id: 'rubesh',
    name: 'Rubesh',
    handle: '',
    relationship: 'Friend in Group',
    gender: 'male',
    lore: [
      'Running joke partner with Arun'
    ],
    connections: [
      { targetName: 'Arun', rel: 'Shipped as a couple with Arun' }
    ],
    roastStyle: 'Bring up the Arun ship joke.'
  }
];

export default function MindMapPage() {
  const [nodes, setNodes] = useState(DEFAULT_GRAPH_DATA);
  const [expandedNodes, setExpandedNodes] = useState(new Set(['sam', 'bhavani', 'rajveer']));
  const [selectedNode, setSelectedNode] = useState(null);

  // Zoom & Pan Canvas state
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 80, y: 320 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // AI Interview Modal State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [aiChat, setAiChat] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [accumulatedNode, setAccumulatedNode] = useState(null);

  const containerRef = useRef(null);
  const chatBottomRef = useRef(null);

  // Fetch from backend
  const refreshNodes = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/social-graph`);
      const data = await res.json();
      if (data.success && data.nodes?.length > 0) {
        // Map backend format to tree
        const formatted = data.nodes.map(n => ({
          id: n.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          name: n.name,
          handle: n.instagramHandle,
          relationship: n.relationshipToSam,
          gender: n.gender,
          lore: n.lore || [],
          connections: (n.connections || []).map(c => ({ targetName: c.targetName, rel: c.relationship })),
          roastStyle: n.roastStyle
        }));

        const root = DEFAULT_GRAPH_DATA[0];
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

  // Pan handlers
  const handleMouseDown = (e) => {
    if (e.target.closest('.interactive-node') || e.target.closest('.canvas-controls')) return;
    setIsPanning(true);
    setStartPan({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e) => {
    if (!isPanning) return;
    setOffset({
      x: e.clientX - startPan.x,
      y: e.clientY - startPan.y
    });
  };

  const handleMouseUp = () => setIsPanning(false);

  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setScale(s => Math.min(Math.max(0.4, s * zoomFactor), 2.5));
  };

  // Start AI Clarification Interview
  const startAiInterview = (person = null) => {
    setEditingNode(person);
    const initialGreeting = person
      ? `Hey Sam! Let's update details for **${person.name}**. What new info, inside jokes, or relationship updates do you have for them?`
      : `Hey Sam! Who is this new person you want to add to your circle? Tell me their name, how you know them (sister, homie, friend, lover, relative), and what they're like!`;

    setAiChat([
      { role: 'assistant', content: initialGreeting }
    ]);
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
        content: `I've noted that! What else should the AI know about ${accumulatedNode?.name || 'them'} (like their Instagram handle, connections, or how to roast them)?`
      }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  // Finalize and Save Node
  const handleFinalizeSave = async () => {
    if (!accumulatedNode?.name) return;

    try {
      const res = await fetch(`${API_BASE}/api/social-graph/node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accumulatedNode)
      });
      const data = await res.json();
      if (data.success) {
        setIsAiModalOpen(false);
        refreshNodes();
      }
    } catch (err) {
      setIsAiModalOpen(false);
      refreshNodes();
    }
  };

  // Layout calculation for Mind Map Tree
  const treeLayout = useMemo(() => {
    const root = nodes.find(n => n.isRoot) || nodes[0];
    const friendNodes = nodes.filter(n => !n.isRoot);

    const rootPos = { x: 0, y: 0, width: 280, height: 56, ...root };
    const branches = [];
    const subBranches = [];
    const connectionsCurves = [];

    // Vertical spacing between friend nodes
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

      // If this friend node is expanded, generate sub-branches for lore & connections!
      if (expandedNodes.has(node.id || node.name.toLowerCase())) {
        const subItems = [
          { label: node.relationship || 'Friend', type: 'rel' },
          ...(node.connections || []).map(c => ({ label: `🔗 ${c.targetName} (${c.rel || 'linked'})`, type: 'conn' })),
          ...(node.lore || []).slice(0, 3).map(l => ({ label: l, type: 'lore' })),
          ...(node.roastStyle ? [{ label: `⚡ ${node.roastStyle}`, type: 'roast' }] : [])
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

          // Curve from Friend Node to Sub-item
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
        background: '#0d111a',
        overflow: 'hidden',
        position: 'relative',
        cursor: isPanning ? 'grabbing' : 'grab',
        userSelect: 'none',
        fontFamily: "'Space Grotesk', -apple-system, sans-serif"
      }}
    >
      {/* Subtle Background Grid */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="1" fill="#1b2234" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Floating Canvas Controls (Zoom In, Zoom Out, Reset, Download, Add) */}
      <div
        className="canvas-controls"
        style={{
          position: 'fixed',
          top: '24px',
          left: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 40
        }}
      >
        <div style={{ background: '#161d2d', border: '1px solid #232d44', borderRadius: '10px', padding: '4px', display: 'flex', flexDirection: 'column', gap: '4px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
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
            onClick={() => { setScale(1); setOffset({ x: 80, y: 320 }); }}
            style={{ width: '36px', height: '36px', background: 'transparent', border: 'none', color: '#c5d1e8', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', cursor: 'pointer' }}
            title="Reset View"
          >
            <Maximize2 size={16} />
          </button>
        </div>

        <button
          onClick={() => startAiInterview(null)}
          style={{
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            border: 'none',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: '600',
            fontSize: '0.85rem',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(99,102,241,0.35)'
          }}
        >
          <Sparkles size={16} />
          <span>+ Add Person (AI Interview)</span>
        </button>

        <button
          onClick={refreshNodes}
          style={{
            background: '#161d2d',
            border: '1px solid #232d44',
            color: '#94a3b8',
            padding: '8px 12px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8rem',
            cursor: 'pointer'
          }}
        >
          <RefreshCw size={13} />
          <span>Sync DB</span>
        </button>
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

      {/* Transformed Canvas Content */}
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
            background: 'linear-gradient(135deg, #1e2638, #252f48)',
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
                background: isSelected ? '#252f48' : '#182030',
                border: isSelected ? '1.5px solid #a855f7' : '1px solid #28344e',
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
                  background: isExpanded ? '#6366f1' : '#222b40',
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

      {/* Right Drawer Inspector: Selected Person Details */}
      {selectedNode && (
        <div
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            bottom: 0,
            width: '420px',
            maxWidth: '90vw',
            background: '#111726',
            borderLeft: '1px solid #232d44',
            padding: '24px',
            zIndex: 50,
            overflowY: 'auto',
            boxShadow: '-10px 0 40px rgba(0,0,0,0.6)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #232d44', paddingBottom: '14px' }}>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Relationship</span>
              <div style={{ marginTop: '4px', background: '#182030', padding: '8px 12px', borderRadius: '8px', border: '1px solid #28344e', fontSize: '0.85rem', color: '#e2e8f0' }}>
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
        </div>
      )}

      {/* AI INTERACTIVE INTERVIEW MODAL (Asks questions to clarify before updating DB!) */}
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
              background: '#111726',
              border: '1px solid #2a3652',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '850px',
              height: '80vh',
              maxHeight: '700px',
              display: 'flex',
              flexDirection: 'row',
              overflow: 'hidden',
              boxShadow: '0 25px 50px rgba(0,0,0,0.8)'
            }}
          >
            {/* Left Column: Conversational Chat Interview */}
            <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', borderRight: '1px solid #232d44' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #232d44', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

              {/* Chat Messages */}
              <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {aiChat.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      background: msg.role === 'user' ? '#6366f1' : '#1e2638',
                      color: '#ffffff',
                      padding: '10px 14px',
                      borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      fontSize: '0.85rem',
                      lineHeight: '1.45',
                      border: msg.role === 'user' ? 'none' : '1px solid #2b3650'
                    }}
                  >
                    {msg.content}
                  </div>
                ))}
                {isAiTyping && (
                  <div style={{ alignSelf: 'flex-start', background: '#1e2638', padding: '8px 14px', borderRadius: '12px', color: '#a5b4fc', fontSize: '0.8rem' }}>
                    Thinking & analyzing circle...
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Input Form */}
              <form onSubmit={handleSendAiMessage} style={{ padding: '12px 16px', borderTop: '1px solid #232d44', display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Tell AI about them (e.g. Her name is Priya, my cousin, talks to Bhavani)..."
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  style={{ flex: 1, background: '#0b0f19', border: '1px solid #2a3652', borderRadius: '8px', color: '#fff', padding: '10px 14px', fontSize: '0.85rem' }}
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

            {/* Right Column: Live Node Summary & Save Button */}
            <div style={{ flex: 0.8, padding: '20px', background: '#0c101a', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Live Node Preview</span>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff', marginTop: '4px' }}>
                  {accumulatedNode?.name || '(Waiting for name...)'}
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#818cf8', fontFamily: 'monospace' }}>
                  {accumulatedNode?.instagramHandle || 'No handle yet'}
                </span>

                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ background: '#161d2d', padding: '8px 10px', borderRadius: '6px', border: '1px solid #232d44', fontSize: '0.75rem', color: '#e2e8f0' }}>
                    <b>Relation:</b> {accumulatedNode?.relationshipToSam || 'Not clarified yet'}
                  </div>

                  <div style={{ background: '#161d2d', padding: '8px 10px', borderRadius: '6px', border: '1px solid #232d44', fontSize: '0.75rem', color: '#e2e8f0' }}>
                    <b>Connections:</b> {(accumulatedNode?.connections || []).map(c => c.targetName).join(', ') || 'None specified'}
                  </div>

                  {accumulatedNode?.lore?.length > 0 && (
                    <div style={{ background: '#161d2d', padding: '8px 10px', borderRadius: '6px', border: '1px solid #232d44', fontSize: '0.75rem', color: '#e2e8f0' }}>
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
                    background: accumulatedNode?.name ? 'linear-gradient(135deg, #10b981, #059669)' : '#232d44',
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
                  style={{ background: 'transparent', border: '1px solid #232d44', color: '#94a3b8', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
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
