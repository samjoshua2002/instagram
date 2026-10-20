'use client';

import React, { useState, useEffect } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Fingerprint, Lock, Mail, Key, ShieldCheck, ArrowRight, RefreshCw, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://instagram-ai-bot-64tf.onrender.com';

export default function LoginPage({ onLoginSuccess }) {
  const [identifier, setIdentifier] = useState('guidetalk.app@gmail.com');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showTotpInput, setShowTotpInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('guidetalk.app@gmail.com');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  // Primary Password & TOTP submission
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
          totpCode: showTotpInput ? totpCode : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (data.requireTotp) {
        setShowTotpInput(true);
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

  // Biometric Passkey / Fingerprint login
  const handlePasskeyLogin = async () => {
    setError('');
    setInfoMessage('');
    setPasskeyLoading(true);

    try {
      // 1. Get WebAuthn assertion options from backend
      const optionsRes = await fetch(`${API_BASE}/api/auth/passkey/login-options?email=${encodeURIComponent(identifier)}`);
      if (!optionsRes.ok) {
        const errData = await optionsRes.json();
        throw new Error(errData.error || 'Failed to fetch passkey challenge');
      }
      const options = await optionsRes.json();

      // 2. Prompt browser TouchID / FaceID / Fingerprint
      const assertion = await startAuthentication({ optionsJSON: options });

      // 3. Verify assertion with backend
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

  // Request 6-digit OTP email
  const handleSendOtp = async (e) => {
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

  // Verify OTP and reset password
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
      }, 1800);
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
        maxWidth: '440px',
        background: '#121215',
        border: '1px solid #27272a',
        borderRadius: '16px',
        padding: '32px 28px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        boxSizing: 'border-box',
      }}>
        {/* Brand / Security Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: '#ffffff',
            color: '#09090b',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '14px',
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

        {/* Alerts */}
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
            <AlertCircle size={16} />
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
            <CheckCircle2 size={16} />
            <span>{infoMessage}</span>
          </div>
        )}

        {/* 1-Tap Biometric Passkey / Fingerprint Button */}
        <button
          type="button"
          onClick={handlePasskeyLogin}
          disabled={passkeyLoading || loading}
          style={{
            width: '100%',
            background: 'linear-gradient(180deg, #27272a 0%, #18181b 100%)',
            border: '1px solid #3f3f46',
            color: '#ffffff',
            borderRadius: '10px',
            padding: '14px',
            fontWeight: '700',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            cursor: passkeyLoading ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
            marginBottom: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
          }}
        >
          {passkeyLoading ? (
            <RefreshCw size={18} className="animate-spin" />
          ) : (
            <Fingerprint size={20} color="#a1a1aa" />
          )}
          <span>{passkeyLoading ? 'Verifying Biometrics...' : 'Sign in with Passkey / Touch ID'}</span>
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px'
        }}>
          <div style={{ flex: 1, height: '1px', background: '#27272a' }} />
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#71717a' }}>
            or password + oneauth
          </span>
          <div style={{ flex: 1, height: '1px', background: '#27272a' }} />
        </div>

        {/* Password + OneAuth Form */}
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

          <div style={{ marginBottom: showTotpInput ? '14px' : '20px' }}>
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

          {/* OneAuth 6-digit verification code input */}
          {showTotpInput && (
            <div style={{
              background: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: '10px',
              padding: '14px',
              marginBottom: '20px',
              animation: 'fadeIn 0.2s ease-in'
            }}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#ffffff', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                OneAuth Verification Code (6 Digits)
              </label>
              <div style={{ position: 'relative' }}>
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
                    padding: '10px 12px 10px 36px',
                    color: '#ffffff',
                    fontSize: '1.2rem',
                    fontFamily: 'monospace',
                    letterSpacing: '4px',
                    boxSizing: 'border-box',
                    outline: 'none',
                    textAlign: 'center'
                  }}
                />
                <Key size={16} color="#71717a" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
              <p style={{ fontSize: '0.72rem', color: '#71717a', margin: '8px 0 0', textAlign: 'center' }}>
                Open Zoho OneAuth or Google Authenticator to get your 6-digit code.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || passkeyLoading}
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
            <span>{showTotpInput ? 'Verify & Enter Dashboard' : 'Continue with Password'}</span>
          </button>
        </form>

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
              <form onSubmit={handleSendOtp}>
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
    </div>
  );
}
