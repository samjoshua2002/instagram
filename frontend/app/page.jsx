'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useApp } from './context/AppContext';
import {
  Users, Sliders, Brain, Clock, Sparkles, TrendingUp, CheckCircle2,
  AlertCircle, ArrowRight, ShieldCheck, Calendar, Activity, Zap, MessageSquare
} from 'lucide-react';

export default function DashboardPage() {
  const { nodes, routingConfig, startAiInterview, toggleGlobalBot } = useApp();

  const friendNodes = useMemo(() => nodes.filter(n => !n.isRoot), [nodes]);

  // Breakdown calculations
  const breakdown = useMemo(() => {
    let close = 0;
    let homies = 0;
    let relatives = 0;
    let icons = 0;
    let pendingReminders = 0;

    friendNodes.forEach(f => {
      if (f.category === 'close_friend') close++;
      else if (f.category === 'homie') homies++;
      else if (f.category === 'relative') relatives++;
      else icons++;

      if (f.idleHours >= 5 && f.idleHours <= 10) {
        pendingReminders++;
      }
    });

    return { close, homies, relatives, icons, pendingReminders };
  }, [friendNodes]);

  const activeModeCount = routingConfig.chatMode === 'everyone_except'
    ? (routingConfig.excludedContactIds || []).length
    : (routingConfig.chatMode === 'only_selected' ? (routingConfig.includedContactIds || []).length : 0);

  return (
    <div style={{ padding: '36px 32px 60px 32px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold' }}>
            // COMMAND CENTER & DECISION INTELLIGENCE
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.6px', marginTop: '4px' }}>
            Sam Joshua // Overview
          </h1>
          <p style={{ color: '#a1a1aa', fontSize: '0.88rem', marginTop: '4px' }}>
            Real-time analytics on your mapped circle, pending follow-up triggers, and live Instagram AI routing.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => startAiInterview(null)}
            style={{
              background: '#ffffff',
              color: '#000000',
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
            <span>+ Add Person (AI)</span>
          </button>
        </div>
      </div>

      {/* 4 Compact Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {/* Stat 1: Total People */}
        <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase' }}>Total Mapped Friends</span>
            <Users size={16} color="#10b981" />
          </div>
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#ffffff', letterSpacing: '-1px' }}>
              {friendNodes.length}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#10b981', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
              ● 100% Interlinked & Verified
            </div>
          </div>
          <Link href="/relationships" style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#a1a1aa', textDecoration: 'none', fontWeight: '600' }}>
            <span>View relationship menu</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* Stat 2: Active Chat Policy */}
        <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase' }}>Active Routing Mode</span>
            <Sliders size={16} color="#38bdf8" />
          </div>
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.3px', textTransform: 'uppercase' }}>
              {routingConfig.chatMode.replace('_', ' ')}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#38bdf8', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
              {routingConfig.chatMode === 'everyone_except' && `${activeModeCount} contacts excluded for Sam`}
              {routingConfig.chatMode === 'only_selected' && `${activeModeCount} contacts whitelisted`}
              {routingConfig.chatMode === 'everyone' && 'Global auto-reply active'}
              {routingConfig.chatMode === 'paused' && 'Bot silenced / manual mode'}
            </div>
          </div>
          <Link href="/controls" style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#a1a1aa', textDecoration: 'none', fontWeight: '600' }}>
            <span>Adjust chat rules</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* Stat 3: 5-10h Reminder Queue */}
        <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase' }}>5–10h Reminders Queue</span>
            <Clock size={16} color="#fbbf24" />
          </div>
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#ffffff', letterSpacing: '-1px' }}>
              {breakdown.pendingReminders}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#fbbf24', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
              Conversations in warm window
            </div>
          </div>
          <span style={{ marginTop: '14px', fontSize: '0.75rem', color: '#a1a1aa' }}>
            No double texts if left on read
          </span>
        </div>

        {/* Stat 4: Memory Facts Synced */}
        <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase' }}>Learned Facts & Lore</span>
            <Brain size={16} color="#a855f7" />
          </div>
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#ffffff', letterSpacing: '-1px' }}>
              {friendNodes.reduce((acc, f) => acc + (f.facts || []).length, 0)}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#a855f7', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
              Extracted facts across friends
            </div>
          </div>
          <Link href="/memories" style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#a1a1aa', textDecoration: 'none', fontWeight: '600' }}>
            <span>Review memory dossiers</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* Main Grid: Circle Category Distribution & Decision Queue */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        {/* Left: Circle Composition Chart */}
        <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '14px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800' }}>Circle Breakdown & Roles</h3>
              <p style={{ fontSize: '0.76rem', color: '#71717a', marginTop: '2px' }}>Categorization of friends mapped into AI memory</p>
            </div>
            <Activity size={18} color="#10b981" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { label: 'Closest Friends & Confidantes', count: breakdown.close, color: '#10b981', desc: 'Bhavani, Moksha, Fami' },
              { label: 'Homies & Bros (Hinglish/Tamil Banter)', count: breakdown.homies, color: '#6366f1', desc: 'Rajveer, Arun' },
              { label: 'Family & Sister', count: breakdown.relatives, color: '#ec4899', desc: 'Annie (talking with Bhavani)' },
              { label: 'Group Legends & Running Gags', count: breakdown.icons, color: '#f59e0b', desc: 'Roni Uncle, Rubesh' }
            ].map((cat, i) => (
              <div key={i} style={{ background: '#121214', border: '1px solid #1f1f23', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: cat.color }} />
                    <span style={{ fontSize: '0.84rem', fontWeight: '700', color: '#ffffff' }}>{cat.label}</span>
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#ffffff', fontFamily: "'JetBrains Mono', monospace" }}>
                    {cat.count}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '4px', marginLeft: '16px' }}>
                  {cat.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Decision Queue & Upcoming Follow-Ups */}
        <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '14px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800' }}>Reminders & Action Queue</h3>
              <p style={{ fontSize: '0.76rem', color: '#71717a', marginTop: '2px' }}>People requests & follow-up opportunities</p>
            </div>
            <Clock size={18} color="#fbbf24" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Action 1: Bhavani */}
            <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#ffffff' }}>Bhavani (@yk_bhavani._.xo)</span>
                <span style={{ fontSize: '0.65rem', background: 'rgba(234,179,8,0.15)', color: '#fef08a', padding: '2px 8px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
                  6h Idle • Warm Follow-Up
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '4px' }}>
                Natural check-in eligible. Inside joke topics: hamster drama 🐹, Netflix watchlist, medicine exams.
              </p>
            </div>

            {/* Action 2: Rajveer */}
            <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#ffffff' }}>Rajveer (@unpredictable_2k26)</span>
                <span style={{ fontSize: '0.65rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '2px 8px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
                  Excluded from AI (Sam Manual)
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '4px' }}>
                AI is paused for Rajveer so Sam can banter directly about Roni uncle without bot interference.
              </p>
            </div>

            {/* Action 3: Upcoming Date */}
            <div style={{ background: '#121214', border: '1px solid #27272a', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#ffffff' }}>Upcoming Milestone</span>
                <span style={{ fontSize: '0.65rem', background: '#18181b', color: '#10b981', padding: '2px 8px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
                  March 12
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '4px' }}>
                🎂 Bhavani&apos;s Birthday (born 12th March 2007) is stored in persistent memory.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
