'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Shield, Users, UserCheck, RefreshCw, Search,
  CheckCircle2, AlertCircle, Fingerprint, Mail,
  ExternalLink, Calendar, ChevronDown, ChevronUp,
  Layers, Lock, Sparkles, Filter, Instagram, Smartphone, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SuperadminPage() {
  const { user, API_BASE, token, enterWorkspace, showToast } = useApp();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('accounts'); // 'accounts' | 'members'
  const [expandedAccountId, setExpandedAccountId] = useState(null);
  const [enteringId, setEnteringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const isSuperadmin = user?.role === 'superadmin';

  const fetchAdminData = async () => {
    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    if (!activeToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/accounts`, {
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to fetch admin accounts.');
      }
      setData(resData);
    } catch (err) {
      console.error('Superadmin fetch error:', err);
      setError(err.message || 'Error loading superadmin directory.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnterWorkspace = async (targetUser) => {
    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    if (!activeToken || enteringId) return;
    setEnteringId(targetUser.id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/impersonate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ userId: targetUser.id })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to enter workspace.');

      enterWorkspace(resData.token, resData.user);
    } catch (err) {
      console.error('Enter workspace error:', err);
      showToast?.(err.message || 'Failed to enter workspace.', 'error');
    } finally {
      setEnteringId(null);
    }
  };

  const handleDeleteAccount = async (targetUser) => {
    const handle = targetUser.instagramUsername || targetUser.username;
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete account @${handle} (${targetUser.email}) and all their workspace data? This cannot be undone.`
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
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to delete account.');
      showToast?.(resData.message || `Account @${handle} deleted.`, 'success');
      await fetchAdminData();
    } catch (err) {
      console.error('Delete account error:', err);
      showToast?.(err.message || 'Failed to delete account.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (isSuperadmin) {
      fetchAdminData();
    }
  }, [isSuperadmin, token]);

  const filteredAccounts = useMemo(() => {
    if (!data?.accounts) return [];
    if (!search.trim()) return data.accounts;
    const q = search.toLowerCase();
    return data.accounts.filter(a =>
      (a.email && a.email.toLowerCase().includes(q)) ||
      (a.username && a.username.toLowerCase().includes(q)) ||
      (a.firstName && a.firstName.toLowerCase().includes(q)) ||
      (a.lastName && a.lastName.toLowerCase().includes(q)) ||
      (a.instagramUsername && a.instagramUsername.toLowerCase().includes(q)) ||
      (a.instagramId && a.instagramId.toLowerCase().includes(q))
    );
  }, [data?.accounts, search]);

  const filteredMembers = useMemo(() => {
    if (!data?.contacts) return [];
    if (!search.trim()) return data.contacts;
    const q = search.toLowerCase();
    return data.contacts.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.handle && c.handle.toLowerCase().includes(q)) ||
      (c.category && c.category.toLowerCase().includes(q)) ||
      (c.relationship && c.relationship.toLowerCase().includes(q))
    );
  }, [data?.contacts, search]);

  if (!isSuperadmin) {
    return (
      <div className="page-container" style={{ maxWidth: '800px', margin: '40px auto', textAlign: 'center' }}>
        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '48px 24px',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <Lock size={28} />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text)', marginBottom: '8px' }}>
            Superadmin Access Required
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '440px', margin: '0 auto 20px', lineHeight: 1.5 }}>
            This command dashboard is strictly restricted to platform administrators with the superadmin role.
          </p>
          <a
            href="/"
            style={{
              display: 'inline-block',
              background: 'var(--primary)',
              color: 'var(--primary-fg)',
              padding: '9px 18px',
              borderRadius: '6px',
              fontSize: '0.84rem',
              fontWeight: '700',
              textDecoration: 'none'
            }}
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="page-container"
      style={{ maxWidth: '1400px' }}
    >
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
              PLATFORM GOVERNANCE
            </span>
            <span style={{
              fontSize: '0.62rem',
              fontWeight: '800',
              fontFamily: "'JetBrains Mono', monospace",
              background: 'var(--primary)',
              color: 'var(--primary-fg)',
              padding: '2px 6px',
              borderRadius: '4px'
            }}>
              SUPERADMIN
            </span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: '800', letterSpacing: '-0.6px', marginTop: '4px', color: 'var(--text)' }}>
            Connected Accounts & Directory
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
            Real-time multi-account observatory: monitor registered user accounts, Instagram handle identities, and active circle member topologies.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchAdminData}
          disabled={loading}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '0.78rem',
            fontWeight: '600',
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
          }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Live State</span>
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div style={{
          background: 'var(--danger-bg)',
          border: '1px solid var(--danger-border)',
          borderRadius: '8px',
          padding: '12px 16px',
          color: 'var(--danger)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.84rem'
        }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Metric Summary Cards */}
      <div className="responsive-grid-4" style={{ marginBottom: '24px' }}>
        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
            REGISTERED ACCOUNTS
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--text)', marginTop: '6px' }}>
            {data?.totalAccounts ?? (loading ? '...' : 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Active platform users
          </div>
        </div>

        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
            TOTAL CIRCLE MEMBERS
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--text)', marginTop: '6px' }}>
            {data?.totalContacts ?? (loading ? '...' : 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            SocialGraph mapped contacts
          </div>
        </div>

        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
            CLOSE FRIENDS
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--success)', marginTop: '6px' }}>
            {data?.contactsBreakdown?.closeFriends ?? (loading ? '...' : 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            High-affinity inner circle
          </div>
        </div>

        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
            ONLINE & DM NETWORK
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--info)', marginTop: '6px' }}>
            {data?.contactsBreakdown?.onlineFriends ?? (loading ? '...' : 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Instagram chat relationships
          </div>
        </div>
      </div>

      {/* Main Section */}
      <div style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        {/* Navigation Tabs + Search Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('accounts')}
              style={{
                background: activeTab === 'accounts' ? 'var(--primary)' : 'var(--bg-hover)',
                color: activeTab === 'accounts' ? 'var(--primary-fg)' : '#52525b',
                border: 'none',
                padding: '7px 16px',
                borderRadius: 'var(--r-md)',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Users size={14} />
              <span>Accounts ({data?.accounts?.length || 0})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('members')}
              style={{
                background: activeTab === 'members' ? 'var(--primary)' : 'var(--bg-hover)',
                color: activeTab === 'members' ? 'var(--primary-fg)' : '#52525b',
                border: 'none',
                padding: '7px 16px',
                borderRadius: 'var(--r-md)',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Layers size={14} />
              <span>Members & Circle ({data?.contacts?.length || 0})</span>
            </button>
          </div>

          <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder={activeTab === 'accounts' ? "Search accounts or handles..." : "Search members..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '34px',
                height: '36px',
                fontSize: '0.8rem'
              }}
            />
          </div>
        </div>

        {/* TAB 1: ACCOUNTS LIST */}
        {activeTab === 'accounts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredAccounts.map(account => {
              const isSuper = account.role === 'superadmin';
              const isExpanded = expandedAccountId === account.id;

              return (
                <div
                  key={account.id}
                  style={{
                    border: '1px solid',
                    borderColor: isSuper ? 'var(--primary)' : 'var(--border)',
                    borderRadius: 'var(--r-lg)',
                    background: isSuper ? 'var(--bg-subtle)' : 'var(--bg)',
                    overflow: 'hidden',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div
                    onClick={() => setExpandedAccountId(isExpanded ? null : account.id)}
                    style={{
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      gap: '12px',
                      flexWrap: 'wrap'
                    }}
                  >
                    {/* User info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px' }}>
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        color: 'var(--primary-fg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '800',
                        fontSize: '0.95rem',
                        overflow: 'hidden',
                        flexShrink: 0
                      }}>
                        {account.profilePicUrl ? (
                          <img src={account.profilePicUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          (account.firstName?.[0] || account.username?.[0] || 'U').toUpperCase()
                        )}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: '800', fontSize: '0.92rem', color: 'var(--text)' }}>
                            {account.firstName ? `${account.firstName} ${account.lastName || ''}`.trim() : account.username}
                          </span>
                          {isSuper ? (
                            <span style={{
                              fontSize: '0.62rem',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontWeight: '800',
                              background: 'var(--primary)',
                              color: 'var(--primary-fg)',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              SUPERADMIN
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '0.62rem',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontWeight: '700',
                              background: 'var(--bg-hover)',
                              color: '#52525b',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              USER
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                          {account.email} • @{account.username}
                        </div>
                      </div>
                    </div>

                    {/* Instagram Handle & Permanent ID */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '160px' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                        INSTAGRAM IDENTITY
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Instagram size={13} color="#09090b" />
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace" }}>
                          {account.instagramUsername ? `@${account.instagramUsername}` : 'Not connected'}
                        </span>
                      </div>
                      {account.instagramId && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--success)', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
                          Permanent ID: {account.instagramId}
                        </span>
                      )}
                    </div>

                    {/* Security & Members Count */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.76rem', color: 'var(--text)', fontWeight: '700' }}>
                          <Fingerprint size={14} color={account.hasPasskeys ? '#15803d' : '#71717a'} />
                          <span>{account.hasPasskeys ? `${account.passkeyCount} Passkey(s)` : 'Password'}</span>
                        </div>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          Joined {account.createdAt ? new Date(account.createdAt).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEnterWorkspace(account);
                        }}
                        disabled={enteringId === account.id}
                        title="Enter and manage this workspace"
                        style={{
                          background: 'var(--primary)',
                          color: 'var(--primary-fg)',
                          border: 'none',
                          borderRadius: 'var(--r-md)',
                          padding: '6px 12px',
                          fontSize: '0.74rem',
                          fontWeight: '700',
                          cursor: enteringId === account.id ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <Shield size={12} color="#15803d" />
                        <span>{enteringId === account.id ? 'Opening...' : 'Manage'}</span>
                      </button>

                      {account.id !== user?.id && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAccount(account);
                          }}
                          disabled={deletingId === account.id}
                          title="Permanently delete this account"
                          style={{
                            background: 'var(--bg)',
                            color: 'var(--danger)',
                            border: '1px solid var(--danger-border)',
                            borderRadius: 'var(--r-md)',
                            padding: '6px 10px',
                            fontSize: '0.74rem',
                            fontWeight: '700',
                            cursor: deletingId === account.id ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Trash2 size={12} />
                          <span>{deletingId === account.id ? '...' : 'Delete'}</span>
                        </button>
                      )}

                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: 'var(--bg-hover)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-muted)'
                      }}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Account Details */}
                  {isExpanded && (
                    <div style={{
                      padding: '16px 18px',
                      borderTop: '1px solid var(--border)',
                      background: 'var(--bg)',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '14px',
                      fontSize: '0.78rem'
                    }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: '700', display: 'block', marginBottom: '2px' }}>
                          MOBILE NUMBER
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--text)' }}>
                          {account.mobileNumber || 'Not provided'}
                        </span>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: '700', display: 'block', marginBottom: '2px' }}>
                          LAST ACTIVITY
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--text)' }}>
                          {account.lastLogin ? new Date(account.lastLogin).toLocaleString() : 'Recent'}
                        </span>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: '700', display: 'block', marginBottom: '2px' }}>
                          INTERNAL DATABASE ID
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                          {account.id}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredAccounts.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No accounts match your query.
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MEMBERS & TOPOLOGY */}
        {activeTab === 'members' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 14px', fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                    PERSON
                  </th>
                  <th style={{ padding: '10px 14px', fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                    INSTAGRAM HANDLE
                  </th>
                  <th style={{ padding: '10px 14px', fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                    CATEGORY
                  </th>
                  <th style={{ padding: '10px 14px', fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                    RELATIONSHIP
                  </th>
                  <th style={{ padding: '10px 14px', fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", textAlign: 'right' }}>
                    LORE FACTS
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr key={member.id} style={{ borderBottom: '1px solid var(--bg-hover)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'var(--bg-hover)',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '700',
                          fontSize: '0.78rem'
                        }}>
                          {member.profilePic ? (
                            <img src={member.profilePic} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            member.name?.[0] || 'P'
                          )}
                        </div>
                        <span style={{ fontWeight: '700', fontSize: '0.84rem', color: 'var(--text)' }}>
                          {member.name}
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem', color: '#52525b' }}>
                      {member.handle ? `@${member.handle}` : <span style={{ color: 'var(--text-muted)' }}>None</span>}
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        fontSize: '0.66rem',
                        fontWeight: '700',
                        fontFamily: "'JetBrains Mono', monospace",
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: member.category === 'close_friend' ? 'var(--success-bg)' : 'var(--bg-hover)',
                        color: member.category === 'close_friend' ? 'var(--success)' : '#52525b'
                      }}>
                        {member.category?.toUpperCase() || 'ONLINE_FRIEND'}
                      </span>
                    </td>

                    <td style={{ padding: '12px 14px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {member.relationship || 'Friend'}
                    </td>

                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', fontSize: '0.8rem' }}>
                      {member.factsCount || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredMembers.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No members found matching your search.
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
