'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Briefcase, User, Sparkles, Bot, ShieldCheck, Check,
  ArrowRight, ArrowLeft, RefreshCw, Sliders, CheckCircle2,
  Building2, MessageSquare, Zap, Film, Instagram, X, Globe,
  ExternalLink, ChevronDown, ChevronUp, Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function OnboardingWizard({ isOpen, onComplete, onClose }) {
  const { user, token, API_BASE, updateUserProfile, showToast, setRoutingConfigState } = useApp();

  const TOTAL_STEPS = 5;
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [error, setError] = useState('');
  const [showManualToken, setShowManualToken] = useState(false);

  // STEP 1: Instagram Connection & Token
  const [instagramUsername, setInstagramUsername] = useState(user?.instagramUsername || '');
  const [instagramPageAccessToken, setInstagramPageAccessToken] = useState('');
  const [instagramAccountId, setInstagramAccountId] = useState(user?.instagramId || '');

  // STEP 2: Account Purpose
  const [accountType, setAccountType] = useState('business'); // 'business' | 'personal'

  // STEP 3: Details & Services
  // Business fields
  const [businessName, setBusinessName] = useState('');
  const [businessCategory, setBusinessCategory] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [businessWebsite, setBusinessWebsite] = useState('');
  // Personal fields
  const [creatorBio, setCreatorBio] = useState('');
  const [creatorTextingHabits, setCreatorTextingHabits] = useState('Casual, uses emojis, short friendly sentences');
  const [creatorMemeStyle, setCreatorMemeStyle] = useState('React with laughs, playful comments, witty banter');

  // STEP 4: AI Persona Tone & Greeting
  const [personaTone, setPersonaTone] = useState('friendly'); // 'professional' | 'friendly' | 'witty' | 'roast'
  const [greetingMessage, setGreetingMessage] = useState('Hey there! Thanks for reaching out. How can I help you today?');

  // STEP 5: Automation Policy
  const [chatMode, setChatMode] = useState('everyone'); // 'everyone' | 'everyone_except' | 'only_selected'
  const [enableGlobalBot, setEnableGlobalBot] = useState(true);

  // Sync user credentials if available
  useEffect(() => {
    if (user) {
      if (user.instagramUsername && !instagramUsername) setInstagramUsername(user.instagramUsername);
      if (user.instagramId && !instagramAccountId) setInstagramAccountId(user.instagramId);
      if (user.businessProfile?.businessName && !businessName) setBusinessName(user.businessProfile.businessName);
      if (user.businessProfile?.category && !businessCategory) setBusinessCategory(user.businessProfile.category);
    }
  }, [user]);

  // Listen for OAuth postMessage from login popup window
  useEffect(() => {
    const handleOAuthMessage = (event) => {
      if (event.data?.type === 'INSTAGRAM_OAUTH_SUCCESS') {
        const { instagramUsername: igUser, instagramAccountId: igId, instagramPageAccessToken: igToken } = event.data.payload || {};
        if (igUser) setInstagramUsername(igUser);
        if (igId) setInstagramAccountId(igId);
        if (igToken) setInstagramPageAccessToken(igToken);
        setOauthConnecting(false);
        showToast?.(`Instagram connected: @${igUser || 'account'}!`, 'success');
      } else if (event.data?.type === 'INSTAGRAM_OAUTH_ERROR') {
        setOauthConnecting(false);
        setError(event.data.error || 'Instagram connection cancelled or failed. You can enter credentials manually.');
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [showToast]);

  if (!isOpen) return null;

  const handleLaunchInstagramOAuth = () => {
    setError('');
    setOauthConnecting(true);
    try {
      const clientOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const oauthUrl = `${API_BASE}/api/auth/instagram/connect?origin=${encodeURIComponent(clientOrigin)}&token=${encodeURIComponent(token || '')}`;
      const popup = window.open(oauthUrl, 'instagram_oauth', 'width=620,height=720,left=250,top=100');
      if (!popup) {
        setOauthConnecting(false);
        setError('Popup was blocked by your browser. Please allow popups for this site or enter your token below.');
        setShowManualToken(true);
      }
    } catch (e) {
      setOauthConnecting(false);
      setError('Failed to open login dialog: ' + e.message);
    }
  };

  const handleCloseOrSkip = async () => {
    try {
      const dismissKey = user?._id ? `chatter_onboarding_dismissed_${user._id}` : 'chatter_onboarding_dismissed';
      sessionStorage.setItem(dismissKey, 'true');
    } catch (e) {}

    try {
      if (token) {
        fetch(`${API_BASE}/api/auth/onboarding/skip`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }).then(res => res.json()).then(data => {
          if (data.user) {
            updateUserProfile({ isOnboarded: true });
          }
        }).catch(() => {});
      }
    } catch (e) {}

    if (onClose) onClose();
  };

  const handleNext = () => {
    setError('');
    if (step === 2 && accountType === 'business' && !businessName.trim()) {
      setError('Please enter your business or brand name.');
      return;
    }
    setStep(prev => Math.min(TOTAL_STEPS, prev + 1));
  };

  const handleBack = () => {
    setError('');
    setStep(prev => Math.max(1, prev - 1));
  };

  const handleFinish = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          accountType,
          businessProfile: accountType === 'business' ? {
            businessName: businessName.trim(),
            category: businessCategory.trim(),
            description: businessDescription.trim(),
            website: businessWebsite.trim(),
          } : {
            creatorBio: creatorBio.trim(),
            textingHabits: creatorTextingHabits.trim(),
            memeStyle: creatorMemeStyle.trim(),
          },
          personaTone,
          greetingMessage: greetingMessage.trim(),
          chatMode,
          enableGlobalBot,
          instagramUsername: instagramUsername.trim(),
          instagramPageAccessToken: instagramPageAccessToken.trim(),
          instagramAccountId: instagramAccountId.trim(),
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete configuration.');
      }

      // Update local context
      updateUserProfile({
        isOnboarded: true,
        accountType,
        businessProfile: data.user?.businessProfile,
        instagramUsername: data.user?.instagramUsername || instagramUsername.trim(),
        instagramId: data.user?.instagramId || instagramAccountId.trim(),
        hasInstagramToken: Boolean(data.user?.hasInstagramToken || instagramPageAccessToken.trim()),
        isInstagramConnected: Boolean(data.user?.isInstagramConnected || instagramPageAccessToken.trim()),
        instagramPageAccessToken: instagramPageAccessToken.trim(),
      });

      if (setRoutingConfigState) {
        setRoutingConfigState(prev => ({
          ...prev,
          chatMode,
          globalBotActive: enableGlobalBot
        }));
      }

      showToast?.('Workspace configured successfully! Welcome aboard.', 'success');
      if (onComplete) onComplete(data.user);
      if (onClose) onClose();
    } catch (err) {
      console.error('Onboarding save error:', err);
      setError(err.message || 'Error saving onboarding preferences.');
    } finally {
      setLoading(false);
    }
  };

  const isConnected = Boolean(instagramPageAccessToken || (instagramAccountId && instagramUsername));

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(9, 9, 11, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '16px',
      boxSizing: 'border-box'
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: '100%',
          maxWidth: '580px',
          maxHeight: '90vh',
          background: 'var(--color-surface)',
          borderRadius: '16px',
          boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header Bar */}
        <div style={{
          padding: '18px 24px 14px 24px',
          borderBottom: '1px solid var(--color-surface-hover)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              background: 'var(--color-text-primary)',
              color: 'var(--color-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '800',
              fontSize: '0.75rem'
            }}>
              C
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: '800', letterSpacing: '-0.3px', color: 'var(--color-text-primary)' }}>
              CHATTER OS // SETUP WIZARD
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: '700',
              fontFamily: "'JetBrains Mono', monospace",
              color: 'var(--color-text-secondary)'
            }}>
              STEP {step} OF {TOTAL_STEPS}
            </span>
            <button
              type="button"
              onClick={handleCloseOrSkip}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                borderRadius: '4px',
                display: 'flex'
              }}
              title="Close or Skip for now"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 5-Step Segmented Progress Bar */}
        <div style={{ display: 'flex', width: '100%', height: '3px', background: 'var(--color-surface-hover)' }}>
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                background: s <= step ? 'var(--color-text-primary)' : 'transparent',
                transition: 'background 0.3s ease'
              }}
            />
          ))}
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{
              background: 'color-mix(in srgb, #ef4444 12%, transparent)',
              border: '1px solid color-mix(in srgb, #ef4444 35%, transparent)',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#f87171',
              fontSize: '0.8rem',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              STEP 1: CONNECT INSTAGRAM (FIRST!)
              ═══════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: '1.28rem', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.4px' }}>
                Connect Your Instagram
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '4px', marginBottom: '20px' }}>
                Authorize your Instagram account to unlock automated direct messages, relationship intelligence, and smart memory.
              </p>

              {/* Connected Status Card */}
              {isConnected ? (
                <div style={{
                  background: 'color-mix(in srgb, #22c55e 12%, transparent)',
                  border: '1.5px solid color-mix(in srgb, #22c55e 45%, transparent)',
                  borderRadius: '12px',
                  padding: '18px 20px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-surface)'
                    }}>
                      <Instagram size={22} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: '800', fontSize: '0.94rem', color: '#4ade80' }}>
                          @{instagramUsername || 'Instagram Account'}
                        </span>
                        <span style={{
                          fontSize: '0.64rem',
                          fontWeight: '800',
                          fontFamily: "'JetBrains Mono', monospace",
                          background: 'color-mix(in srgb, #22c55e 14%, transparent)',
                          color: '#4ade80',
                          padding: '1px 6px',
                          borderRadius: '4px'
                        }}>
                          LINKED
                        </span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#4ade80', marginTop: '2px', fontFamily: "'JetBrains Mono', monospace" }}>
                        ID: {instagramAccountId || 'Connected'} • Page Token Active
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleLaunchInstagramOAuth}
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid color-mix(in srgb, #22c55e 35%, transparent)',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '0.74rem',
                      fontWeight: '700',
                      color: '#4ade80',
                      cursor: 'pointer'
                    }}
                  >
                    Change Account
                  </button>
                </div>
              ) : (
                /* Primary 1-Click Login Popup Button */
                <div style={{ marginBottom: '22px' }}>
                  <button
                    type="button"
                    onClick={handleLaunchInstagramOAuth}
                    disabled={oauthConnecting}
                    style={{
                      width: '100%',
                      background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
                      color: 'var(--color-surface)',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      fontWeight: '800',
                      fontSize: '0.92rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      cursor: oauthConnecting ? 'wait' : 'pointer',
                      boxShadow: '0 6px 20px rgba(214, 36, 159, 0.25)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {oauthConnecting ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        <span>Connecting via Meta Dialog...</span>
                      </>
                    ) : (
                      <>
                        <Instagram size={20} />
                        <span>Log in with Instagram &amp; Authorize</span>
                        <ExternalLink size={16} />
                      </>
                    )}
                  </button>
                  <p style={{ fontSize: '0.73rem', color: 'var(--color-text-secondary)', textAlign: 'center', marginTop: '8px' }}>
                    Opens official Meta authorization popup. Grants permissions and fills your token automatically.
                  </p>
                </div>
              )}

              {/* Expandable Manual Credentials Override */}
              <div style={{
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: '14px 16px',
                marginBottom: '10px'
              }}>
                <div
                  onClick={() => setShowManualToken(!showManualToken)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Lock size={14} color="var(--color-text-secondary)" />
                    <span style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                      Manual Credentials Override
                    </span>
                  </div>
                  {showManualToken ? <ChevronUp size={14} color="var(--color-text-secondary)" /> : <ChevronDown size={14} color="var(--color-text-secondary)" />}
                </div>

                {showManualToken && (
                  <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: 'var(--color-text-secondary)', marginBottom: '3px' }}>
                          Instagram Handle
                        </label>
                        <input
                          type="text"
                          value={instagramUsername}
                          onChange={(e) => setInstagramUsername(e.target.value)}
                          placeholder="e.g. ar_amx86"
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            fontSize: '0.8rem',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: 'var(--color-text-secondary)', marginBottom: '3px' }}>
                          Account / Page ID
                        </label>
                        <input
                          type="text"
                          value={instagramAccountId}
                          onChange={(e) => setInstagramAccountId(e.target.value)}
                          placeholder="e.g. 1052952240901611"
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            fontSize: '0.8rem',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: 'var(--color-text-secondary)', marginBottom: '3px' }}>
                        Page Access Token (starts with IGA... or EAA...)
                      </label>
                      <input
                        type="password"
                        value={instagramPageAccessToken}
                        onChange={(e) => setInstagramPageAccessToken(e.target.value)}
                        placeholder="Paste Meta Page Access Token (optional / override)"
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface)',
                          fontSize: '0.78rem',
                          fontFamily: "'JetBrains Mono', monospace",
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              STEP 2: ACCOUNT PURPOSE (PERSONAL VS BUSINESS)
              ═══════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: '1.28rem', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.4px' }}>
                Choose Your Account Type
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '4px', marginBottom: '20px' }}>
                Select your primary workflow. We adapt your AI chat prompts, tone guidelines, and memory models accordingly.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                {/* Personal Option */}
                <div
                  onClick={() => setAccountType('personal')}
                  style={{
                    border: '1.5px solid',
                    borderColor: accountType === 'personal' ? 'var(--color-text-primary)' : 'var(--color-border)',
                    background: accountType === 'personal' ? 'var(--color-surface-elevated)' : 'var(--color-surface)',
                    borderRadius: '12px',
                    padding: '18px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: accountType === 'personal' ? '0 4px 12px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: accountType === 'personal' ? 'var(--color-text-primary)' : 'var(--color-surface-hover)',
                      color: accountType === 'personal' ? 'var(--color-surface)' : 'var(--color-text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '12px'
                    }}>
                      <User size={18} />
                    </div>
                    <div style={{ fontWeight: '800', fontSize: '0.94rem', color: 'var(--color-text-primary)' }}>
                      Personal &amp; Creator
                    </div>
                    <p style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginTop: '6px', lineHeight: 1.4 }}>
                      Natural casual chat, friendly humor, witty reactions to shared reels/memes, and friend memory recall.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '12px' }}>
                    <div style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      border: accountType === 'personal' ? '4px solid var(--color-text-primary)' : '1.5px solid var(--color-border-strong)'
                    }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: accountType === 'personal' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                      {accountType === 'personal' ? 'Selected' : 'Select'}
                    </span>
                  </div>
                </div>

                {/* Business Option */}
                <div
                  onClick={() => setAccountType('business')}
                  style={{
                    border: '1.5px solid',
                    borderColor: accountType === 'business' ? 'var(--color-text-primary)' : 'var(--color-border)',
                    background: accountType === 'business' ? 'var(--color-surface-elevated)' : 'var(--color-surface)',
                    borderRadius: '12px',
                    padding: '18px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: accountType === 'business' ? '0 4px 12px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: accountType === 'business' ? 'var(--color-text-primary)' : 'var(--color-surface-hover)',
                      color: accountType === 'business' ? 'var(--color-surface)' : 'var(--color-text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '12px'
                    }}>
                      <Briefcase size={18} />
                    </div>
                    <div style={{ fontWeight: '800', fontSize: '0.94rem', color: 'var(--color-text-primary)' }}>
                      Business &amp; Brand
                    </div>
                    <p style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginTop: '6px', lineHeight: 1.4 }}>
                      Automate customer inquiries, appointments, services, FAQs, and product links professionally.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '12px' }}>
                    <div style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      border: accountType === 'business' ? '4px solid var(--color-text-primary)' : '1.5px solid var(--color-border-strong)'
                    }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: accountType === 'business' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                      {accountType === 'business' ? 'Selected' : 'Select'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              STEP 3: DETAILS & SERVICES (BASED ON CHOICE!)
              ═══════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <div>
              {accountType === 'business' ? (
                <div>
                  <h2 style={{ fontSize: '1.28rem', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.4px' }}>
                    Business Profile &amp; Services
                  </h2>
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '4px', marginBottom: '18px' }}>
                    Give your AI assistant context about your brand, services, and offers to answer customer inquiries.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                          Business / Brand Name *
                        </label>
                        <input
                          type="text"
                          value={businessName}
                          onChange={(e) => setBusinessName(e.target.value)}
                          placeholder="e.g. Acme Agency"
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border)',
                            fontSize: '0.82rem',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                          Industry / Category
                        </label>
                        <input
                          type="text"
                          value={businessCategory}
                          onChange={(e) => setBusinessCategory(e.target.value)}
                          placeholder="e.g. Creator Agency, E-commerce"
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border)',
                            fontSize: '0.82rem',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                        Products, Services &amp; Offers
                      </label>
                      <textarea
                        rows={3}
                        value={businessDescription}
                        onChange={(e) => setBusinessDescription(e.target.value)}
                        placeholder="Describe what services you provide, package pricing, or how you help clients..."
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          fontSize: '0.82rem',
                          boxSizing: 'border-box',
                          fontFamily: 'inherit'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                        Website or Booking Link
                      </label>
                      <input
                        type="url"
                        value={businessWebsite}
                        onChange={(e) => setBusinessWebsite(e.target.value)}
                        placeholder="https://yourbrand.com/book"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          fontSize: '0.82rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <h2 style={{ fontSize: '1.28rem', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.4px' }}>
                    Personal Style &amp; Interests
                  </h2>
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '4px', marginBottom: '18px' }}>
                    Teach the AI your personality, slang, and how you chat with friends so it speaks just like you.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                        About You, Hobbies &amp; Interests
                      </label>
                      <textarea
                        rows={2}
                        value={creatorBio}
                        onChange={(e) => setCreatorBio(e.target.value)}
                        placeholder="e.g. Tech founder, loves fitness, watches Formula 1, photography enthusiast..."
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          fontSize: '0.82rem',
                          boxSizing: 'border-box',
                          fontFamily: 'inherit'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                        Texting Style &amp; Slang
                      </label>
                      <input
                        type="text"
                        value={creatorTextingHabits}
                        onChange={(e) => setCreatorTextingHabits(e.target.value)}
                        placeholder="e.g. Lowercase, friendly banter, uses 'haha', quick one-liners"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          fontSize: '0.82rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                        Meme &amp; Shared Reels Reaction Style
                      </label>
                      <input
                        type="text"
                        value={creatorMemeStyle}
                        onChange={(e) => setCreatorMemeStyle(e.target.value)}
                        placeholder="e.g. Laugh out loud, witty roast, or tag along with a question"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          fontSize: '0.82rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              STEP 4: AI PERSONA TONE & GREETING
              ═══════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <div>
              <h2 style={{ fontSize: '1.28rem', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.4px' }}>
                AI Persona Tone &amp; Greeting
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '4px', marginBottom: '18px' }}>
                Select how your AI sounds when replying to inbound direct messages.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
                {[
                  { id: 'friendly', title: 'Friendly & Warm', badge: 'CASUAL', desc: 'Approachable, warm, conversational, uses emojis naturally.' },
                  { id: 'professional', title: 'Professional & Polite', badge: 'BUSINESS', desc: 'Direct, polite, structured sentences, suitable for executive brands.' },
                  { id: 'witty', title: 'Witty & Humorous', badge: 'PLAYFUL', desc: 'Fast comebacks, intelligent humor, energetic conversationalist.' },
                  { id: 'roast', title: 'Savage / Roast Mode', badge: 'BANTER', desc: 'Bold banter, playful roasts, meme culture responses.' }
                ].map((tone) => {
                  const isSelected = personaTone === tone.id;
                  return (
                    <div
                      key={tone.id}
                      onClick={() => setPersonaTone(tone.id)}
                      style={{
                        border: '1.5px solid',
                        borderColor: isSelected ? 'var(--color-text-primary)' : 'var(--color-border)',
                        background: isSelected ? 'var(--color-surface-elevated)' : 'var(--color-surface)',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: '800', fontSize: '0.88rem', color: 'var(--color-text-primary)' }}>
                            {tone.title}
                          </span>
                          <span style={{
                            fontSize: '0.62rem',
                            fontWeight: '700',
                            fontFamily: "'JetBrains Mono', monospace",
                            background: isSelected ? 'var(--color-text-primary)' : 'var(--color-surface-hover)',
                            color: isSelected ? 'var(--color-surface)' : 'var(--color-text-secondary)',
                            padding: '1px 6px',
                            borderRadius: '4px'
                          }}>
                            {tone.badge}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', margin: '3px 0 0 0' }}>
                          {tone.desc}
                        </p>
                      </div>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        border: isSelected ? '5px solid var(--color-text-primary)' : '1.5px solid var(--color-border-strong)',
                        flexShrink: 0
                      }} />
                    </div>
                  );
                })}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                  Default Opening Greeting
                </label>
                <textarea
                  rows={2}
                  value={greetingMessage}
                  onChange={(e) => setGreetingMessage(e.target.value)}
                  placeholder="Greeting sent when a new contact messages..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    fontSize: '0.82rem',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              STEP 5: AUTOMATION POLICY & SUMMARY REVIEW
              ═══════════════════════════════════════════════════════════ */}
          {step === 5 && (
            <div>
              <h2 style={{ fontSize: '1.28rem', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.4px' }}>
                Summary &amp; Automation Policy
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '4px', marginBottom: '16px' }}>
                Confirm your configuration and activate your Instagram AI Bot.
              </p>

              {/* Summary Card */}
              <div style={{
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: '14px 16px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '0.68rem', fontWeight: '800', color: 'var(--color-text-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Configuration Overview
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.76rem' }}>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Instagram:</span>{' '}
                    <strong style={{ color: 'var(--color-text-primary)' }}>@{instagramUsername || 'Not connected'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Account Tier:</span>{' '}
                    <strong style={{ color: 'var(--color-text-primary)' }}>{accountType === 'business' ? 'Business & Brand' : 'Personal & Creator'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>AI Tone:</span>{' '}
                    <strong style={{ color: 'var(--color-text-primary)' }}>{personaTone.toUpperCase()}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Status:</span>{' '}
                    <strong style={{ color: isConnected ? '#4ade80' : '#fbbf24' }}>
                      {isConnected ? 'Ready to Automate' : 'Credentials Needed'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Chat Mode Radios */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {[
                  { id: 'everyone', title: 'Auto-reply to Everyone', desc: 'AI handles DMs from everyone (customers, followers, new inquiries).' },
                  { id: 'everyone_except', title: 'Everyone EXCEPT selected friends', desc: 'AI handles general inquiries, while letting you chat manually with close contacts.' },
                  { id: 'only_selected', title: 'ONLY Selected Contacts (Whitelist)', desc: 'AI only replies to verified contacts you explicitly enable in Chat Rules.' }
                ].map(mode => {
                  const isSelected = chatMode === mode.id;
                  return (
                    <div
                      key={mode.id}
                      onClick={() => setChatMode(mode.id)}
                      style={{
                        border: '1px solid',
                        borderColor: isSelected ? 'var(--color-text-primary)' : 'var(--color-border)',
                        background: isSelected ? 'var(--color-surface-elevated)' : 'var(--color-surface)',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '0.82rem', color: 'var(--color-text-primary)' }}>
                          {mode.title}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                          {mode.desc}
                        </div>
                      </div>
                      <div style={{
                        width: '14px',
                        height: '14px',
                        borderRadius: '50%',
                        border: isSelected ? '4.5px solid var(--color-text-primary)' : '1.5px solid var(--color-border-strong)',
                        flexShrink: 0
                      }} />
                    </div>
                  );
                })}
              </div>

              {/* Master AI Bot Toggle */}
              <div style={{
                background: 'var(--color-surface-hover)',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={16} color="var(--color-text-primary)" />
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '0.8rem', color: 'var(--color-text-primary)' }}>
                      Activate Instagram AI Bot Automation
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                      The AI bot will start responding automatically to incoming Instagram messages.
                    </div>
                  </div>
                </div>

                <label style={{ position: 'relative', display: 'inline-block', width: '38px', height: '22px', flexShrink: 0, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={enableGlobalBot}
                    onChange={(e) => setEnableGlobalBot(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: enableGlobalBot ? '#16a34a' : 'var(--color-border-strong)',
                    borderRadius: '22px',
                    transition: '0.2s'
                  }}>
                    <span style={{
                      position: 'absolute',
                      content: '""',
                      height: '16px',
                      width: '16px',
                      left: enableGlobalBot ? '19px' : '3px',
                      bottom: '3px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: '0.2s'
                    }} />
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div style={{
          padding: '16px 24px',
          background: 'var(--color-surface-elevated)',
          borderTop: '1px solid var(--color-surface-hover)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCloseOrSkip}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={handleNext}
                style={{
                  background: 'var(--color-text-primary)',
                  color: 'var(--color-surface)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 18px',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}
              >
                <span>Continue</span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={loading}
                style={{
                  background: 'var(--color-text-primary)',
                  color: 'var(--color-surface)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 20px',
                  fontSize: '0.82rem',
                  fontWeight: '800',
                  cursor: loading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.18)'
                }}
              >
                {loading ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Complete Setup &amp; Launch</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
