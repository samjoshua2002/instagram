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
  ExternalLink
} from 'lucide-react';

export default function InstagramConnectFallback({ onConnect, user }) {
  const { token, API_BASE, updateUserProfile, showToast } = useApp();

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

  // Listen for OAuth postMessage from login popup window
  React.useEffect(() => {
    const handleOAuthMessage = (event) => {
      if (event.data?.type === 'INSTAGRAM_OAUTH_SUCCESS') {
        const { instagramUsername: igUser, instagramAccountId: igId, instagramPageAccessToken: igToken } = event.data.payload || {};
        if (igUser) setHandle(igUser);
        if (igId) setAccountId(igId);
        if (igToken) setAccessToken(igToken);
        setOauthConnecting(false);
        if (updateUserProfile) {
          updateUserProfile({
            hasInstagramToken: true,
            isInstagramConnected: true,
            instagramPageAccessToken: igToken,
            instagramAccountId: igId,
            instagramUsername: igUser,
          });
        }
        showToast?.(`Instagram connected: @${igUser || 'account'}! Automation active.`, 'success');
      } else if (event.data?.type === 'INSTAGRAM_OAUTH_ERROR') {
        setOauthConnecting(false);
        setErrorMsg(event.data.error || 'Instagram connection cancelled or failed.');
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [showToast, updateUserProfile]);

  const handleLaunchInstagramOAuth = () => {
    setErrorMsg('');
    setOauthConnecting(true);
    try {
      const clientOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const oauthUrl = `${API_BASE}/api/auth/instagram/connect?origin=${encodeURIComponent(clientOrigin)}&token=${encodeURIComponent(token || '')}`;
      const popup = window.open(oauthUrl, 'instagram_oauth', 'width=620,height=720,left=250,top=100');
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
            instagramId: cleanAccountId,
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

  const username = user?.instagramUsername || user?.username || 'Creator';

  return (
    <div style={{
      width: '100%',
      minHeight: '100%',
      padding: '36px 40px',
      background: '#ffffff',
      boxSizing: 'border-box',
      overflowY: 'auto'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        {/* Breadcrumb & Header */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#f4f4f5',
            border: '1px solid #e4e4e7',
            borderRadius: '999px',
            padding: '3px 12px',
            fontSize: '0.68rem',
            fontWeight: '800',
            fontFamily: "'JetBrains Mono', monospace",
            color: '#52525b',
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
            marginBottom: '14px'
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }} />
            WORKSPACE // 00 // INTEGRATION SETUP
          </div>

          <h1 style={{
            fontSize: '1.95rem',
            fontWeight: '800',
            color: '#09090b',
            letterSpacing: '-0.6px',
            margin: '0 0 8px 0',
            lineHeight: 1.2
          }}>
            Connect your Instagram handle to activate chat automation
          </h1>
          <p style={{
            fontSize: '0.9rem',
            color: '#71717a',
            lineHeight: 1.55,
            margin: 0,
            maxWidth: '720px'
          }}>
            Link your Instagram account credentials to unlock live contact relationship graphs, AI-powered direct message replies, memory tracking, and custom automation rules.
          </p>
        </div>

        {/* Error message if any */}
        {errorMsg && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            borderRadius: '10px',
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

        {/* Account Info Pill */}
        <div style={{
          width: '100%',
          background: '#fafafa',
          border: '1px solid #e4e4e7',
          borderRadius: '12px',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: '#e4e4e7',
              color: '#18181b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '800',
              fontSize: '0.92rem'
            }}>
              {username[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#09090b' }}>
                @{username.replace(/^@/, '')}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#71717a' }}>
                {user?.accountType ? `${user.accountType.charAt(0).toUpperCase() + user.accountType.slice(1)} Tier` : 'Creator Account'}
                {user?.email ? ` • ${user.email}` : ''}
              </div>
            </div>
          </div>
          <span style={{
            fontSize: '0.7rem',
            fontWeight: '800',
            fontFamily: "'JetBrains Mono', monospace",
            background: '#fef3c7',
            color: '#b45309',
            border: '1px solid #fde68a',
            padding: '4px 10px',
            borderRadius: '6px'
          }}>
            ACTION REQUIRED // NOT CONNECTED
          </span>
        </div>

        {/* Main 2-Column Section */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.95fr', gap: '24px', marginBottom: '32px' }}>
          {/* Direct Credentials Form Card */}
          <div style={{
            background: '#fafafa',
            border: '1px solid #e4e4e7',
            borderRadius: '14px',
            padding: '26px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h2 style={{
                fontSize: '1.1rem',
                fontWeight: '700',
                color: '#09090b',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Key size={18} />
                <span>Instagram API Credentials</span>
              </h2>
              <span style={{ fontSize: '0.72rem', background: '#ffffff', border: '1px solid #e4e4e7', color: '#71717a', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                Direct Setup
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '20px', lineHeight: 1.45 }}>
              Connect directly via Meta to automatically generate and save your Page Access Token, or enter your credentials manually below.
            </p>

            {/* One-Click Meta OAuth Connect Button */}
            <div style={{ marginBottom: '22px' }}>
              <button
                type="button"
                onClick={handleLaunchInstagramOAuth}
                disabled={oauthConnecting}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '11px',
                  padding: '13px 20px',
                  fontSize: '0.88rem',
                  fontWeight: '700',
                  cursor: oauthConnecting ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '9px',
                  boxShadow: '0 6px 20px rgba(124, 58, 237, 0.25)',
                  transition: 'all 0.15s ease'
                }}
              >
                {oauthConnecting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Connecting via Meta OAuth...</span>
                  </>
                ) : (
                  <>
                    <Instagram size={17} />
                    <span>Log in with Instagram &amp; Auto-Generate Token</span>
                    <Zap size={15} />
                  </>
                )}
              </button>
              <span style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '6px', display: 'block', textAlign: 'center' }}>
                Opens official Meta dialog to automatically link your Page Access Token &amp; Account ID.
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={{ flex: 1, height: '1px', background: '#e4e4e7' }} />
              <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Or Enter / Update Token Manually
              </span>
              <div style={{ flex: 1, height: '1px', background: '#e4e4e7' }} />
            </div>

            <form onSubmit={handleConnectDirectly} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', textTransform: 'uppercase', color: '#52525b', marginBottom: '6px' }}>
                  Instagram Handle
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="e.g. ar_amx86"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #e4e4e7',
                      background: '#ffffff',
                      fontSize: '0.86rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', textTransform: 'uppercase', color: '#52525b', marginBottom: '6px' }}>
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
                    border: '1px solid #e4e4e7',
                    background: '#ffffff',
                    fontSize: '0.86rem',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.76rem', fontWeight: '700', textTransform: 'uppercase', color: '#52525b' }}>
                    Page Access Token
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#71717a',
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
                    border: '1px solid #e4e4e7',
                    background: '#ffffff',
                    fontSize: '0.86rem',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box'
                  }}
                />
                <span style={{ fontSize: '0.72rem', color: '#a1a1aa', marginTop: '4px', display: 'block' }}>
                  Meta Graph API User/Page Access Token with direct messaging permissions.
                </span>
              </div>

              <button
                type="submit"
                disabled={saving}
                style={{
                  width: '100%',
                  background: '#09090b',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
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
                  marginTop: '6px'
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
                    <span>Connect Instagram &amp; Activate Automation</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px' }}>
              <button
                type="button"
                onClick={onConnect}
                style={{
                  flex: 1,
                  background: '#ffffff',
                  color: '#09090b',
                  border: '1px solid #e4e4e7',
                  borderRadius: '9px',
                  padding: '9px 14px',
                  fontSize: '0.78rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Layers size={14} />
                <span>Open Guided Wizard</span>
              </button>

              <Link
                href="/settings"
                style={{
                  flex: 1,
                  background: '#ffffff',
                  color: '#52525b',
                  border: '1px solid #e4e4e7',
                  borderRadius: '9px',
                  padding: '9px 14px',
                  fontSize: '0.78rem',
                  fontWeight: '600',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Settings size={14} />
                <span>Persona &amp; Style Settings</span>
              </Link>
            </div>
          </div>

          {/* Guide / Instructions Card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{
              background: '#fafafa',
              border: '1px solid #e4e4e7',
              borderRadius: '14px',
              padding: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{
                  fontSize: '0.98rem',
                  fontWeight: '700',
                  color: '#09090b',
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
                    background: '#e4e4e7',
                    color: '#09090b',
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
                    background: '#e4e4e7',
                    color: '#09090b',
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
                    background: '#e4e4e7',
                    color: '#09090b',
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
                    background: '#e4e4e7',
                    color: '#09090b',
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

              <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #e4e4e7' }}>
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
                    color: '#09090b',
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
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <Lock size={16} color="#64748b" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.76rem', color: '#64748b', lineHeight: 1.45 }}>
                Your access token is encrypted in MongoDB and never shared. Only the authenticated automation engine communicates with Meta's official Graph API.
              </div>
            </div>
          </div>
        </div>

        {/* Feature Previews Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '14px'
        }}>
          <div style={{
            background: '#fafafa',
            border: '1px solid #e4e4e7',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <Bot size={18} color="#09090b" />
            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#09090b' }}>AI DM Replies</div>
            <div style={{ fontSize: '0.72rem', color: '#71717a', lineHeight: 1.4 }}>
              Automate direct messages with your personal voice, humor, and texting cadence.
            </div>
          </div>

          <div style={{
            background: '#fafafa',
            border: '1px solid #e4e4e7',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <Sparkles size={18} color="#09090b" />
            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#09090b' }}>Social Graph</div>
            <div style={{ fontSize: '0.72rem', color: '#71717a', lineHeight: 1.4 }}>
              Map your relationship tiers, track shared memories, and personalize responses.
            </div>
          </div>

          <div style={{
            background: '#fafafa',
            border: '1px solid #e4e4e7',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <Sliders size={18} color="#09090b" />
            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#09090b' }}>Chat Rules</div>
            <div style={{ fontSize: '0.72rem', color: '#71717a', lineHeight: 1.4 }}>
              Granular controls over who the AI responds to and specific forbidden phrases.
            </div>
          </div>

          <div style={{
            background: '#fafafa',
            border: '1px solid #e4e4e7',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <Instagram size={18} color="#09090b" />
            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#09090b' }}>Media Vault</div>
            <div style={{ fontSize: '0.72rem', color: '#71717a', lineHeight: 1.4 }}>
              Automatically dispatch your portfolio reels, GIFs, and media assets in chat.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
