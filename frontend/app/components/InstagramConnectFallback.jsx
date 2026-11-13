'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import {
  Instagram,
  Sparkles,
  Sliders,
  ShieldAlert,
  ArrowRight,
  Zap,
  Settings,
  Bot,
  Key,
  Eye,
  EyeOff,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CheckCircle2,
  Lock,
  Layers,
  ExternalLink,
  Send,
  Clock
} from 'lucide-react';

export default function InstagramConnectFallback({ onConnect, user }) {
  const { token, API_BASE, updateUserProfile, showToast, refreshAccount } = useApp();

  const initialUsername = user?.instagramUsername || user?.username || '';
  const initialAccountId = user?.instagramId || user?.instagramAccountId || '';
  const initialToken = user?.instagramPageAccessToken || '';

  const [handle, setHandle] = useState(initialUsername);
  const [accountId, setAccountId] = useState(initialAccountId);
  const [accessToken, setAccessToken] = useState(initialToken);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [approvalStatus, setApprovalStatus] = useState(user?.igApprovalStatus || (user?.role === 'superadmin' ? 'approved' : 'none'));
  const [requestHandle, setRequestHandle] = useState(user?.instagramUsername || user?.username || '');
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  React.useEffect(() => {
    if (user?.igApprovalStatus) {
      setApprovalStatus(user.igApprovalStatus);
    }
  }, [user?.igApprovalStatus]);

  const handleRequestAccess = async (e) => {
    e?.preventDefault();
    const cleanHandle = requestHandle.trim().replace(/^@/, '');
    if (!cleanHandle) {
      setErrorMsg('Please enter your Instagram username to request automation access.');
      return;
    }
    setRequestingAccess(true);
    setErrorMsg('');
    try {
      const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
      const res = await fetch(`${API_BASE}/api/auth/ig-request-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {})
        },
        body: JSON.stringify({ instagramUsername: cleanHandle })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit request');
      setApprovalStatus('pending');
      setHandle(cleanHandle);
      if (updateUserProfile) {
        updateUserProfile({
          igApprovalStatus: 'pending',
          instagramUsername: cleanHandle
        });
      }
      showToast?.('Request submitted! Superadmin will add your handle to Meta App Roles.', 'success');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit request');
    } finally {
      setRequestingAccess(false);
    }
  };

  const handleCheckApprovalStatus = async () => {
    setCheckingStatus(true);
    try {
      const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {}
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data && data.igApprovalStatus) {
        setApprovalStatus(data.igApprovalStatus);
        if (updateUserProfile) {
          updateUserProfile(data);
        }
        if (data.igApprovalStatus === 'approved') {
          showToast?.('🎉 Your Instagram automation has been approved by admin!', 'success');
        } else if (data.igApprovalStatus === 'pending') {
          showToast?.('Request is still pending Admin whitelist in Meta Roles.', 'info');
        }
      }
    } catch (err) {
      console.error(err);
      showToast?.(`Could not check approval status: ${err.message}`, 'error');
    } finally {
      setCheckingStatus(false);
    }
  };

  // Listen for OAuth postMessage from login popup window
  React.useEffect(() => {
    const handleOAuthMessage = (event) => {
      // Only trust messages coming from our own backend's OAuth popup
      let apiOrigin = '';
      try { apiOrigin = new URL(API_BASE).origin; } catch (e) {}
      if (!apiOrigin || event.origin !== apiOrigin) return;
      if (event.data?.type === 'INSTAGRAM_OAUTH_SUCCESS') {
        const { instagramUsername: igUser, instagramAccountId: igId } = event.data.payload || {};
        if (igUser) setHandle(igUser);
        if (igId) setAccountId(igId);
        setOauthConnecting(false);
        if (updateUserProfile) {
          updateUserProfile({
            hasInstagramToken: true,
            isInstagramConnected: true,
            ...(igId ? { instagramAccountId: igId } : {}),
            ...(igUser ? { instagramUsername: igUser } : {}),
          });
        }
        // Token stays on the server now: re-read account + persona
        refreshAccount?.();
        showToast?.(`Instagram connected: @${igUser || 'account'}! Automation active.`, 'success');
      } else if (event.data?.type === 'INSTAGRAM_OAUTH_ERROR') {
        setOauthConnecting(false);
        setErrorMsg(event.data.error || 'Instagram connection cancelled or failed.');
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [API_BASE, showToast, updateUserProfile, refreshAccount]);

  const handleLaunchInstagramOAuth = () => {
    setErrorMsg('');
    setOauthConnecting(true);
    try {
      const clientOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://instagram-ebon-zeta.vercel.app';
      const currentToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : '') || '';

      const backendUrl = (API_BASE || 'https://instagram-ai-bot-64tf.onrender.com').replace(/\/+$/, '');
      const redirectUri = `${backendUrl}/api/auth/instagram/callback`;

      const metaAppId = '28946827981672606';
      const scopes = [
        'instagram_basic',
        'instagram_manage_messages',
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_metadata'
      ].join(',');

      const stateObj = {
        token: currentToken,
        origin: clientOrigin,
        redirectUri: redirectUri,
        appId: metaAppId
      };
      const state = btoa(JSON.stringify(stateObj));

      // Official Meta / Facebook OAuth dialog for App ID 28946827981672606
      const directOAuthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;

      const popup = window.open(directOAuthUrl, 'instagram_oauth', 'width=620,height=720,left=250,top=100');
      if (!popup) {
        setOauthConnecting(false);
        setErrorMsg('Popup was blocked by your browser. Please allow popups or enter your credentials below.');
      }
    } catch (e) {
      setOauthConnecting(false);
      setErrorMsg('Failed to open login dialog: ' + e.message);
    }
  };

  const handleConnectDirectly = async (e) => {
    e?.preventDefault();
    if (!accessToken.trim()) {
      setErrorMsg('Please enter your Instagram Page Access Token to activate automation.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const cleanHandle = handle.trim().replace(/^@/, '');
      const cleanToken = accessToken.trim();
      const cleanAccountId = accountId.trim();

      const currentAuthToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
      const headers = {
        'Content-Type': 'application/json',
        ...(currentAuthToken ? { 'Authorization': `Bearer ${currentAuthToken}` } : {})
      };

      // 1. Update PersonaConfig
      const personaRes = await fetch(`${API_BASE}/api/persona`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          instagramHandle: cleanHandle ? `@${cleanHandle}` : undefined,
          instagramAccountId: cleanAccountId || undefined,
          instagramPageAccessToken: cleanToken,
          globalBotActive: true
        })
      });

      if (!personaRes.ok) {
        const errData = await personaRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update credentials on server');
      }

      // 2. Update User Profile if profile endpoint is available
      try {
        await fetch(`${API_BASE}/api/auth/profile`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            instagramUsername: cleanHandle,
          })
        });
      } catch (profileErr) {
        // Non-critical if persona succeeded
      }

      // 3. Update local user context so app instantly unlocks
      if (updateUserProfile) {
        updateUserProfile({
          hasInstagramToken: true,
          isInstagramConnected: true,
          instagramPageAccessToken: cleanToken,
          instagramAccountId: cleanAccountId,
          instagramUsername: cleanHandle,
        });
      }

      showToast?.('Instagram connected successfully! Workspace automation unlocked.', 'success');
    } catch (err) {
      setErrorMsg(err.message || 'Error connecting Instagram. Please verify your token.');
    } finally {
      setSaving(false);
    }
  };

  const [setupTab, setSetupTab] = useState('oauth'); // 'oauth' | 'manual'
  const username = user?.instagramUsername || user?.username || 'Creator';

  return (
    <div className="connect-fallback-container">
      <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        {/* Breadcrumb & Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: '999px',
            padding: '3px 12px',
            fontSize: '0.68rem',
            fontWeight: '800',
            fontFamily: "'JetBrains Mono', monospace",
            color: '#52525b',
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
            marginBottom: '12px'
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--warning)' }} />
            WORKSPACE SETUP // INSTAGRAM CONNECTION
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h1 style={{
                fontSize: '1.75rem',
                fontWeight: '800',
                color: 'var(--text)',
                letterSpacing: '-0.5px',
                margin: '0 0 6px 0',
                lineHeight: 1.2
              }}>
                Connect Instagram to activate automations
              </h1>
              <p style={{
                fontSize: '0.86rem',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
                margin: 0,
                maxWidth: '680px'
              }}>
                Link your Instagram account to unlock live contact relationship graphs, AI-powered direct message replies, memory tracking, and custom automation rules.
              </p>
            </div>

            {onConnect && (
              <button
                type="button"
                onClick={onConnect}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '7px 13px',
                  fontSize: '0.78rem',
                  fontWeight: '600',
                  color: '#52525b',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <Layers size={14} />
                <span>Launch Guided Wizard</span>
              </button>
            )}
          </div>
        </div>

        {/* Error message if any */}
        {errorMsg && (
          <div style={{
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            color: 'var(--danger)',
            borderRadius: 'var(--r-lg)',
            padding: '12px 16px',
            fontSize: '0.84rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <ShieldAlert size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Account Info Bar */}
        <div style={{
          width: '100%',
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '24px',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: 'var(--r-lg)',
              background: 'var(--border)',
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '800',
              fontSize: '0.9rem'
            }}>
              {username[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: '800', color: 'var(--text)' }}>
                @{username.replace(/^@/, '')}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {user?.accountType ? `${user.accountType.charAt(0).toUpperCase() + user.accountType.slice(1)} Tier` : 'Creator Account'}
                {user?.email ? ` • ${user.email}` : ''}
              </div>
            </div>
          </div>
          <span style={{
            fontSize: '0.68rem',
            fontWeight: '800',
            fontFamily: "'JetBrains Mono', monospace",
            background: approvalStatus === 'pending' ? 'var(--warning-bg)' : (approvalStatus === 'approved' ? '#eff6ff' : 'var(--bg-hover)'),
            color: approvalStatus === 'pending' ? 'var(--warning)' : (approvalStatus === 'approved' ? 'var(--info)' : 'var(--text-muted)'),
            border: `1px solid ${approvalStatus === 'pending' ? 'var(--warning-border)' : (approvalStatus === 'approved' ? '#bfdbfe' : 'var(--border)')}`,
            padding: '4px 10px',
            borderRadius: '6px'
          }}>
            {approvalStatus === 'pending' ? 'APPROVAL PENDING // META TEST ROLES' : (approvalStatus === 'approved' ? 'ROLE APPROVED // READY TO CONNECT' : 'ACTION REQUIRED // NOT CONNECTED')}
          </span>
        </div>

        {/* Meta Sandbox / Test Mode Whitelist Notice */}
        {user?.role !== 'superadmin' && (
          <div style={{
            background: approvalStatus === 'approved' ? 'var(--success-bg)' : (approvalStatus === 'pending' ? 'var(--warning-bg)' : 'var(--bg-subtle)'),
            border: `1px solid ${approvalStatus === 'approved' ? 'var(--success-border)' : (approvalStatus === 'pending' ? 'var(--warning-border)' : 'var(--border)')}`,
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '22px',
            fontSize: '0.82rem',
            color: approvalStatus === 'approved' ? 'var(--success)' : (approvalStatus === 'pending' ? 'var(--warning)' : 'var(--text)'),
            boxSizing: 'border-box'
          }}>
            {approvalStatus === 'pending' ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1, minWidth: '240px' }}>
                  <Clock size={18} color="#b45309" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '0.88rem', color: 'var(--warning)', marginBottom: '3px' }}>
                      ⏳ Request Submitted — Waiting for Admin Whitelist
                    </div>
                    <div style={{ lineHeight: 1.5, color: 'var(--warning)' }}>
                      Your handle <strong>@{user?.instagramUsername || handle}</strong> is awaiting addition into Meta App Roles by the Superadmin. Once added, you will receive an automated email with direct steps to accept the invite.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCheckApprovalStatus}
                  disabled={checkingStatus}
                  style={{
                    background: 'var(--warning-bg)',
                    border: '1px solid var(--warning-border)',
                    borderRadius: '8px',
                    padding: '7px 12px',
                    fontSize: '0.74rem',
                    fontWeight: '700',
                    color: 'var(--warning)',
                    cursor: checkingStatus ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <RefreshCw size={12} className={checkingStatus ? 'animate-spin' : ''} />
                  <span>{checkingStatus ? 'Checking...' : 'Check Status'}</span>
                </button>
              </div>
            ) : approvalStatus === 'approved' ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1, minWidth: '240px' }}>
                  <CheckCircle2 size={18} color="#15803d" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '0.88rem', color: 'var(--success)', marginBottom: '3px' }}>
                      🎉 Whitelisted in Meta Roles! Complete Next 2 Steps:
                    </div>
                    <div style={{ lineHeight: 1.5, color: 'var(--success)' }}>
                      <strong>Step 1:</strong> Accept the invite in Instagram: <em>Settings &rarr; Website Permissions (or Apps and Websites) &rarr; Tester Invites</em>.<br />
                      <strong>Step 2:</strong> Click <strong>1-Click Meta Login</strong> below to grant token access.
                    </div>
                  </div>
                </div>
                <a
                  href="https://www.instagram.com/accounts/manage_access/"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: 'var(--success)',
                    border: '1px solid var(--success)',
                    color: 'var(--primary-fg)',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '0.74rem',
                    fontWeight: '700',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>Open Instagram Permissions</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Lock size={16} color="#0369a1" />
                  <span style={{ fontWeight: '800', fontSize: '0.86rem', color: 'var(--text)' }}>
                    Meta Test Mode: Request Access Whitelist
                  </span>
                </div>
                <p style={{ margin: '0 0 12px 0', lineHeight: 1.5, color: '#52525b' }}>
                  Since Chatter OS is running in Meta Sandbox mode, your Instagram account must be manually added to <strong>Meta App Roles &rarr; Instagram Testers</strong> before token authorization can succeed. Request access below:
                </p>
                <form onSubmit={handleRequestAccess} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div className="input-focus-ring" style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'var(--bg)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    flex: '1 1 220px',
                    maxWidth: '360px'
                  }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: '700', marginRight: '4px' }}>@</span>
                    <input
                      type="text"
                      value={requestHandle}
                      onChange={(e) => setRequestHandle(e.target.value)}
                      placeholder="instagram_username"
                      style={{
                        border: 'none',
                        outline: 'none',
                        fontSize: '0.82rem',
                        width: '100%',
                        color: 'var(--text)',
                        fontWeight: '600'
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={requestingAccess}
                    style={{
                      background: 'var(--primary)',
                      border: '1px solid var(--primary)',
                      color: 'var(--primary-fg)',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      cursor: requestingAccess ? 'wait' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <Send size={12} />
                    <span>{requestingAccess ? 'Submitting...' : 'Request Permission'}</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Main 2-Column Responsive Section */}
        <div className="connect-grid-layout">
          {/* Main Credentials Card */}
          <div style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: '24px',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h2 style={{
                fontSize: '1.05rem',
                fontWeight: '700',
                color: 'var(--text)',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Key size={17} />
                <span>Instagram API Credentials</span>
              </h2>
            </div>

            {/* Clean Segmented Tab Switcher */}
            <div style={{
              display: 'flex',
              background: 'var(--bg-hover)',
              padding: '4px',
              borderRadius: 'var(--r-md)',
              marginBottom: '20px',
              border: '1px solid var(--border)'
            }}>
              <button
                type="button"
                onClick={() => setSetupTab('oauth')}
                style={{
                  flex: '1 1 auto',
                  whiteSpace: 'nowrap',
                  padding: '8px 10px',
                  borderRadius: 'var(--r-md)',
                  border: 'none',
                  background: setupTab === 'oauth' ? 'var(--bg)' : 'transparent',
                  color: setupTab === 'oauth' ? 'var(--text)' : 'var(--text-muted)',
                  fontWeight: '700',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow: setupTab === 'oauth' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Zap size={14} color={setupTab === 'oauth' ? '#09090b' : '#71717a'} />
                <span>1-Click Meta Login</span>
                <span style={{
                  fontSize: '0.62rem',
                  background: 'var(--success-bg)',
                  color: 'var(--success)',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  fontWeight: '800'
                }}>RECOMMENDED</span>
              </button>

              <button
                type="button"
                onClick={() => setSetupTab('manual')}
                style={{
                  flex: '1 1 auto',
                  whiteSpace: 'nowrap',
                  padding: '8px 10px',
                  borderRadius: 'var(--r-md)',
                  border: 'none',
                  background: setupTab === 'manual' ? 'var(--bg)' : 'transparent',
                  color: setupTab === 'manual' ? 'var(--text)' : 'var(--text-muted)',
                  fontWeight: '700',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow: setupTab === 'manual' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Sliders size={14} />
                <span>Manual Token Setup</span>
              </button>
            </div>

            {/* TAB 1: 1-Click Meta OAuth (Streamlined & Clean) */}
            {setupTab === 'oauth' && (
              <div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '18px', lineHeight: 1.5 }}>
                  Log in directly through official Meta dialog to automatically grant permissions, link your Instagram business profile, and generate long-lived tokens.
                </p>

                <div style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '20px'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', fontSize: '0.82rem', color: '#52525b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle2 size={16} color="#15803d" />
                      <span>Automatic Instagram Business ID resolution</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle2 size={16} color="#15803d" />
                      <span>60-day auto-refreshing Page Access Token</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle2 size={16} color="#15803d" />
                      <span>Instant webhook routing for real-time AI responses</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="is-primary"
                    onClick={handleLaunchInstagramOAuth}
                    disabled={oauthConnecting}
                    style={{
                      width: '100%',
                      background: 'var(--primary)',
                      color: 'var(--primary-fg)',
                      border: 'none',
                      borderRadius: '11px',
                      padding: '14px 20px',
                      fontSize: '0.92rem',
                      fontWeight: '700',
                      cursor: oauthConnecting ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '9px',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {oauthConnecting ? (
                      <>
                        <RefreshCw size={17} className="animate-spin" />
                        <span>Connecting via Meta OAuth...</span>
                      </>
                    ) : (
                      <>
                        <Instagram size={18} />
                        <span>Connect with Instagram</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px', display: 'block', textAlign: 'center' }}>
                    Official Meta Graph API dialog opens in a secure popup window.
                  </span>
                </div>
              </div>
            )}

            {/* TAB 2: Manual Access Token Input */}
            {setupTab === 'manual' && (
              <form onSubmit={handleConnectDirectly} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: '#52525b', marginBottom: '6px' }}>
                    Instagram Handle
                  </label>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="e.g. your_instagram_handle"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      fontSize: '0.86rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: '#52525b', marginBottom: '6px' }}>
                    Instagram Business Account ID
                  </label>
                  <input
                    type="text"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    placeholder="e.g. 17841400000000000"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      fontSize: '0.86rem',
                      fontFamily: 'monospace',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: '#52525b' }}>
                      Page Access Token
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: '0.72rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                      <span>{showToken ? 'Hide' : 'Show Token'}</span>
                    </button>
                  </div>
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="EAA... (Meta Page Access Token)"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      fontSize: '0.86rem',
                      fontFamily: 'monospace',
                      boxSizing: 'border-box'
                    }}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    Requires <code>instagram_basic</code> &amp; <code>instagram_manage_messages</code> permissions.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    width: '100%',
                    background: 'var(--primary)',
                    color: 'var(--primary-fg)',
                    border: 'none',
                    borderRadius: 'var(--r-md)',
                    padding: '13px 20px',
                    fontSize: '0.88rem',
                    fontWeight: '700',
                    cursor: saving ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(9, 9, 11, 0.12)',
                    transition: 'all 0.15s ease',
                    marginTop: '4px'
                  }}
                >
                  {saving ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Verifying &amp; Activating...</span>
                    </>
                  ) : (
                    <>
                      <Zap size={16} />
                      <span>Save &amp; Activate Automation</span>
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Guide / Instructions Card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)',
              padding: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{
                  fontSize: '0.98rem',
                  fontWeight: '700',
                  color: 'var(--text)',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <HelpCircle size={17} />
                  <span>How to obtain your Access Token</span>
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.82rem', color: '#52525b', lineHeight: 1.5 }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <span style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'var(--border)',
                    color: 'var(--text)',
                    fontWeight: '800',
                    fontSize: '0.72rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>1</span>
                  <span>Log into <strong>Meta for Developers</strong> (developers.facebook.com) and open the <strong>Graph API Explorer</strong>.</span>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <span style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'var(--border)',
                    color: 'var(--text)',
                    fontWeight: '800',
                    fontSize: '0.72rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>2</span>
                  <span>Select your Meta App and choose <strong>Get Page Access Token</strong> for your Instagram-linked Facebook Page.</span>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <span style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'var(--border)',
                    color: 'var(--text)',
                    fontWeight: '800',
                    fontSize: '0.72rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>3</span>
                  <span>Ensure permissions include: <code>instagram_basic</code>, <code>instagram_manage_messages</code>, and <code>pages_manage_metadata</code>.</span>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <span style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'var(--border)',
                    color: 'var(--text)',
                    fontWeight: '800',
                    fontSize: '0.72rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>4</span>
                  <span>Copy the generated token, paste it in the Page Access Token field on the left, and click <strong>Connect</strong>.</span>
                </div>
              </div>

              <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                <a
                  href="https://developers.facebook.com/tools/explorer/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    color: 'var(--text)',
                    textDecoration: 'none'
                  }}
                >
                  <span>Open Meta Graph API Explorer</span>
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>

            {/* Privacy & Safety Note */}
            <div style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <Lock size={16} color="#71717a" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Your access token is stored securely on the server and only used to talk to Meta's Graph API.
              </div>
            </div>
          </div>
        </div>

        {/* Feature Previews Grid */}
        <div className="connect-features-grid">
          <div style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <Bot size={18} color="#09090b" />
            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text)' }}>AI DM Replies</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Automate direct messages with your personal voice, humor, and texting cadence.
            </div>
          </div>

          <div style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <Sparkles size={18} color="#09090b" />
            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text)' }}>Social Graph</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Map your relationship tiers, track shared memories, and personalize responses.
            </div>
          </div>

          <div style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <Sliders size={18} color="#09090b" />
            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text)' }}>Chat Rules</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Granular controls over who the AI responds to and specific forbidden phrases.
            </div>
          </div>

          <div style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <Instagram size={18} color="#09090b" />
            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text)' }}>Media Vault</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Automatically dispatch your portfolio reels, GIFs, and media assets in chat.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
