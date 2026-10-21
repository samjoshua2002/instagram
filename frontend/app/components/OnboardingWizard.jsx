'use client';

import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Briefcase, User, Sparkles, Bot, ShieldCheck, Check,
  ArrowRight, ArrowLeft, RefreshCw, Sliders, CheckCircle2,
  Building2, MessageSquare, Zap, Film, Instagram, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function OnboardingWizard({ isOpen, onComplete, onClose }) {
  const { user, token, API_BASE, updateUserProfile, showToast, setRoutingConfigState } = useApp();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [accountType, setAccountType] = useState('business'); // 'business' | 'personal'
  const [businessName, setBusinessName] = useState('');
  const [businessCategory, setBusinessCategory] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');

  // AI Tone
  const [personaTone, setPersonaTone] = useState('friendly'); // 'professional' | 'friendly' | 'witty' | 'roast'
  const [greetingMessage, setGreetingMessage] = useState('Hey there! Thanks for reaching out. How can I help you today?');

  // Automation Policy
  const [chatMode, setChatMode] = useState('everyone'); // 'everyone' | 'everyone_except' | 'only_selected'
  const [enableGlobalBot, setEnableGlobalBot] = useState(true);

  // Instagram Connection & Token
  const [instagramUsername, setInstagramUsername] = useState(user?.instagramUsername || '');
  const [instagramPageAccessToken, setInstagramPageAccessToken] = useState('');
  const [instagramAccountId, setInstagramAccountId] = useState(user?.instagramId || '');

  React.useEffect(() => {
    if (user) {
      if (user.instagramUsername) setInstagramUsername(user.instagramUsername);
      if (user.instagramId) setInstagramAccountId(user.instagramId);
    }
  }, [user]);

  if (!isOpen) return null;

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
    if (step === 1 && accountType === 'business' && !businessName.trim()) {
      setError('Please enter your business or brand name.');
      return;
    }
    setStep(prev => prev + 1);
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
            description: businessDescription.trim()
          } : undefined,
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
    } catch (err) {
      console.error('Onboarding save error:', err);
      setError(err.message || 'Error saving onboarding preferences.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(9, 9, 11, 0.90)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '620px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.35)',
          border: '1px solid #e4e4e7',
          overflow: 'hidden'
        }}
      >
        {/* Wizard Header & Progress */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid #f4f4f5',
          background: '#fafafa'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: '#09090b',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '800',
                fontSize: '0.85rem'
              }}>
                C
              </div>
              <span style={{ fontWeight: '800', fontSize: '0.85rem', letterSpacing: '-0.3px', color: '#09090b' }}>
                CHATTER OS // SETUP WIZARD
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: '700',
                fontFamily: "'JetBrains Mono', monospace",
                background: '#f4f4f5',
                border: '1px solid #e4e4e7',
                padding: '3px 8px',
                borderRadius: '999px',
                color: '#71717a'
              }}>
                STEP {step} OF 3
              </span>
              <button
                type="button"
                onClick={handleCloseOrSkip}
                aria-label="Close setup wizard"
                title="Close / Cancel Setup"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#71717a',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  padding: 0
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
            {[1, 2, 3].map(i => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: '4px',
                  borderRadius: '2px',
                  background: step >= i ? '#09090b' : '#e4e4e7',
                  transition: 'background 0.3s ease'
                }}
              />
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#b91c1c',
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

          {/* STEP 1: ACCOUNT PURPOSE */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: '1.28rem', fontWeight: '800', color: '#09090b', margin: 0, letterSpacing: '-0.4px' }}>
                How do you plan to use Chatter OS?
              </h2>
              <p style={{ fontSize: '0.82rem', color: '#71717a', marginTop: '4px', marginBottom: '20px' }}>
                Choose your primary workflow. We tailor your AI responses, tone, and intelligence models accordingly.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '22px' }}>
                {/* Business Option */}
                <div
                  onClick={() => setAccountType('business')}
                  style={{
                    border: '1.5px solid',
                    borderColor: accountType === 'business' ? '#09090b' : '#e4e4e7',
                    background: accountType === 'business' ? '#fafafa' : '#ffffff',
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
                      background: accountType === 'business' ? '#09090b' : '#f4f4f5',
                      color: accountType === 'business' ? '#ffffff' : '#71717a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '12px'
                    }}>
                      <Briefcase size={18} />
                    </div>
                    <div style={{ fontWeight: '800', fontSize: '0.94rem', color: '#09090b' }}>
                      Business & Brand
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '6px', lineHeight: 1.4 }}>
                      Automate sales, customer FAQs, appointment bookings, and lead capture for your brand or agency.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '10px' }}>
                    <div style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      border: accountType === 'business' ? '4px solid #09090b' : '1.5px solid #d4d4d8'
                    }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: accountType === 'business' ? '#09090b' : '#a1a1aa' }}>
                      Selected
                    </span>
                  </div>
                </div>

                {/* Personal Option */}
                <div
                  onClick={() => setAccountType('personal')}
                  style={{
                    border: '1.5px solid',
                    borderColor: accountType === 'personal' ? '#09090b' : '#e4e4e7',
                    background: accountType === 'personal' ? '#fafafa' : '#ffffff',
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
                      background: accountType === 'personal' ? '#09090b' : '#f4f4f5',
                      color: accountType === 'personal' ? '#ffffff' : '#71717a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '12px'
                    }}>
                      <User size={18} />
                    </div>
                    <div style={{ fontWeight: '800', fontSize: '0.94rem', color: '#09090b' }}>
                      Personal & Creator
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '6px', lineHeight: 1.4 }}>
                      Natural casual chat, friendly humor, witty reactions to shared reels/memes, and friend memory recall.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '10px' }}>
                    <div style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      border: accountType === 'personal' ? '4px solid #09090b' : '1.5px solid #d4d4d8'
                    }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: accountType === 'personal' ? '#09090b' : '#a1a1aa' }}>
                      Selected
                    </span>
                  </div>
                </div>
              </div>

              {/* Conditional Business Profile Details */}
              {accountType === 'business' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
                >
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#09090b', marginBottom: '4px' }}>
                      Business / Brand Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Apex Apparel or Joshua Studio"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#09090b', marginBottom: '4px' }}>
                        Industry / Category
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. E-commerce / Fitness"
                        value={businessCategory}
                        onChange={(e) => setBusinessCategory(e.target.value)}
                        style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#09090b', marginBottom: '4px' }}>
                        Target Audience
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Online shoppers"
                        value={businessDescription}
                        onChange={(e) => setBusinessDescription(e.target.value)}
                        style={{ width: '100%', height: '38px', fontSize: '0.84rem' }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}

          {/* STEP 2: AI VOICE & PERSONA */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: '1.28rem', fontWeight: '800', color: '#09090b', margin: 0, letterSpacing: '-0.4px' }}>
                Customize Your AI Response Voice
              </h2>
              <p style={{ fontSize: '0.82rem', color: '#71717a', marginTop: '4px', marginBottom: '18px' }}>
                Determine how your automated agent sounds when direct messages arrive on Instagram.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
                {[
                  {
                    id: 'friendly',
                    label: 'Warm & Friendly',
                    desc: 'Polite, approachable, engaging, and highly conversational. Great for all audiences.',
                    badge: 'POPULAR'
                  },
                  {
                    id: 'professional',
                    label: 'Professional & Efficient',
                    desc: 'Clear, concise, professional customer service. Perfect for business operations.',
                    badge: accountType === 'business' ? 'RECOMMENDED' : 'FORMAL'
                  },
                  {
                    id: 'witty',
                    label: 'Witty & Casual Banter',
                    desc: 'Uses natural slang, quick wit, and reacts smartly to memes without sounding like a robot.',
                    badge: 'CREATOR'
                  },
                  {
                    id: 'roast',
                    label: 'Savage / Roast Mode',
                    desc: 'Humorous roasts and playfully sarcastic replies for close circles and friend banter.',
                    badge: 'FUN'
                  }
                ].map(tone => {
                  const isSelected = personaTone === tone.id;
                  return (
                    <div
                      key={tone.id}
                      onClick={() => setPersonaTone(tone.id)}
                      style={{
                        border: '1px solid',
                        borderColor: isSelected ? '#09090b' : '#e4e4e7',
                        background: isSelected ? '#fafafa' : '#ffffff',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: '800', fontSize: '0.88rem', color: '#09090b' }}>
                            {tone.label}
                          </span>
                          <span style={{
                            fontSize: '0.62rem',
                            fontWeight: '700',
                            fontFamily: "'JetBrains Mono', monospace",
                            background: isSelected ? '#09090b' : '#f4f4f5',
                            color: isSelected ? '#ffffff' : '#71717a',
                            padding: '1px 6px',
                            borderRadius: '4px'
                          }}>
                            {tone.badge}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.74rem', color: '#71717a', margin: '3px 0 0 0' }}>
                          {tone.desc}
                        </p>
                      </div>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        border: isSelected ? '5px solid #09090b' : '1.5px solid #d4d4d8',
                        flexShrink: 0
                      }} />
                    </div>
                  );
                })}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#09090b', marginBottom: '4px' }}>
                  Default Opening Greeting
                </label>
                <textarea
                  rows={2}
                  value={greetingMessage}
                  onChange={(e) => setGreetingMessage(e.target.value)}
                  placeholder="Greeting message sent when a new chat starts..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #e4e4e7',
                    fontSize: '0.82rem',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>
          )}

          {/* STEP 3: AUTOMATION POLICY & ACTIVATION */}
          {step === 3 && (
            <div>
              <h2 style={{ fontSize: '1.28rem', fontWeight: '800', color: '#09090b', margin: 0, letterSpacing: '-0.4px' }}>
                Connect Instagram & Chat Activation
              </h2>
              <p style={{ fontSize: '0.82rem', color: '#71717a', marginTop: '4px', marginBottom: '18px' }}>
                Connect your Meta App access token and choose your AI DM automation rules.
              </p>

              {/* Instagram Connection & Access Token Setup */}
              <div style={{
                background: '#fafafa',
                border: '1px solid #e4e4e7',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff'
                    }}>
                      <Instagram size={15} />
                    </div>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '0.86rem', color: '#09090b' }}>
                        Instagram Graph API Connection
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#71717a' }}>
                        Connect your account to send and receive real Instagram DMs automatically.
                      </div>
                    </div>
                  </div>
                  {instagramPageAccessToken ? (
                    <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>
                      Token Configured
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: '4px' }}>
                      Optional / Later
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#3f3f46', marginBottom: '4px' }}>
                      Your Instagram Handle
                    </label>
                    <input
                      type="text"
                      value={instagramUsername}
                      onChange={(e) => setInstagramUsername(e.target.value)}
                      placeholder="e.g. catovidz"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid #e4e4e7',
                        background: '#ffffff',
                        fontSize: '0.82rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#3f3f46', marginBottom: '4px' }}>
                      Instagram Account / Page ID
                    </label>
                    <input
                      type="text"
                      value={instagramAccountId}
                      onChange={(e) => setInstagramAccountId(e.target.value)}
                      placeholder="e.g. 1784144..."
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid #e4e4e7',
                        background: '#ffffff',
                        fontSize: '0.82rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#3f3f46', marginBottom: '4px' }}>
                    Instagram Page Access Token (starts with IGA... or EAA...)
                  </label>
                  <input
                    type="password"
                    value={instagramPageAccessToken}
                    onChange={(e) => setInstagramPageAccessToken(e.target.value)}
                    placeholder="Paste your Meta Page Access Token (or configure later in Settings)"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #e4e4e7',
                      background: '#ffffff',
                      fontSize: '0.8rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      boxSizing: 'border-box'
                    }}
                  />
                  <p style={{ fontSize: '0.68rem', color: '#71717a', margin: '4px 0 0 0' }}>
                    Generate this from your Meta for Developers App or Instagram Graph API explorer. You can also paste or update this anytime in Settings &gt; Persona &amp; Style.
                  </p>
                </div>
              </div>

              {/* Chat Mode Radios */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {[
                  {
                    id: 'everyone',
                    title: 'Auto-reply to Everyone',
                    desc: 'AI handles DMs from everyone (customers, followers, new inquiries).'
                  },
                  {
                    id: 'everyone_except',
                    title: 'Everyone EXCEPT selected friends',
                    desc: 'AI handles customer DMs automatically, while letting you chat manually with close contacts.'
                  },
                  {
                    id: 'only_selected',
                    title: 'ONLY Selected Contacts (Whitelist)',
                    desc: 'AI only replies to verified contacts you explicitly enable in Chat Rules.'
                  }
                ].map(mode => {
                  const isSelected = chatMode === mode.id;
                  return (
                    <div
                      key={mode.id}
                      onClick={() => setChatMode(mode.id)}
                      style={{
                        border: '1px solid',
                        borderColor: isSelected ? '#09090b' : '#e4e4e7',
                        background: isSelected ? '#fafafa' : '#ffffff',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '800', fontSize: '0.86rem', color: '#09090b' }}>
                          {mode.title}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#71717a', marginTop: '2px' }}>
                          {mode.desc}
                        </div>
                      </div>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        border: isSelected ? '5px solid #09090b' : '1.5px solid #d4d4d8',
                        flexShrink: 0
                      }} />
                    </div>
                  );
                })}
              </div>

              {/* Master Bot Automation Switch */}
              <div style={{
                background: enableGlobalBot ? '#f0fdf4' : '#fafafa',
                border: '1.5px solid',
                borderColor: enableGlobalBot ? '#bbf7d0' : '#e4e4e7',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Zap size={16} color={enableGlobalBot ? '#16a34a' : '#71717a'} />
                    <span style={{ fontWeight: '800', fontSize: '0.9rem', color: '#09090b' }}>
                      Activate Instagram AI Bot Automation
                    </span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#52525b', margin: '4px 0 0 0' }}>
                    {enableGlobalBot
                      ? 'The AI bot will start responding automatically to incoming Instagram messages.'
                      : 'The bot will remain paused. You can activate it at any time from the top bar.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setEnableGlobalBot(!enableGlobalBot)}
                  style={{
                    background: enableGlobalBot ? '#16a34a' : '#e4e4e7',
                    border: 'none',
                    borderRadius: '999px',
                    width: '46px',
                    height: '26px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px 4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    flexShrink: 0
                  }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    transform: enableGlobalBot ? 'translateX(18px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                  }} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #f4f4f5',
          background: '#fafafa',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {step > 1 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e4e4e7',
                  color: '#09090b',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={handleCloseOrSkip}
                disabled={loading}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#71717a',
                  padding: '8px 10px',
                  fontSize: '0.78rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCloseOrSkip}
              disabled={loading}
              style={{
                background: '#ffffff',
                border: '1px solid #e4e4e7',
                color: '#71717a',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <X size={13} />
              <span>Cancel / Skip for now</span>
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              style={{
                background: '#09090b',
                color: '#ffffff',
                border: 'none',
                padding: '9px 20px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
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
                background: '#09090b',
                color: '#ffffff',
                border: 'none',
                padding: '9px 22px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '800',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 14px rgba(9, 9, 11, 0.2)'
              }}
            >
              {loading ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Launching Workspace...</span>
                </>
              ) : (
                <>
                  <Check size={14} strokeWidth={3} />
                  <span>Complete Setup & Launch</span>
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
