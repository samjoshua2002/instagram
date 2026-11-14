'use client';

import React, { useMemo, useState, useEffect } from 'react';
import PageSkeleton from '../components/Skeletons';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../context/DialogContext';
import {
  Search, RefreshCw, AlertCircle, ExternalLink, ChevronDown, Layers,
  Lock, LogIn, Trash2, Send
} from 'lucide-react';
import { motion } from 'framer-motion';
import { DUR, EASE_OUT, T } from '../lib/motion';
import WorkspaceModeSwitch from '../components/WorkspaceModeSwitch';
import PageHero from '../components/PageHero';
import { currentMode } from '../lib/workspaceFeatures';
import { useActivity, RangeTabs } from './kit';
import PersonalView from './PersonalView';
import BusinessView from './BusinessView';
import PlatformView from './PlatformView';
import './analytics.css';

export default function AnalyticsPage() {
  const { nodes, routingConfig, user, token, enterWorkspace, API_BASE, showToast, workspaceFeatures, isSyncingInitial } = useApp();
  const confirm = useConfirm();
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
      showToast?.(err.message || 'Failed to enter workspace.', 'error');
      setImpersonatingId(null);
    }
  };

  const [deletingId, setDeletingId] = useState(null);
  const [approvingId, setApprovingId] = useState(null);

  // Layout follows the Personal / Business switch; superadmins get the platform layout
  const mode = currentMode(workspaceFeatures, user);
  const layout = isSuperadmin ? 'platform' : mode === 'business' ? 'business' : 'personal';
  const [range, setRange] = useState('30d');
  const activity = useActivity(range, isSuperadmin ? 'platform' : undefined);

  // Overview KPIs (handoffs, leads, bookings, automation), refreshed every 30s so they show up live
  const [bizStats, setBizStats] = useState(null);
  const [bizLoaded, setBizLoaded] = useState(false);
  useEffect(() => {
    if (isSuperadmin) return undefined;
    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    if (!activeToken) return undefined;
    const headers = { Authorization: `Bearer ${activeToken}` };
    const load = () => {
      fetch(`${API_BASE}/api/analytics/overview`, { headers })
        .then(r => (r.ok ? r.json() : null))
        .then(data => { if (data) setBizStats(data); })
        .catch(() => {})
        .finally(() => setBizLoaded(true));
    };
    load();
    // Skipped while the tab is hidden or offline, like the other pollers
    const timer = setInterval(() => {
      if (document.hidden || navigator.onLine === false) return;
      load();
    }, 30000);
    return () => clearInterval(timer);
  }, [isSuperadmin, token, API_BASE]);

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
          // Never the app username: the server would save it as their Instagram handle
          instagramUsername: targetUser.instagramUsername || ''
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
    const confirmed = await confirm({
      title: `Delete @${handle}?`,
      message: `This permanently deletes ${targetUser.email} and all their workspace data. This cannot be undone.`,
      confirmLabel: 'Delete account',
      tone: 'danger',
    });
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
  // The list can shrink (filter, search, refresh): never stay on a page that no longer exists
  useEffect(() => {
    setCurrentPage(p => Math.max(1, Math.min(p, totalPages)));
  }, [totalPages]);
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

  const friendNodes = useMemo(() => nodes.filter(n => !n.isRoot), [nodes]);

  // First load: show the dashboard skeleton until the numbers arrive (no empty zeros flash)
  const firstLoad = isSuperadmin
    ? !adminData && !adminError
    : layout === 'business'
      ? !bizLoaded
      : isSyncingInitial && !(nodes || []).some(n => !n.isRoot);
  if (firstLoad) return <PageSkeleton variant="dashboard" label="Loading analytics" />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.page, ease: EASE_OUT }}
      className="page-container dashboard-container spx-page has-hero"
    >
      <PageHero
        seed="page-analytics"
        icon={<Layers size={96} strokeWidth={2} />}
        eyebrow={isSuperadmin ? 'Superadmin observatory' : 'Command center'}
        title={isSuperadmin && activeTab === 'platform' ? 'Platform Users & Workspaces' : 'Analytics Overview'}
        desc={isSuperadmin && activeTab === 'platform'
          ? 'Multi-tenant management for all registered accounts, connected Instagram workspaces, and automations.'
          : 'Real-time analytics on your contacts, interaction volume, and AI routing.'}
      >
        {/* Superadmin Quick Actions */}
        {isSuperadmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'var(--color-surface-hover)',
              border: '1px solid var(--color-border)',
              fontSize: '0.74rem',
              fontWeight: '700',
              fontFamily: "var(--font-label)",
              color: 'var(--color-text-primary)'
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
                background: 'var(--color-text-primary)',
                color: 'var(--color-surface)',
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
      </PageHero>

      {/* Mode switch (left) and time range (right) */}
      <div className="an an-toolbar" style={{ marginBottom: '16px' }}>
        {!isSuperadmin && <WorkspaceModeSwitch />}
        <div className="an-toolbar-end"><RangeTabs value={range} onChange={setRange} /></div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          PRACTICAL SUPERADMIN VIEW FOR 25+ USERS
         ───────────────────────────────────────────────────────────── */}
      {isSuperadmin && activeTab === 'platform' ? (
        <div>
          <div className="an" style={{ marginBottom: '16px' }}>
            <PlatformView accounts={adminData?.accounts || []} kpi={kpiMetrics} range={range} activity={activity} onFilter={id => { setFilterType(id); setCurrentPage(1); }} />
          </div>

          {/* MAIN USERS DIRECTORY CONTAINER */}
          <div id="platform-directory" style={{ scrollMarginTop: '80px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            padding: '22px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            {/* Meta Sandbox Pending Whitelist Alert Banner */}
            {kpiMetrics.pendingApproval > 0 && (
              <div style={{
                background: 'color-mix(in srgb, #f59e0b 12%, transparent)',
                border: '1px solid color-mix(in srgb, #f59e0b 35%, transparent)',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                fontSize: '0.78rem',
                color: 'var(--color-warning)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={16} color="var(--color-warning)" style={{ flexShrink: 0 }} />
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
                    background: 'color-mix(in srgb, #f59e0b 14%, transparent)',
                    border: '1px solid #fcd34d',
                    borderRadius: '6px',
                    padding: '4px 9px',
                    fontSize: '0.72rem',
                    fontWeight: '700',
                    color: 'var(--color-warning)',
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
                      borderColor: filterType === f.id ? 'var(--color-text-primary)' : 'var(--color-border)',
                      background: filterType === f.id ? 'var(--color-text-primary)' : 'var(--color-surface)',
                      color: filterType === f.id ? 'var(--color-surface)' : 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Search + Refresh */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 240px', minWidth: '220px', maxWidth: '340px' }}>
                <div style={{
                  position: 'relative',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <Search size={14} style={{ position: 'absolute', left: '11px', color: 'var(--color-text-muted)' }} />
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
                      border: '1px solid var(--color-border)',
                      fontSize: '0.8rem',
                      outline: 'none',
                      background: 'var(--color-surface)'
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
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    cursor: 'pointer',
                    color: 'var(--color-text-primary)'
                  }}
                >
                  <RefreshCw size={14} className={adminLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {adminError && (
              <div style={{
                background: 'color-mix(in srgb, #ef4444 12%, transparent)',
                border: '1px solid color-mix(in srgb, #ef4444 35%, transparent)',
                color: 'var(--color-danger)',
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
              <table className="card-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{
                    borderBottom: '1.5px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                    fontFamily: "var(--font-label)",
                    fontSize: '0.68rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    <th style={{ padding: '10px 8px' }}>User / Creator</th>
                    <th style={{ padding: '10px 8px' }}>Workspace / Business</th>
                    <th style={{ padding: '10px 8px' }}>Instagram Handle</th>
                    <th style={{ padding: '10px 8px' }}>Automation</th>
                    <th style={{ padding: '10px 8px' }}>Security</th>
                    <th style={{ padding: '10px 8px' }}>Registered</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Actions</th>
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
                              borderBottom: '1px solid var(--color-surface-hover)',
                              background: isExpanded ? 'var(--color-surface-elevated)' : 'var(--color-surface)',
                              transition: 'background 0.15s ease'
                            }}
                          >
                            {/* User Identity */}
                            <td className="ct-title" style={{ padding: '12px 8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                  width: '36px',
                                  height: '36px',
                                  borderRadius: '8px',
                                  background: 'var(--color-text-primary)',
                                  color: 'var(--color-surface)',
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
                                  <div style={{ fontWeight: '800', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '3px 5px' }}>
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {acc.firstName ? `${acc.firstName} ${acc.lastName || ''}`.trim() : acc.username}
                                    </span>
                                    {isSelf && (
                                      <span style={{
                                        fontSize: '0.58rem',
                                        background: 'var(--color-surface-hover)',
                                        border: '1px solid var(--color-border)',
                                        color: 'var(--color-text-secondary)',
                                        borderRadius: '3px',
                                        padding: '1px 4px',
                                        fontFamily: "var(--font-label)"
                                      }}>
                                        YOU
                                      </span>
                                    )}
                                    {/* Role: only superadmins get a badge (was its own column) */}
                                    {isSuper && (
                                      <span style={{
                                        fontSize: '0.58rem',
                                        fontWeight: '800',
                                        fontFamily: "var(--font-label)",
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        background: 'var(--color-text-primary)',
                                        color: 'var(--color-surface)',
                                        flexShrink: 0
                                      }}>
                                        SUPERADMIN
                                      </span>
                                    )}
                                  </div>
                                  <div title={`${acc.email} • @${acc.username}`} style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', fontFamily: "var(--font-label)", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }}>
                                    {acc.email} • @{acc.username}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Workspace / Business */}
                            <td data-label="Workspace" style={{ padding: '12px 8px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>
                                  {acc.businessProfile?.businessName || (isBusiness ? 'Creator Studio' : 'Personal')}
                                </span>
                                <span style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>
                                  {acc.businessProfile?.category || acc.accountType || 'Personal'}
                                </span>
                              </div>
                            </td>

                            {/* Instagram Handle */}
                            <td data-label="Instagram" style={{ padding: '12px 8px' }}>
                              {acc.instagramUsername ? (
                                <a
                                  href={`https://instagram.com/${acc.instagramUsername}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: 'var(--color-text-primary)',
                                    textDecoration: 'none',
                                    fontWeight: '700',
                                    fontFamily: "var(--font-label)"
                                  }}
                                >
                                  <span>@{acc.instagramUsername}</span>
                                  <ExternalLink size={11} color="var(--color-text-muted)" />
                                </a>
                              ) : (
                                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.74rem' }}>Unlinked</span>
                              )}
                            </td>

                            {/* Automation Status */}
                            <td data-label="Automation" style={{ padding: '12px 8px' }}>
                              {(() => {
                                const isConnected = Boolean(acc.hasInstagramToken || acc.isInstagramConnected);
                                const isPending = acc.igApprovalStatus === 'pending';
                                const isApproved = acc.igApprovalStatus === 'approved';

                                let dotColor = 'var(--color-text-muted)';
                                let textColor = 'var(--color-text-secondary)';
                                let label = 'Not Connected';

                                if (isConnected) {
                                  dotColor = '#16a34a';
                                  textColor = 'var(--color-success)';
                                  label = 'Active';
                                } else if (isPending) {
                                  dotColor = '#f59e0b';
                                  textColor = 'var(--color-warning)';
                                  label = 'Pending Approval';
                                } else if (isApproved) {
                                  dotColor = 'var(--ambient-dominant)';
                                  textColor = 'var(--ambient-dominant)';
                                  label = 'Approved';
                                }

                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                            <td data-label="Security" style={{ padding: '12px 8px' }}>
                              {acc.hasPasskeys ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: 'color-mix(in srgb, #22c55e 12%, transparent)',
                                  border: '1px solid color-mix(in srgb, #22c55e 35%, transparent)',
                                  color: 'var(--color-success)',
                                  fontSize: '0.68rem',
                                  fontWeight: '700',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  whiteSpace: 'nowrap'
                                }}>
                                  <Lock size={10} />
                                  <span>{acc.passkeyCount || 1} Passkey</span>
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>Password</span>
                              )}
                            </td>

                            {/* Registered */}
                            <td data-label="Registered" style={{ padding: '12px 8px', fontSize: '0.74rem', color: 'var(--color-text-secondary)', fontFamily: "var(--font-label)" }}>
                              {acc.createdAt ? new Date(acc.createdAt).toLocaleDateString() : 'Recent'}
                            </td>

                            {/* Actions: Impersonate / Approve / Details */}
                            <td className="ct-actions" style={{ padding: '12px 8px', textAlign: 'right' }}>
                              <div className="an-acc-actions" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '6px' }}>
                                {!isSelf && !acc.hasInstagramToken && !acc.isInstagramConnected && (
                                  <button
                                    type="button"
                                    onClick={() => handleApproveUser(acc)}
                                    disabled={approvingId === acc.id}
                                    title={acc.igApprovalStatus === 'pending'
                                      ? `Whitelisted in Meta Roles? Click to mark approved & dispatch invite email to ${acc.email}`
                                      : `Send Meta tester invite email to ${acc.email}`}
                                    style={{
                                      background: acc.igApprovalStatus === 'pending' ? 'var(--color-text-primary)' : 'var(--color-surface)',
                                      border: acc.igApprovalStatus === 'pending' ? '1px solid var(--color-text-primary)' : '1px solid var(--color-border)',
                                      borderRadius: '6px',
                                      padding: '5px 8px',
                                      fontSize: '0.7rem',
                                      fontWeight: '700',
                                      color: acc.igApprovalStatus === 'pending' ? 'var(--color-surface)' : 'var(--color-text-primary)',
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

                                {!isSelf && !isSuper && (
                                  <button
                                    type="button"
                                    onClick={() => handleEnterWorkspace(acc)}
                                    disabled={impersonatingId === acc.id}
                                    title={`Switch to ${acc.username}'s workspace`}
                                    style={{
                                      background: 'var(--color-text-primary)',
                                      border: '1px solid var(--color-text-primary)',
                                      borderRadius: '6px',
                                      padding: '5px 9px',
                                      fontSize: '0.72rem',
                                      fontWeight: '700',
                                      color: 'var(--color-surface)',
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
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '6px',
                                    padding: '5px 8px',
                                    fontSize: '0.72rem',
                                    fontWeight: '700',
                                    color: 'var(--color-text-primary)',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                >
                                  <span>{isExpanded ? 'Hide' : 'Info'}</span>
                                  <motion.span style={{ display: 'inline-flex' }} initial={false} animate={{ rotate: isExpanded ? 180 : 0 }} transition={T.move}><ChevronDown size={11} /></motion.span>
                                </button>

                                {!isSelf && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAccount(acc)}
                                    disabled={deletingId === acc.id}
                                    title={`Permanently delete @${acc.username}`}
                                    aria-label={`Delete @${acc.username}`}
                                    style={{
                                      background: 'var(--color-surface)',
                                      border: '1px solid color-mix(in srgb, #ef4444 35%, transparent)',
                                      borderRadius: '6px',
                                      padding: '5px 8px',
                                      fontSize: '0.72rem',
                                      fontWeight: '700',
                                      color: 'var(--color-danger)',
                                      cursor: deletingId === acc.id ? 'wait' : 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px'
                                    }}
                                  >
                                    {deletingId === acc.id ? <span>...</span> : <Trash2 size={13} />}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Drawer */}
                          {isExpanded && (
                            <tr className="ct-detail-row" style={{ background: 'var(--color-surface-elevated)', borderBottom: '1px solid var(--color-border)' }}>
                              <td className="ct-full" colSpan={7} style={{ padding: '16px 20px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', fontSize: '0.76rem' }}>
                                  <div>
                                    <div style={{ color: 'var(--color-text-secondary)', fontWeight: '700', fontFamily: "var(--font-label)", marginBottom: '3px' }}>USER ID</div>
                                    <div style={{ fontFamily: "var(--font-label)", color: 'var(--color-text-primary)' }}>{acc.id}</div>
                                  </div>
                                  <div>
                                    <div style={{ color: 'var(--color-text-secondary)', fontWeight: '700', fontFamily: "var(--font-label)", marginBottom: '3px' }}>INSTAGRAM ID</div>
                                    <div style={{ fontFamily: "var(--font-label)", color: 'var(--color-text-primary)' }}>{acc.instagramId || 'None registered'}</div>
                                  </div>
                                  <div>
                                    <div style={{ color: 'var(--color-text-secondary)', fontWeight: '700', fontFamily: "var(--font-label)", marginBottom: '3px' }}>CONTACT NUMBERS</div>
                                    <div style={{ color: 'var(--color-text-primary)' }}>
                                      Mobile: {acc.mobileNumber || 'N/A'} • WA: {acc.whatsappNumber || 'N/A'}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ color: 'var(--color-text-secondary)', fontWeight: '700', fontFamily: "var(--font-label)", marginBottom: '3px' }}>LAST LOGIN</div>
                                    <div style={{ fontFamily: "var(--font-label)", color: 'var(--color-text-primary)' }}>
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
                      <td className="ct-full" colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-secondary)' }}>
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
              borderTop: '1px solid var(--color-surface-hover)',
              fontSize: '0.78rem',
              color: 'var(--color-text-secondary)'
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
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    fontSize: '0.74rem',
                    color: 'var(--color-text-primary)'
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
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    fontSize: '0.74rem',
                    fontWeight: '700',
                    color: currentPage <= 1 ? 'var(--color-border-strong)' : 'var(--color-text-primary)',
                    cursor: currentPage <= 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Prev
                </button>
                <span style={{
                  fontFamily: "var(--font-label)",
                  fontWeight: '700',
                  color: 'var(--color-text-primary)',
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
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    fontSize: '0.74rem',
                    fontWeight: '700',
                    color: currentPage >= totalPages ? 'var(--color-border-strong)' : 'var(--color-text-primary)',
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
            VIEW B: PERSONAL / BUSINESS ANALYTICS
           ───────────────────────────────────────────────────────────── */
        <div className="an">
          {layout === 'business' ? (
            <BusinessView biz={bizStats} routingConfig={routingConfig} range={range} activity={activity} />
          ) : (
            <PersonalView friendNodes={friendNodes} routingConfig={routingConfig} bizStats={bizStats} range={range} activity={activity} />
          )}
        </div>
      )}
    </motion.div>
  );
}
