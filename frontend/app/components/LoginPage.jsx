'use client';

import React, { useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import {
  Fingerprint,
  Lock,
  Mail,
  Key,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  QrCode,
  Copy,
  Check
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://instagram-ai-bot-64tf.onrender.com';

export default function LoginPage({ onLoginSuccess }) {
  // Login Mode: 'oneauth' | 'passkey' | 'password'
  const [activeTab, setActiveTab] = useState('oneauth');

  // Shared credentials
  const [identifier, setIdentifier] = useState('guidetalk.app@gmail.com');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Password tab secondary 2FA state (if required)
  const [showSecondaryTotp, setShowSecondaryTotp] = useState(false);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('guidetalk.app@gmail.com');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  // OneAuth QR setup modal state (for first-time pairing from login screen)
  const [showOneAuthSetupModal, setShowOneAuthSetupModal] = useState(false);
  const [setupStep, setSetupStep] = useState('request'); // 'request' | 'verify' | 'qr'
  const [setupEmail, setSetupEmail] = useState('guidetalk.app@gmail.com');
  const [setupOtpCode, setSetupOtpCode] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [setupSuccess, setSetupSuccess] = useState('');
  const [setupQrData, setSetupQrData] = useState(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // 1. Direct Zoho OneAuth Login (Passwordless Alternative)
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
        if (data.needsSetup) {
          setError(data.error);
          return;
        }
        throw new Error(data.error || 'Zoho OneAuth authentication failed');
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

  // 2. Biometric Passkey / Fingerprint login (1-Tap Alternative)
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
        throw new Error(verifyData.error || 'Biometric verification failed');
      }

      if (verifyData.token) {
        onLoginSuccess(verifyData.token, verifyData.user);
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Biometric sign-in was cancelled or timed out.');
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
        setInfoMessage('Enter the 6-digit code from your Zoho OneAuth app to finish logging in.');
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

  // Forgot password OTP Request
  const handleSendForgotOtp = async (e) => {
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
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP code');

      setOtpSent(true);
      setForgotSuccess(data.message || 'Verification code sent to your email!');
    } catch (err) {
      setForgotError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  // Forgot password OTP Verify
  const handleResetPassword = async (e) => {
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
          otpCode,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');

      setForgotSuccess(data.message || 'Password reset successfully! You can now log in.');
      setPassword(newPassword);
      setTimeout(() => {
        setShowForgotModal(false);
        setOtpSent(false);
        setOtpCode('');
        setNewPassword('');
        setActiveTab('password');
      }, 1800);
    } catch (err) {
      setForgotError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  // Zoho OneAuth QR Setup Flow
  const handleRequestSetupOtp = async (e) => {
    e?.preventDefault();
    setSetupError('');
    setSetupSuccess('');
    setSetupLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/oneauth/request-setup-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: setupEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to request setup code');

      setSetupStep('verify');
      setSetupSuccess(data.message || 'Verification code sent to your email.');
    } catch (err) {
      setSetupError(err.message);
    } finally {
      setSetupLoading(false);
    }
  };

  const handleVerifySetupOtp = async (e) => {
    e?.preventDefault();
    setSetupError('');
    setSetupSuccess('');
    setSetupLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/oneauth/verify-setup-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: setupEmail,
          otpCode: setupOtpCode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');

      setSetupQrData(data);
      setSetupStep('qr');
      setSetupSuccess('OneAuth QR Code unlocked! Scan it into Zoho OneAuth on your phone.');
    } catch (err) {
      setSetupError(err.message);
    } finally {
      setSetupLoading(false);
    }
  };

  const copySecretToClipboard = () => {
    if (setupQrData?.secret) {
      navigator.clipboard.writeText(setupQrData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      background: '#09090b',
      color: '#f4f4f5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        background: '#121215',
        border: '1px solid #27272a',
        borderRadius: '16px',
        padding: '32px 28px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        boxSizing: 'border-box',
      }}>
        {/* Brand / Security Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: '#ffffff',
            color: '#09090b',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '12px',
            boxShadow: '0 4px 14px rgba(255,255,255,0.2)'
          }}>
            <ShieldCheck size={28} />
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: '800', letterSpacing: '-0.5px', margin: '0 0 6px 0', color: '#ffffff' }}>
            CHATTER OS // SECURE
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#a1a1aa', margin: 0 }}>
            Restricted access • Sam Joshua (<span style={{ color: '#e4e4e7', fontFamily: 'monospace' }}>guidetalk.app@gmail.com</span>)
          </p>
        </div>

        {/* Dynamic Login Mode Selector (Alternative Methods) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '6px',
          background: '#18181b',
          padding: '4px',
          borderRadius: '10px',
          marginBottom: '22px',
          border: '1px solid #27272a'
        }}>
          <button
            type="button"
            onClick={() => { setActiveTab('oneauth'); setError(''); setInfoMessage(''); }}
            style={{
              background: activeTab === 'oneauth' ? '#27272a' : 'transparent',
              color: activeTab === 'oneauth' ? '#ffffff' : '#a1a1aa',
              border: activeTab === 'oneauth' ? '1px solid #3f3f46' : '1px solid transparent',
              borderRadius: '7px',
              padding: '8px 4px',
              fontSize: '0.76rem',
              fontWeight: '700',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Smartphone size={16} color={activeTab === 'oneauth' ? '#60a5fa' : '#71717a'} />
            <span>Zoho OneAuth</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('passkey'); setError(''); setInfoMessage(''); }}
            style={{
              background: activeTab === 'passkey' ? '#27272a' : 'transparent',
              color: activeTab === 'passkey' ? '#ffffff' : '#a1a1aa',
              border: activeTab === 'passkey' ? '1px solid #3f3f46' : '1px solid transparent',
              borderRadius: '7px',
              padding: '8px 4px',
              fontSize: '0.76rem',
              fontWeight: '700',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Fingerprint size={16} color={activeTab === 'passkey' ? '#4ade80' : '#71717a'} />
            <span>Passkey / Touch ID</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('password'); setError(''); setInfoMessage(''); }}
            style={{
              background: activeTab === 'password' ? '#27272a' : 'transparent',
              color: activeTab === 'password' ? '#ffffff' : '#a1a1aa',
              border: activeTab === 'password' ? '1px solid #3f3f46' : '1px solid transparent',
              borderRadius: '7px',
              padding: '8px 4px',
              fontSize: '0.76rem',
              fontWeight: '700',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Lock size={16} color={activeTab === 'password' ? '#f59e0b' : '#71717a'} />
            <span>Password</span>
          </button>
        </div>

        {/* Global Feedback Messages */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#f87171',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '0.82rem',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {infoMessage && (
          <div style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            color: '#60a5fa',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '0.82rem',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{infoMessage}</span>
          </div>
        )}

        {/* TAB 1: ZOHO ONEAUTH DIRECT LOGIN (Passwordless) */}
        {activeTab === 'oneauth' && (
          <form onSubmit={handleOneAuthLogin}>
            <div style={{
              background: 'rgba(96, 165, 250, 0.05)',
              border: '1px solid rgba(96, 165, 250, 0.15)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '0.78rem',
              color: '#93c5fd',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Smartphone size={16} style={{ flexShrink: 0 }} />
              <span>Passwordless login: Enter the 6-digit code directly from your Zoho OneAuth app.</span>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#a1a1aa', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Account Email or Username
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="guidetalk.app@gmail.com"
                  required
                  style={{
                    width: '100%',
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    padding: '10px 12px 10px 36px',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <Mail size={16} color="#71717a" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.76rem', fontWeight: '700', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  6-Digit Zoho OneAuth Code
                </label>
                <button
                  type="button"
                  onClick={() => { setShowOneAuthSetupModal(true); setSetupEmail(identifier); }}
                  style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.72rem', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <QrCode size={12} />
                  <span>Scan QR Code on Phone</span>
                </button>
              </div>

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
                    background: '#09090b',
                    border: '1px solid #3f3f46',
                    borderRadius: '8px',
                    padding: '12px 12px 12px 36px',
                    color: '#ffffff',
                    fontSize: '1.4rem',
                    fontFamily: 'monospace',
                    letterSpacing: '6px',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <Key size={18} color="#71717a" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !totpCode || totpCode.length !== 6}
              style={{
                width: '100%',
                background: '#ffffff',
                color: '#09090b',
                border: 'none',
                borderRadius: '8px',
                padding: '13px',
                fontWeight: '700',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: (loading || !totpCode || totpCode.length !== 6) ? 'not-allowed' : 'pointer',
                opacity: (loading || !totpCode || totpCode.length !== 6) ? 0.7 : 1,
                transition: 'all 0.15s ease'
              }}
            >
              {loading ? <RefreshCw size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              <span>{loading ? 'Verifying Code...' : 'Log In with Zoho OneAuth'}</span>
            </button>
          </form>
        )}

        {/* TAB 2: BIOMETRIC PASSKEY / TOUCH ID LOGIN */}
        {activeTab === 'passkey' && (
          <div>
            <div style={{
              background: 'rgba(74, 222, 128, 0.05)',
              border: '1px solid rgba(74, 222, 128, 0.15)',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '0.8rem',
              color: '#86efac',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Fingerprint size={18} style={{ flexShrink: 0 }} />
              <span>Authenticate instantly with Touch ID, Face ID, or Windows Hello.</span>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#a1a1aa', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Account Email or Username
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="guidetalk.app@gmail.com"
                  required
                  style={{
                    width: '100%',
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    padding: '10px 12px 10px 36px',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <Mail size={16} color="#71717a" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={passkeyLoading}
              style={{
                width: '100%',
                background: 'linear-gradient(180deg, #27272a 0%, #18181b 100%)',
                border: '1px solid #3f3f46',
                color: '#ffffff',
                borderRadius: '10px',
                padding: '15px',
                fontWeight: '700',
                fontSize: '0.92rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                cursor: passkeyLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
              }}
            >
              {passkeyLoading ? (
                <RefreshCw size={20} className="animate-spin" />
              ) : (
                <Fingerprint size={22} color="#4ade80" />
              )}
              <span>{passkeyLoading ? 'Verifying Biometrics...' : 'Touch ID / Fingerprint Login'}</span>
            </button>
            <p style={{ fontSize: '0.74rem', color: '#71717a', textAlign: 'center', marginTop: '12px' }}>
              Ensure your device has a registered passkey. You can register more passkeys anytime in your settings.
            </p>
          </div>
        )}

        {/* TAB 3: PASSWORD LOGIN */}
        {activeTab === 'password' && (
          <form onSubmit={handlePasswordLogin}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: '#a1a1aa', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Email or Username
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="guidetalk.app@gmail.com"
                  required
                  style={{
                    width: '100%',
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    padding: '10px 12px 10px 36px',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <Mail size={16} color="#71717a" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            <div style={{ marginBottom: showSecondaryTotp ? '14px' : '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.76rem', fontWeight: '600', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => { setShowForgotModal(true); setForgotEmail(identifier); }}
                  style={{ background: 'none', border: 'none', color: '#a1a1aa', fontSize: '0.74rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
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
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    padding: '10px 12px 10px 36px',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <Lock size={16} color="#71717a" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            {showSecondaryTotp && (
              <div style={{
                background: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '20px',
              }}>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#ffffff', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  OneAuth 6-Digit Verification Code
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
                    background: '#09090b',
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: '#ffffff',
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
                background: '#ffffff',
                color: '#09090b',
                border: 'none',
                borderRadius: '8px',
                padding: '12px',
                fontWeight: '700',
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              <span>{showSecondaryTotp ? 'Verify & Enter Dashboard' : 'Continue with Password'}</span>
            </button>
          </form>
        )}

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.72rem', color: '#52525b' }}>
          Protected by Chatter OS Sentinel • AES-256 + WebAuthn FIDO2
        </div>
      </div>

      {/* Forgot Password OTP Modal */}
      {showForgotModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#121215',
            border: '1px solid #27272a',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '420px',
            padding: '28px',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#27272a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <KeyRound size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', margin: 0, color: '#fff' }}>Reset Password</h3>
                <p style={{ fontSize: '0.76rem', color: '#a1a1aa', margin: 0 }}>Send OTP to your email to recover access</p>
              </div>
            </div>

            {forgotError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#f87171', borderRadius: '8px', padding: '8px 12px', fontSize: '0.78rem', marginBottom: '14px' }}>
                {forgotError}
              </div>
            )}
            {forgotSuccess && (
              <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.25)', color: '#4ade80', borderRadius: '8px', padding: '8px 12px', fontSize: '0.78rem', marginBottom: '14px' }}>
                {forgotSuccess}
              </div>
            )}

            {!otpSent ? (
              <form onSubmit={handleSendForgotOtp}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#a1a1aa', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Registered Email
                  </label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      background: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      color: '#ffffff',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    style={{ background: 'none', border: '1px solid #27272a', color: '#a1a1aa', borderRadius: '8px', padding: '10px 16px', fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    style={{ background: '#fff', color: '#09090b', border: 'none', borderRadius: '8px', padding: '10px 18px', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    {forgotLoading ? 'Sending...' : 'Send 6-Digit OTP'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPassword}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#a1a1aa', marginBottom: '6px', textTransform: 'uppercase' }}>
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    required
                    style={{
                      width: '100%',
                      background: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      color: '#ffffff',
                      fontSize: '1.1rem',
                      fontFamily: 'monospace',
                      letterSpacing: '4px',
                      textAlign: 'center',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#a1a1aa', marginBottom: '6px', textTransform: 'uppercase' }}>
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
                      background: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      color: '#ffffff',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    style={{ background: 'none', border: '1px solid #27272a', color: '#a1a1aa', borderRadius: '8px', padding: '10px 16px', fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    style={{ background: '#fff', color: '#09090b', border: 'none', borderRadius: '8px', padding: '10px 18px', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    {forgotLoading ? 'Resetting...' : 'Reset & Log In'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Zoho OneAuth QR Setup Modal (For linking phone app directly from login screen) */}
      {showOneAuthSetupModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#121215',
            border: '1px solid #27272a',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '440px',
            padding: '28px',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#27272a', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <QrCode size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', margin: 0, color: '#fff' }}>Pair Zoho OneAuth App</h3>
                <p style={{ fontSize: '0.76rem', color: '#a1a1aa', margin: 0 }}>Unlock your OneAuth QR code securely</p>
              </div>
            </div>

            {setupError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#f87171', borderRadius: '8px', padding: '8px 12px', fontSize: '0.78rem', marginBottom: '14px' }}>
                {setupError}
              </div>
            )}
            {setupSuccess && (
              <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.25)', color: '#4ade80', borderRadius: '8px', padding: '8px 12px', fontSize: '0.78rem', marginBottom: '14px' }}>
                {setupSuccess}
              </div>
            )}

            {setupStep === 'request' && (
              <form onSubmit={handleRequestSetupOtp}>
                <p style={{ fontSize: '0.82rem', color: '#a1a1aa', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                  To view your Zoho OneAuth QR code, we will send a 6-digit confirmation code to your authorized email address.
                </p>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#a1a1aa', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Owner Email
                  </label>
                  <input
                    type="email"
                    value={setupEmail}
                    onChange={(e) => setSetupEmail(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      background: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      color: '#ffffff',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => { setShowOneAuthSetupModal(false); setSetupStep('request'); }}
                    style={{ background: 'none', border: '1px solid #27272a', color: '#a1a1aa', borderRadius: '8px', padding: '10px 16px', fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={setupLoading}
                    style={{ background: '#fff', color: '#09090b', border: 'none', borderRadius: '8px', padding: '10px 18px', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    {setupLoading ? 'Sending...' : 'Send Setup Code'}
                  </button>
                </div>
              </form>
            )}

            {setupStep === 'verify' && (
              <form onSubmit={handleVerifySetupOtp}>
                <p style={{ fontSize: '0.82rem', color: '#a1a1aa', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                  Enter the 6-digit verification code sent to <b style={{ color: '#fff' }}>{setupEmail}</b>.
                </p>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#a1a1aa', marginBottom: '6px', textTransform: 'uppercase' }}>
                    6-Digit Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={setupOtpCode}
                    onChange={(e) => setSetupOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    required
                    autoFocus
                    style={{
                      width: '100%',
                      background: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      color: '#ffffff',
                      fontSize: '1.2rem',
                      fontFamily: 'monospace',
                      letterSpacing: '4px',
                      textAlign: 'center',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setSetupStep('request')}
                    style={{ background: 'none', border: '1px solid #27272a', color: '#a1a1aa', borderRadius: '8px', padding: '10px 16px', fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={setupLoading || setupOtpCode.length !== 6}
                    style={{ background: '#fff', color: '#09090b', border: 'none', borderRadius: '8px', padding: '10px 18px', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    {setupLoading ? 'Verifying...' : 'Unlock QR Code'}
                  </button>
                </div>
              </form>
            )}

            {setupStep === 'qr' && setupQrData && (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  background: '#ffffff',
                  padding: '14px',
                  borderRadius: '12px',
                  display: 'inline-block',
                  margin: '10px auto 16px',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.5)'
                }}>
                  {setupQrData.qrDataUrl && (
                    <img
                      src={setupQrData.qrDataUrl}
                      alt="Zoho OneAuth QR Code"
                      style={{ width: '180px', height: '180px', display: 'block' }}
                    />
                  )}
                </div>

                <div style={{ textAlign: 'left', marginBottom: '16px', background: '#18181b', padding: '12px', borderRadius: '8px', border: '1px solid #27272a' }}>
                  <div style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', marginBottom: '4px' }}>Manual Secret Key</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#f4f4f5', wordBreak: 'break-all' }}>
                      {setupQrData.secret}
                    </span>
                    <button
                      type="button"
                      onClick={copySecretToClipboard}
                      style={{ background: '#27272a', border: '1px solid #3f3f46', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '0.74rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
                    >
                      {copiedSecret ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
                      <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <p style={{ fontSize: '0.78rem', color: '#a1a1aa', margin: '0 0 20px 0', lineHeight: 1.4 }}>
                  1. Open the <b>Zoho OneAuth</b> app on your phone.<br/>
                  2. Tap <b>+</b> and choose <b>Scan QR Code</b> (or enter the key manually).<br/>
                  3. Use the 6-digit code shown in the app to log in!
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setShowOneAuthSetupModal(false);
                    setSetupStep('request');
                    setActiveTab('oneauth');
                  }}
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    color: '#09090b',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px',
                    fontWeight: '700',
                    fontSize: '0.86rem',
                    cursor: 'pointer'
                  }}
                >
                  Done! Return to Zoho OneAuth Login
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
