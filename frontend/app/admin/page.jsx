'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Shield, Users, UserCheck, RefreshCw, Search,
  CheckCircle2, AlertCircle, Fingerprint, Mail,
  ExternalLink, Calendar, ChevronDown, ChevronUp,
  Layers, Lock, Sparkles, Filter, Instagram, Smartphone
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
          background: '#ffffff',
          border: '1px solid #e4e4e7',
          borderRadius: '12px',
          padding: '48px 24px',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: '#fef2f2',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <Lock size={28} />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#09090b', marginBottom: '8px' }}>
            Superadmin Access Required
          </h2>
          <p style={{ color: '#71717a', fontSize: '0.88rem', maxWidth: '440px', margin: '0 auto 20px', lineHeight: 1.5 }}>
            This command dashboard is strictly restricted to platform administrators with the superadmin role.
          </p>
          <a
            href="/"
            style={{
              display: 'inline-block',
              background: '#09090b',
              color: '#ffffff',
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
            <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
              PLATFORM GOVERNANCE
            </span>
            <span style={{
              fontSize: '0.62rem',
              fontWeight: '800',
              fontFamily: "'JetBrains Mono', monospace",
              background: '#09090b',
              color: '#ffffff',
              padding: '2px 6px',
              borderRadius: '4px'
            }}>
              SUPERADMIN
            </span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: '800', letterSpacing: '-0.6px', marginTop: '4px', color: '#09090b' }}>
            Connected Accounts & Directory
          </h1>
          <p style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '4px' }}>
            Real-time multi-account observatory: monitor registered user accounts, Instagram handle identities, and active circle member topologies.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchAdminData}
          disabled={loading}
          style={{
            background: '#ffffff',
            border: '1px solid #e4e4e7',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '0.78rem',
            fontWeight: '600',
            color: '#09090b',
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
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          padding: '12px 16px',
          color: '#b91c1c',
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
          background: '#ffffff',
          border: '1px solid #e4e4e7',
          borderRadius: '10px',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.7rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
            REGISTERED ACCOUNTS
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#09090b', marginTop: '6px' }}>
            {data?.totalAccounts ?? (loading ? '...' : 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '4px' }}>
            Active platform users
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #e4e4e7',
          borderRadius: '10px',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.7rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
            TOTAL CIRCLE MEMBERS
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#09090b', marginTop: '6px' }}>
            {data?.totalContacts ?? (loading ? '...' : 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '4px' }}>
            SocialGraph mapped contacts
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #e4e4e7',
          borderRadius: '10px',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.7rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
            CLOSE FRIENDS
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#16a34a', marginTop: '6px' }}>
            {data?.contactsBreakdown?.closeFriends ?? (loading ? '...' : 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '4px' }}>
            High-affinity inner circle
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #e4e4e7',
          borderRadius: '10px',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.7rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
            ONLINE & DM NETWORK
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0284c7', marginTop: '6px' }}>
            {data?.contactsBreakdown?.onlineFriends ?? (loading ? '...' : 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '4px' }}>
            Instagram chat relationships
          </div>
        </div>
      </div>

      {/* Main Section */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e4e4e7',
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
                background: activeTab === 'accounts' ? '#09090b' : '#f4f4f5',
                color: activeTab === 'accounts' ? '#ffffff' : '#71717a',
                border: 'none',
                padding: '7px 16px',
                borderRadius: '7px',
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
                background: activeTab === 'members' ? '#09090b' : '#f4f4f5',
                color: activeTab === 'members' ? '#ffffff' : '#71717a',
                border: 'none',
                padding: '7px 16px',
                borderRadius: '7px',
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
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
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
                    borderColor: isSuper ? '#09090b' : '#e4e4e7',
                    borderRadius: '10px',
                    background: isSuper ? '#fafafa' : '#ffffff',
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
                        background: '#09090b',
                        color: '#ffffff',
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
                          <span style={{ fontWeight: '800', fontSize: '0.92rem', color: '#09090b' }}>
                            {account.firstName ? `${account.firstName} ${account.lastName || ''}`.trim() : account.username}
                          </span>
                          {isSuper ? (
                            <span style={{
                              fontSize: '0.62rem',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontWeight: '800',
                              background: '#09090b',
                              color: '#ffffff',
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
                              background: '#f4f4f5',
                              color: '#71717a',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              USER
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '0.74rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                          {account.email} • @{account.username}
                        </div>
                      </div>
                    </div>

                    {/* Instagram Handle & Permanent ID */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '160px' }}>
                      <span style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                        INSTAGRAM IDENTITY
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Instagram size={13} color="#e1306c" />
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#09090b', fontFamily: "'JetBrains Mono', monospace" }}>
                          {account.instagramUsername ? `@${account.instagramUsername}` : 'Not connected'}
                        </span>
                      </div>
                      {account.instagramId && (
                        <span style={{ fontSize: '0.68rem', color: '#16a34a', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
                          Permanent ID: {account.instagramId}
                        </span>
                      )}
                    </div>

                    {/* Security & Members Count */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.76rem', color: '#09090b', fontWeight: '700' }}>
                          <Fingerprint size={14} color={account.hasPasskeys ? '#16a34a' : '#a1a1aa'} />
                          <span>{account.hasPasskeys ? `${account.passkeyCount} Passkey(s)` : 'Password'}</span>
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#71717a' }}>
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
                          background: '#09090b',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '7px',
                          padding: '6px 12px',
                          fontSize: '0.74rem',
                          fontWeight: '700',
                          cursor: enteringId === account.id ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <Shield size={12} color="#22c55e" />
                        <span>{enteringId === account.id ? 'Opening...' : 'Manage'}</span>
                      </button>

                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: '#f4f4f5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#71717a'
                      }}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Account Details */}
                  {isExpanded && (
                    <div style={{
                      padding: '16px 18px',
                      borderTop: '1px solid #e4e4e7',
                      background: '#ffffff',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '14px',
                      fontSize: '0.78rem'
                    }}>
                      <div>
                        <span style={{ color: '#71717a', fontSize: '0.7rem', fontWeight: '700', display: 'block', marginBottom: '2px' }}>
                          MOBILE NUMBER
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#09090b' }}>
                          {account.mobileNumber || 'Not provided'}
                        </span>
                      </div>

                      <div>
                        <span style={{ color: '#71717a', fontSize: '0.7rem', fontWeight: '700', display: 'block', marginBottom: '2px' }}>
                          LAST ACTIVITY
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#09090b' }}>
                          {account.lastLogin ? new Date(account.lastLogin).toLocaleString() : 'Recent'}
                        </span>
                      </div>

                      <div>
                        <span style={{ color: '#71717a', fontSize: '0.7rem', fontWeight: '700', display: 'block', marginBottom: '2px' }}>
                          INTERNAL DATABASE ID
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#71717a', fontSize: '0.72rem' }}>
                          {account.id}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredAccounts.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '36px', color: '#a1a1aa', fontSize: '0.85rem' }}>
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
                <tr style={{ background: '#fafafa', borderBottom: '1px solid #e4e4e7' }}>
                  <th style={{ padding: '10px 14px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                    PERSON
                  </th>
                  <th style={{ padding: '10px 14px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                    INSTAGRAM HANDLE
                  </th>
                  <th style={{ padding: '10px 14px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                    CATEGORY
                  </th>
                  <th style={{ padding: '10px 14px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                    RELATIONSHIP
                  </th>
                  <th style={{ padding: '10px 14px', fontSize: '0.7rem', fontWeight: '700', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", textAlign: 'right' }}>
                    LORE FACTS
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr key={member.id} style={{ borderBottom: '1px solid #f4f4f5' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: '#f4f4f5',
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
                        <span style={{ fontWeight: '700', fontSize: '0.84rem', color: '#09090b' }}>
                          {member.name}
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem', color: '#52525b' }}>
                      {member.handle ? `@${member.handle}` : <span style={{ color: '#d4d4d8' }}>None</span>}
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        fontSize: '0.66rem',
                        fontWeight: '700',
                        fontFamily: "'JetBrains Mono', monospace",
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: member.category === 'close_friend' ? '#f0fdf4' : '#f4f4f5',
                        color: member.category === 'close_friend' ? '#16a34a' : '#71717a'
                      }}>
                        {member.category?.toUpperCase() || 'ONLINE_FRIEND'}
                      </span>
                    </td>

                    <td style={{ padding: '12px 14px', fontSize: '0.8rem', color: '#71717a' }}>
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
              <div style={{ textAlign: 'center', padding: '36px', color: '#a1a1aa', fontSize: '0.85rem' }}>
                No members found matching your search.
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
