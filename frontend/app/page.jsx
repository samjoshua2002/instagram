'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useApp } from './context/AppContext';
import {
  Users, Sliders, Sparkles, ArrowRight,
  MessageSquare, Film, Bot, Shield,
  Search, RefreshCw, CheckCircle2, AlertCircle,
  ExternalLink, ChevronDown, ChevronUp, Layers,
  Lock, Instagram, Smartphone, Calendar, UserCheck, Mail
} from 'lucide-react';
import { motion, animate, AnimatePresence } from 'framer-motion';

// Butter-Smooth Framer Motion Animated Number Counter (quintic deceleration curve)
function AnimatedNumber({ value, duration = 1.8 }) {
  const numericValue = typeof value === 'number' ? value : parseInt(value, 10) || 0;
  const [displayValue, setDisplayValue] = useState(0);
  const prevValueRef = useRef(0);

  useEffect(() => {
    const start = prevValueRef.current;
    const controls = animate(start, numericValue, {
      duration,
      ease: [0.16, 1, 0.3, 1], // butter smooth quintic ease-out
      onUpdate: (latest) => setDisplayValue(Math.round(latest))
    });
    prevValueRef.current = numericValue;
    return () => controls.stop();
  }, [numericValue, duration]);

  return <span>{displayValue.toLocaleString()}</span>;
}

// Butter-Smooth Framer Motion Animated SVG Donut Chart
function DonutChart({ segments, size = 130, stroke = 20 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let offset = 0;

  return (
    <motion.svg
      initial={{ rotate: -90, scale: 0.92, opacity: 0 }}
      animate={{ rotate: -90, scale: 1, opacity: 1 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: 'visible' }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#f4f4f5"
        strokeWidth={stroke}
      />
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const currentOffset = offset;
        offset += dash;
        return (
          <motion.circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={stroke}
            initial={{ strokeDasharray: `0 ${circ}`, strokeDashoffset: -currentOffset }}
            animate={{ strokeDasharray: `${dash} ${circ - dash}`, strokeDashoffset: -currentOffset }}
            transition={{
              duration: 1.8,
              delay: 0.2 + i * 0.15,
              ease: [0.16, 1, 0.3, 1]
            }}
            strokeLinecap="butt"
          />
        );
      })}
    </motion.svg>
  );
}

// Horizontal bar row for leaderboards with butter-smooth progress animation
function BarRow({ label, handle, value, max, index }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const shades = ['#09090b', '#27272a', '#52525b', '#a1a1aa', '#d4d4d8'];
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, delay: 0.2 + index * 0.1, ease: [0.16, 1, 0.3, 1] }}
      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f4f4f5' }}
    >
      <span style={{ width: '16px', fontSize: '0.66rem', color: '#a1a1aa', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', textAlign: 'right', flexShrink: 0 }}>
        {index + 1}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
          <span style={{ fontSize: '0.81rem', fontWeight: '700', color: '#09090b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>{label}</span>
          <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#09090b', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, marginLeft: '8px' }}>
            <AnimatedNumber value={value} duration={1.6} />
          </span>
        </div>
        <div style={{ width: '100%', height: '6px', background: '#f4f4f5', borderRadius: '3px', overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1.6, delay: 0.25 + index * 0.12, ease: [0.16, 1, 0.3, 1] }}
            style={{ height: '100%', background: shades[index] || '#d4d4d8', borderRadius: '3px' }}
          />
        </div>
        {handle && <div style={{ fontSize: '0.63rem', color: '#a1a1aa', fontFamily: "'JetBrains Mono', monospace", marginTop: '2px' }}>{handle}</div>}
      </div>
    </motion.div>
  );
}

const statsContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.06
    }
  }
};

const statCardVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: [0.16, 1, 0.3, 1]
    }
  }
};

export default function AnalyticsPage() {
  const { nodes, routingConfig, user, token, API_BASE } = useApp();
  const isSuperadmin = user?.role === 'superadmin';

  // Toggle view for superadmins: 'platform' (default) vs 'personal'
  const [activeTab, setActiveTab] = useState(isSuperadmin ? 'platform' : 'personal');

  // Superadmin observatory state
  const [adminData, setAdminData] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [adminSubTab, setAdminSubTab] = useState('accounts'); // 'accounts' | 'members'
  const [expandedAccountId, setExpandedAccountId] = useState(null);

  // Fetch admin accounts and social graph members when superadmin
  const fetchAdminAccounts = async () => {
    if (!token || !isSuperadmin) return;
    setAdminLoading(true);
    setAdminError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/accounts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch admin accounts.');
      setAdminData(data);
    } catch (err) {
      console.error('Superadmin directory fetch error:', err);
      setAdminError(err.message || 'Error loading platform accounts.');
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperadmin) {
      fetchAdminAccounts();
    }
  }, [isSuperadmin, token]);

  // Filtered accounts list
  const filteredAccounts = useMemo(() => {
    if (!adminData?.accounts) return [];
    if (!adminSearch.trim()) return adminData.accounts;
    const q = adminSearch.toLowerCase();
    return adminData.accounts.filter(a =>
      (a.email && a.email.toLowerCase().includes(q)) ||
      (a.username && a.username.toLowerCase().includes(q)) ||
      (a.firstName && a.firstName.toLowerCase().includes(q)) ||
      (a.lastName && a.lastName.toLowerCase().includes(q)) ||
      (a.instagramUsername && a.instagramUsername.toLowerCase().includes(q))
    );
  }, [adminData?.accounts, adminSearch]);

  // Filtered members list
  const filteredMembers = useMemo(() => {
    if (!adminData?.contacts) return [];
    if (!adminSearch.trim()) return adminData.contacts;
    const q = adminSearch.toLowerCase();
    return adminData.contacts.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.handle && c.handle.toLowerCase().includes(q)) ||
      (c.category && c.category.toLowerCase().includes(q)) ||
      (c.relationship && c.relationship.toLowerCase().includes(q))
    );
  }, [adminData?.contacts, adminSearch]);

  // Personal Bot Analytics
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

  const personalStatCards = [
    { label: 'Total People', value: friendNodes.length, sub: 'Active profiles', icon: <Users size={15} />, href: '/relationships' },
    { label: 'Total DMs', value: breakdown.totalDMs, sub: 'From contacts', icon: <MessageSquare size={15} />, href: '/relationships' },
    { label: 'Reels Shared', value: breakdown.totalReels, sub: 'Reels exchanged', icon: <Film size={15} />, href: null },
    { label: 'AI Active', value: breakdown.aiActive, sub: `${breakdown.aiPaused} paused`, icon: <Bot size={15} />, href: '/controls' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="page-container dashboard-container"
    >
      {/* HEADER WITH VIEW SWITCHER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', letterSpacing: '0.08em' }}>
            {isSuperadmin ? 'SUPERADMIN OBSERVATORY' : 'COMMAND CENTER'}
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: '900', letterSpacing: '-0.7px', marginTop: '4px', color: '#09090b' }}>
            {isSuperadmin && activeTab === 'platform' ? 'Platform Accounts & Users Summary' : 'Analytics Overview'}
          </h1>
          <p style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '4px' }}>
            {isSuperadmin && activeTab === 'platform'
              ? 'Multi-tenant directory of all connected accounts, members graph, and automation policies.'
              : 'Real-time analytics on your contacts, interaction volume, and AI routing.'}
          </p>
        </div>

        {/* Superadmin Tab Switcher */}
        {isSuperadmin && (
          <div style={{
            display: 'inline-flex',
            background: '#f4f4f5',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid #e4e4e7',
            gap: '4px'
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('platform')}
              style={{
                padding: '7px 14px',
                borderRadius: '7px',
                fontSize: '0.78rem',
                fontWeight: '700',
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'platform' ? '#09090b' : 'transparent',
                color: activeTab === 'platform' ? '#ffffff' : '#71717a',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <Shield size={13} />
              <span>Platform Summary</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('personal')}
              style={{
                padding: '7px 14px',
                borderRadius: '7px',
                fontSize: '0.78rem',
                fontWeight: '700',
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'personal' ? '#09090b' : 'transparent',
                color: activeTab === 'personal' ? '#ffffff' : '#71717a',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <Bot size={13} />
              <span>My Bot & DMs</span>
            </button>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          VIEW A: SUPERADMIN PLATFORM ACCOUNTS & MEMBERS DIRECTORY
         ───────────────────────────────────────────────────────────── */}
      {isSuperadmin && activeTab === 'platform' ? (
        <div>
          {/* PLATFORM KPI SUMMARY CARDS */}
          <motion.div
            variants={statsContainerVariants}
            initial="hidden"
            animate="visible"
            className="stats-grid"
            style={{ marginBottom: '24px' }}
          >
            {/* 1. Total Registered Accounts */}
            <motion.div
              variants={statCardVariants}
              whileHover={{ y: -3, transition: { duration: 0.25, ease: 'easeOut' } }}
              style={{
                background: '#fff',
                border: '1px solid #e4e4e7',
                borderRadius: '12px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '120px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.06em' }}>
                  Registered Accounts
                </span>
                <div style={{ background: '#f4f4f5', padding: '5px', borderRadius: '6px', color: '#09090b' }}>
                  <Users size={15} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '2.4rem', fontWeight: '900', color: '#09090b', letterSpacing: '-1.5px', lineHeight: 1 }}>
                  <AnimatedNumber value={adminData?.totalAccounts || 0} duration={1.6} />
                </div>
                <div style={{ fontSize: '0.68rem', color: '#a1a1aa', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
                  {adminData?.accounts ? (
                    <>
                      {adminData.accounts.filter(a => a.role === 'superadmin').length} Admins • {adminData.accounts.filter(a => a.role !== 'superadmin').length} Users
                    </>
                  ) : 'Active creators'}
                </div>
              </div>
              <div />
            </motion.div>

            {/* 2. Total Social Graph Members */}
            <motion.div
              variants={statCardVariants}
              whileHover={{ y: -3, transition: { duration: 0.25, ease: 'easeOut' } }}
              style={{
                background: '#fff',
                border: '1px solid #e4e4e7',
                borderRadius: '12px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '120px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.06em' }}>
                  Platform Members
                </span>
                <div style={{ background: '#f4f4f5', padding: '5px', borderRadius: '6px', color: '#09090b' }}>
                  <Layers size={15} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '2.4rem', fontWeight: '900', color: '#09090b', letterSpacing: '-1.5px', lineHeight: 1 }}>
                  <AnimatedNumber value={adminData?.totalContacts || friendNodes.length} duration={1.6} />
                </div>
                <div style={{ fontSize: '0.68rem', color: '#a1a1aa', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
                  {adminData?.contactsBreakdown?.closeFriends || 0} Close • {adminData?.contactsBreakdown?.onlineFriends || 0} Online
                </div>
              </div>
              <Link href="/relationships" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#09090b', textDecoration: 'none', fontWeight: '700' }}>
                <span>View Directory</span><ArrowRight size={10} />
              </Link>
            </motion.div>

            {/* 3. Connected Instagram Creators */}
            <motion.div
              variants={statCardVariants}
              whileHover={{ y: -3, transition: { duration: 0.25, ease: 'easeOut' } }}
              style={{
                background: '#fff',
                border: '1px solid #e4e4e7',
                borderRadius: '12px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '120px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.06em' }}>
                  Instagram Connected
                </span>
                <div style={{ background: '#f4f4f5', padding: '5px', borderRadius: '6px', color: '#09090b' }}>
                  <Instagram size={15} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '2.4rem', fontWeight: '900', color: '#09090b', letterSpacing: '-1.5px', lineHeight: 1 }}>
                  <AnimatedNumber value={adminData?.accounts ? adminData.accounts.filter(a => a.instagramUsername).length : 1} duration={1.6} />
                </div>
                <div style={{ fontSize: '0.68rem', color: '#a1a1aa', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
                  Live Webhook automations
                </div>
              </div>
              <div />
            </motion.div>

            {/* 4. Enterprise Passkeys & 2FA */}
            <motion.div
              variants={statCardVariants}
              whileHover={{ y: -3, transition: { duration: 0.25, ease: 'easeOut' } }}
              style={{
                background: '#fff',
                border: '1px solid #e4e4e7',
                borderRadius: '12px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '120px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.06em' }}>
                  Protected by Passkeys
                </span>
                <div style={{ background: '#f4f4f5', padding: '5px', borderRadius: '6px', color: '#09090b' }}>
                  <Lock size={15} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '2.4rem', fontWeight: '900', color: '#09090b', letterSpacing: '-1.5px', lineHeight: 1 }}>
                  <AnimatedNumber value={adminData?.accounts ? adminData.accounts.filter(a => a.hasPasskeys).length : 1} duration={1.6} />
                </div>
                <div style={{ fontSize: '0.68rem', color: '#a1a1aa', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
                  FIDO2 Biometric Auth
                </div>
              </div>
              <div />
            </motion.div>
          </motion.div>

          {/* ACCOUNTS & MEMBERS TABLE CONTAINER */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #e4e4e7',
            borderRadius: '12px',
            padding: '22px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            {/* Top Toolbar: Sub-tabs, Search, and Refresh */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setAdminSubTab('accounts')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    border: '1px solid',
                    borderColor: adminSubTab === 'accounts' ? '#09090b' : '#e4e4e7',
                    background: adminSubTab === 'accounts' ? '#09090b' : '#ffffff',
                    color: adminSubTab === 'accounts' ? '#ffffff' : '#09090b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Users size={14} />
                  <span>Connected Accounts ({adminData?.accounts?.length || 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAdminSubTab('members')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    border: '1px solid',
                    borderColor: adminSubTab === 'members' ? '#09090b' : '#e4e4e7',
                    background: adminSubTab === 'members' ? '#09090b' : '#ffffff',
                    color: adminSubTab === 'members' ? '#ffffff' : '#09090b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Layers size={14} />
                  <span>Platform Members Graph ({adminData?.contacts?.length || 0})</span>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '380px' }}>
                <div style={{
                  position: 'relative',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <Search size={14} style={{ position: 'absolute', left: '11px', color: '#a1a1aa' }} />
                  <input
                    type="text"
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                    placeholder={adminSubTab === 'accounts' ? 'Filter by email, username, or IG...' : 'Filter members by name or handle...'}
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 32px',
                      borderRadius: '8px',
                      border: '1px solid #e4e4e7',
                      fontSize: '0.8rem',
                      outline: 'none',
                      background: '#fcfcfc'
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={fetchAdminAccounts}
                  disabled={adminLoading}
                  title="Refresh directory"
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #e4e4e7',
                    background: '#ffffff',
                    cursor: 'pointer',
                    color: '#09090b'
                  }}
                >
                  <RefreshCw size={14} className={adminLoading ? 'spin' : ''} />
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {adminError && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={15} />
                <span>{adminError}</span>
              </div>
            )}

            {/* SUBTAB 1: ACCOUNTS LIST TABLE */}
            {adminSubTab === 'accounts' ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid #e4e4e7', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '10px 12px' }}>Account & Creator</th>
                      <th style={{ padding: '10px 12px' }}>Role & Type</th>
                      <th style={{ padding: '10px 12px' }}>Instagram Handle</th>
                      <th style={{ padding: '10px 12px' }}>Authentication</th>
                      <th style={{ padding: '10px 12px' }}>Onboarding</th>
                      <th style={{ padding: '10px 12px' }}>Registered</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.length > 0 ? (
                      filteredAccounts.map((acc) => {
                        const isExpanded = expandedAccountId === acc.id;
                        const isSuper = acc.role === 'superadmin';
                        return (
                          <React.Fragment key={acc.id}>
                            <tr
                              style={{
                                borderBottom: '1px solid #f4f4f5',
                                background: isExpanded ? '#fafafa' : '#ffffff',
                                transition: 'background 0.15s ease'
                              }}
                            >
                              {/* Account Identity */}
                              <td style={{ padding: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '8px',
                                    background: '#09090b',
                                    color: '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    overflow: 'hidden',
                                    flexShrink: 0
                                  }}>
                                    {acc.profilePicUrl ? (
                                      <img src={acc.profilePicUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                      (acc.firstName?.[0] || acc.username?.[0] || 'U').toUpperCase()
                                    )}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: '800', color: '#09090b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span>{acc.firstName ? `${acc.firstName} ${acc.lastName || ''}`.trim() : acc.username}</span>
                                      {acc.isVerified && <CheckCircle2 size={13} color="#16a34a" />}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                                      {acc.email} • @{acc.username}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Role & Type */}
                              <td style={{ padding: '12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                                  <span style={{
                                    fontSize: '0.62rem',
                                    fontWeight: '800',
                                    fontFamily: "'JetBrains Mono', monospace",
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: isSuper ? '#09090b' : '#f4f4f5',
                                    color: isSuper ? '#ffffff' : '#09090b'
                                  }}>
                                    {isSuper ? '👑 SUPERADMIN' : 'USER'}
                                  </span>
                                  <span style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'capitalize' }}>
                                    {acc.accountType || 'Personal'}
                                  </span>
                                </div>
                              </td>

                              {/* Instagram Handle */}
                              <td style={{ padding: '12px' }}>
                                {acc.instagramUsername ? (
                                  <a
                                    href={`https://instagram.com/${acc.instagramUsername}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      color: '#09090b',
                                      textDecoration: 'none',
                                      fontWeight: '700',
                                      fontFamily: "'JetBrains Mono', monospace"
                                    }}
                                  >
                                    <span>@{acc.instagramUsername}</span>
                                    <ExternalLink size={11} color="#a1a1aa" />
                                  </a>
                                ) : (
                                  <span style={{ color: '#a1a1aa', fontSize: '0.74rem' }}>Unlinked</span>
                                )}
                              </td>

                              {/* Auth / Passkeys */}
                              <td style={{ padding: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  {acc.hasPasskeys ? (
                                    <span style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      background: '#f0fdf4',
                                      border: '1px solid #bbf7d0',
                                      color: '#16a34a',
                                      fontSize: '0.68rem',
                                      fontWeight: '700',
                                      padding: '2px 6px',
                                      borderRadius: '4px'
                                    }}>
                                      <Lock size={11} />
                                      <span>{acc.passkeyCount || 1} Passkey</span>
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '0.72rem', color: '#71717a' }}>Password / 2FA</span>
                                  )}
                                </div>
                              </td>

                              {/* Onboarding */}
                              <td style={{ padding: '12px' }}>
                                <span style={{
                                  fontSize: '0.68rem',
                                  fontWeight: '700',
                                  color: acc.isOnboarded ? '#15803d' : '#b45309',
                                  background: acc.isOnboarded ? '#f0fdf4' : '#fffbeb',
                                  border: `1px solid ${acc.isOnboarded ? '#bbf7d0' : '#fef3c7'}`,
                                  padding: '2px 6px',
                                  borderRadius: '4px'
                                }}>
                                  {acc.isOnboarded ? 'Ready' : 'Pending'}
                                </span>
                              </td>

                              {/* Registered Date */}
                              <td style={{ padding: '12px', fontSize: '0.74rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                                {acc.createdAt ? new Date(acc.createdAt).toLocaleDateString() : 'N/A'}
                              </td>

                              {/* Actions / Expand */}
                              <td style={{ padding: '12px', textAlign: 'right' }}>
                                <button
                                  type="button"
                                  onClick={() => setExpandedAccountId(isExpanded ? null : acc.id)}
                                  style={{
                                    background: '#f4f4f5',
                                    border: '1px solid #e4e4e7',
                                    borderRadius: '6px',
                                    padding: '5px 8px',
                                    fontSize: '0.72rem',
                                    fontWeight: '700',
                                    color: '#09090b',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                >
                                  <span>{isExpanded ? 'Hide' : 'Details'}</span>
                                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                              </td>
                            </tr>

                            {/* Expanded Account Inspector Drawer */}
                            {isExpanded && (
                              <tr style={{ background: '#fafafa', borderBottom: '1px solid #e4e4e7' }}>
                                <td colSpan={7} style={{ padding: '16px 20px' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', fontSize: '0.76rem' }}>
                                    <div>
                                      <div style={{ color: '#71717a', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace", marginBottom: '3px' }}>ACCOUNT ID</div>
                                      <div style={{ fontFamily: "'JetBrains Mono', monospace", color: '#09090b' }}>{acc.id}</div>
                                    </div>
                                    <div>
                                      <div style={{ color: '#71717a', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace", marginBottom: '3px' }}>INSTAGRAM USER ID</div>
                                      <div style={{ fontFamily: "'JetBrains Mono', monospace", color: '#09090b' }}>{acc.instagramId || 'None registered'}</div>
                                    </div>
                                    <div>
                                      <div style={{ color: '#71717a', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace", marginBottom: '3px' }}>CONTACT NUMBERS</div>
                                      <div style={{ color: '#09090b' }}>
                                        Mobile: {acc.mobileNumber || 'N/A'} • WA: {acc.whatsappNumber || 'N/A'}
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{ color: '#71717a', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace", marginBottom: '3px' }}>LAST LOGIN</div>
                                      <div style={{ fontFamily: "'JetBrains Mono', monospace", color: '#09090b' }}>
                                        {acc.lastLogin ? new Date(acc.lastLogin).toLocaleString() : 'Recent'}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#71717a' }}>
                          No accounts match the current filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* SUBTAB 2: PLATFORM MEMBERS SOCIAL GRAPH */
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid #e4e4e7', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '10px 12px' }}>Member Name</th>
                      <th style={{ padding: '10px 12px' }}>Category</th>
                      <th style={{ padding: '10px 12px' }}>Relationship</th>
                      <th style={{ padding: '10px 12px' }}>Instagram Handle</th>
                      <th style={{ padding: '10px 12px' }}>Lore / Facts</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Tree Connections</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.length > 0 ? (
                      filteredMembers.map((c) => (
                        <tr key={c.id} style={{ borderBottom: '1px solid #f4f4f5' }}>
                          <td style={{ padding: '12px', fontWeight: '800', color: '#09090b' }}>
                            {c.name}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span style={{
                              fontSize: '0.66rem',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontWeight: '700',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: '#f4f4f5',
                              color: '#09090b',
                              textTransform: 'uppercase'
                            }}>
                              {(c.category || 'online_friend').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '12px', color: '#52525b', textTransform: 'capitalize' }}>
                            {c.relationship || 'friend'}
                          </td>
                          <td style={{ padding: '12px', fontFamily: "'JetBrains Mono', monospace", color: '#09090b' }}>
                            {c.handle ? `@${c.handle}` : 'Unlinked'}
                          </td>
                          <td style={{ padding: '12px', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                            {c.factsCount || 0} facts
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: '800', color: '#09090b' }}>
                            {c.connectionsCount || 0}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#71717a' }}>
                          No platform members found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ─────────────────────────────────────────────────────────────
            VIEW B: PERSONAL BOT & DM ANALYTICS
           ───────────────────────────────────────────────────────────── */
        <div>
          {/* STAT CARDS WITH BUTTER-SMOOTH FRAMER MOTION STAGGER & ANIMATED COUNTERS */}
          <motion.div
            variants={statsContainerVariants}
            initial="hidden"
            animate="visible"
            className="stats-grid"
          >
            {personalStatCards.map((c, i) => (
              <motion.div
                key={i}
                variants={statCardVariants}
                whileHover={{ y: -3, transition: { duration: 0.25, ease: 'easeOut' } }}
                className="stat-card-item"
                style={{
                  background: '#fff',
                  border: '1px solid #e4e4e7',
                  borderRadius: '12px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '120px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.06em' }}>{c.label}</span>
                  <div style={{ background: '#f4f4f5', padding: '5px', borderRadius: '6px', color: '#09090b' }}>{c.icon}</div>
                </div>
                <div>
                  <div className="stat-card-value" style={{ fontSize: '2.4rem', fontWeight: '900', color: '#09090b', letterSpacing: '-1.5px', lineHeight: 1 }}>
                    <AnimatedNumber value={c.value} duration={1.8} />
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#a1a1aa', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>{c.sub}</div>
                </div>
                {c.href ? (
                  <Link href={c.href} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#09090b', textDecoration: 'none', fontWeight: '700' }}>
                    <span>View</span><ArrowRight size={10} />
                  </Link>
                ) : <div />}
              </motion.div>
            ))}
          </motion.div>

          {/* MAIN 3-COL CHARTS WITH BUTTER-SMOOTH PROGRESS BARS & ANIMATED COUNTERS */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="charts-grid"
          >
            {/* Donut: Circle Breakdown */}
            <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '22px' }}>
              <div style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>CIRCLE COMPOSITION</div>
              <div style={{ fontSize: '1rem', fontWeight: '800', color: '#09090b', marginBottom: '18px', marginTop: '2px' }}>Relationship Map</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: '16px' }}>
                <DonutChart segments={donutSegments.length > 0 ? donutSegments : [{ value: 1, color: '#f4f4f5' }]} size={130} stroke={20} />
                <div style={{ position: 'absolute', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.7rem', fontWeight: '900', color: '#09090b', lineHeight: 1 }}>
                    <AnimatedNumber value={friendNodes.length} duration={1.5} />
                  </div>
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
                    <span style={{ fontWeight: '800', color: '#09090b', fontFamily: "'JetBrains Mono', monospace" }}>
                      <AnimatedNumber value={s.value} duration={1.4} />
                    </span>
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
          </motion.div>

          {/* BOTTOM ROW: AI Status + Routing */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="bottom-grid"
          >
            {/* AI Split */}
            <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '22px' }}>
              <div style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI REPLY STATUS</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', marginTop: '2px' }}>
                <div style={{ fontSize: '1rem', fontWeight: '800', color: '#09090b' }}>Per-Contact AI Mode</div>
                <Bot size={14} style={{ color: '#a1a1aa' }} />
              </div>
              <div style={{ height: '8px', background: '#f4f4f5', borderRadius: '4px', overflow: 'hidden', marginBottom: '14px' }}>
                {friendNodes.length > 0 && (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(breakdown.aiActive / friendNodes.length) * 100}%` }}
                    transition={{ duration: 1.6, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    style={{ height: '100%', background: '#09090b', borderRadius: '4px' }}
                  />
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
                      <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#09090b', letterSpacing: '-0.5px' }}>
                        <AnimatedNumber value={s.value} duration={1.5} />
                      </div>
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
                  {routingConfig.chatMode === 'paused' && 'Silenced — Manual chat active'}
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
                  <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#09090b' }}>
                    <AnimatedNumber value={friendNodes.length} duration={1.5} /> people
                  </span>
                </div>
              </div>
              <Link href="/controls" style={{ marginTop: '14px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#09090b', textDecoration: 'none', fontWeight: '700' }}>
                <span>Adjust routing</span><ArrowRight size={10} />
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
