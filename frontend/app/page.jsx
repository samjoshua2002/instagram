'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Network, Plus, RefreshCw, X, Share2, Shield, Heart, User, Trash2, ArrowUpRight } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://instagram-ai-bot-64tf.onrender.com';

const INITIAL_NODES = [
  {
    name: 'Sam Joshua',
    instagramHandle: '@catovidz',
    relationshipToSam: 'Creator / You',
    gender: 'male',
    connections: [
      { targetName: 'Bhavani', relationship: 'closest online friend' },
      { targetName: 'Annie', relationship: 'sister' },
      { targetName: 'Rajveer', relationship: 'day-one homie' },
      { targetName: 'Moksha', relationship: 'sister figure' },
      { targetName: 'Fami', relationship: 'very close friend (moi)' },
      { targetName: 'Arun', relationship: 'tamil homie' },
      { targetName: 'Roni', relationship: 'running joke buddy' }
    ],
    lore: ['Creator of Chatter AI. Direct messaging auto-pilot.'],
    roastStyle: 'Casual chill creator vibe.',
    isCenter: true
  },
  {
    name: 'Bhavani',
    aliases: ['bhavani', 'bhanvani', 'yk_bhavani._.xo', 'bhavani🐹'],
    instagramHandle: '@yk_bhavani._.xo',
    senderId: '29005624469042002',
    gender: 'female',
    relationshipToSam: 'Closest online friend / Medicine student',
    connections: [
      { targetName: 'Annie', relationship: 'talking with Sam\'s sister Annie', notes: 'Currently talking with Sam\'s sister Annie.' }
    ],
    lore: [
      'Bhanvani is one of Sam\'s closest online friends.',
      'Her dad is in the Indian Army, and she is studying medicine.',
      'Shares a Netflix subscription with Sam (she recently added one of her new friends to their plan).',
      'Currently talking with Sam\'s sister Annie.',
      'Loves hamsters (hamster obsession 🐹) and is obsessed with reading books.',
      'Birthday is on 12th March 2007.',
      'Loves teasing Sam and joking around with playful personality.',
      'Strictly NEVER call her bro, da, or man. Speak warmly, tease back gently.'
    ],
    roastStyle: 'Playful and gentle teasing, no hard insults. Tease her about her hamster obsession or Netflix password sharing.',
    languages: ['English', 'Tamil']
  },
  {
    name: 'Annie',
    aliases: ['annie', 'ann', 'sister'],
    instagramHandle: '',
    senderId: '',
    gender: 'female',
    relationshipToSam: 'Sister',
    connections: [
      { targetName: 'Bhavani', relationship: 'talking / friends with Bhavani', notes: 'Bhavani is currently talking with Annie.' }
    ],
    lore: ['Sam\'s sister.', 'Currently talking with Bhavani.'],
    roastStyle: 'Sisterly teasing.',
    languages: ['English', 'Tamil']
  },
  {
    name: 'Rajveer',
    aliases: ['rajveer', 'gs', 'unpredictable_2k26'],
    instagramHandle: '@unpredictable_2k26',
    senderId: '877566845441453',
    gender: 'male',
    relationshipToSam: 'Day-one Homie / Brother',
    connections: [
      { targetName: 'Roni', relationship: 'close buddy / favorite trolling victim' },
      { targetName: 'Moksha', relationship: 'close friend / account sharer' },
      { targetName: 'Fami', relationship: 'friend in circle / plots ragebaits' }
    ],
    lore: [
      'Calls himself drama king; talks in Hinglish and Hindi.',
      'Running gag about Roni uncle: fake bank account, court cases, axe of justice, Nami simping.',
      'When he roasts or insults, roast him back hard like guy friends do.'
    ],
    roastStyle: 'Savage Hindi/Hinglish bro banter: "abe chal na lode", "aukaat mein reh bsdk", "dramebaaz chup baith".',
    languages: ['Hindi', 'Hinglish', 'English']
  },
  {
    name: 'Roni',
    aliases: ['roni', 'roni uncle', 'roni_uncle'],
    instagramHandle: '',
    senderId: '',
    gender: 'male',
    relationshipToSam: 'Close friend / Group running joke legend',
    connections: [
      { targetName: 'Rajveer', relationship: 'close buddy' }
    ],
    lore: [
      'Legendary running gag friend of the circle ("roni uncle").',
      'Jokes: Roni bank account, legal team on speed dial, Area 51 research, Toji soul, axe of justice, simping over Nami and Robin.'
    ],
    roastStyle: 'Clown his anime protagonist delusions, fake legal team, and axe of justice jokes.',
    languages: ['Hinglish', 'English']
  },
  {
    name: 'Moksha',
    aliases: ['moksha', '1fyz_2', 'fyz'],
    instagramHandle: '@1fyz_2',
    senderId: '1337018008317393',
    gender: 'female',
    relationshipToSam: 'Close friend / Sister figure / Drama queen',
    connections: [
      { targetName: 'Rajveer', relationship: 'close friend / account sharer' },
      { targetName: 'Fami', relationship: 'friend / plots ragebaits' }
    ],
    lore: [
      'High-voltage drama queen. Uses hardcore Hindi cuss words when angry or teasing ("abey lovde", "bkl", "mkc").',
      'When she cusses, cuss and roast her right back in Hindi: "chup kar chudail", "apni gaand mat phula dramebaaz", "bkl chill kar".'
    ],
    roastStyle: 'Savage Hindi sister/drama queen roast: "chup kar chudail", "abe lodu chup baith", "bkl drama factory".',
    languages: ['Hindi', 'Hinglish', 'English']
  },
  {
    name: 'Fami',
    aliases: ['fami', 'mavis', 'm4visyzx', 'moi', 'ო𝗈ꪱᜒ'],
    instagramHandle: '@m4visyzx',
    senderId: '2144547476275057',
    gender: 'female',
    relationshipToSam: 'Very close friend ("moi" / Fami)',
    connections: [
      { targetName: 'Rajveer', relationship: 'friend / teasing target' },
      { targetName: 'Moksha', relationship: 'friend / circle' }
    ],
    lore: [
      'Goes by Fami (Instagram: @m4visyzx, display name "moi" / "ო𝗈ꪱᜒ").',
      'Very close friend of Sam with high emotional connection (often texts "Oyy", "Please reply", "Byy").',
      'Gets easily ragebaited by Rajveer and Moksha ("fami will get so ragebaited").',
      'Strictly NEVER call her "da", "bro", or "man". Be warm, sweet, playful, and responsive.'
    ],
    roastStyle: 'Cute playful banter, tease her when she gets ragebaited or confused.',
    languages: ['English']
  },
  {
    name: 'Arun',
    aliases: ['arun', 'graphicsbyarun'],
    instagramHandle: '@graphicsbyarun',
    senderId: '1144338295203170',
    gender: 'male',
    relationshipToSam: 'Close Tamil homie / Graphic designer bro',
    connections: [
      { targetName: 'Rubesh', relationship: 'homie / inside joke couple' }
    ],
    lore: [
      'Texts in Tamil and Tanglish ("dei", "summa irunga", "gay Lord").',
      'When he roasts or calls Sam gay, abuse him back in Tamil: "dei mooditu poda gomma", "otha summa iru da", "ne tha da periya gay lord".'
    ],
    roastStyle: 'Tamil roast: "dei poi vela paaru da", "ne tha da gay lord", "otha mooditu po gomma".',
    languages: ['Tamil', 'Tanglish', 'English']
  },
  {
    name: 'Rubesh',
    aliases: ['rubesh', 'rupesh'],
    instagramHandle: '',
    senderId: '',
    gender: 'male',
    relationshipToSam: 'Friend in the group',
    connections: [
      { targetName: 'Arun', relationship: 'homie / inside joke couple' }
    ],
    lore: ['Running joke partner with Arun ("U and Rubesh gay lovers breakup ha").'],
    roastStyle: 'Bring up the Arun ship joke.',
    languages: ['Tamil', 'English']
  }
];

export default function SocialTreePage() {
  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState('tree'); // 'tree' or 'list'
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    instagramHandle: '',
    relationshipToSam: 'Friend',
    gender: 'unknown',
    connections: '',
    lore: '',
    roastStyle: '',
    aliases: ''
  });

  const canvasRef = useRef(null);

  // Fetch nodes from API
  const fetchNodes = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/social-graph`);
      const data = await res.json();
      if (data.success && data.nodes?.length > 0) {
        // Merge with Sam creator node at center
        const samNode = INITIAL_NODES.find(n => n.name === 'Sam Joshua');
        setNodes([samNode, ...data.nodes.filter(n => n.name !== 'Sam Joshua')]);
      }
    } catch (err) {
      console.warn('Using local tree data:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNodes();
  }, []);

  // Save node
  const handleSaveNode = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/api/social-graph/node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        fetchNodes();
      }
    } catch (err) {
      // Offline fallback: update local state
      const existsIndex = nodes.findIndex(n => n.name.toLowerCase() === formData.name.toLowerCase());
      const updatedNode = {
        ...formData,
        connections: formData.connections.split(',').map(c => ({ targetName: c.trim(), relationship: 'friend' })).filter(c => c.targetName),
        lore: formData.lore.split('\n').filter(Boolean)
      };

      if (existsIndex >= 0) {
        const next = [...nodes];
        next[existsIndex] = updatedNode;
        setNodes(next);
      } else {
        setNodes([...nodes, updatedNode]);
      }
      setIsModalOpen(false);
    }
  };

  // Canvas Interactive Force / Radial Dot Tree
  useEffect(() => {
    if (viewMode !== 'tree') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const resize = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Compute positions
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const nonCenterNodes = nodes.filter(n => !n.isCenter);
    const radius = Math.min(centerX, centerY) * 0.72;

    const positionedNodes = nodes.map((node, i) => {
      if (node.isCenter) {
        return { ...node, x: centerX, y: centerY, r: 24 };
      }
      const index = nonCenterNodes.findIndex(n => n.name === node.name);
      const angle = (index / nonCenterNodes.length) * Math.PI * 2 - Math.PI / 2;
      return {
        ...node,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        r: 16
      };
    });

    let hoveredNode = null;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Draw subtle background grid dots
      ctx.fillStyle = '#151515';
      const gridSize = 40;
      for (let x = 0; x < canvas.width; x += gridSize) {
        for (let y = 0; y < canvas.height; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 2. Draw connections (lines)
      positionedNodes.forEach(nodeA => {
        (nodeA.connections || []).forEach(conn => {
          const nodeB = positionedNodes.find(n => n.name.toLowerCase() === conn.targetName.toLowerCase());
          if (nodeB) {
            const isHighlighted = (hoveredNode && (hoveredNode.name === nodeA.name || hoveredNode.name === nodeB.name)) ||
                                  (selectedNode && (selectedNode.name === nodeA.name || selectedNode.name === nodeB.name));

            ctx.beginPath();
            ctx.moveTo(nodeA.x, nodeA.y);
            ctx.lineTo(nodeB.x, nodeB.y);

            if (isHighlighted) {
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2;
              ctx.setLineDash([4, 4]);
            } else {
              ctx.strokeStyle = '#222222';
              ctx.lineWidth = 1;
              ctx.setLineDash([]);
            }
            ctx.stroke();

            // Draw connection label midpoint if highlighted
            if (isHighlighted) {
              const midX = (nodeA.x + nodeB.x) / 2;
              const midY = (nodeA.y + nodeB.y) / 2;
              ctx.fillStyle = '#000000';
              ctx.fillRect(midX - 45, midY - 10, 90, 20);
              ctx.strokeStyle = '#444444';
              ctx.strokeRect(midX - 45, midY - 10, 90, 20);
              ctx.fillStyle = '#aaaaaa';
              ctx.font = '10px monospace';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(conn.relationship?.slice(0, 16) || 'linked', midX, midY);
            }
          }
        });
      });

      // 3. Draw Nodes (Dots)
      positionedNodes.forEach(node => {
        const isHovered = hoveredNode?.name === node.name;
        const isSelected = selectedNode?.name === node.name;

        // Outer glow on active/hover
        if (isHovered || isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r + 10, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.fill();
        }

        // Main dot
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fillStyle = node.isCenter ? '#ffffff' : (isSelected ? '#ffffff' : '#0a0a0a');
        ctx.fill();
        ctx.strokeStyle = (isHovered || isSelected) ? '#ffffff' : (node.isCenter ? '#ffffff' : '#333333');
        ctx.lineWidth = node.isCenter ? 3 : 2;
        ctx.setLineDash([]);
        ctx.stroke();

        // Node Label
        ctx.fillStyle = (isHovered || isSelected || node.isCenter) ? '#ffffff' : '#888888';
        ctx.font = node.isCenter ? 'bold 13px "Space Grotesk"' : '12px "Space Grotesk"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(node.name, node.x, node.y + node.r + 8);

        // Subtext (Handle / Role)
        if (node.instagramHandle || node.relationshipToSam) {
          ctx.fillStyle = '#444444';
          ctx.font = '10px monospace';
          const sub = node.instagramHandle || node.relationshipToSam;
          ctx.fillText(sub.length > 20 ? sub.slice(0, 18) + '...' : sub, node.x, node.y + node.r + 24);
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    // Mouse interactions
    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let found = null;
      for (const node of positionedNodes) {
        const dist = Math.hypot(node.x - mouseX, node.y - mouseY);
        if (dist <= node.r + 6) {
          found = node;
          break;
        }
      }
      hoveredNode = found;
      canvas.style.cursor = found ? 'pointer' : 'default';
    };

    const handleClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      for (const node of positionedNodes) {
        const dist = Math.hypot(node.x - mouseX, node.y - mouseY);
        if (dist <= node.r + 6) {
          setSelectedNode(node);
          return;
        }
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [nodes, viewMode, selectedNode]);

  const filteredNodes = nodes.filter(n =>
    n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (n.relationshipToSam || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (n.instagramHandle || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: '#000000', color: '#ffffff', padding: '24px' }}>
      {/* Header Bar */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #1a1a1a', paddingBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: '700', letterSpacing: '-0.5px' }}>CHATTER // SOCIAL TREE</span>
            <span className="mono" style={{ fontSize: '0.7rem', background: '#111111', border: '1px solid #222222', padding: '2px 8px', borderRadius: '4px', color: '#888888' }}>
              PURE BLACK MINIMALIST
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#666666', marginTop: '4px' }}>
            Interactive node-based relationship graph & friend tree. Deployable on Vercel.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="btn"
            onClick={() => setViewMode(viewMode === 'tree' ? 'list' : 'tree')}
          >
            <Network size={14} />
            <span>{viewMode === 'tree' ? 'List View' : 'Dot Tree View'}</span>
          </button>

          <button className="btn" onClick={fetchNodes} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Sync</span>
          </button>

          <button className="btn btn-primary" onClick={() => {
            setFormData({
              name: '',
              instagramHandle: '',
              relationshipToSam: 'Friend',
              gender: 'unknown',
              connections: '',
              lore: '',
              roastStyle: '',
              aliases: ''
            });
            setIsModalOpen(true);
          }}>
            <Plus size={14} />
            <span>Add Friend / Node</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      {viewMode === 'tree' ? (
        <div className="canvas-wrapper">
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          <div style={{ position: 'absolute', bottom: '16px', left: '16px', background: 'rgba(0, 0, 0, 0.7)', border: '1px solid #222222', borderRadius: '6px', padding: '8px 12px', fontSize: '0.75rem', color: '#666666' }}>
            💡 Click any dot to inspect details, lore, and relationships.
          </div>
        </div>
      ) : (
        /* Minimalist List Grid */
        <div>
          <div style={{ marginBottom: '16px', maxWidth: '360px' }}>
            <input
              type="text"
              placeholder="Search friends, handles, relationships..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {filteredNodes.map(node => (
              <div
                key={node.name}
                onClick={() => setSelectedNode(node)}
                style={{
                  background: '#080808',
                  border: '1px solid #1c1c1c',
                  borderRadius: '8px',
                  padding: '18px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#444444'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#1c1c1c'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: '600' }}>{node.name}</h3>
                    <span className="mono" style={{ fontSize: '0.75rem', color: '#666666' }}>{node.instagramHandle || 'No handle'}</span>
                  </div>
                  <span className="mono" style={{ fontSize: '0.7rem', border: '1px solid #222222', padding: '2px 6px', borderRadius: '4px', color: '#aaaaaa' }}>
                    {node.relationshipToSam}
                  </span>
                </div>

                {node.connections?.length > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#777777', marginBottom: '8px' }}>
                    <b>Linked to:</b> {node.connections.map(c => c.targetName).join(', ')}
                  </div>
                )}

                <p style={{ fontSize: '0.8rem', color: '#555555', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {node.lore?.[0] || 'No lore recorded.'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inspector Drawer */}
      <div className={`inspector-drawer ${selectedNode ? 'open' : ''}`}>
        {selectedNode && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #1a1a1a', paddingBottom: '16px' }}>
              <div>
                <span className="mono" style={{ fontSize: '0.7rem', color: '#666666', textTransform: 'uppercase' }}>Node Details</span>
                <h2 style={{ fontSize: '1.4rem', fontWeight: '700', marginTop: '2px' }}>{selectedNode.name}</h2>
                <span className="mono" style={{ fontSize: '0.8rem', color: '#888888' }}>{selectedNode.instagramHandle || 'Unlinked Account'}</span>
              </div>
              <button className="btn btn-sm" onClick={() => setSelectedNode(null)}>
                <X size={14} />
              </button>
            </div>

            {/* Relationship Badge */}
            <div style={{ marginBottom: '20px' }}>
              <span className="mono" style={{ fontSize: '0.75rem', color: '#666666', display: 'block', marginBottom: '4px' }}>RELATIONSHIP TO SAM</span>
              <div style={{ background: '#0a0a0a', border: '1px solid #222222', borderRadius: '6px', padding: '10px 14px', fontSize: '0.85rem' }}>
                {selectedNode.relationshipToSam || 'Friend'}
              </div>
            </div>

            {/* Tree Connections */}
            <div style={{ marginBottom: '20px' }}>
              <span className="mono" style={{ fontSize: '0.75rem', color: '#666666', display: 'block', marginBottom: '6px' }}>CONNECTED FRIENDS (TREE CHAIN)</span>
              {selectedNode.connections?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {selectedNode.connections.map((c, idx) => (
                    <div
                      key={idx}
                      style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: '6px', padding: '8px 12px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}
                    >
                      <span style={{ fontWeight: '500' }}>🔗 {c.targetName}</span>
                      <span className="mono" style={{ color: '#777777', fontSize: '0.7rem' }}>{c.relationship}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.8rem', color: '#444444' }}>No direct connections established.</p>
              )}
            </div>

            {/* Shared Lore & Inside Jokes */}
            <div style={{ marginBottom: '20px' }}>
              <span className="mono" style={{ fontSize: '0.75rem', color: '#666666', display: 'block', marginBottom: '6px' }}>SHARED LORE & INSIDE JOKES</span>
              {selectedNode.lore?.length > 0 ? (
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedNode.lore.map((item, idx) => (
                    <li key={idx} style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: '6px', padding: '8px 12px', fontSize: '0.8rem', color: '#cccccc', lineHeight: '1.4' }}>
                      • {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: '0.8rem', color: '#444444' }}>No lore recorded.</p>
              )}
            </div>

            {/* Cuss & Roast Style */}
            {selectedNode.roastStyle && (
              <div style={{ marginBottom: '24px' }}>
                <span className="mono" style={{ fontSize: '0.75rem', color: '#666666', display: 'block', marginBottom: '6px' }}>⚡ CUSS & ROAST STYLE (BANTER BACK)</span>
                <div style={{ background: '#0d0d0d', border: '1px solid #222222', borderRadius: '6px', padding: '10px 14px', fontSize: '0.8rem', color: '#aaaaaa', lineHeight: '1.4' }}>
                  {selectedNode.roastStyle}
                </div>
              </div>
            )}

            {/* Edit / Quick Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => {
                  setFormData({
                    name: selectedNode.name,
                    instagramHandle: selectedNode.instagramHandle || '',
                    relationshipToSam: selectedNode.relationshipToSam || '',
                    gender: selectedNode.gender || 'unknown',
                    connections: (selectedNode.connections || []).map(c => `${c.targetName} (${c.relationship})`).join(', '),
                    lore: (selectedNode.lore || []).join('\n'),
                    roastStyle: selectedNode.roastStyle || '',
                    aliases: (selectedNode.aliases || []).join(', ')
                  });
                  setIsModalOpen(true);
                }}
              >
                Edit Node Info
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Node Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #1a1a1a', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Add / Edit Friend Node</h3>
              <button className="btn btn-sm" onClick={() => setIsModalOpen(false)}>
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSaveNode} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="mono" style={{ fontSize: '0.75rem', color: '#777777', display: 'block', marginBottom: '4px' }}>Friend Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Bhanvani, Roni, Rajveer, Moksha"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="mono" style={{ fontSize: '0.75rem', color: '#777777', display: 'block', marginBottom: '4px' }}>Instagram Handle</label>
                <input
                  type="text"
                  placeholder="e.g. @yk_bhavani._.xo"
                  value={formData.instagramHandle}
                  onChange={(e) => setFormData({ ...formData, instagramHandle: e.target.value })}
                />
              </div>

              <div>
                <label className="mono" style={{ fontSize: '0.75rem', color: '#777777', display: 'block', marginBottom: '4px' }}>Relationship to Sam</label>
                <input
                  type="text"
                  placeholder="e.g. Closest online friend / Medicine student"
                  value={formData.relationshipToSam}
                  onChange={(e) => setFormData({ ...formData, relationshipToSam: e.target.value })}
                />
              </div>

              <div>
                <label className="mono" style={{ fontSize: '0.75rem', color: '#777777', display: 'block', marginBottom: '4px' }}>Gender</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                >
                  <option value="female">Female (Never call da/bro)</option>
                  <option value="male">Male (Casual bro/da)</option>
                  <option value="neutral">Neutral</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>

              <div>
                <label className="mono" style={{ fontSize: '0.75rem', color: '#777777', display: 'block', marginBottom: '4px' }}>Connected Friends (Tree Chain)</label>
                <input
                  type="text"
                  placeholder="e.g. Annie (sister), Rajveer (homie)"
                  value={formData.connections}
                  onChange={(e) => setFormData({ ...formData, connections: e.target.value })}
                />
                <span className="mono" style={{ fontSize: '0.65rem', color: '#555555' }}>Format: Name (relationship), Name (relationship)</span>
              </div>

              <div>
                <label className="mono" style={{ fontSize: '0.75rem', color: '#777777', display: 'block', marginBottom: '4px' }}>Shared Lore & Inside Jokes (1 per line)</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Indian Army dad, Netflix subscription, hamster obsession, 12th March 2007 birthday..."
                  value={formData.lore}
                  onChange={(e) => setFormData({ ...formData, lore: e.target.value })}
                />
              </div>

              <div>
                <label className="mono" style={{ fontSize: '0.75rem', color: '#777777', display: 'block', marginBottom: '4px' }}>Cuss / Roast Style</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Playful and gentle teasing, no hard insults. Tease about hamster obsession."
                  value={formData.roastStyle}
                  onChange={(e) => setFormData({ ...formData, roastStyle: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Node</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
