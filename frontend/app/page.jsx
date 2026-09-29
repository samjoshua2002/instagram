'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useApp } from './context/AppContext';
import {
  Users, Sliders, Brain, Clock, Sparkles, TrendingUp, CheckCircle2,
  AlertCircle, ArrowRight, ShieldCheck, Calendar, Activity, Zap, MessageSquare, Film, Bot
} from 'lucide-react';

export default function DashboardPage() {
  const { nodes, routingConfig, startAiInterview } = useApp();

  const friendNodes = useMemo(() => nodes.filter(n => !n.isRoot), [nodes]);

  // Breakdown calculations
  const breakdown = useMemo(() => {
    let close = 0;
    let online = 0;
    let offline = 0;
    let relatives = 0;
    let professional = 0;
    let totalDMs = 0;
    let totalReels = 0;

    friendNodes.forEach(f => {
      const cat = f.category || 'online_friend';
      if (cat === 'close_friend' || f.id === 'fami' || f.id === 'bhavani') close++;
      else if (cat === 'online_friend') online++;
      else if (cat === 'offline_friend') offline++;
      else if (cat === 'family' || cat === 'relative') relatives++;
      else professional++;

      totalDMs += (f.chatsCount || f.messageCount || 0);
      totalReels += (f.reelsCount || 0);
    });

    return { close, online, offline, relatives, professional, totalDMs, totalReels };
  }, [friendNodes]);

  const activeModeCount = routingConfig.chatMode === 'everyone_except'
    ? (routingConfig.excludedContactIds || []).length
    : (routingConfig.chatMode === 'only_selected' ? (routingConfig.includedContactIds || []).length : 0);

  return (
    <div style={{ padding: '36px 36px 80px 36px', maxWidth: '1300px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
            COMMAND CENTER
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.6px', marginTop: '4px', color: '#09090b' }}>
            Overview & Intelligence
          </h1>
          <p style={{ color: '#71717a', fontSize: '0.88rem', marginTop: '4px' }}>
            Real-time analytics on mapped contacts, interaction volume, and live Instagram AI routing.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => startAiInterview(null)}
            style={{
              background: '#09090b',
              color: '#ffffff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Sparkles size={14} />
            <span>+ Add Person</span>
          </button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {/* Stat 1: Total People */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', fontWeight: '700' }}>
              Total People
            </span>
            <Users size={16} style={{ color: '#09090b' }} />
          </div>
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#09090b', letterSpacing: '-1px' }}>
              {friendNodes.length}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#71717a', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
              Active directory profiles
            </div>
          </div>
          <Link href="/relationships" style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#09090b', textDecoration: 'none', fontWeight: '600' }}>
            <span>Open people directory</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* Stat 2: Total Chats / DMs */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', fontWeight: '700' }}>
              Total Chats / DMs
            </span>
            <MessageSquare size={16} style={{ color: '#09090b' }} />
          </div>
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#09090b', letterSpacing: '-1px' }}>
              {breakdown.totalDMs}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#71717a', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
              Messages recorded in database
            </div>
          </div>
          <Link href="/relationships" style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#09090b', textDecoration: 'none', fontWeight: '600' }}>
            <span>Review conversations</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* Stat 3: Total Reels Shared */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', fontWeight: '700' }}>
              Reels Shared
            </span>
            <Film size={16} style={{ color: '#09090b' }} />
          </div>
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#09090b', letterSpacing: '-1px' }}>
              {breakdown.totalReels}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#71717a', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
              Instagram reels exchanged
            </div>
          </div>
          <span style={{ marginTop: '14px', fontSize: '0.75rem', color: '#71717a' }}>
            Auto-reacted by AI
          </span>
        </div>

        {/* Stat 4: Active Chat Policy */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', fontWeight: '700' }}>
              Active Routing Policy
            </span>
            <Sliders size={16} style={{ color: '#09090b' }} />
          </div>
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#09090b', letterSpacing: '-0.3px', textTransform: 'uppercase' }}>
              {routingConfig.chatMode.replace('_', ' ')}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#71717a', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
              {routingConfig.chatMode === 'everyone_except' && `${activeModeCount} contacts excluded`}
              {routingConfig.chatMode === 'only_selected' && `${activeModeCount} contacts selected`}
              {routingConfig.chatMode === 'everyone' && 'Global auto-reply active'}
              {routingConfig.chatMode === 'paused' && 'Bot silenced / manual mode'}
            </div>
          </div>
          <Link href="/controls" style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#09090b', textDecoration: 'none', fontWeight: '600' }}>
            <span>Adjust chat controls</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* Main Grid: Circle Distribution & Intelligence Action Queue */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        {/* Left: Circle Composition */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#09090b', margin: 0 }}>
                Circle Breakdown
              </h3>
              <p style={{ fontSize: '0.76rem', color: '#71717a', marginTop: '2px' }}>
                Relationship categories mapped across contacts
              </p>
            </div>
            <Activity size={18} style={{ color: '#09090b' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { label: 'Close Circle / Fami', count: breakdown.close, desc: 'Highest trust, inside jokes, continuous lore' },
              { label: 'Online Friends', count: breakdown.online, desc: 'Casual DM interaction, shared reels, tech discussions' },
              { label: 'Offline Friends', count: breakdown.offline, desc: 'Local circle, college or hometown friends' },
              { label: 'Family / Relatives', count: breakdown.relatives, desc: 'Sister & family members' },
              { label: 'Professional / Business', count: breakdown.professional, desc: 'Creators, clients, or collaborative inquiries' }
            ].map((cat, i) => (
              <div key={i} style={{ background: '#f4f4f5', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: '700', color: '#09090b' }}>{cat.label}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#09090b', fontFamily: "'JetBrains Mono', monospace" }}>
                    {cat.count}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '3px' }}>
                  {cat.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Key Intelligence Highlights */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#09090b', margin: 0 }}>
                Intelligence Highlights
              </h3>
              <p style={{ fontSize: '0.76rem', color: '#71717a', marginTop: '2px' }}>
                Synthesized contact context & rules
              </p>
            </div>
            <Clock size={18} style={{ color: '#09090b' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ background: '#f4f4f5', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#09090b' }}>Bhavani (@yk_bhavani._.xo)</span>
                <span style={{ fontSize: '0.68rem', background: '#ffffff', border: '1px solid #e4e4e7', color: '#09090b', padding: '2px 8px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
                  ACTIVE INTEL
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '4px' }}>
                Synthesized facts: Medicine student, exams, hamster updates, Netflix watchlist. Full AI auto-reply active.
              </p>
            </div>

            <div style={{ background: '#f4f4f5', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#09090b' }}>Rajveer (@unpredictable_2k26)</span>
                <span style={{ fontSize: '0.68rem', background: '#ffffff', border: '1px solid #e4e4e7', color: '#09090b', padding: '2px 8px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
                  SAM MANUAL
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '4px' }}>
                AI paused for Rajveer so Sam chats manually about Roni uncle and mutual jokes without bot intervention.
              </p>
            </div>

            <div style={{ background: '#f4f4f5', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#09090b' }}>Annie (@annies_hepsiba)</span>
                <span style={{ fontSize: '0.68rem', background: '#ffffff', border: '1px solid #e4e4e7', color: '#09090b', padding: '2px 8px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
                  SISTER / CIRCLE
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '4px' }}>
                Connected to Bhavani in circle. AI replies respectfully matching family tone.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
