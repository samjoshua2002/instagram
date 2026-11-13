'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '../context/AppContext';
import {
  Shield, Users, ArrowRight, ArrowLeft, RefreshCw,
  Search, Lock, ExternalLink, CheckCircle2, AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function SuperadminWorkspacePrompt({ sectionTitle, sectionCode, sectionDescription }) {
  const { user, token, API_BASE, enterWorkspace, showToast } = useApp();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [enteringId, setEnteringId] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchAccounts = async () => {
      const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
      if (!activeToken) return;
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/api/admin/accounts`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load creator accounts.');
        if (isMounted) {
          // Filter to creator/user accounts
          setAccounts(data.accounts || []);
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Error fetching platform accounts.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAccounts();
    return () => { isMounted = false; };
  }, [token, API_BASE]);

  const handleSelectWorkspace = async (targetUser) => {
    if (enteringId) return;
    setEnteringId(targetUser.id);
    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
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
      if (!res.ok) throw new Error(data.error || 'Failed to switch into workspace.');

      enterWorkspace(data.token, data.user);
    } catch (err) {
      console.error('Enter workspace error:', err);
      showToast?.(err.message || 'Failed to enter workspace.', 'error');
      setEnteringId(null);
    }
  };

  const filteredAccounts = accounts.filter(a => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (a.username && a.username.toLowerCase().includes(q)) ||
      (a.email && a.email.toLowerCase().includes(q)) ||
      (a.firstName && a.firstName.toLowerCase().includes(q)) ||
      (a.lastName && a.lastName.toLowerCase().includes(q)) ||
      (a.instagramUsername && a.instagramUsername.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ maxWidth: '920px', margin: '32px auto', padding: '0 20px' }}>
      {/* Top Banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
          marginBottom: '24px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', maxWidth: '600px' }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'var(--primary)',
              color: 'var(--primary-fg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
            }}>
              <Shield size={22} color="#15803d" strokeWidth={2.2} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{
                  fontSize: '0.65rem',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: '800',
                  background: 'var(--bg-hover)',
                  color: 'var(--text)',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  PLATFORM SUPERADMIN
                </span>
                <span style={{
                  fontSize: '0.65rem',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: 'var(--text-muted)'
                }}>
                  [{sectionCode || 'TENANT CONFIG'}]
                </span>
              </div>
              <h1 style={{ fontSize: '1.28rem', fontWeight: '800', color: 'var(--text)', margin: '0 0 6px 0', letterSpacing: '-0.3px' }}>
                {sectionTitle || 'Creator Workspace Scope'}
              </h1>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                {sectionDescription ||
                  'This section configures automation for individual creator accounts. Select a creator workspace below to inspect and manage their rules, relationships, or persona.'}
              </p>
            </div>
          </div>

          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '8px',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              textDecoration: 'none',
              fontSize: '0.8rem',
              fontWeight: '700',
              transition: 'all 0.15s ease'
            }}
          >
            <ArrowLeft size={13} />
            <span>Platform Console</span>
          </Link>
        </div>
      </motion.div>

      {/* Creator Selector */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '0.96rem', fontWeight: '700', color: 'var(--text)', margin: '0 0 4px 0' }}>
              Select Creator Workspace to Configure
            </h2>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>
              Showing {filteredAccounts.length} platform {filteredAccounts.length === 1 ? 'account' : 'accounts'}
            </p>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', minWidth: '240px' }}>
            <Search size={14} color="#71717a" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search creator name or handle..."
              style={{
                width: '100%',
                padding: '7px 12px 7px 30px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '0.8rem',
                outline: 'none',
                background: 'var(--bg-subtle)'
              }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: '8px', color: 'var(--text-muted)' }}>
            <RefreshCw size={16} className="animate-spin" />
            <span style={{ fontSize: '0.84rem' }}>Loading creator workspaces...</span>
          </div>
        ) : error ? (
          <div style={{ padding: '16px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: '8px', color: 'var(--danger)', fontSize: '0.82rem' }}>
            {error}
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
            No creator accounts found matching search.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '12px' }}>
            {filteredAccounts.map((acc) => {
              const handle = acc.instagramUsername || acc.username;
              const name = acc.firstName ? `${acc.firstName} ${acc.lastName || ''}`.trim() : acc.username;
              const isEntering = enteringId === acc.id;

              return (
                <div
                  key={acc.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-lg)',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    background: 'var(--bg-subtle)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    {acc.profilePicUrl ? (
                      <img
                        src={acc.profilePicUrl}
                        alt=""
                        style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border)' }}
                      />
                    ) : (
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--primary)', color: 'var(--primary-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '0.85rem' }}>
                        {name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: '700', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                        @{handle}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                    <span style={{
                      fontSize: '0.62rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      color: acc.accountType === 'business' ? 'var(--text)' : 'var(--text-muted)'
                    }}>
                      {acc.accountType || 'personal'}
                    </span>

                    <button
                      type="button"
                      disabled={isEntering}
                      onClick={() => handleSelectWorkspace(acc)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        background: 'var(--primary)',
                        color: 'var(--primary-fg)',
                        border: 'none',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        cursor: isEntering ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      {isEntering ? (
                        <>
                          <RefreshCw size={11} className="animate-spin" />
                          <span>Opening...</span>
                        </>
                      ) : (
                        <>
                          <span>Manage Workspace</span>
                          <ArrowRight size={11} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
