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
  Shield
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://instagram-ai-bot-64tf.onrender.com';

export default function LoginPage({ onLoginSuccess }) {
  // Tabs: 'oneauth' | 'passkey' | 'password'
  const [activeTab, setActiveTab] = useState('oneauth');

  // Credentials
  const [identifier, setIdentifier] = useState('guidetalk.app@gmail.com');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Password tab secondary TOTP requirement
  const [showSecondaryTotp, setShowSecondaryTotp] = useState(false);

  // Direct QR Code display on Zoho OneAuth tab
  const [showQrCode, setShowQrCode] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Forgot Password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotMethod, setForgotMethod] = useState('oneauth'); // 'oneauth' | 'email'
  const [forgotEmail, setForgotEmail] = useState('guidetalk.app@gmail.com');
  const [forgotTotpCode, setForgotTotpCode] = useState('');
  const [forgotOtpCode, setForgotOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  // Automatically fetch QR code when toggle is opened
  const toggleQrCode = async () => {
    if (showQrCode) {
      setShowQrCode(false);
      return;
    }
    setShowQrCode(true);
    if (qrData) return;

    setQrLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/oneauth/qr?email=${encodeURIComponent(identifier)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load QR code');
      setQrData(data);
    } catch (err) {
      setError('Could not load OneAuth QR code: ' + err.message);
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
    setLoading(true);

    try {
      if (!totpCode || totpCode.trim().length !== 6) {
        throw new Error('Please enter the 6-digit code from your Zoho OneAuth app');
      }

      const res = await fetch(`${API_BASE}/api/auth/oneauth-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
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
    setPasskeyLoading(true);

    try {
      const optionsRes = await fetch(`${API_BASE}/api/auth/passkey/login-options?email=${encodeURIComponent(identifier)}`);
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
          email: identifier,
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
        setError('Biometric verification cancelled or timed out.');
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
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
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
        setInfoMessage('Please enter your 6-digit OneAuth code to continue.');
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

  // Password Reset via Zoho OneAuth (Zero email delay / No timeout!)
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
          identifier: forgotEmail,
          totpCode: forgotTotpCode.trim(),
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');

      setForgotSuccess('Password updated successfully! You can now log in.');
      setPassword(newPassword);
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
        body: JSON.stringify({ email: forgotEmail }),
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
          email: forgotEmail,
          otpCode: forgotOtpCode.trim(),
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');

      setForgotSuccess('Password updated! Redirecting to login...');
      setPassword(newPassword);
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
      minHeight: '100vh',
      width: '100vw',
      background: '#f8fafc',
      color: '#0f172a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, sans-serif",
      padding: '24px 16px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '440px',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '20px',
        padding: '36px 32px',
        boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)',
        boxSizing: 'border-box',
      }}>
        {/* Modern Clean Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
            color: '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            boxShadow: '0 10px 20px -5px rgba(37, 99, 235, 0.3)',
            fontWeight: '700',
            fontSize: '1.25rem',
            letterSpacing: '-0.5px'
          }}>
            SJ
          </div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: '700', letterSpacing: '-0.3px', margin: '0 0 4px 0', color: '#0f172a' }}>
            Sam Joshua
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
            Instagram Intelligence & Workspace
          </p>
        </div>

        {/* Crisp Segmented Tabs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '4px',
          background: '#f1f5f9',
          padding: '4px',
          borderRadius: '12px',
          marginBottom: '24px',
          border: '1px solid #e2e8f0'
        }}>
          <button
            type="button"
            onClick={() => { setActiveTab('oneauth'); setError(''); setInfoMessage(''); }}
            style={{
              background: activeTab === 'oneauth' ? '#ffffff' : 'transparent',
              color: activeTab === 'oneauth' ? '#0f172a' : '#64748b',
              border: activeTab === 'oneauth' ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
              borderRadius: '9px',
              padding: '8px 4px',
              fontSize: '0.78rem',
              fontWeight: activeTab === 'oneauth' ? '600' : '500',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: activeTab === 'oneauth' ? '0 2px 6px rgba(0,0,0,0.04)' : 'none'
            }}
          >
            <Smartphone size={16} color={activeTab === 'oneauth' ? '#2563eb' : '#94a3b8'} />
            <span>OneAuth</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('passkey'); setError(''); setInfoMessage(''); }}
            style={{
              background: activeTab === 'passkey' ? '#ffffff' : 'transparent',
              color: activeTab === 'passkey' ? '#0f172a' : '#64748b',
              border: activeTab === 'passkey' ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
              borderRadius: '9px',
              padding: '8px 4px',
              fontSize: '0.78rem',
              fontWeight: activeTab === 'passkey' ? '600' : '500',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: activeTab === 'passkey' ? '0 2px 6px rgba(0,0,0,0.04)' : 'none'
            }}
          >
            <Fingerprint size={16} color={activeTab === 'passkey' ? '#16a34a' : '#94a3b8'} />
            <span>Passkey</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('password'); setError(''); setInfoMessage(''); }}
            style={{
              background: activeTab === 'password' ? '#ffffff' : 'transparent',
              color: activeTab === 'password' ? '#0f172a' : '#64748b',
              border: activeTab === 'password' ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
              borderRadius: '9px',
              padding: '8px 4px',
              fontSize: '0.78rem',
              fontWeight: activeTab === 'password' ? '600' : '500',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: activeTab === 'password' ? '0 2px 6px rgba(0,0,0,0.04)' : 'none'
            }}
          >
            <Lock size={16} color={activeTab === 'password' ? '#d97706' : '#94a3b8'} />
            <span>Password</span>
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '0.82rem',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            lineHeight: 1.4
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {infoMessage && (
          <div style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#15803d',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '0.82rem',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{infoMessage}</span>
          </div>
        )}

        {/* TAB 1: ZOHO ONEAUTH (Passwordless) */}
        {activeTab === 'oneauth' && (
          <div>
            {/* Quick QR Code Scan Drawer / Box */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <QrCode size={18} color="#2563eb" />
                  <span style={{ fontSize: '0.84rem', fontWeight: '600', color: '#1e293b' }}>
                    Need to link Zoho OneAuth?
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleQrCode}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#334155',
                    borderRadius: '7px',
                    padding: '5px 10px',
                    fontSize: '0.74rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>{showQrCode ? 'Hide QR' : 'Show QR to Scan'}</span>
                  {showQrCode ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {showQrCode && (
                <div style={{ marginTop: '14px', textAlign: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                  {qrLoading ? (
                    <div style={{ padding: '24px', color: '#64748b', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Generating QR Code...</span>
                    </div>
                  ) : qrData ? (
                    <div>
                      <div style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '12px',
                        display: 'inline-block',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.04)'
                      }}>
                        <img
                          src={qrData.qrDataUrl}
                          alt="OneAuth QR Code"
                          style={{ width: '180px', height: '180px', display: 'block' }}
                        />
                      </div>
                      <p style={{ fontSize: '0.78rem', color: '#475569', margin: '10px 0 6px', fontWeight: '500' }}>
                        1. Open Zoho OneAuth on your phone & tap <b>+</b><br/>
                        2. Point camera to scan this QR code
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>
                          Key: {qrData.secret?.slice(0, 16)}...
                        </span>
                        <button
                          type="button"
                          onClick={copySecret}
                          style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.72rem', cursor: 'pointer', padding: 0, fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                        >
                          {copiedSecret ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                          <span>{copiedSecret ? 'Copied' : 'Copy Key'}</span>
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <form onSubmit={handleOneAuthLogin}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                  Email or Username
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      padding: '11px 12px 11px 36px',
                      color: '#0f172a',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                  <Mail size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                </div>
              </div>

              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                  6-Digit OneAuth Code
                </label>
                <div style={{ position: 'relative' }}>
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
                      border: '1px solid #2563eb',
                      borderRadius: '10px',
                      padding: '12px 12px 12px 36px',
                      color: '#0f172a',
                      fontSize: '1.4rem',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      letterSpacing: '8px',
                      textAlign: 'center',
                      boxSizing: 'border-box',
                      outline: 'none',
                      boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.1)'
                    }}
                  />
                  <Key size={18} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                </div>
                <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '6px 0 0', textAlign: 'center' }}>
                  Open Zoho OneAuth on your phone and enter the live 6-digit code.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || !totpCode || totpCode.length !== 6}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '13px',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: (loading || !totpCode || totpCode.length !== 6) ? 'not-allowed' : 'pointer',
                  opacity: (loading || !totpCode || totpCode.length !== 6) ? 0.6 : 1,
                  transition: 'all 0.15s ease'
                }}
              >
                {loading ? <RefreshCw size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                <span>{loading ? 'Verifying...' : 'Sign In with OneAuth'}</span>
              </button>
            </form>
          </div>
        )}

        {/* TAB 2: BIOMETRIC PASSKEY */}
        {activeTab === 'passkey' && (
          <div>
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
              marginBottom: '20px'
            }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: '#dcfce7',
                color: '#15803d',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '10px'
              }}>
                <Fingerprint size={24} />
              </div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '600', margin: '0 0 4px', color: '#166534' }}>
                Touch ID / Face ID
              </h3>
              <p style={{ fontSize: '0.78rem', color: '#15803d', margin: 0 }}>
                Instant passwordless biometric authentication
              </p>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                Account Email
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    padding: '11px 12px 11px 36px',
                    color: '#0f172a',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <Mail size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={passkeyLoading}
              style={{
                width: '100%',
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '14px',
                fontWeight: '600',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: passkeyLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {passkeyLoading ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Fingerprint size={18} color="#4ade80" />
              )}
              <span>{passkeyLoading ? 'Authenticating...' : 'Sign In with Passkey'}</span>
            </button>
            <p style={{ fontSize: '0.74rem', color: '#64748b', textAlign: 'center', marginTop: '12px' }}>
              Requires a registered passkey on this browser or phone.
            </p>
          </div>
        )}

        {/* TAB 3: PASSWORD */}
        {activeTab === 'password' && (
          <form onSubmit={handlePasswordLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                Email or Username
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    padding: '11px 12px 11px 36px',
                    color: '#0f172a',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <Mail size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            <div style={{ marginBottom: showSecondaryTotp ? '14px' : '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.76rem', fontWeight: '600', color: '#475569' }}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => { setShowForgotModal(true); setForgotEmail(identifier); }}
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.74rem', cursor: 'pointer', padding: 0, fontWeight: '500' }}
                >
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  style={{
                    width: '100%',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    padding: '11px 12px 11px 36px',
                    color: '#0f172a',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <Lock size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            {showSecondaryTotp && (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '20px',
              }}>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#1e293b', marginBottom: '6px' }}>
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
                    border: '1px solid #2563eb',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: '#0f172a',
                    fontSize: '1.2rem',
                    fontFamily: 'monospace',
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
              disabled={loading}
              style={{
                width: '100%',
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '13px',
                fontWeight: '600',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {loading ? <RefreshCw size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              <span>{showSecondaryTotp ? 'Verify & Enter' : 'Sign In with Password'}</span>
            </button>
          </form>
        )}

        <div style={{ marginTop: '28px', textAlign: 'center', fontSize: '0.74rem', color: '#94a3b8' }}>
          Personal Dashboard • End-to-End Authenticated
        </div>
      </div>

      {/* Forgot Password Light Modal */}
      {showForgotModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '18px',
            width: '100%',
            maxWidth: '420px',
            padding: '28px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <KeyRound size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', margin: 0, color: '#0f172a' }}>Reset Password</h3>
                <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>Choose your preferred recovery method</p>
              </div>
            </div>

            {/* Method switcher */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '4px',
              background: '#f1f5f9',
              padding: '3px',
              borderRadius: '9px',
              marginBottom: '16px'
            }}>
              <button
                type="button"
                onClick={() => { setForgotMethod('oneauth'); setForgotError(''); setForgotSuccess(''); }}
                style={{
                  background: forgotMethod === 'oneauth' ? '#ffffff' : 'transparent',
                  color: forgotMethod === 'oneauth' ? '#0f172a' : '#64748b',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '7px',
                  fontSize: '0.76rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Via OneAuth (Instant)
              </button>
              <button
                type="button"
                onClick={() => { setForgotMethod('email'); setForgotError(''); setForgotSuccess(''); }}
                style={{
                  background: forgotMethod === 'email' ? '#ffffff' : 'transparent',
                  color: forgotMethod === 'email' ? '#0f172a' : '#64748b',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '7px',
                  fontSize: '0.76rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Via Email OTP
              </button>
            </div>

            {forgotError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '8px', padding: '8px 12px', fontSize: '0.78rem', marginBottom: '14px', lineHeight: 1.4 }}>
                {forgotError}
              </div>
            )}
            {forgotSuccess && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', borderRadius: '8px', padding: '8px 12px', fontSize: '0.78rem', marginBottom: '14px' }}>
                {forgotSuccess}
              </div>
            )}

            {/* Method A: Instant Reset via Zoho OneAuth Code (No email needed!) */}
            {forgotMethod === 'oneauth' && (
              <form onSubmit={handleResetViaOneAuth}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                    Registered Email
                  </label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      color: '#0f172a',
                      fontSize: '0.86rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
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
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      color: '#0f172a',
                      fontSize: '1.2rem',
                      fontFamily: 'monospace',
                      letterSpacing: '4px',
                      textAlign: 'center',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
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
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      color: '#0f172a',
                      fontSize: '0.86rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    style={{ background: 'none', border: '1px solid #cbd5e1', color: '#64748b', borderRadius: '8px', padding: '9px 14px', fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading || !forgotTotpCode || !newPassword}
                    style={{ background: '#0f172a', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontWeight: '600', fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    {forgotLoading ? 'Updating...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}

            {/* Method B: Standard Email OTP */}
            {forgotMethod === 'email' && (
              !otpSent ? (
                <form onSubmit={handleSendEmailOtp}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                      Registered Email
                    </label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '9px 12px',
                        color: '#0f172a',
                        fontSize: '0.86rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(false)}
                      style={{ background: 'none', border: '1px solid #cbd5e1', color: '#64748b', borderRadius: '8px', padding: '9px 14px', fontSize: '0.82rem', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      style={{ background: '#0f172a', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontWeight: '600', fontSize: '0.82rem', cursor: 'pointer' }}
                    >
                      {forgotLoading ? 'Sending...' : 'Send Email OTP'}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleVerifyEmailOtp}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
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
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        color: '#0f172a',
                        fontSize: '1.2rem',
                        fontFamily: 'monospace',
                        letterSpacing: '4px',
                        textAlign: 'center',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: '18px' }}>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
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
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '9px 12px',
                        color: '#0f172a',
                        fontSize: '0.86rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setOtpSent(false)}
                      style={{ background: 'none', border: '1px solid #cbd5e1', color: '#64748b', borderRadius: '8px', padding: '9px 14px', fontSize: '0.82rem', cursor: 'pointer' }}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      style={{ background: '#0f172a', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontWeight: '600', fontSize: '0.82rem', cursor: 'pointer' }}
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
    </div>
  );
}
