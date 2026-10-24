'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useApp } from './context/AppContext';
import {
  Users, Sliders, Sparkles, ArrowRight,
  MessageSquare, Film, Bot, Shield,
  Search, RefreshCw, CheckCircle2, AlertCircle,
  ExternalLink, ChevronDown, ChevronUp, Layers,
  Lock, Instagram, Smartphone, Calendar, UserCheck, Mail,
  LogIn, Building2, Briefcase, User as UserIcon, Filter,
  ChevronLeft, Trash2, Send, Clock, Target, Zap
} from 'lucide-react';
import { motion, animate, AnimatePresence } from 'framer-motion';
import BusinessConversionPanel from './components/BusinessConversionPanel';

// Butter-Smooth Framer Motion Animated Number Counter (quintic deceleration curve)
function AnimatedNumber({ value, duration = 1.6 }) {
  const numericValue = typeof value === 'number' ? value : parseInt(value, 10) || 0;
  const [displayValue, setDisplayValue] = useState(0);
  const prevValueRef = useRef(0);

  useEffect(() => {
    const start = prevValueRef.current;
    const controls = animate(start, numericValue, {
      duration,
      ease: [0.16, 1, 0.3, 1],
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
  const { nodes, routingConfig, user, token, enterWorkspace, API_BASE, showToast } = useApp();
  const isSuperadmin = user?.role === 'superadmin';

  // Toggle view for superadmins: 'platform' (default)
  const [activeTab, setActiveTab] = useState('platform');

  // Superadmin observatory state
  const [adminData, setAdminData] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'business' | 'personal' | 'admin' | 'pending'
  const [expandedAccountId, setExpandedAccountId] = useState(null);
  const [impersonatingId, setImpersonatingId] = useState(null);

  // Pagination for 25+ users
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Fetch admin accounts list
  const fetchAdminAccounts = async () => {
    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    if (!activeToken) return;
    setAdminLoading(true);
    setAdminError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/accounts`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
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

  // Impersonate / Enter Workspace
  const handleEnterWorkspace = async (targetUser) => {
    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    if (!activeToken || impersonatingId) return;
    setImpersonatingId(targetUser.id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/impersonate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ userId: targetUser.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to enter workspace.');

      enterWorkspace(data.token, data.user);
    } catch (err) {
      console.error('Workspace impersonation error:', err);
      setImpersonatingId(null);
    }
  };

  const [deletingId, setDeletingId] = useState(null);
  const [approvingId, setApprovingId] = useState(null);

  // Business workspaces: conversion KPIs, refreshed every 30s so new leads/bookings show up live
  const isBusinessWorkspace = ['business', 'agency'].includes(user?.accountType);
  const [bizStats, setBizStats] = useState(null);
  useEffect(() => {
    if (!isBusinessWorkspace) return;
    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    if (!activeToken) return;
    const load = () => fetch(`${API_BASE}/api/analytics/overview`, { headers: { Authorization: `Bearer ${activeToken}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) setBizStats(data); })
      .catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [isBusinessWorkspace, token, API_BASE]);

  const handleApproveUser = async (targetUser) => {
    const handle = targetUser.instagramUsername || targetUser.username;
    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    if (!activeToken) return;

    setApprovingId(targetUser.id);
    try {
      const res = await fetch(`${API_BASE}/api/auth/admin/approve-ig-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          userId: targetUser.id,
          instagramUsername: targetUser.instagramUsername || targetUser.username
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve user access.');
      showToast?.(data.message || `Approved @${handle}! Invite instructions emailed.`, 'success');
      await fetchAdminAccounts();
    } catch (err) {
      console.error('Approve access error:', err);
      showToast?.(err.message || 'Failed to approve user.', 'error');
    } finally {
      setApprovingId(null);
    }
  };

  const handleDeleteAccount = async (targetUser) => {
    const handle = targetUser.instagramUsername || targetUser.username;
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete @${handle} (${targetUser.email}) and all their workspace data? This cannot be undone.`
    );
    if (!confirmed) return;

    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    if (!activeToken) return;

    setDeletingId(targetUser.id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/accounts/${targetUser.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete account.');
      showToast?.(data.message || `Account @${handle} deleted successfully.`, 'success');
      await fetchAdminAccounts();
    } catch (err) {
      console.error('Delete account error:', err);
      showToast?.(err.message || 'Failed to delete account.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Filtered accounts list for 25+ users
  const filteredAccounts = useMemo(() => {
    if (!adminData?.accounts) return [];
    let list = adminData.accounts;

    // Filter pill condition
    if (filterType === 'active') {
      list = list.filter(a => a.hasInstagramToken || a.isInstagramConnected);
    } else if (filterType === 'pendingApproval') {
      list = list.filter(a => a.igApprovalStatus === 'pending');
    } else if (filterType === 'notConnected') {
      list = list.filter(a => !a.hasInstagramToken && !a.isInstagramConnected);
    } else if (filterType === 'business') {
      list = list.filter(a => a.accountType === 'business' || a.accountType === 'creator' || a.accountType === 'agency');
    } else if (filterType === 'personal') {
      list = list.filter(a => a.accountType === 'personal' || !a.accountType);
    } else if (filterType === 'admin') {
      list = list.filter(a => a.role === 'superadmin');
    } else if (filterType === 'pending') {
      list = list.filter(a => !a.isOnboarded);
    }

    // Text search
    if (adminSearch.trim()) {
      const q = adminSearch.toLowerCase();
      list = list.filter(a =>
        (a.email && a.email.toLowerCase().includes(q)) ||
        (a.username && a.username.toLowerCase().includes(q)) ||
        (a.firstName && a.firstName.toLowerCase().includes(q)) ||
        (a.lastName && a.lastName.toLowerCase().includes(q)) ||
        (a.instagramUsername && a.instagramUsername.toLowerCase().includes(q))
      );
    }

    return list;
  }, [adminData?.accounts, filterType, adminSearch]);

  // Paginated accounts
  const totalPages = Math.ceil(filteredAccounts.length / pageSize) || 1;
  const paginatedAccounts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAccounts.slice(start, start + pageSize);
  }, [filteredAccounts, currentPage, pageSize]);

  // Compute KPI metrics across all users
  const kpiMetrics = useMemo(() => {
    if (!adminData?.accounts) {
      return { total: 0, admins: 0, regular: 0, business: 0, personal: 0, activeInstagram: 0, pendingApproval: 0, notConnected: 0, passkeys: 0, pending: 0 };
    }
    const accounts = adminData.accounts;
    const total = accounts.length;
    const admins = accounts.filter(a => a.role === 'superadmin').length;
    const regular = total - admins;
    const business = accounts.filter(a => a.accountType === 'business' || a.accountType === 'creator' || a.accountType === 'agency').length;
    const personal = accounts.filter(a => a.accountType === 'personal' || !a.accountType).length;
    const activeInstagram = accounts.filter(a => a.hasInstagramToken || a.isInstagramConnected).length;
    const pendingApproval = accounts.filter(a => a.igApprovalStatus === 'pending').length;
    const notConnected = accounts.filter(a => !a.hasInstagramToken && !a.isInstagramConnected).length;
    const passkeys = accounts.filter(a => a.hasPasskeys).length;
    const pending = accounts.filter(a => !a.isOnboarded).length;
    return { total, admins, regular, business, personal, activeInstagram, pendingApproval, notConnected, passkeys, pending };
  }, [adminData]);

  // Personal Bot Analytics (Fallback for regular user or when toggle is switched)
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

  const businessStatCards = [
    { label: '💬 Total Conversations', value: bizStats?.totalConversations || 0, sub: `${bizStats?.openHandoffs || 0} waiting for your team`, icon: <MessageSquare size={15} />, href: '/relationships' },
    { label: '🎯 Leads Captured', value: bizStats?.activeLeads || 0, sub: `${bizStats?.leadsLast30d || 0} in the last 30 days`, icon: <Target size={15} />, href: null },
    { label: '📅 Bookings Confirmed', value: bizStats?.confirmedBookings || 0, sub: `${bizStats?.upcomingBookings || 0} upcoming`, icon: <Calendar size={15} />, href: null },
    { label: '⚡ Automation Rate', value: bizStats?.automationRate || 0, sub: `% of replies by AI · ${bizStats?.resolutionRate || 0}% resolved`, icon: <Zap size={15} />, href: '/controls' },
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
            {isSuperadmin && activeTab === 'platform' ? 'Platform Users & Workspaces' : 'Analytics Overview'}
          </h1>
          <p style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '4px' }}>
            {isSuperadmin && activeTab === 'platform'
              ? 'Multi-tenant management for all registered accounts, connected Instagram workspaces, and automations.'
              : 'Real-time analytics on your contacts, interaction volume, and AI routing.'}
          </p>
        </div>

        {/* Superadmin Quick Actions */}
        {isSuperadmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              background: '#f4f4f5',
              border: '1px solid #e4e4e7',
              fontSize: '0.74rem',
              fontWeight: '700',
              fontFamily: "'JetBrains Mono', monospace",
              color: '#09090b'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }} />
              <span>SUPERADMIN OBSERVATORY</span>
            </div>

            <button
              type="button"
              onClick={fetchAdminAccounts}
              disabled={adminLoading}
              title="Refresh platform accounts"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: '#09090b',
                color: '#ffffff',
                border: 'none',
                fontSize: '0.74rem',
                fontWeight: '700',
                cursor: adminLoading ? 'wait' : 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <RefreshCw size={12} className={adminLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          PRACTICAL SUPERADMIN VIEW FOR 25+ USERS
         ───────────────────────────────────────────────────────────── */}
      {isSuperadmin && activeTab === 'platform' ? (
        <div>
          {/* 4 HIGH-LEVEL TENANT METRICS */}
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
                  Total Creators & Users
                </span>
                <div style={{ background: '#f4f4f5', padding: '5px', borderRadius: '6px', color: '#09090b' }}>
                  <Users size={15} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '2.4rem', fontWeight: '900', color: '#09090b', letterSpacing: '-1.5px', lineHeight: 1 }}>
                  <AnimatedNumber value={kpiMetrics.total} duration={1.6} />
                </div>
                <div style={{ fontSize: '0.68rem', color: '#a1a1aa', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
                  {kpiMetrics.admins} Superadmin • {kpiMetrics.regular} Users
                </div>
              </div>
              <div />
            </motion.div>

            {/* 2. Active Webhook Automations */}
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
                  Active Automations
                </span>
                <div style={{ background: '#f4f4f5', padding: '5px', borderRadius: '6px', color: '#09090b' }}>
                  <Bot size={15} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '2.4rem', fontWeight: '900', color: '#09090b', letterSpacing: '-1.5px', lineHeight: 1 }}>
                  <AnimatedNumber value={kpiMetrics.activeInstagram} duration={1.6} />
                </div>
                <div style={{ fontSize: '0.68rem', color: '#a1a1aa', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
                  {kpiMetrics.notConnected} Not connected
                </div>
              </div>
              <div />
            </motion.div>

            {/* 3. Instagram Connected Workspaces */}
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
                  Instagram Workspaces
                </span>
                <div style={{ background: '#f4f4f5', padding: '5px', borderRadius: '6px', color: '#09090b' }}>
                  <Instagram size={15} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '2.4rem', fontWeight: '900', color: '#09090b', letterSpacing: '-1.5px', lineHeight: 1 }}>
                  <AnimatedNumber value={kpiMetrics.activeInstagram} duration={1.6} />
                </div>
                <div style={{ fontSize: '0.68rem', color: '#a1a1aa', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
                  {kpiMetrics.pendingApproval > 0 ? `${kpiMetrics.pendingApproval} Pending whitelist` : 'Multi-account webhooks live'}
                </div>
              </div>
              <div />
            </motion.div>

            {/* 4. Portfolio Breakdown */}
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
                  Account Structure
                </span>
                <div style={{ background: '#f4f4f5', padding: '5px', borderRadius: '6px', color: '#09090b' }}>
                  <Building2 size={15} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '2.4rem', fontWeight: '900', color: '#09090b', letterSpacing: '-1.5px', lineHeight: 1 }}>
                  <AnimatedNumber value={kpiMetrics.business} duration={1.6} />
                </div>
                <div style={{ fontSize: '0.68rem', color: '#a1a1aa', marginTop: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
                  Business accounts • {kpiMetrics.personal} Personal
                </div>
              </div>
              <div />
            </motion.div>
          </motion.div>

          {/* MAIN USERS DIRECTORY CONTAINER */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #e4e4e7',
            borderRadius: '12px',
            padding: '22px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            {/* Meta Sandbox Pending Whitelist Alert Banner */}
            {kpiMetrics.pendingApproval > 0 && (
              <div style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                fontSize: '0.78rem',
                color: '#92400e'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={16} color="#d97706" style={{ flexShrink: 0 }} />
                  <span>
                    <strong>{kpiMetrics.pendingApproval} Creator(s) waiting for Meta Sandbox Whitelist:</strong> Add their Instagram username in <em>Meta App Roles &rarr; Roles (Instagram Testers)</em>, then click <strong>Approve &amp; Email</strong> to dispatch invite instructions.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFilterType('pendingApproval');
                    setCurrentPage(1);
                  }}
                  style={{
                    background: '#fef3c7',
                    border: '1px solid #fcd34d',
                    borderRadius: '6px',
                    padding: '4px 9px',
                    fontSize: '0.72rem',
                    fontWeight: '700',
                    color: '#b45309',
                    cursor: 'pointer'
                  }}
                >
                  View Pending ({kpiMetrics.pendingApproval})
                </button>
              </div>
            )}

            {/* TOOLBAR: FILTERS + SEARCH + REFRESH */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
              {/* Quick Filter Pills */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: `All (${kpiMetrics.total})` },
                  { id: 'active', label: `Active (${kpiMetrics.activeInstagram})` },
                  { id: 'pendingApproval', label: `Pending Approval (${kpiMetrics.pendingApproval})` },
                  { id: 'notConnected', label: `Not Connected (${kpiMetrics.notConnected})` },
                  { id: 'business', label: `Business (${kpiMetrics.business})` },
                  { id: 'personal', label: `Personal (${kpiMetrics.personal})` },
                  { id: 'admin', label: `Admins (${kpiMetrics.admins})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFilterType(f.id);
                      setCurrentPage(1);
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.76rem',
                      fontWeight: '700',
                      border: '1px solid',
                      borderColor: filterType === f.id ? '#09090b' : '#e4e4e7',
                      background: filterType === f.id ? '#09090b' : '#ffffff',
                      color: filterType === f.id ? '#ffffff' : '#52525b',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Search + Refresh */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '340px' }}>
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
                    onChange={(e) => {
                      setAdminSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search name, email, or @handle..."
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
                  title="Refresh user directory"
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

            {/* PRACTICAL ENTERPRISE USER DIRECTORY TABLE */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{
                    borderBottom: '1.5px solid #e4e4e7',
                    color: '#71717a',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.68rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    <th style={{ padding: '10px 12px' }}>User / Creator</th>
                    <th style={{ padding: '10px 12px' }}>Workspace / Business</th>
                    <th style={{ padding: '10px 12px' }}>Instagram Handle</th>
                    <th style={{ padding: '10px 12px' }}>Role</th>
                    <th style={{ padding: '10px 12px' }}>Automation</th>
                    <th style={{ padding: '10px 12px' }}>Security</th>
                    <th style={{ padding: '10px 12px' }}>Registered</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAccounts.length > 0 ? (
                    paginatedAccounts.map((acc) => {
                      const isExpanded = expandedAccountId === acc.id;
                      const isSuper = acc.role === 'superadmin';
                      const isSelf = user?.id === acc.id || user?.email === acc.email;
                      const isBusiness = acc.accountType === 'business' || acc.accountType === 'creator' || acc.accountType === 'agency';

                      return (
                        <React.Fragment key={acc.id}>
                          <tr
                            style={{
                              borderBottom: '1px solid #f4f4f5',
                              background: isExpanded ? '#fafafa' : '#ffffff',
                              transition: 'background 0.15s ease'
                            }}
                          >
                            {/* User Identity */}
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
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: '800', color: '#09090b', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {acc.firstName ? `${acc.firstName} ${acc.lastName || ''}`.trim() : acc.username}
                                    </span>
                                    {isSelf && (
                                      <span style={{
                                        fontSize: '0.58rem',
                                        background: '#f4f4f5',
                                        border: '1px solid #e4e4e7',
                                        color: '#71717a',
                                        borderRadius: '3px',
                                        padding: '1px 4px',
                                        fontFamily: "'JetBrains Mono', monospace"
                                      }}>
                                        YOU
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {acc.email} • @{acc.username}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Workspace / Business */}
                            <td style={{ padding: '12px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontWeight: '700', color: '#09090b' }}>
                                  {acc.businessProfile?.businessName || (isBusiness ? 'Creator Studio' : 'Personal')}
                                </span>
                                <span style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'capitalize' }}>
                                  {acc.businessProfile?.category || acc.accountType || 'Personal'}
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

                            {/* Role */}
                            <td style={{ padding: '12px' }}>
                              <span style={{
                                fontSize: '0.62rem',
                                fontWeight: '800',
                                fontFamily: "'JetBrains Mono', monospace",
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: isSuper ? '#09090b' : '#f4f4f5',
                                color: isSuper ? '#ffffff' : '#09090b'
                              }}>
                                {isSuper ? 'SUPERADMIN' : 'USER'}
                              </span>
                            </td>

                            {/* Automation Status */}
                            <td style={{ padding: '12px' }}>
                              {(() => {
                                const isConnected = Boolean(acc.hasInstagramToken || acc.isInstagramConnected);
                                const isPending = acc.igApprovalStatus === 'pending';
                                const isApproved = acc.igApprovalStatus === 'approved';

                                let dotColor = '#a1a1aa';
                                let textColor = '#71717a';
                                let label = 'Not Connected';

                                if (isConnected) {
                                  dotColor = '#16a34a';
                                  textColor = '#15803d';
                                  label = 'Active';
                                } else if (isPending) {
                                  dotColor = '#f59e0b';
                                  textColor = '#b45309';
                                  label = 'Pending Approval';
                                } else if (isApproved) {
                                  dotColor = '#0284c7';
                                  textColor = '#0369a1';
                                  label = 'Approved';
                                }

                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                                    <div style={{
                                      width: '7px',
                                      height: '7px',
                                      borderRadius: '50%',
                                      background: dotColor,
                                      flexShrink: 0
                                    }} />
                                    <span style={{
                                      fontSize: '0.72rem',
                                      fontWeight: '700',
                                      color: textColor
                                    }}>
                                      {label}
                                    </span>
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Security */}
                            <td style={{ padding: '12px' }}>
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
                                  <Lock size={10} />
                                  <span>{acc.passkeyCount || 1} Passkey</span>
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.72rem', color: '#71717a' }}>Password</span>
                              )}
                            </td>

                            {/* Registered */}
                            <td style={{ padding: '12px', fontSize: '0.74rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                              {acc.createdAt ? new Date(acc.createdAt).toLocaleDateString() : 'Recent'}
                            </td>

                            {/* Actions: Impersonate / Approve / Details */}
                            <td style={{ padding: '12px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                {!isSelf && !acc.hasInstagramToken && !acc.isInstagramConnected && (
                                  <button
                                    type="button"
                                    onClick={() => handleApproveUser(acc)}
                                    disabled={approvingId === acc.id}
                                    title={acc.igApprovalStatus === 'pending'
                                      ? `Whitelisted in Meta Roles? Click to mark approved & dispatch invite email to ${acc.email}`
                                      : `Send Meta tester invite email to ${acc.email}`}
                                    style={{
                                      background: acc.igApprovalStatus === 'pending' ? '#09090b' : '#ffffff',
                                      border: acc.igApprovalStatus === 'pending' ? '1px solid #09090b' : '1px solid #e4e4e7',
                                      borderRadius: '6px',
                                      padding: '5px 8px',
                                      fontSize: '0.7rem',
                                      fontWeight: '700',
                                      color: acc.igApprovalStatus === 'pending' ? '#ffffff' : '#09090b',
                                      cursor: approvingId === acc.id ? 'wait' : 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    <Send size={11} />
                                    <span>
                                      {approvingId === acc.id
                                        ? 'Sending...'
                                        : (acc.igApprovalStatus === 'pending' ? 'Approve & Email' : 'Invite')}
                                    </span>
                                  </button>
                                )}

                                {!isSelf && (
                                  <button
                                    type="button"
                                    onClick={() => handleEnterWorkspace(acc)}
                                    disabled={impersonatingId === acc.id}
                                    title={`Switch to ${acc.username}'s workspace`}
                                    style={{
                                      background: '#09090b',
                                      border: '1px solid #09090b',
                                      borderRadius: '6px',
                                      padding: '5px 9px',
                                      fontSize: '0.72rem',
                                      fontWeight: '700',
                                      color: '#ffffff',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    <LogIn size={11} />
                                    <span>{impersonatingId === acc.id ? 'Entering...' : 'Enter'}</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setExpandedAccountId(isExpanded ? null : acc.id)}
                                  style={{
                                    background: '#ffffff',
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
                                  <span>{isExpanded ? 'Hide' : 'Info'}</span>
                                  {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                </button>

                                {!isSelf && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAccount(acc)}
                                    disabled={deletingId === acc.id}
                                    title={`Permanently delete @${acc.username}`}
                                    style={{
                                      background: '#ffffff',
                                      border: '1px solid #fecaca',
                                      borderRadius: '6px',
                                      padding: '5px 8px',
                                      fontSize: '0.72rem',
                                      fontWeight: '700',
                                      color: '#dc2626',
                                      cursor: deletingId === acc.id ? 'wait' : 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px'
                                    }}
                                  >
                                    <Trash2 size={11} />
                                    <span>{deletingId === acc.id ? '...' : 'Delete'}</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Drawer */}
                          {isExpanded && (
                            <tr style={{ background: '#fafafa', borderBottom: '1px solid #e4e4e7' }}>
                              <td colSpan={8} style={{ padding: '16px 20px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', fontSize: '0.76rem' }}>
                                  <div>
                                    <div style={{ color: '#71717a', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace", marginBottom: '3px' }}>USER ID</div>
                                    <div style={{ fontFamily: "'JetBrains Mono', monospace", color: '#09090b' }}>{acc.id}</div>
                                  </div>
                                  <div>
                                    <div style={{ color: '#71717a', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace", marginBottom: '3px' }}>INSTAGRAM ID</div>
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
                      <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#71717a' }}>
                        No accounts found matching your filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINATION CONTROLS FOR 25+ USERS */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginTop: '18px',
              paddingTop: '16px',
              borderTop: '1px solid #f4f4f5',
              fontSize: '0.78rem',
              color: '#71717a'
            }}>
              <div>
                Showing {filteredAccounts.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, filteredAccounts.length)} of {filteredAccounts.length} creators
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '5px 8px',
                    borderRadius: '6px',
                    border: '1px solid #e4e4e7',
                    background: '#ffffff',
                    fontSize: '0.74rem',
                    color: '#09090b'
                  }}
                >
                  <option value={10}>10 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                </select>

                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage <= 1}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    border: '1px solid #e4e4e7',
                    background: '#ffffff',
                    fontSize: '0.74rem',
                    fontWeight: '700',
                    color: currentPage <= 1 ? '#d4d4d8' : '#09090b',
                    cursor: currentPage <= 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Prev
                </button>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: '700',
                  color: '#09090b',
                  whiteSpace: 'nowrap',
                  minWidth: '54px',
                  textAlign: 'center',
                  display: 'inline-block',
                  userSelect: 'none'
                }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  disabled={currentPage >= totalPages}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    border: '1px solid #e4e4e7',
                    background: '#ffffff',
                    fontSize: '0.74rem',
                    fontWeight: '700',
                    color: currentPage >= totalPages ? '#d4d4d8' : '#09090b',
                    cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer'
                  }}
                >
                  Next
                </button>
              </div>
            </div>
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
            {(isBusinessWorkspace ? businessStatCards : personalStatCards).map((c, i) => (
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

          {isBusinessWorkspace && <BusinessConversionPanel refreshKey={bizStats} />}

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
