'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useApp } from './context/AppContext';
import {
  Users, Sliders, Sparkles, ArrowRight,
  MessageSquare, Film, Bot, Shield
} from 'lucide-react';

// Pure SVG Donut Chart – no external dep needed
function DonutChart({ segments, size = 130, stroke = 20 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f4f4f5" strokeWidth={stroke} />
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const el = (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={seg.color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset} strokeLinecap="butt" />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

// Horizontal bar row for leaderboards
function BarRow({ label, handle, value, max, index }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const shades = ['#09090b', '#27272a', '#52525b', '#a1a1aa', '#d4d4d8'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f4f4f5' }}>
      <span style={{ width: '16px', fontSize: '0.66rem', color: '#a1a1aa', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', textAlign: 'right', flexShrink: 0 }}>
        {index + 1}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
          <span style={{ fontSize: '0.81rem', fontWeight: '700', color: '#09090b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>{label}</span>
          <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#09090b', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, marginLeft: '8px' }}>{value}</span>
        </div>
        <div style={{ width: '100%', height: '5px', background: '#f4f4f5', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: shades[index] || '#d4d4d8', borderRadius: '3px', transition: 'width 0.6s ease' }} />
        </div>
        {handle && <div style={{ fontSize: '0.63rem', color: '#a1a1aa', fontFamily: "'JetBrains Mono', monospace", marginTop: '2px' }}>{handle}</div>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { nodes, routingConfig, startAiInterview } = useApp();
  const friendNodes = useMemo(() => nodes.filter(n => !n.isRoot), [nodes]);

  const breakdown = useMemo(() => {
    let close = 0, online = 0, offline = 0, relatives = 0, professional = 0;
    let totalDMs = 0, totalReels = 0, aiActive = 0, aiPaused = 0;
    friendNodes.forEach(f => {
      const cat = f.category || 'online_friend';
      if (cat === 'close_friend') close++;
      else if (cat === 'online_friend') online++;
      else if (cat === 'offline_friend') offline++;
      else if (cat === 'family' || cat === 'relative') relatives++;
      else professional++;
      totalDMs += (f.chatsCount || f.messageCount || 0);
      totalReels += (f.reelsCount || 0);
      if (f.aiEnabled !== false) aiActive++; else aiPaused++;
    });
    return { close, online, offline, relatives, professional, totalDMs, totalReels, aiActive, aiPaused };
  }, [friendNodes]);

  const topChatters = useMemo(() =>
    [...friendNodes].filter(n => (n.chatsCount || n.messageCount || 0) > 0)
      .sort((a, b) => (b.chatsCount || b.messageCount || 0) - (a.chatsCount || a.messageCount || 0))
      .slice(0, 5), [friendNodes]);

  const topReelers = useMemo(() =>
    [...friendNodes].filter(n => (n.reelsCount || 0) > 0)
      .sort((a, b) => (b.reelsCount || 0) - (a.reelsCount || 0))
      .slice(0, 5), [friendNodes]);

  const maxChats = topChatters[0] ? (topChatters[0].chatsCount || topChatters[0].messageCount || 0) : 1;
  const maxReels = topReelers[0] ? (topReelers[0].reelsCount || 0) : 1;

  const donutSegments = [
    { label: 'Close Circle', value: breakdown.close, color: '#09090b' },
    { label: 'Online Friends', value: breakdown.online, color: '#3f3f46' },
    { label: 'Offline Friends', value: breakdown.offline, color: '#71717a' },
    { label: 'Family', value: breakdown.relatives, color: '#a1a1aa' },
    { label: 'Professional', value: breakdown.professional, color: '#d4d4d8' },
  ].filter(s => s.value > 0);

  const activeModeCount = routingConfig.chatMode === 'everyone_except'
    ? (routingConfig.excludedContactIds || []).length
    : (routingConfig.chatMode === 'only_selected' ? (routingConfig.includedContactIds || []).length : 0);

  const statCards = [
    { label: 'Total People', value: friendNodes.length, sub: 'Active profiles', icon: <Users size={15} />, href: '/relationships' },
    { label: 'Total DMs', value: breakdown.totalDMs, sub: 'From contacts', icon: <MessageSquare size={15} />, href: '/relationships' },
    { label: 'Reels Shared', value: breakdown.totalReels, sub: 'Reels exchanged', icon: <Film size={15} />, href: null },
    { label: 'AI Active', value: breakdown.aiActive, sub: `${breakdown.aiPaused} paused`, icon: <Bot size={15} />, href: '/controls' },
  ];

  return (
    <div className="page-container dashboard-container">

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div>
          <div style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', letterSpacing: '0.08em' }}>COMMAND CENTER</div>
          <h1 style={{ fontSize: '2rem', fontWeight: '900', letterSpacing: '-0.7px', marginTop: '4px', color: '#09090b' }}>Analytics Overview</h1>
          <p style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '4px' }}>Real-time analytics on contacts, interaction volume, and AI routing.</p>
        </div>
        <button onClick={() => startAiInterview(null)}
          style={{ background: '#09090b', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={14} /><span>+ Add Person</span>
        </button>
      </div>

      {/* STAT CARDS */}
      <div className="stats-grid">
        {statCards.map((c, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.06em' }}>{c.label}</span>
              <div style={{ background: '#f4f4f5', padding: '5px', borderRadius: '6px', color: '#09090b' }}>{c.icon}</div>
            </div>
            <div>
              <div style={{ fontSize: '2.4rem', fontWeight: '900', color: '#09090b', letterSpacing: '-1.5px', lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: '0.68rem', color: '#a1a1aa', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>{c.sub}</div>
            </div>
            {c.href ? (
              <Link href={c.href} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#09090b', textDecoration: 'none', fontWeight: '700' }}>
                <span>View</span><ArrowRight size={10} />
              </Link>
            ) : <div />}
          </div>
        ))}
      </div>

      {/* MAIN 3-COL CHARTS */}
      <div className="charts-grid">

        {/* Donut: Circle Breakdown */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '22px' }}>
          <div style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>CIRCLE COMPOSITION</div>
          <div style={{ fontSize: '1rem', fontWeight: '800', color: '#09090b', marginBottom: '18px', marginTop: '2px' }}>Relationship Map</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: '16px' }}>
            <DonutChart segments={donutSegments.length > 0 ? donutSegments : [{ value: 1, color: '#f4f4f5' }]} size={130} stroke={20} />
            <div style={{ position: 'absolute', textAlign: 'center' }}>
              <div style={{ fontSize: '1.7rem', fontWeight: '900', color: '#09090b', lineHeight: 1 }}>{friendNodes.length}</div>
              <div style={{ fontSize: '0.58rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>TOTAL</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {[
              { label: 'Close Circle', value: breakdown.close, color: '#09090b' },
              { label: 'Online Friends', value: breakdown.online, color: '#3f3f46' },
              { label: 'Offline Friends', value: breakdown.offline, color: '#71717a' },
              { label: 'Family', value: breakdown.relatives, color: '#a1a1aa' },
              { label: 'Professional', value: breakdown.professional, color: '#d4d4d8' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ color: '#52525b' }}>{s.label}</span>
                </div>
                <span style={{ fontWeight: '800', color: '#09090b', fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar: Top Chatters */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '22px' }}>
          <div style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>MESSAGE VOLUME</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', marginTop: '2px' }}>
            <div style={{ fontSize: '1rem', fontWeight: '800', color: '#09090b' }}>Top Chatters</div>
            <MessageSquare size={14} style={{ color: '#a1a1aa' }} />
          </div>
          {topChatters.length > 0
            ? topChatters.map((p, i) => <BarRow key={p.id || p.name} index={i} label={p.name} handle={p.handle || p.instagramHandle} value={p.chatsCount || p.messageCount || 0} max={maxChats} />)
            : <div style={{ textAlign: 'center', padding: '30px 0', color: '#a1a1aa', fontSize: '0.8rem' }}>No message data yet</div>
          }
          <Link href="/relationships" style={{ marginTop: '14px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#09090b', textDecoration: 'none', fontWeight: '700' }}>
            <span>View all</span><ArrowRight size={10} />
          </Link>
        </div>

        {/* Bar: Top Reel Sharers */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '22px' }}>
          <div style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>REEL ACTIVITY</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', marginTop: '2px' }}>
            <div style={{ fontSize: '1rem', fontWeight: '800', color: '#09090b' }}>Top Reel Sharers</div>
            <Film size={14} style={{ color: '#a1a1aa' }} />
          </div>
          {topReelers.length > 0
            ? topReelers.map((p, i) => <BarRow key={p.id || p.name} index={i} label={p.name} handle={p.handle || p.instagramHandle} value={p.reelsCount || 0} max={maxReels} />)
            : <div style={{ textAlign: 'center', padding: '30px 0', color: '#a1a1aa', fontSize: '0.8rem' }}>No reel data yet</div>
          }
          <Link href="/relationships" style={{ marginTop: '14px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#09090b', textDecoration: 'none', fontWeight: '700' }}>
            <span>View all</span><ArrowRight size={10} />
          </Link>
        </div>
      </div>

      {/* BOTTOM ROW: AI Status + Routing */}
      <div className="bottom-grid">

        {/* AI Split */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '22px' }}>
          <div style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI REPLY STATUS</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', marginTop: '2px' }}>
            <div style={{ fontSize: '1rem', fontWeight: '800', color: '#09090b' }}>Per-Contact AI Mode</div>
            <Bot size={14} style={{ color: '#a1a1aa' }} />
          </div>
          <div style={{ height: '8px', background: '#f4f4f5', borderRadius: '4px', overflow: 'hidden', marginBottom: '14px' }}>
            {friendNodes.length > 0 && (
              <div style={{ width: `${(breakdown.aiActive / friendNodes.length) * 100}%`, height: '100%', background: '#09090b', transition: 'width 0.5s ease' }} />
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {[
              { label: 'Full AI Active', value: breakdown.aiActive, color: '#09090b' },
              { label: 'Manual / Paused', value: breakdown.aiPaused, color: '#d4d4d8' },
            ].map((s, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#f4f4f5', border: '1px solid #e4e4e7', borderRadius: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#09090b', letterSpacing: '-0.5px' }}>{s.value}</div>
                  <div style={{ fontSize: '0.64rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
          <Link href="/controls" style={{ marginTop: '14px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#09090b', textDecoration: 'none', fontWeight: '700' }}>
            <span>Manage AI controls</span><ArrowRight size={10} />
          </Link>
        </div>

        {/* Routing Policy */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '22px' }}>
          <div style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ROUTING POLICY</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', marginTop: '2px' }}>
            <div style={{ fontSize: '1rem', fontWeight: '800', color: '#09090b' }}>Active Chat Mode</div>
            <Shield size={14} style={{ color: '#a1a1aa' }} />
          </div>
          <div style={{ background: '#09090b', borderRadius: '10px', padding: '16px 18px', marginBottom: '12px' }}>
            <div style={{ fontSize: '0.58rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', letterSpacing: '0.08em', marginBottom: '5px' }}>CURRENT MODE</div>
            <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#fff', letterSpacing: '-0.3px', textTransform: 'uppercase' }}>
              {routingConfig.chatMode.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#71717a', marginTop: '3px', fontFamily: "'JetBrains Mono', monospace" }}>
              {routingConfig.chatMode === 'everyone_except' && `${activeModeCount} contact${activeModeCount !== 1 ? 's' : ''} excluded`}
              {routingConfig.chatMode === 'only_selected' && `${activeModeCount} contact${activeModeCount !== 1 ? 's' : ''} selected`}
              {routingConfig.chatMode === 'everyone' && 'All contacts — global auto-reply'}
              {routingConfig.chatMode === 'paused' && 'Silenced — Sam is chatting manually'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1, background: '#f4f4f5', borderRadius: '8px', padding: '9px 11px', border: '1px solid #e4e4e7' }}>
              <div style={{ fontSize: '0.58rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', marginBottom: '2px' }}>BOT STATUS</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: routingConfig.globalBotActive ? '#09090b' : '#d4d4d8' }} />
                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#09090b' }}>{routingConfig.globalBotActive ? 'ONLINE' : 'PAUSED'}</span>
              </div>
            </div>
            <div style={{ flex: 1, background: '#f4f4f5', borderRadius: '8px', padding: '9px 11px', border: '1px solid #e4e4e7' }}>
              <div style={{ fontSize: '0.58rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', marginBottom: '2px' }}>CONTACTS</div>
              <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#09090b' }}>{friendNodes.length} people</span>
            </div>
          </div>
          <Link href="/controls" style={{ marginTop: '14px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#09090b', textDecoration: 'none', fontWeight: '700' }}>
            <span>Adjust routing</span><ArrowRight size={10} />
          </Link>
        </div>
      </div>

      <style jsx>{`
        .dashboard-container {
          padding: 36px 36px 80px 36px;
          max-width: 1300px;
          margin: 0 auto;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 20px;
        }
        .charts-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 14px;
          margin-bottom: 14px;
        }
        .bottom-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        @media (max-width: 1024px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .charts-grid {
            grid-template-columns: 1fr;
          }
          .bottom-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 768px) {
          .dashboard-container {
            padding: 16px 14px 80px 14px;
          }
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
          }
          .charts-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .bottom-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
        }
        @media (max-width: 480px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}