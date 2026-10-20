'use client';

import React, { useState, useEffect } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import {
  Fingerprint,
  Lock,
  Mail,
  Key,
  ArrowRight,
  RefreshCw,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  QrCode,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Shield,
  Layers
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://instagram-ai-bot-64tf.onrender.com';

export default function LoginPage({ onLoginSuccess }) {
  // Tabs: 'oneauth' | 'passkey' | 'password'
  const [activeTab, setActiveTab] = useState('oneauth');

  // Input states (empty by default so different users can enter their own credentials)
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Password tab secondary TOTP requirement
  const [showSecondaryTotp, setShowSecondaryTotp] = useState(false);

  // Dynamic QR Code display for OneAuth
  const [showQrCode, setShowQrCode] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Forgot Password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotMethod, setForgotMethod] = useState('oneauth'); // 'oneauth' | 'email'
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotTotpCode, setForgotTotpCode] = useState('');
  const [forgotOtpCode, setForgotOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  // Toggle QR Code specifically for the entered email/user
  const toggleQrCode = async () => {
    if (showQrCode) {
      setShowQrCode(false);
      return;
    }

    const emailToFetch = (identifier || '').trim();
    if (!emailToFetch) {
      setError('Please enter your email or username above first to view your QR code.');
      return;
    }

    setError('');
    setShowQrCode(true);
    setQrLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/oneauth/qr?email=${encodeURIComponent(emailToFetch)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate OneAuth QR code');
      setQrData(data);
    } catch (err) {
      setError(err.message || 'Could not load QR code');
      setShowQrCode(false);
    } finally {
      setQrLoading(false);
    }
  };

  const copySecret = () => {
    if (qrData?.secret) {
      navigator.clipboard.writeText(qrData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  // 1. Zoho OneAuth Login (Passwordless)
  const handleOneAuthLogin = async (e) => {
    e?.preventDefault();
    setError('');
    setInfoMessage('');

    if (!identifier.trim()) {
      setError('Please enter your email or username.');
      return;
    }
    if (!totpCode || totpCode.trim().length !== 6) {
      setError('Please enter the 6-digit code from your Zoho OneAuth app.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/oneauth-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          code: totpCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'OneAuth verification failed');
      }

      if (data.token) {
        onLoginSuccess(data.token, data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Passkey / Touch ID Login
  const handlePasskeyLogin = async () => {
    setError('');
    setInfoMessage('');

    if (!identifier.trim()) {
      setError('Please enter your account email or username.');
      return;
    }

    setPasskeyLoading(true);
    try {
      const optionsRes = await fetch(`${API_BASE}/api/auth/passkey/login-options?email=${encodeURIComponent(identifier.trim())}`);
      if (!optionsRes.ok) {
        const errData = await optionsRes.json();
        throw new Error(errData.error || 'Failed to fetch passkey challenge');
      }
      const options = await optionsRes.json();

      const assertion = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch(`${API_BASE}/api/auth/passkey/login-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: identifier.trim(),
          response: assertion,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || 'Passkey verification failed');
      }

      if (verifyData.token) {
        onLoginSuccess(verifyData.token, verifyData.user);
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Biometric verification was cancelled.');
      } else {
        setError(err.message || 'Passkey authentication failed.');
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  // 3. Password Login
  const handlePasswordLogin = async (e) => {
    e?.preventDefault();
    setError('');
    setInfoMessage('');

    if (!identifier.trim()) {
      setError('Please enter your email or username.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
          totpCode: showSecondaryTotp ? totpCode : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (data.requireTotp) {
        setShowSecondaryTotp(true);
        setInfoMessage('Enter the 6-digit code from your Zoho OneAuth app.');
        setLoading(false);
        return;
      }

      if (data.token) {
        onLoginSuccess(data.token, data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Password Reset via Zoho OneAuth (Zero wait, instant)
  const handleResetViaOneAuth = async (e) => {
    e?.preventDefault();
    setForgotError('');
    setForgotSuccess('');
    setForgotLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password/verify-oneauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: forgotEmail.trim(),
          totpCode: forgotTotpCode.trim(),
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');

      setForgotSuccess('Password updated successfully! You can now log in.');
      setPassword(newPassword);
      setIdentifier(forgotEmail);
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotTotpCode('');
        setNewPassword('');
        setActiveTab('password');
      }, 1500);
    } catch (err) {
      setForgotError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  // Password Reset via Email OTP
  const handleSendEmailOtp = async (e) => {
    e?.preventDefault();
    setForgotError('');
    setForgotSuccess('');
    setForgotLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send verification code');

      setOtpSent(true);
      setForgotSuccess(data.message || 'Verification code sent to your email.');
    } catch (err) {
      setForgotError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (e) => {
    e?.preventDefault();
    setForgotError('');
    setForgotSuccess('');
    setForgotLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password/verify-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          otpCode: forgotOtpCode.trim(),
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');

      setForgotSuccess('Password updated! Redirecting to login...');
      setPassword(newPassword);
      setIdentifier(forgotEmail);
      setTimeout(() => {
        setShowForgotModal(false);
        setOtpSent(false);
        setForgotOtpCode('');
        setNewPassword('');
        setActiveTab('password');
      }, 1500);
    } catch (err) {
      setForgotError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      overflow: 'hidden',
      background: '#ffffff',
      color: '#09090b',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>
      {/* LEFT PANEL: ARCHITECTURAL ARTWORK (Desktop & Tablet) */}
      <div
        className="login-left-panel"
        style={{
          width: '50%',
          height: '100vh',
          position: 'relative',
          background: '#09090b',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px',
          boxSizing: 'border-box'
        }}
      >
        {/* Background Image with Fallback */}
        <picture style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}>
          <source srcSet="/login-art.jpg" type="image/jpeg" />
          <img
            src="/login-art.png"
            alt="Potsdamer Platz Architecture"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              filter: 'grayscale(100%) contrast(1.15) brightness(0.95)',
            }}
          />
        </picture>

        {/* Artistic Gradient Overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(9, 9, 11, 0.35) 0%, rgba(9, 9, 11, 0.15) 50%, rgba(9, 9, 11, 0.85) 100%)',
          zIndex: 1
        }} />

        {/* Top Branding Pill */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.12)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            color: '#ffffff',
            padding: '7px 14px',
            borderRadius: '999px',
            fontSize: '0.74rem',
            fontWeight: '600',
            letterSpacing: '0.6px',
            textTransform: 'uppercase'
          }}>
            <Layers size={14} />
            <span>Chatter OS // Workspace</span>
          </div>
        </div>

        {/* Bottom Architectural Caption */}
        <div style={{ position: 'relative', zIndex: 2, color: '#ffffff', maxWidth: '420px' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.8px', margin: '0 0 8px 0', lineHeight: 1.2 }}>
            Potsdamer Platz
          </h2>
          <p style={{ fontSize: '0.86rem', color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.5, margin: 0 }}>
            Precision intelligence, few-shot style calibration, and automated Instagram creator workflows.
          </p>
        </div>
      </div>

      {/* RIGHT PANEL: COMPACT LOGIN DETAILS */}
      <div style={{
        flex: 1,
        height: '100vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '36px 28px',
        boxSizing: 'border-box',
        background: '#ffffff'
      }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>
          {/* Header */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: '#09090b',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
              fontWeight: '800',
              fontSize: '1rem',
              letterSpacing: '-0.5px'
            }}>
              C
            </div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: '800', letterSpacing: '-0.5px', margin: '0 0 6px 0', color: '#09090b' }}>
              Sign in to Chatter
            </h1>
            <p style={{ fontSize: '0.84rem', color: '#71717a', margin: 0 }}>
              Enter your credentials to access your Instagram dashboard.
            </p>
          </div>

          {/* Segmented Mode Selector */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '4px',
            background: '#f4f4f5',
            padding: '3px',
            borderRadius: '10px',
            marginBottom: '22px',
            border: '1px solid #e4e4e7'
          }}>
            <button
              type="button"
              onClick={() => { setActiveTab('oneauth'); setError(''); setInfoMessage(''); }}
              style={{
                background: activeTab === 'oneauth' ? '#ffffff' : 'transparent',
                color: activeTab === 'oneauth' ? '#09090b' : '#71717a',
                border: activeTab === 'oneauth' ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
                borderRadius: '7px',
                padding: '7px 4px',
                fontSize: '0.78rem',
                fontWeight: activeTab === 'oneauth' ? '600' : '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: activeTab === 'oneauth' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <Smartphone size={14} />
              <span>OneAuth</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('passkey'); setError(''); setInfoMessage(''); }}
              style={{
                background: activeTab === 'passkey' ? '#ffffff' : 'transparent',
                color: activeTab === 'passkey' ? '#09090b' : '#71717a',
                border: activeTab === 'passkey' ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
                borderRadius: '7px',
                padding: '7px 4px',
                fontSize: '0.78rem',
                fontWeight: activeTab === 'passkey' ? '600' : '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: activeTab === 'passkey' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <Fingerprint size={14} />
              <span>Passkey</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('password'); setError(''); setInfoMessage(''); }}
              style={{
                background: activeTab === 'password' ? '#ffffff' : 'transparent',
                color: activeTab === 'password' ? '#09090b' : '#71717a',
                border: activeTab === 'password' ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
                borderRadius: '7px',
                padding: '7px 4px',
                fontSize: '0.78rem',
                fontWeight: activeTab === 'password' ? '600' : '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: activeTab === 'password' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <Lock size={14} />
              <span>Password</span>
            </button>
          </div>

          {/* Feedback Messages */}
          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '0.8rem',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              lineHeight: 1.4
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{error}</span>
            </div>
          )}

          {infoMessage && (
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#15803d',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '0.8rem',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* TAB 1: ZOHO ONEAUTH (COMPACT FLOW) */}
          {activeTab === 'oneauth' && (
            <div>
              <form onSubmit={handleOneAuthLogin}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#3f3f46', marginBottom: '5px' }}>
                    Email or Username
                  </label>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="name@example.com or username"
                    required
                    style={{
                      width: '100%',
                      background: '#ffffff',
                      border: '1px solid #e4e4e7',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      color: '#09090b',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box',
                      outline: 'none',
                      transition: 'border-color 0.15s ease'
                    }}
                  />
                </div>

                {/* Compact QR Code toggle drawer */}
                <div style={{
                  background: '#fafafa',
                  border: '1px solid #f4f4f5',
                  borderRadius: '8px',
                  padding: '9px 12px',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.78rem', color: '#52525b', fontWeight: '500' }}>
                      Pair Zoho OneAuth app
                    </span>
                    <button
                      type="button"
                      onClick={toggleQrCode}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e4e4e7',
                        color: '#09090b',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '0.72rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <QrCode size={12} />
                      <span>{showQrCode ? 'Hide QR' : 'Show QR'}</span>
                    </button>
                  </div>

                  {showQrCode && (
                    <div style={{ marginTop: '12px', textAlign: 'center', borderTop: '1px solid #e4e4e7', paddingTop: '12px' }}>
                      {qrLoading ? (
                        <div style={{ padding: '16px', color: '#71717a', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Generating QR for {identifier}...</span>
                        </div>
                      ) : qrData ? (
                        <div>
                          <div style={{
                            background: '#ffffff',
                            border: '1px solid #e4e4e7',
                            borderRadius: '10px',
                            padding: '8px',
                            display: 'inline-block'
                          }}>
                            <img
                              src={qrData.qrDataUrl}
                              alt="OneAuth QR"
                              style={{ width: '150px', height: '150px', display: 'block' }}
                            />
                          </div>
                          <p style={{ fontSize: '0.74rem', color: '#52525b', margin: '8px 0 4px', fontWeight: '500' }}>
                            Scan with Zoho OneAuth on your phone
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.7rem', color: '#71717a', fontFamily: 'monospace' }}>
                              {qrData.secret?.slice(0, 14)}...
                            </span>
                            <button
                              type="button"
                              onClick={copySecret}
                              style={{ background: 'none', border: 'none', color: '#09090b', fontSize: '0.72rem', cursor: 'pointer', padding: 0, fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                            >
                              {copiedSecret ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                              <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#3f3f46', marginBottom: '5px' }}>
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    autoFocus
                    required
                    style={{
                      width: '100%',
                      background: '#ffffff',
                      border: '1px solid #09090b',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      color: '#09090b',
                      fontSize: '1.25rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: '6px',
                      textAlign: 'center',
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                  <p style={{ fontSize: '0.72rem', color: '#71717a', margin: '6px 0 0', textAlign: 'center' }}>
                    Enter the live code from Zoho OneAuth app
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading || !identifier || totpCode.length !== 6}
                  style={{
                    width: '100%',
                    background: '#09090b',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '11px',
                    fontWeight: '600',
                    fontSize: '0.88rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: (loading || !identifier || totpCode.length !== 6) ? 'not-allowed' : 'pointer',
                    opacity: (loading || !identifier || totpCode.length !== 6) ? 0.6 : 1,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {loading ? <RefreshCw size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  <span>{loading ? 'Verifying...' : 'Sign In with OneAuth'}</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: BIOMETRIC PASSKEY */}
          {activeTab === 'passkey' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#3f3f46', marginBottom: '5px' }}>
                  Email or Username
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="name@example.com or username"
                  required
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1px solid #e4e4e7',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: '#09090b',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>

              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={passkeyLoading || !identifier.trim()}
                style={{
                  width: '100%',
                  background: '#09090b',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px',
                  fontWeight: '600',
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: (passkeyLoading || !identifier.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (passkeyLoading || !identifier.trim()) ? 0.6 : 1,
                  transition: 'all 0.15s ease'
                }}
              >
                {passkeyLoading ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Fingerprint size={16} color="#4ade80" />
                )}
                <span>{passkeyLoading ? 'Authenticating...' : 'Sign In with Touch ID'}</span>
              </button>
              <p style={{ fontSize: '0.72rem', color: '#71717a', textAlign: 'center', marginTop: '10px' }}>
                Use Touch ID, Face ID, or your physical security key
              </p>
            </div>
          )}

          {/* TAB 3: PASSWORD */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordLogin}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#3f3f46', marginBottom: '5px' }}>
                  Email or Username
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="name@example.com or username"
                  required
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1px solid #e4e4e7',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: '#09090b',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: showSecondaryTotp ? '12px' : '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <label style={{ fontSize: '0.76rem', fontWeight: '600', color: '#3f3f46' }}>
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => { setShowForgotModal(true); setForgotEmail(identifier); }}
                    style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '0.72rem', cursor: 'pointer', padding: 0 }}
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1px solid #e4e4e7',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: '#09090b',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>

              {showSecondaryTotp && (
                <div style={{
                  background: '#fafafa',
                  border: '1px solid #e4e4e7',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                }}>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#09090b', marginBottom: '5px' }}>
                    OneAuth 6-Digit Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    autoFocus
                    style={{
                      width: '100%',
                      background: '#ffffff',
                      border: '1px solid #09090b',
                      borderRadius: '6px',
                      padding: '8px',
                      color: '#09090b',
                      fontSize: '1.1rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: '4px',
                      boxSizing: 'border-box',
                      outline: 'none',
                      textAlign: 'center'
                    }}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !identifier.trim() || !password}
                style={{
                  width: '100%',
                  background: '#09090b',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '11px',
                  fontWeight: '600',
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: (loading || !identifier.trim() || !password) ? 'not-allowed' : 'pointer',
                  opacity: (loading || !identifier.trim() || !password) ? 0.6 : 1,
                  transition: 'all 0.15s ease'
                }}
              >
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                <span>{showSecondaryTotp ? 'Verify & Enter' : 'Sign In with Password'}</span>
              </button>
            </form>
          )}

          <div style={{ marginTop: '28px', textAlign: 'center', fontSize: '0.72rem', color: '#a1a1aa' }}>
            Chatter OS • End-to-End Encrypted Session
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(9, 9, 11, 0.45)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            border: '1px solid #e4e4e7',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '380px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#f4f4f5', color: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <KeyRound size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '0.98rem', fontWeight: '700', margin: 0, color: '#09090b' }}>Reset Password</h3>
                <p style={{ fontSize: '0.74rem', color: '#71717a', margin: 0 }}>Choose your recovery method</p>
              </div>
            </div>

            {/* Method switcher */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '4px',
              background: '#f4f4f5',
              padding: '3px',
              borderRadius: '8px',
              marginBottom: '14px'
            }}>
              <button
                type="button"
                onClick={() => { setForgotMethod('oneauth'); setForgotError(''); setForgotSuccess(''); }}
                style={{
                  background: forgotMethod === 'oneauth' ? '#ffffff' : 'transparent',
                  color: forgotMethod === 'oneauth' ? '#09090b' : '#71717a',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px',
                  fontSize: '0.74rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                OneAuth (Instant)
              </button>
              <button
                type="button"
                onClick={() => { setForgotMethod('email'); setForgotError(''); setForgotSuccess(''); }}
                style={{
                  background: forgotMethod === 'email' ? '#ffffff' : 'transparent',
                  color: forgotMethod === 'email' ? '#09090b' : '#71717a',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px',
                  fontSize: '0.74rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Email OTP
              </button>
            </div>

            {forgotError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '6px', padding: '8px 10px', fontSize: '0.76rem', marginBottom: '12px' }}>
                {forgotError}
              </div>
            )}
            {forgotSuccess && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', borderRadius: '6px', padding: '8px 10px', fontSize: '0.76rem', marginBottom: '12px' }}>
                {forgotSuccess}
              </div>
            )}

            {/* Instant Reset via OneAuth Code */}
            {forgotMethod === 'oneauth' && (
              <form onSubmit={handleResetViaOneAuth}>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '600', color: '#3f3f46', marginBottom: '4px' }}>
                    Account Email
                  </label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                    style={{
                      width: '100%',
                      background: '#ffffff',
                      border: '1px solid #e4e4e7',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      color: '#09090b',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '600', color: '#3f3f46', marginBottom: '4px' }}>
                    Live 6-Digit OneAuth Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={forgotTotpCode}
                    onChange={(e) => setForgotTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    required
                    style={{
                      width: '100%',
                      background: '#ffffff',
                      border: '1px solid #e4e4e7',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      color: '#09090b',
                      fontSize: '1.1rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: '4px',
                      textAlign: 'center',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '600', color: '#3f3f46', marginBottom: '4px' }}>
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    style={{
                      width: '100%',
                      background: '#ffffff',
                      border: '1px solid #e4e4e7',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      color: '#09090b',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    style={{ background: 'none', border: '1px solid #e4e4e7', color: '#71717a', borderRadius: '6px', padding: '8px 12px', fontSize: '0.78rem', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading || !forgotTotpCode || !newPassword}
                    style={{ background: '#09090b', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '8px 14px', fontWeight: '600', fontSize: '0.78rem', cursor: 'pointer' }}
                  >
                    {forgotLoading ? 'Updating...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}

            {/* Email OTP Flow */}
            {forgotMethod === 'email' && (
              !otpSent ? (
                <form onSubmit={handleSendEmailOtp}>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '600', color: '#3f3f46', marginBottom: '4px' }}>
                      Account Email
                    </label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="name@example.com"
                      required
                      style={{
                        width: '100%',
                        background: '#ffffff',
                        border: '1px solid #e4e4e7',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        color: '#09090b',
                        fontSize: '0.84rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(false)}
                      style={{ background: 'none', border: '1px solid #e4e4e7', color: '#71717a', borderRadius: '6px', padding: '8px 12px', fontSize: '0.78rem', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      style={{ background: '#09090b', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '8px 14px', fontWeight: '600', fontSize: '0.78rem', cursor: 'pointer' }}
                    >
                      {forgotLoading ? 'Sending...' : 'Send OTP'}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleVerifyEmailOtp}>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '600', color: '#3f3f46', marginBottom: '4px' }}>
                      6-Digit Email Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={forgotOtpCode}
                      onChange={(e) => setForgotOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      required
                      style={{
                        width: '100%',
                        background: '#ffffff',
                        border: '1px solid #e4e4e7',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        color: '#09090b',
                        fontSize: '1.1rem',
                        fontFamily: "'JetBrains Mono', monospace",
                        letterSpacing: '4px',
                        textAlign: 'center',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '600', color: '#3f3f46', marginBottom: '4px' }}>
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                      style={{
                        width: '100%',
                        background: '#ffffff',
                        border: '1px solid #e4e4e7',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        color: '#09090b',
                        fontSize: '0.84rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setOtpSent(false)}
                      style={{ background: 'none', border: '1px solid #e4e4e7', color: '#71717a', borderRadius: '6px', padding: '8px 12px', fontSize: '0.78rem', cursor: 'pointer' }}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      style={{ background: '#09090b', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '8px 14px', fontWeight: '600', fontSize: '0.78rem', cursor: 'pointer' }}
                    >
                      {forgotLoading ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              )
            )}
          </div>
        </div>
      )}

      {/* Responsive Style for Mobile Screens */}
      <style jsx>{`
        @media (max-width: 899px) {
          .login-left-panel {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
