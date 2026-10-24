'use client';

import React, { useState, useEffect } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
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
  Layers,
  UserPlus,
  Eye,
  EyeOff,
  UserCheck,
  ArrowLeft,
  User as UserIcon,
  Phone,
  Instagram,
  ShieldCheck,
  LogOut,
  X
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://instagram-ai-bot-64tf.onrender.com';

function detectCurrentDevice() {
  if (typeof window === 'undefined') return 'Biometric Passkey';
  const ua = navigator.userAgent || '';
  if (/iPhone/i.test(ua)) return 'iPhone (Face ID / Touch ID)';
  if (/iPad/i.test(ua)) return 'iPad (Touch ID)';
  if (/Android/i.test(ua)) {
    if (/Samsung/i.test(ua)) return 'Samsung Galaxy (Biometrics)';
    if (/Pixel/i.test(ua)) return 'Google Pixel (Fingerprint)';
    if (/Xiaomi|Redmi/i.test(ua)) return 'Xiaomi Phone (Fingerprint)';
    if (/OnePlus/i.test(ua)) return 'OnePlus (Fingerprint)';
    return 'Android Phone (Fingerprint)';
  }
  if (/Macintosh|Mac OS X/i.test(ua)) return 'MacBook (Touch ID)';
  if (/Windows/i.test(ua)) return 'Windows PC (Windows Hello)';
  if (/CrOS/i.test(ua)) return 'Chromebook (Fingerprint)';
  if (/Linux/i.test(ua)) return 'Linux (Security Key)';
  return 'Security Key / Biometrics';
}

export default function LoginPage({ onLoginSuccess }) {
  // Top primary navigation tabs: 'signin' | 'register'
  const [authMode, setAuthMode] = useState('signin');

  const sanitizeAccountRole = (acc) => {
    if (!acc) return acc;
    const isSuper = acc.email === 'samjoshuacs2002@gmail.com' || acc.username === 'samjoshua2002';
    return {
      ...acc,
      role: isSuper ? 'superadmin' : 'user'
    };
  };

  // Cached / Remembered Accounts State (Multi-Account Support)
  const [savedAccounts, setSavedAccounts] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('chatter_saved_accounts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = parsed.map(sanitizeAccountRole);
          try { localStorage.setItem('chatter_saved_accounts', JSON.stringify(sanitized)); } catch (e) {}
          return sanitized;
        }
      }
      const single = localStorage.getItem('chatter_remembered_account');
      if (single) {
        const parsed = JSON.parse(single);
        if (parsed && (parsed.email || parsed.username)) {
          const sanitized = [sanitizeAccountRole(parsed)];
          try { localStorage.setItem('chatter_saved_accounts', JSON.stringify(sanitized)); } catch (e) {}
          return sanitized;
        }
      }
      return [];
    } catch {
      return [];
    }
  });

  const [rememberedAccount, setRememberedAccount] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('chatter_saved_accounts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = sanitizeAccountRole(parsed[0]);
          try { localStorage.setItem('chatter_remembered_account', JSON.stringify(sanitized)); } catch (e) {}
          return sanitized;
        }
      }
      const cached = localStorage.getItem('chatter_remembered_account');
      if (cached) {
        const sanitized = sanitizeAccountRole(JSON.parse(cached));
        try { localStorage.setItem('chatter_remembered_account', JSON.stringify(sanitized)); } catch (e) {}
        return sanitized;
      }
      return null;
    } catch {
      return null;
    }
  });

  // Re-sync local storage cache on mount to immediately remove superadmin from guidetalk
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('chatter_saved_accounts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const sanitized = parsed.map(sanitizeAccountRole);
          localStorage.setItem('chatter_saved_accounts', JSON.stringify(sanitized));
          setSavedAccounts(sanitized);
        }
      }
      const single = localStorage.getItem('chatter_remembered_account');
      if (single) {
        const parsed = JSON.parse(single);
        if (parsed) {
          const sanitized = sanitizeAccountRole(parsed);
          localStorage.setItem('chatter_remembered_account', JSON.stringify(sanitized));
          setRememberedAccount(sanitized);
        }
      }
    } catch (e) {}
  }, []);

  const [useAnotherAccount, setUseAnotherAccount] = useState(false);
  const [showAccountChooser, setShowAccountChooser] = useState(false);

  // Sign In Sub-State
  // activeSignInMethod: 'passkey' | 'password' | 'oneauth'
  const [activeSignInMethod, setActiveSignInMethod] = useState(() => {
    if (typeof window === 'undefined') return 'password';
    try {
      const cached = localStorage.getItem('chatter_remembered_account');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.hasPasskeys) return 'passkey';
      }
    } catch {}
    return 'password';
  });
  const [identifier, setIdentifier] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const cached = localStorage.getItem('chatter_remembered_account');
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed?.email || parsed?.username || '';
      }
    } catch {}
    return '';
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [showSecondaryTotp, setShowSecondaryTotp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // OneAuth QR Code popup/helper
  const [showQrCode, setShowQrCode] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrData, setQrData] = useState(null);
  // The QR holds the account's secret, so it is shown only after an emailed code is entered
  const [qrEmail, setQrEmail] = useState('');
  const [qrUnlockCode, setQrUnlockCode] = useState('');
  const [qrNotice, setQrNotice] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Create Account Flow States
  // regStage: 'form' (Stage 1) | 'otp' (Stage 1.5) | 'passkey_prompt' (Stage 2)
  const [regStage, setRegStage] = useState('form');
  const [regForm, setRegForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    mobileNumber: '',
    whatsappNumber: '',
    instagramUsername: '',
    instagramId: '',
    password: '',
  });
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regOtpCode, setRegOtpCode] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');
  const [regAuthToken, setRegAuthToken] = useState(null);
  const [regAuthUser, setRegAuthUser] = useState(null);
  const [regPasskeyLoading, setRegPasskeyLoading] = useState(false);
  const [regPasskeySuccess, setRegPasskeySuccess] = useState(false);

  // Live Instagram Handle Recommendation & Validation State
  const [instaChecking, setInstaChecking] = useState(false);
  const [instaPreview, setInstaPreview] = useState(null);
  const [instaError, setInstaError] = useState('');

  // Debounced live Instagram profile lookup
  useEffect(() => {
    const handle = (regForm.instagramUsername || '').trim().replace(/^@/, '');
    if (!handle) {
      setInstaPreview(null);
      setInstaError('');
      setInstaChecking(false);
      return;
    }

    const isValidSyntax = /^[a-zA-Z0-9._]{1,30}$/.test(handle);
    if (!isValidSyntax) {
      setInstaPreview(null);
      setInstaError('Instagram handle can only contain letters, numbers, periods, and underscores.');
      setInstaChecking(false);
      return;
    }

    setInstaError('');
    setInstaChecking(true);
    setInstaPreview(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/instagram/check-handle?handle=${encodeURIComponent(handle)}`);
        const data = await res.json();
        if (data.alreadyRegistered) {
          setInstaError(data.message || `@${handle} is already registered on Chatter OS.`);
          setInstaPreview(null);
        } else if (data.exists) {
          setInstaPreview({
            ...data,
            username: data.handle || data.username || handle
          });
          setInstaError('');
          setRegForm(prev => ({
            ...prev,
            instagramId: data.instagramId || '',
            instagramUsername: data.handle || data.username || handle,
            profilePicUrl: data.profilePicUrl || prev.profilePicUrl || ''
          }));
        } else {
          // If valid handle syntax, allow user to proceed
          if (/^[a-zA-Z0-9._]{1,30}$/.test(handle)) {
            setInstaPreview({
              exists: true,
              handle,
              username: handle,
              fullName: handle,
              profilePicUrl: '',
              isProfessional: true
            });
            setInstaError('');
            setRegForm(prev => ({
              ...prev,
              instagramUsername: handle
            }));
          } else {
            setInstaError(data.message || 'Please enter a valid Instagram handle.');
            setInstaPreview(null);
          }
        }
      } catch (err) {
        if (/^[a-zA-Z0-9._]{1,30}$/.test(handle)) {
          setInstaPreview({
            exists: true,
            handle,
            username: handle,
            fullName: handle,
            profilePicUrl: '',
            isProfessional: true
          });
          setInstaError('');
        } else {
          setInstaError('Unable to verify Instagram account. Please check your connection.');
          setInstaPreview(null);
        }
      } finally {
        setInstaChecking(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [regForm.instagramUsername]);

  // Forgot Password Modal States
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

  // 1. Initialize Cached Account from LocalStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const cached = localStorage.getItem('chatter_remembered_account');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && (parsed.email || parsed.username)) {
          setRememberedAccount(parsed);
          setIdentifier(parsed.email || parsed.username);
          // If remembered user has passkeys configured, default method to passkey
          if (parsed.hasPasskeys) {
            setActiveSignInMethod('passkey');
          }
        }
      }
    } catch (e) {
      console.warn('Could not read cached account:', e);
    }
  }, []);

  // Helper to persist remembered account on any successful authentication
  const cacheAccount = (userData) => {
    if (!userData) return;
    try {
      const isConnected = Boolean(userData.hasInstagramToken || userData.isInstagramConnected || userData.instagramPageAccessToken);
      const record = {
        ...userData,
        email: userData.email,
        role: (userData.email === 'samjoshuacs2002@gmail.com' || userData.username === 'samjoshua2002') ? 'superadmin' : 'user',
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        profilePicUrl: userData.profilePicUrl || '',
        hasPasskeys: userData.hasPasskeys ?? true,
        hasInstagramToken: isConnected,
        isInstagramConnected: isConnected,
        instagramUsername: userData.instagramUsername || '',
        instagramAccountId: userData.instagramAccountId || userData.instagramId || '',
        instagramPageAccessToken: userData.instagramPageAccessToken || '',
        lastUsed: Date.now(),
      };
      localStorage.setItem('chatter_remembered_account', JSON.stringify(record));
      localStorage.setItem('chatter_user_profile', JSON.stringify(record));
      setRememberedAccount(record);

      let saved = [];
      try {
        const stored = localStorage.getItem('chatter_saved_accounts');
        if (stored) saved = JSON.parse(stored);
        if (!Array.isArray(saved)) saved = [];
      } catch (e) {}

      const filtered = saved.filter(a => a.email !== record.email && a.username !== record.username);
      filtered.unshift(record);
      localStorage.setItem('chatter_saved_accounts', JSON.stringify(filtered));
      setSavedAccounts(filtered);
    } catch (e) {}
  };

  // Switch / Choose Saved Account
  const handleSelectAccount = (acc) => {
    setRememberedAccount(acc);
    setIdentifier(acc.email || acc.username || '');
    setPassword('');
    setTotpCode('');
    setError('');
    setInfoMessage('');
    setUseAnotherAccount(false);
    setShowAccountChooser(false);
    try {
      localStorage.setItem('chatter_remembered_account', JSON.stringify(acc));
    } catch (e) {}
    if (acc.hasPasskeys) {
      setActiveSignInMethod('passkey');
    } else {
      setActiveSignInMethod('password');
    }
  };

  const handleRemoveSavedAccount = (emailToRemove, e) => {
    e?.stopPropagation();
    try {
      const updated = savedAccounts.filter(a => a.email !== emailToRemove);
      localStorage.setItem('chatter_saved_accounts', JSON.stringify(updated));
      setSavedAccounts(updated);
      if (rememberedAccount?.email === emailToRemove) {
        if (updated.length > 0) {
          handleSelectAccount(updated[0]);
        } else {
          setRememberedAccount(null);
          localStorage.removeItem('chatter_remembered_account');
          setUseAnotherAccount(true);
          setShowAccountChooser(false);
        }
      }
    } catch (e) {}
  };

  const handleSwitchAccount = () => {
    setShowAccountChooser(true);
    setUseAnotherAccount(false);
    setError('');
    setInfoMessage('');
  };

  const handleReturnToSavedAccount = () => {
    setUseAnotherAccount(false);
    setShowAccountChooser(false);
    if (rememberedAccount?.email) {
      setIdentifier(rememberedAccount.email);
    }
    setError('');
    setInfoMessage('');
  };

  // ─────────────────────────────────────────────────────────────
  // SIGN IN HANDLERS
  // ─────────────────────────────────────────────────────────────

  // 1-Tap Biometric / Passkey Login
  const handlePasskeyLogin = async (overrideIdentifier) => {
    setError('');
    setInfoMessage('');

    const targetId = (overrideIdentifier || identifier || rememberedAccount?.email || '').trim();
    setPasskeyLoading(true);

    try {
      const optionsUrl = targetId
        ? `${API_BASE}/api/auth/passkey/login-options?identifier=${encodeURIComponent(targetId)}`
        : `${API_BASE}/api/auth/passkey/login-options`;

      const optionsRes = await fetch(optionsUrl);
      if (!optionsRes.ok) {
        const errData = await optionsRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch passkey challenge.');
      }
      const options = await optionsRes.json();

      const assertion = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch(`${API_BASE}/api/auth/passkey/login-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: targetId,
          response: assertion,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || 'Passkey verification failed.');
      }

      if (verifyData.token) {
        cacheAccount(verifyData.user);
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

  // Password Login (+ optional OneAuth 2FA)
  const handlePasswordLogin = async (e) => {
    e?.preventDefault();
    setError('');
    setInfoMessage('');

    const loginId = (useAnotherAccount || !rememberedAccount)
      ? identifier.trim()
      : (rememberedAccount?.email || identifier.trim());

    if (!loginId) {
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
          identifier: loginId,
          password,
          totpCode: showSecondaryTotp ? totpCode : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid email or password.');
      }

      if (data.requireTotp) {
        setShowSecondaryTotp(true);
        setInfoMessage('Enter the 6-digit code from your Zoho OneAuth app.');
        setLoading(false);
        return;
      }

      if (data.token) {
        cacheAccount(data.user);
        onLoginSuccess(data.token, data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Zoho OneAuth Passwordless Login
  const handleOneAuthLogin = async (e) => {
    e?.preventDefault();
    setError('');
    setInfoMessage('');

    const loginId = (useAnotherAccount || !rememberedAccount)
      ? identifier.trim()
      : (rememberedAccount?.email || identifier.trim());

    if (!loginId) {
      setError('Please enter your email or username.');
      return;
    }
    if (!totpCode || totpCode.trim().length !== 6) {
      setError('Please enter the 6-digit code from your Zoho OneAuth app.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: loginId,
          totpCode: totpCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Zoho OneAuth verification failed.');
      }

      if (data.token) {
        cacheAccount(data.user);
        onLoginSuccess(data.token, data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Toggle QR Code for Zoho OneAuth
  const toggleQrCode = async () => {
    if (showQrCode) {
      setShowQrCode(false);
      return;
    }

    const emailToFetch = (useAnotherAccount || !rememberedAccount)
      ? identifier.trim()
      : (rememberedAccount?.email || identifier.trim());

    if (!emailToFetch) {
      setError('Please enter your email above first to view your QR code.');
      return;
    }

    setError('');
    setShowQrCode(true);
    setQrLoading(true);
    setQrData(null);
    setQrUnlockCode('');
    setQrEmail(emailToFetch);

    try {
      const res = await fetch(`${API_BASE}/api/auth/oneauth/request-setup-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToFetch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send the code.');
      setQrNotice(data.message || 'We emailed you a 6-digit code.');
    } catch (err) {
      setError(err.message || 'Could not load QR code.');
      setShowQrCode(false);
    } finally {
      setQrLoading(false);
    }
  };

  const unlockQrCode = async () => {
    if (qrUnlockCode.length !== 6) return;
    setQrLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/oneauth/verify-setup-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: qrEmail, otpCode: qrUnlockCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load QR code.');
      setQrData(data);
    } catch (err) {
      setQrNotice(err.message || 'Could not load QR code.');
    } finally {
      setQrLoading(false);
    }
  };

  const renderQrPanel = (size) => (
    <div style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '14px', marginBottom: '14px', textAlign: 'center' }}>
      {qrLoading ? (
        <RefreshCw size={18} className="animate-spin" color="var(--color-text-primary)" style={{ margin: '12px auto' }} />
      ) : qrData ? (
        <div>
          <img src={qrData.qrDataUrl} alt="OneAuth QR" style={{ width: size, height: size, display: 'block', margin: '0 auto 8px', borderRadius: '6px' }} />
          <p style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', margin: '0 0 6px' }}>Scan with Zoho OneAuth on your phone</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{qrData.secret?.slice(0, 14)}...</span>
            <button type="button" onClick={copySecret} style={{ background: 'none', border: 'none', color: 'var(--color-text-primary)', fontSize: '0.72rem', cursor: 'pointer', fontWeight: '600' }}>
              {copiedSecret ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', margin: '0 0 8px' }}>{qrNotice}</p>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={qrUnlockCode}
              onChange={(e) => setQrUnlockCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); unlockQrCode(); } }}
              placeholder="Email code"
              aria-label="6-digit code from your email"
              style={{ width: '120px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', textAlign: 'center', letterSpacing: '2px' }}
            />
            <button type="button" onClick={unlockQrCode} disabled={qrUnlockCode.length !== 6} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-text-primary)', color: 'var(--color-surface)', fontSize: '0.74rem', fontWeight: 600, cursor: qrUnlockCode.length === 6 ? 'pointer' : 'not-allowed', opacity: qrUnlockCode.length === 6 ? 1 : 0.5 }}>
              Show QR
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const copySecret = () => {
    if (qrData?.secret) {
      navigator.clipboard.writeText(qrData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // CREATE ACCOUNT HANDLERS (2-STAGE IN-PLACE PROCESS)
  // ─────────────────────────────────────────────────────────────

  // Stage 1: Submit Details & Request Email OTP (with Try/Catch account check)
  const handleRegisterSubmit = async (e) => {
    e?.preventDefault();
    setRegError('');
    setRegSuccess('');

    if (!regForm.username.trim()) {
      setRegError('Please choose a username for your account.');
      return;
    }
    if (regForm.username.trim().length < 3) {
      setRegError('Username must be at least 3 characters.');
      return;
    }
    if (!regForm.email.trim() || !regForm.email.includes('@')) {
      setRegError('Please provide a valid email address.');
      return;
    }
    if (!regForm.password || regForm.password.length < 6) {
      setRegError('Password must be at least 6 characters.');
      return;
    }
    if (regForm.instagramUsername && regForm.instagramUsername.trim()) {
      const cleanH = regForm.instagramUsername.trim().replace(/^@/, '');
      if (!/^[a-zA-Z0-9._]{1,30}$/.test(cleanH)) {
        setRegError('Instagram handle can only contain letters, numbers, periods, and underscores.');
        return;
      }
      if (instaChecking) {
        setRegError('Please wait for Instagram handle verification to complete.');
        return;
      }
      if (instaError) {
        setRegError(instaError);
        return;
      }
      if (!instaPreview || !instaPreview.exists) {
        if (/^[a-zA-Z0-9._]{1,30}$/.test(cleanH)) {
          setInstaPreview({
            exists: true,
            handle: cleanH,
            username: cleanH,
            fullName: cleanH,
            profilePicUrl: '',
            isProfessional: true
          });
        } else {
          setRegError('Please enter a valid Instagram handle.');
          return;
        }
      }
    }

    setRegLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const res = await fetch(`${API_BASE}/api/auth/register/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regForm),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await res.json();

      if (!res.ok) {
        // Explicit check if account already exists
        if (res.status === 409) {
          throw new Error(data.error || 'An account with this email or username already exists. Please sign in instead.');
        }
        throw new Error(data.error || 'Failed to initiate account creation.');
      }

      setRegSuccess(data.message || `Verification code sent to ${regForm.email}. Check your inbox!`);
      setRegStage('otp');
    } catch (err) {
      if (err.name === 'AbortError') {
        setRegError('Request timed out. Please check your network connection and try again.');
      } else {
        setRegError(err.message || 'Failed to initiate account creation.');
      }
    } finally {
      setRegLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setRegError('');
    setRegSuccess('');
    setRegLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/register/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regForm.email.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend code.');
      setRegSuccess(data.message || 'New verification code sent. Check your inbox!');
    } catch (err) {
      setRegError(err.message || 'Failed to resend verification code.');
    } finally {
      setRegLoading(false);
    }
  };

  // Stage 1.5: Confirm OTP & Verify Account
  const handleVerifyRegisterOtp = async (e) => {
    e?.preventDefault();
    setRegError('');
    setRegSuccess('');

    if (!regOtpCode || regOtpCode.trim().length !== 6) {
      setRegError('Please enter the 6-digit verification code sent to your email.');
      return;
    }

    setRegLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/register/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regForm.email.trim(),
          otpCode: regOtpCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Verification code failed or expired.');
      }

      // Save authenticated session state
      setRegAuthToken(data.token);
      setRegAuthUser(data.user);
      cacheAccount(data.user);

      // STAY IN SAME PAGE: Transition to Stage 2 (Passkey Prompt)
      setRegStage('passkey_prompt');
      setRegSuccess('Email verified! You can now link Touch ID / Passkey for fast sign-in.');
    } catch (err) {
      setRegError(err.message);
    } finally {
      setRegLoading(false);
    }
  };

  // Stage 2: In-Place Biometric Passkey Registration
  const handleSetupPasskeyInPlace = async () => {
    if (!regAuthToken) {
      setRegError('Session missing. Please try signing in.');
      return;
    }

    setRegPasskeyLoading(true);
    setRegError('');

    try {
      const optionsRes = await fetch(`${API_BASE}/api/auth/passkey/register-options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${regAuthToken}`,
        },
      });

      if (!optionsRes.ok) {
        const errData = await optionsRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to initialize passkey registration.');
      }
      const options = await optionsRes.json();

      const registration = await startRegistration({ optionsJSON: options });
      const deviceName = detectCurrentDevice();

      const verifyRes = await fetch(`${API_BASE}/api/auth/passkey/register-verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${regAuthToken}`,
        },
        body: JSON.stringify({
          response: registration,
          name: deviceName,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || 'Failed to verify passkey.');
      }

      const updatedUser = { ...regAuthUser, hasPasskeys: true };
      cacheAccount(updatedUser);
      setRegPasskeySuccess(true);

      // Brief confirmation before entering dashboard
      setTimeout(() => {
        onLoginSuccess(regAuthToken, updatedUser);
      }, 1000);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setRegError('Passkey setup was cancelled. You can always configure it later in Settings.');
      } else {
        setRegError(err.message || 'Passkey setup could not be completed.');
      }
    } finally {
      setRegPasskeyLoading(false);
    }
  };

  const handleSkipPasskeyAndEnter = () => {
    if (regAuthToken && regAuthUser) {
      onLoginSuccess(regAuthToken, regAuthUser);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // FORGOT PASSWORD MODAL HANDLERS
  // ─────────────────────────────────────────────────────────────
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
      if (!res.ok) throw new Error(data.error || 'Reset failed.');

      setForgotSuccess('Password updated successfully! You can now log in.');
      setPassword(newPassword);
      setIdentifier(forgotEmail);
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotTotpCode('');
        setNewPassword('');
        setActiveSignInMethod('password');
      }, 1500);
    } catch (err) {
      setForgotError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

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
      if (!res.ok) throw new Error(data.error || 'Failed to send verification code.');

      setOtpSent(true);
      setForgotSuccess(data.message || 'Verification code sent to your email.');
    } catch (err) {
      setForgotError(err.message || 'Network delay. You can also use OneAuth (Instant) to reset immediately.');
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
      if (!res.ok) throw new Error(data.error || 'Failed to reset password.');

      setForgotSuccess('Password updated! Returning to login...');
      setPassword(newPassword);
      setIdentifier(forgotEmail);
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotOtpCode('');
        setNewPassword('');
        setOtpSent(false);
        setActiveSignInMethod('password');
      }, 1500);
    } catch (err) {
      setForgotError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  const openForgotModal = () => {
    const defaultEmail = rememberedAccount?.email || identifier || '';
    setForgotEmail(defaultEmail);
    setForgotError('');
    setForgotSuccess('');
    setOtpSent(false);
    setShowForgotModal(true);
  };

  return (
    <div className="login-split-layout">
      {/* LEFT COLUMN: ARCHITECTURAL POSTSDAMER PLATZ ARTWORK */}
      <div className="login-art-panel">
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'url(/login-art.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'contrast(1.08) grayscale(100%)',
          zIndex: 0
        }} />

        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(9, 9, 11, 0.4) 0%, rgba(9, 9, 11, 0.15) 50%, rgba(9, 9, 11, 0.85) 100%)',
          zIndex: 1
        }} />

        {/* Top Header Badge */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(9, 9, 11, 0.65)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            padding: '7px 14px',
            borderRadius: '999px',
            color: '#ffffff',
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
        <div style={{ position: 'relative', zIndex: 2, color: '#ffffff', maxWidth: '440px' }}>
          <h2 style={{ fontSize: '1.85rem', fontWeight: '800', letterSpacing: '-0.8px', margin: '0 0 8px 0', lineHeight: 1.2 }}>
            Potsdamer Platz
          </h2>
          <p style={{ fontSize: '0.86rem', color: 'rgba(255, 255, 255, 0.8)', lineHeight: 1.5, margin: 0 }}>
            Precision intelligence, few-shot style calibration, and automated Instagram creator workflows.
          </p>
        </div>
      </div>

      {/* RIGHT COLUMN: FULL-PAGE CLEAN FORM LAYOUT */}
      <div className="login-form-panel">
        <div className="login-form-container">
          {/* Brand Header */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '11px',
              background: 'var(--color-text-primary)',
              color: 'var(--color-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
              fontWeight: '800',
              fontSize: '1.05rem',
              letterSpacing: '-0.5px'
            }}>
              C
            </div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: '800', letterSpacing: '-0.6px', margin: '0 0 6px 0', color: 'var(--color-text-primary)' }}>
              {authMode === 'signin' ? 'Welcome back to Chatter' : 'Create your Chatter Account'}
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0 }}>
              {authMode === 'signin'
                ? 'Sign in to access your automated Instagram creator suite.'
                : 'Enter your credentials to configure your personalized creator workspace.'}
            </p>
          </div>

          {/* PRIMARY NAVIGATION TABS: [ Sign In ] vs [ Create Account ] */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px',
            background: 'var(--color-surface-hover)',
            padding: '4px',
            borderRadius: '12px',
            marginBottom: '24px',
            border: '1px solid var(--color-border)'
          }}>
            <button
              type="button"
              onClick={() => {
                setAuthMode('signin');
                setError('');
                setInfoMessage('');
              }}
              style={{
                background: authMode === 'signin' ? 'var(--color-surface)' : 'transparent',
                color: authMode === 'signin' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                border: authMode === 'signin' ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
                borderRadius: '8px',
                padding: '9px 12px',
                fontSize: '0.84rem',
                fontWeight: authMode === 'signin' ? '700' : '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: authMode === 'signin' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <Lock size={15} />
              <span>Sign In</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setRegError('');
                setRegSuccess('');
              }}
              style={{
                background: authMode === 'register' ? 'var(--color-surface)' : 'transparent',
                color: authMode === 'register' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                border: authMode === 'register' ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
                borderRadius: '8px',
                padding: '9px 12px',
                fontSize: '0.84rem',
                fontWeight: authMode === 'register' ? '700' : '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: authMode === 'register' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <UserPlus size={15} />
              <span>Create Account</span>
            </button>
          </div>

          {/* ════════════════════════════════════════════════════════════
              MODE A: SIGN IN (SMART CACHED ACCOUNT & INDUSTRY STANDARD)
              ════════════════════════════════════════════════════════════ */}
          {authMode === 'signin' && (
            <div>
              {/* Feedback messages */}
              {error && (
                <div style={{
                  background: 'color-mix(in srgb, #ef4444 12%, transparent)',
                  border: '1px solid color-mix(in srgb, #ef4444 35%, transparent)',
                  color: '#f87171',
                  borderRadius: '10px',
                  padding: '11px 14px',
                  fontSize: '0.82rem',
                  marginBottom: '18px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '9px',
                  lineHeight: 1.4
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{error}</span>
                </div>
              )}

              {infoMessage && (
                <div style={{
                  background: 'color-mix(in srgb, #22c55e 12%, transparent)',
                  border: '1px solid color-mix(in srgb, #22c55e 35%, transparent)',
                  color: '#4ade80',
                  borderRadius: '10px',
                  padding: '11px 14px',
                  fontSize: '0.82rem',
                  marginBottom: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '9px'
                }}>
                  <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                  <span>{infoMessage}</span>
                </div>
              )}

              {/* SCENARIO 0: MULTI-ACCOUNT CHOOSER LIST */}
              {showAccountChooser ? (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0 }}>
                      Choose an account
                    </h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', margin: '4px 0 0 0' }}>
                      Select a saved account to continue to Chatter OS:
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {(savedAccounts.length > 0 ? savedAccounts : (rememberedAccount ? [rememberedAccount] : [])).map((acc) => {
                      const isCurrent = rememberedAccount?.email === acc.email;
                      const isSuper = acc.role === 'superadmin';
                      return (
                        <div
                          key={acc.email || acc.username}
                          onClick={() => handleSelectAccount(acc)}
                          style={{
                            border: '1.5px solid',
                            borderColor: isCurrent ? 'var(--color-text-primary)' : 'var(--color-border)',
                            background: isCurrent ? 'var(--color-surface-elevated)' : 'var(--color-surface)',
                            borderRadius: '11px',
                            padding: '12px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                            <div style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '10px',
                              background: 'var(--color-text-primary)',
                              color: 'var(--color-surface)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: '800',
                              fontSize: '0.92rem',
                              flexShrink: 0,
                              overflow: 'hidden'
                            }}>
                              {acc.profilePicUrl ? (
                                <img src={acc.profilePicUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                (acc.firstName?.[0] || acc.username?.[0] || 'U').toUpperCase()
                              )}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {acc.firstName ? `${acc.firstName} ${acc.lastName || ''}`.trim() : acc.username}
                                </span>
                                {isSuper && (
                                  <span style={{
                                    fontSize: '0.62rem',
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontWeight: '800',
                                    background: 'var(--color-text-primary)',
                                    color: 'var(--color-surface)',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    flexShrink: 0
                                  }}>
                                    SUPERADMIN
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {acc.email} • @{acc.username}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => handleRemoveSavedAccount(acc.email, e)}
                            title="Remove account from device"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--color-text-muted)',
                              cursor: 'pointer',
                              padding: '6px',
                              borderRadius: '4px'
                            }}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Sign in with another account */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowAccountChooser(false);
                      setUseAnotherAccount(true);
                      setIdentifier('');
                      setPassword('');
                      setTotpCode('');
                      setError('');
                      setActiveSignInMethod('password');
                    }}
                    style={{
                      width: '100%',
                      padding: '11px',
                      borderRadius: '10px',
                      border: '1.5px dashed var(--color-border-strong)',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      fontSize: '0.84rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <UserPlus size={15} />
                    <span>Sign in with another account</span>
                  </button>
                </div>
              ) : rememberedAccount && !useAnotherAccount ? (
                /* SCENARIO 1: REMEMBERED ACCOUNT CARD */
                <div>
                  <div style={{
                    background: 'var(--color-surface-elevated)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '20px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: 'var(--color-text-primary)',
                        color: 'var(--color-surface)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '700',
                        fontSize: '1rem',
                        flexShrink: 0,
                        overflow: 'hidden'
                      }}>
                        {rememberedAccount.profilePicUrl ? (
                          <img src={rememberedAccount.profilePicUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          (rememberedAccount.firstName?.[0] || rememberedAccount.username?.[0] || 'U').toUpperCase()
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {rememberedAccount.firstName ? `${rememberedAccount.firstName} ${rememberedAccount.lastName || ''}`.trim() : rememberedAccount.username}
                          </span>
                          {rememberedAccount.role === 'superadmin' && (
                            <span style={{
                              fontSize: '0.6rem',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontWeight: '800',
                              background: 'var(--color-text-primary)',
                              color: 'var(--color-surface)',
                              padding: '1px 5px',
                              borderRadius: '3px'
                            }}>
                              SUPERADMIN
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {rememberedAccount.email}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSwitchAccount}
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        fontSize: '0.76rem',
                        fontWeight: '700',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        padding: '5px 10px',
                        flexShrink: 0
                      }}
                    >
                      {savedAccounts.length > 1 ? `Switch (${savedAccounts.length})` : 'Switch'}
                    </button>
                  </div>

                  {/* PRIMARY 1-TAP PASSKEY BUTTON */}
                  <div style={{ marginBottom: '22px' }}>
                    <button
                      type="button"
                      onClick={() => handlePasskeyLogin(rememberedAccount.email)}
                      disabled={passkeyLoading}
                      style={{
                        width: '100%',
                        background: 'var(--color-text-primary)',
                        color: 'var(--color-surface)',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '14px',
                        fontWeight: '600',
                        fontSize: '0.92rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        cursor: passkeyLoading ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {passkeyLoading ? (
                        <RefreshCw size={18} className="animate-spin" />
                      ) : (
                        <Fingerprint size={18} color="var(--color-surface)" />
                      )}
                      <span>{passkeyLoading ? 'Verifying Touch ID / Biometrics...' : 'Continue with Touch ID / Passkey'}</span>
                    </button>
                    <p style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', margin: '7px 0 0', textAlign: 'center' }}>
                      Fast biometric authentication • No password required
                    </p>
                  </div>

                  {/* DIVIDER FOR ALTERNATIVE SIGN IN METHODS */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    margin: '22px 0 16px',
                    color: 'var(--color-text-muted)',
                    fontSize: '0.74rem'
                  }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
                    <span>or sign in using</span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
                  </div>

                  {/* Method Toggles */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '18px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSignInMethod('password');
                        setError('');
                      }}
                      style={{
                        background: activeSignInMethod === 'password' ? 'var(--color-surface)' : 'var(--color-surface-elevated)',
                        color: activeSignInMethod === 'password' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        border: activeSignInMethod === 'password' ? '1px solid var(--color-text-primary)' : '1px solid var(--color-border)',
                        borderRadius: '8px',
                        padding: '9px',
                        fontSize: '0.78rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <Key size={14} />
                      <span>Password</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveSignInMethod('oneauth');
                        setError('');
                      }}
                      style={{
                        background: activeSignInMethod === 'oneauth' ? 'var(--color-surface)' : 'var(--color-surface-elevated)',
                        color: activeSignInMethod === 'oneauth' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        border: activeSignInMethod === 'oneauth' ? '1px solid var(--color-text-primary)' : '1px solid var(--color-border)',
                        borderRadius: '8px',
                        padding: '9px',
                        fontSize: '0.78rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <Smartphone size={14} />
                      <span>Zoho OneAuth</span>
                    </button>
                  </div>

                  {/* Alternative 1: Password Entry */}
                  {activeSignInMethod === 'password' && (
                    <form onSubmit={handlePasswordLogin}>
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--color-text-secondary)' }}>
                            Password
                          </label>
                          <button
                            type="button"
                            onClick={openForgotModal}
                            style={{ background: 'none', border: 'none', color: 'var(--color-text-primary)', fontSize: '0.74rem', cursor: 'pointer', padding: 0, fontWeight: '600' }}
                          >
                            Forgot password?
                          </button>
                        </div>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                            style={{
                              width: '100%',
                              background: 'var(--color-surface)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '9px',
                              padding: '11px 40px 11px 12px',
                              color: 'var(--color-text-primary)',
                              fontSize: '0.9rem',
                              boxSizing: 'border-box',
                              outline: 'none'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            style={{
                              position: 'absolute',
                              right: '12px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              color: 'var(--color-text-secondary)',
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      {showSecondaryTotp && (
                        <div style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: 'var(--color-text-primary)', marginBottom: '6px' }}>
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
                              background: 'var(--color-surface)',
                              border: '1px solid var(--color-text-primary)',
                              borderRadius: '8px',
                              padding: '10px',
                              color: 'var(--color-text-primary)',
                              fontSize: '1.25rem',
                              fontFamily: "'JetBrains Mono', monospace",
                              letterSpacing: '5px',
                              textAlign: 'center',
                              boxSizing: 'border-box',
                              outline: 'none'
                            }}
                          />
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loading || !password}
                        style={{
                          width: '100%',
                          background: 'var(--color-text-primary)',
                          color: 'var(--color-surface)',
                          border: 'none',
                          borderRadius: '9px',
                          padding: '12px',
                          fontWeight: '600',
                          fontSize: '0.88rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          cursor: (loading || !password) ? 'not-allowed' : 'pointer',
                          opacity: (loading || !password) ? 0.6 : 1,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {loading ? <RefreshCw size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                        <span>{showSecondaryTotp ? 'Verify & Enter' : 'Sign In with Password'}</span>
                      </button>
                    </form>
                  )}

                  {/* Alternative 2: Zoho OneAuth Direct Login */}
                  {activeSignInMethod === 'oneauth' && (
                    <form onSubmit={handleOneAuthLogin}>
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--color-text-secondary)' }}>
                            6-Digit Zoho OneAuth Code
                          </label>
                          <button
                            type="button"
                            onClick={toggleQrCode}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--color-text-primary)',
                              fontSize: '0.74rem',
                              cursor: 'pointer',
                              padding: 0,
                              fontWeight: '600',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <QrCode size={13} />
                            <span>{showQrCode ? 'Hide QR' : 'Show QR'}</span>
                          </button>
                        </div>

                        {showQrCode && renderQrPanel('140px')}

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
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-text-primary)',
                            borderRadius: '9px',
                            padding: '11px',
                            color: 'var(--color-text-primary)',
                            fontSize: '1.25rem',
                            fontFamily: "'JetBrains Mono', monospace",
                            letterSpacing: '6px',
                            textAlign: 'center',
                            boxSizing: 'border-box',
                            outline: 'none'
                          }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading || totpCode.trim().length !== 6}
                        style={{
                          width: '100%',
                          background: 'var(--color-text-primary)',
                          color: 'var(--color-surface)',
                          border: 'none',
                          borderRadius: '9px',
                          padding: '12px',
                          fontWeight: '600',
                          fontSize: '0.88rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          cursor: (loading || totpCode.trim().length !== 6) ? 'not-allowed' : 'pointer',
                          opacity: (loading || totpCode.trim().length !== 6) ? 0.6 : 1,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {loading ? <RefreshCw size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                        <span>Sign In with OneAuth</span>
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                /* SCENARIO 2: STANDARD SIGN IN FORM (NO CACHED ACCOUNT OR SWITCHED) */
                <div>
                  {rememberedAccount && useAnotherAccount && (
                    <button
                      type="button"
                      onClick={handleReturnToSavedAccount}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-text-secondary)',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        marginBottom: '16px',
                        fontWeight: '500'
                      }}
                    >
                      <ArrowLeft size={14} />
                      <span>Back to saved account ({rememberedAccount.email})</span>
                    </button>
                  )}

                  {/* Method selector for standard sign-in */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '4px',
                    background: 'var(--color-surface-hover)',
                    padding: '3px',
                    borderRadius: '9px',
                    marginBottom: '18px'
                  }}>
                    <button
                      type="button"
                      onClick={() => { setActiveSignInMethod('password'); setError(''); }}
                      style={{
                        background: activeSignInMethod === 'password' ? 'var(--color-surface)' : 'transparent',
                        color: activeSignInMethod === 'password' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '7px 4px',
                        fontSize: '0.76rem',
                        fontWeight: activeSignInMethod === 'password' ? '600' : '500',
                        cursor: 'pointer'
                      }}
                    >
                      Password
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveSignInMethod('passkey'); setError(''); }}
                      style={{
                        background: activeSignInMethod === 'passkey' ? 'var(--color-surface)' : 'transparent',
                        color: activeSignInMethod === 'passkey' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '7px 4px',
                        fontSize: '0.76rem',
                        fontWeight: activeSignInMethod === 'passkey' ? '600' : '500',
                        cursor: 'pointer'
                      }}
                    >
                      Passkey
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveSignInMethod('oneauth'); setError(''); }}
                      style={{
                        background: activeSignInMethod === 'oneauth' ? 'var(--color-surface)' : 'transparent',
                        color: activeSignInMethod === 'oneauth' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '7px 4px',
                        fontSize: '0.76rem',
                        fontWeight: activeSignInMethod === 'oneauth' ? '600' : '500',
                        cursor: 'pointer'
                      }}
                    >
                      OneAuth
                    </button>
                  </div>

                  {/* Identifier Input */}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '5px' }}>
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
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        color: 'var(--color-text-primary)',
                        fontSize: '0.88rem',
                        boxSizing: 'border-box',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {/* Method: Password */}
                  {activeSignInMethod === 'password' && (
                    <form onSubmit={handlePasswordLogin}>
                      <div style={{ marginBottom: '18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--color-text-secondary)' }}>
                            Password
                          </label>
                          <button
                            type="button"
                            onClick={openForgotModal}
                            style={{ background: 'none', border: 'none', color: 'var(--color-text-primary)', fontSize: '0.74rem', cursor: 'pointer', padding: 0, fontWeight: '600' }}
                          >
                            Forgot password?
                          </button>
                        </div>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••••••"
                            required
                            style={{
                              width: '100%',
                              background: 'var(--color-surface)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '8px',
                              padding: '10px 38px 10px 12px',
                              color: 'var(--color-text-primary)',
                              fontSize: '0.88rem',
                              boxSizing: 'border-box',
                              outline: 'none'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                          >
                            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>

                      {showSecondaryTotp && (
                        <div style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: 'var(--color-text-primary)', marginBottom: '5px' }}>
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
                              background: 'var(--color-surface)',
                              border: '1px solid var(--color-text-primary)',
                              borderRadius: '6px',
                              padding: '8px',
                              color: 'var(--color-text-primary)',
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
                          background: 'var(--color-text-primary)',
                          color: 'var(--color-surface)',
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

                  {/* Method: Passkey */}
                  {activeSignInMethod === 'passkey' && (
                    <div>
                      <button
                        type="button"
                        onClick={() => handlePasskeyLogin(identifier.trim())}
                        disabled={passkeyLoading || !identifier.trim()}
                        style={{
                          width: '100%',
                          background: 'var(--color-text-primary)',
                          color: 'var(--color-surface)',
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
                        {passkeyLoading ? <RefreshCw size={16} className="animate-spin" /> : <Fingerprint size={16} />}
                        <span>{passkeyLoading ? 'Authenticating...' : 'Sign In with Passkey'}</span>
                      </button>
                      <p style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', margin: '8px 0 0', textAlign: 'center' }}>
                        Uses your device Touch ID, Face ID, or Windows Hello
                      </p>
                    </div>
                  )}

                  {/* Method: OneAuth */}
                  {activeSignInMethod === 'oneauth' && (
                    <form onSubmit={handleOneAuthLogin}>
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--color-text-secondary)' }}>
                            6-Digit Verification Code
                          </label>
                          <button
                            type="button"
                            onClick={toggleQrCode}
                            style={{ background: 'none', border: 'none', color: 'var(--color-text-primary)', fontSize: '0.72rem', cursor: 'pointer', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          >
                            <QrCode size={13} />
                            <span>{showQrCode ? 'Hide QR' : 'Show QR'}</span>
                          </button>
                        </div>

                        {showQrCode && renderQrPanel('130px')}

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
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-text-primary)',
                            borderRadius: '8px',
                            padding: '10px',
                            color: 'var(--color-text-primary)',
                            fontSize: '1.25rem',
                            fontFamily: "'JetBrains Mono', monospace",
                            letterSpacing: '5px',
                            textAlign: 'center',
                            boxSizing: 'border-box',
                            outline: 'none'
                          }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading || !identifier.trim() || totpCode.trim().length !== 6}
                        style={{
                          width: '100%',
                          background: 'var(--color-text-primary)',
                          color: 'var(--color-surface)',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '11px',
                          fontWeight: '600',
                          fontSize: '0.88rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          cursor: (loading || !identifier.trim() || totpCode.trim().length !== 6) ? 'not-allowed' : 'pointer',
                          opacity: (loading || !identifier.trim() || totpCode.trim().length !== 6) ? 0.6 : 1,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {loading ? <RefreshCw size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                        <span>Sign In with OneAuth</span>
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Bottom Footer Details */}
              <div style={{ marginTop: '28px', textAlign: 'center', fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>
                Chatter OS • End-to-End Encrypted Session
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════
              MODE B: CREATE ACCOUNT (2-STAGE IN-PLACE FLOW WITH OTP & PASSKEY)
              ════════════════════════════════════════════════════════════ */}
          {authMode === 'register' && (
            <div>
              {/* Feedback messages */}
              {regError && (
                <div style={{
                  background: 'color-mix(in srgb, #ef4444 12%, transparent)',
                  border: '1px solid color-mix(in srgb, #ef4444 35%, transparent)',
                  color: '#f87171',
                  borderRadius: '10px',
                  padding: '11px 14px',
                  fontSize: '0.82rem',
                  marginBottom: '18px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '9px',
                  lineHeight: 1.4
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ flex: 1 }}>
                    <div>{regError}</div>
                    {regError.includes('already exists') && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('signin');
                          setIdentifier(regForm.email || regForm.username);
                          setError('');
                        }}
                        style={{
                          marginTop: '6px',
                          background: 'none',
                          border: 'none',
                          color: '#f87171',
                          textDecoration: 'underline',
                          fontWeight: '700',
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        Click here to Sign In →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {regSuccess && (
                <div style={{
                  background: 'color-mix(in srgb, #22c55e 12%, transparent)',
                  border: '1px solid color-mix(in srgb, #22c55e 35%, transparent)',
                  color: '#4ade80',
                  borderRadius: '10px',
                  padding: '11px 14px',
                  fontSize: '0.82rem',
                  marginBottom: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '9px'
                }}>
                  <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                  <span>{regSuccess}</span>
                </div>
              )}

              {/* STAGE 1: FILL REGISTRATION DETAILS */}
              {regStage === 'form' && (
                <form onSubmit={handleRegisterSubmit}>
                  {/* Name fields in 2 columns */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                        First Name
                      </label>
                      <input
                        type="text"
                        value={regForm.firstName}
                        onChange={(e) => setRegForm({ ...regForm, firstName: e.target.value })}
                        placeholder="First name"
                        style={{
                          width: '100%',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '8px',
                          padding: '9px 11px',
                          color: 'var(--color-text-primary)',
                          fontSize: '0.86rem',
                          boxSizing: 'border-box',
                          outline: 'none'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                        Last Name
                      </label>
                      <input
                        type="text"
                        value={regForm.lastName}
                        onChange={(e) => setRegForm({ ...regForm, lastName: e.target.value })}
                        placeholder="Last name"
                        style={{
                          width: '100%',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '8px',
                          padding: '9px 11px',
                          color: 'var(--color-text-primary)',
                          fontSize: '0.86rem',
                          boxSizing: 'border-box',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>

                  {/* Username */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                      Username *
                    </label>
                    <input
                      type="text"
                      value={regForm.username}
                      onChange={(e) => setRegForm({ ...regForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '') })}
                      placeholder="e.g. samjoshua"
                      required
                      style={{
                        width: '100%',
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                        padding: '9px 11px',
                        color: 'var(--color-text-primary)',
                        fontSize: '0.86rem',
                        boxSizing: 'border-box',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {/* Email */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                      Email Address *
                    </label>
                    <input
                      type="email"
                      value={regForm.email}
                      onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                      placeholder="name@example.com"
                      required
                      style={{
                        width: '100%',
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                        padding: '9px 11px',
                        color: 'var(--color-text-primary)',
                        fontSize: '0.86rem',
                        boxSizing: 'border-box',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {/* Instagram Username & Mobile (Optional creator info) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                        <span>Instagram Handle</span>
                        {instaChecking && <RefreshCw size={11} className="animate-spin" style={{ color: 'var(--color-text-secondary)' }} />}
                      </label>
                      <input
                        type="text"
                        value={regForm.instagramUsername}
                        onChange={(e) => setRegForm({ ...regForm, instagramUsername: e.target.value.replace(/^@/, '') })}
                        placeholder="username"
                        style={{
                          width: '100%',
                          background: 'var(--color-surface)',
                          border: '1px solid',
                          borderColor: instaPreview ? '#16a34a' : (instaError ? '#ef4444' : 'var(--color-border)'),
                          borderRadius: '8px',
                          padding: '9px 11px',
                          color: 'var(--color-text-primary)',
                          fontSize: '0.86rem',
                          boxSizing: 'border-box',
                          outline: 'none',
                          transition: 'border-color 0.15s ease'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                        Mobile Number
                      </label>
                      <input
                        type="tel"
                        value={regForm.mobileNumber}
                        onChange={(e) => setRegForm({ ...regForm, mobileNumber: e.target.value })}
                        placeholder="+1 555-0199"
                        style={{
                          width: '100%',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '8px',
                          padding: '9px 11px',
                          color: 'var(--color-text-primary)',
                          fontSize: '0.86rem',
                          boxSizing: 'border-box',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>

                  {/* Instagram Verification Checking State */}
                  {instaChecking && (
                    <div style={{
                      marginBottom: '14px',
                      background: 'var(--color-surface-elevated)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '0.74rem',
                      color: 'var(--color-text-secondary)'
                    }}>
                      <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                      <span>Verifying professional/business account on Instagram...</span>
                    </div>
                  )}

                  {/* Instagram Live Account Recommendation Card */}
                  {instaPreview && !instaChecking && (
                    <div style={{
                      marginBottom: '14px',
                      background: 'color-mix(in srgb, #22c55e 12%, transparent)',
                      border: '1px solid color-mix(in srgb, #22c55e 35%, transparent)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}>
                      <img
                        src={instaPreview.profilePicUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(instaPreview.username)}&background=09090b&color=fff`}
                        alt={instaPreview.username}
                        onError={(e) => {
                          e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(instaPreview.username)}&background=09090b&color=fff`;
                        }}
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: '1.5px solid #16a34a',
                          flexShrink: 0
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ fontWeight: '700', fontSize: '0.84rem', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {instaPreview.fullName || instaPreview.username}
                          </span>
                          {instaPreview.isVerified && (
                            <span title="Verified Account" style={{ color: 'var(--ambient-dominant)', display: 'flex' }}>
                              <CheckCircle2 size={13} fill="var(--ambient-dominant)" color="var(--color-surface)" />
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          @{instaPreview.username} {instaPreview.instagramId ? `• ID: ${instaPreview.instagramId}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#4ade80', fontSize: '0.68rem', fontWeight: '800', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, background: 'color-mix(in srgb, #22c55e 14%, transparent)', padding: '3px 7px', borderRadius: '4px' }}>
                        <Check size={12} strokeWidth={3} />
                        <span>{instaPreview.isVerified ? 'VERIFIED' : 'READY'}</span>
                      </div>
                    </div>
                  )}

                  {instaError && !instaChecking && (
                    <div style={{
                      marginBottom: '14px',
                      background: 'color-mix(in srgb, #ef4444 12%, transparent)',
                      border: '1px solid color-mix(in srgb, #ef4444 35%, transparent)',
                      borderRadius: '8px',
                      padding: '7px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.74rem',
                      color: '#f87171'
                    }}>
                      <AlertCircle size={14} style={{ flexShrink: 0 }} />
                      <span>{instaError}</span>
                    </div>
                  )}

                  {/* Password */}
                  <div style={{ marginBottom: '18px' }}>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                      Set Password *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showRegPassword ? 'text' : 'password'}
                        value={regForm.password}
                        onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                        placeholder="Min. 6 characters"
                        required
                        minLength={6}
                        style={{
                          width: '100%',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '8px',
                          padding: '9px 38px 9px 11px',
                          color: 'var(--color-text-primary)',
                          fontSize: '0.86rem',
                          boxSizing: 'border-box',
                          outline: 'none'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                      >
                        {showRegPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={regLoading}
                    style={{
                      width: '100%',
                      background: 'var(--color-text-primary)',
                      color: 'var(--color-surface)',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '12px',
                      fontWeight: '600',
                      fontSize: '0.88rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      cursor: regLoading ? 'not-allowed' : 'pointer',
                      opacity: regLoading ? 0.7 : 1,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {regLoading ? <RefreshCw size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                    <span>{regLoading ? 'Verifying Details...' : 'Continue & Verify Email'}</span>
                  </button>
                </form>
              )}

              {/* STAGE 1.5: IN-PLACE OTP VERIFICATION */}
              {regStage === 'otp' && (
                <div>
                  <div style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '16px', marginBottom: '20px', textAlign: 'center' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--color-text-primary)', color: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                      <Mail size={18} />
                    </div>
                    <h3 style={{ fontSize: '0.98rem', fontWeight: '700', color: 'var(--color-text-primary)', margin: '0 0 4px' }}>
                      Verify your Email Address
                    </h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                      We sent a 6-digit confirmation code to <strong>{regForm.email}</strong>.
                    </p>
                  </div>

                  <form onSubmit={handleVerifyRegisterOtp}>
                    <div style={{ marginBottom: '18px' }}>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '6px', textAlign: 'center' }}>
                        Enter 6-Digit Verification Code
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={regOtpCode}
                        onChange={(e) => setRegOtpCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        autoFocus
                        required
                        style={{
                          width: '100%',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-text-primary)',
                          borderRadius: '8px',
                          padding: '11px',
                          color: 'var(--color-text-primary)',
                          fontSize: '1.3rem',
                          fontFamily: "'JetBrains Mono', monospace",
                          letterSpacing: '6px',
                          textAlign: 'center',
                          boxSizing: 'border-box',
                          outline: 'none'
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={regLoading || regOtpCode.trim().length !== 6}
                      style={{
                        width: '100%',
                        background: 'var(--color-text-primary)',
                        color: 'var(--color-surface)',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '12px',
                        fontWeight: '600',
                        fontSize: '0.88rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        cursor: (regLoading || regOtpCode.trim().length !== 6) ? 'not-allowed' : 'pointer',
                        opacity: (regLoading || regOtpCode.trim().length !== 6) ? 0.6 : 1,
                        marginBottom: '12px'
                      }}
                    >
                      {regLoading ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      <span>{regLoading ? 'Verifying Code...' : 'Confirm & Activate Account'}</span>
                    </button>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setRegStage('form')}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '0.76rem', cursor: 'pointer', padding: 0 }}
                      >
                        ← Edit Details
                      </button>
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={regLoading}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-primary)', fontSize: '0.76rem', fontWeight: '600', cursor: regLoading ? 'wait' : 'pointer', padding: 0 }}
                      >
                        {regLoading ? 'Sending...' : 'Resend Code'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* STAGE 2: IN-PLACE BIOMETRIC / PASSKEY SETUP PROMPT */}
              {regStage === 'passkey_prompt' && (
                <div style={{
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '16px',
                  padding: '24px',
                  textAlign: 'center'
                }}>
                  <div style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '14px',
                    background: 'var(--color-text-primary)',
                    color: 'var(--color-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px'
                  }}>
                    <Fingerprint size={28} />
                  </div>

                  <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--color-text-primary)', margin: '0 0 6px' }}>
                    Want to skip typing passwords?
                  </h3>
                  <p style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)', margin: '0 0 16px', lineHeight: 1.45 }}>
                    Set up Touch ID, Face ID, or your device security key right now. Next time you can log in with 1 tap!
                  </p>

                  <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.76rem',
                    color: 'var(--color-text-secondary)',
                    marginBottom: '20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <Sparkles size={13} color="var(--color-text-primary)" />
                    <span>Detected: <strong>{detectCurrentDevice()}</strong></span>
                  </div>

                  {regPasskeySuccess ? (
                    <div style={{
                      background: 'color-mix(in srgb, #22c55e 12%, transparent)',
                      border: '1px solid color-mix(in srgb, #22c55e 35%, transparent)',
                      color: '#4ade80',
                      borderRadius: '8px',
                      padding: '12px',
                      fontSize: '0.84rem',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}>
                      <CheckCircle2 size={18} />
                      <span>Passkey linked! Entering dashboard...</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={handleSetupPasskeyInPlace}
                        disabled={regPasskeyLoading}
                        style={{
                          width: '100%',
                          background: 'var(--color-text-primary)',
                          color: 'var(--color-surface)',
                          border: 'none',
                          borderRadius: '10px',
                          padding: '13px',
                          fontWeight: '600',
                          fontSize: '0.9rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          cursor: regPasskeyLoading ? 'not-allowed' : 'pointer',
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                        }}
                      >
                        {regPasskeyLoading ? (
                          <RefreshCw size={16} className="animate-spin" />
                        ) : (
                          <Fingerprint size={16} />
                        )}
                        <span>{regPasskeyLoading ? 'Linking Touch ID...' : 'Set Up Touch ID / Passkey'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSkipPasskeyAndEnter}
                        style={{
                          width: '100%',
                          background: 'transparent',
                          color: 'var(--color-text-secondary)',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '10px',
                          fontWeight: '500',
                          fontSize: '0.82rem',
                          cursor: 'pointer'
                        }}
                      >
                        Skip & Enter Dashboard →
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: '28px', textAlign: 'center', fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>
                Chatter OS • Precision Creator Infrastructure
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          FORGOT PASSWORD MODAL (INDUSTRY STANDARD RECOVERY)
          ════════════════════════════════════════════════════════════ */}
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
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '420px',
            padding: '26px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <KeyRound size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: '700', margin: 0, color: 'var(--color-text-primary)' }}>Reset Password</h3>
                  <p style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', margin: 0 }}>Choose your verified recovery method</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '1.2rem', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            {/* Recovery method switcher */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '4px',
              background: 'var(--color-surface-hover)',
              padding: '3px',
              borderRadius: '8px',
              marginBottom: '16px'
            }}>
              <button
                type="button"
                onClick={() => { setForgotMethod('oneauth'); setForgotError(''); setForgotSuccess(''); }}
                style={{
                  background: forgotMethod === 'oneauth' ? 'var(--color-surface)' : 'transparent',
                  color: forgotMethod === 'oneauth' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '7px',
                  fontSize: '0.76rem',
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
                  background: forgotMethod === 'email' ? 'var(--color-surface)' : 'transparent',
                  color: forgotMethod === 'email' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '7px',
                  fontSize: '0.76rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Email OTP
              </button>
            </div>

            {forgotError && (
              <div style={{ background: 'color-mix(in srgb, #ef4444 12%, transparent)', border: '1px solid color-mix(in srgb, #ef4444 35%, transparent)', color: '#f87171', borderRadius: '8px', padding: '9px 12px', fontSize: '0.78rem', marginBottom: '14px' }}>
                {forgotError}
              </div>
            )}
            {forgotSuccess && (
              <div style={{ background: 'color-mix(in srgb, #22c55e 12%, transparent)', border: '1px solid color-mix(in srgb, #22c55e 35%, transparent)', color: '#4ade80', borderRadius: '8px', padding: '9px 12px', fontSize: '0.78rem', marginBottom: '14px' }}>
                {forgotSuccess}
              </div>
            )}

            {/* Instant Reset via OneAuth Code */}
            {forgotMethod === 'oneauth' && (
              <form onSubmit={handleResetViaOneAuth}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
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
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '7px',
                      padding: '8px 10px',
                      color: 'var(--color-text-primary)',
                      fontSize: '0.86rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                    6-Digit Zoho OneAuth App Code
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
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-text-primary)',
                      borderRadius: '7px',
                      padding: '8px',
                      color: 'var(--color-text-primary)',
                      fontSize: '1.1rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: '4px',
                      textAlign: 'center',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                    New Password (min. 8 characters)
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                    style={{
                      width: '100%',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '7px',
                      padding: '8px 10px',
                      color: 'var(--color-text-primary)',
                      fontSize: '0.86rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading || !forgotEmail || forgotTotpCode.length !== 6 || newPassword.length < 8}
                  style={{
                    width: '100%',
                    background: 'var(--color-text-primary)',
                    color: 'var(--color-surface)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '11px',
                    fontWeight: '600',
                    fontSize: '0.86rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: (forgotLoading || !forgotEmail || forgotTotpCode.length !== 6 || newPassword.length < 8) ? 'not-allowed' : 'pointer',
                    opacity: (forgotLoading || !forgotEmail || forgotTotpCode.length !== 6 || newPassword.length < 8) ? 0.6 : 1
                  }}
                >
                  {forgotLoading ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  <span>Update Password Instantly</span>
                </button>
              </form>
            )}

            {/* Reset via Email OTP */}
            {forgotMethod === 'email' && (
              <div>
                {!otpSent ? (
                  <form onSubmit={handleSendEmailOtp}>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                        Account Email Address
                      </label>
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="name@example.com"
                        required
                        style={{
                          width: '100%',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '7px',
                          padding: '8px 10px',
                          color: 'var(--color-text-primary)',
                          fontSize: '0.86rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={forgotLoading || !forgotEmail}
                      style={{
                        width: '100%',
                        background: 'var(--color-text-primary)',
                        color: 'var(--color-surface)',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '11px',
                        fontWeight: '600',
                        fontSize: '0.86rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        cursor: (forgotLoading || !forgotEmail) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {forgotLoading ? <RefreshCw size={15} className="animate-spin" /> : <Mail size={15} />}
                      <span>Send 6-Digit Verification Code</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyEmailOtp}>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                        6-Digit Verification Code
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={forgotOtpCode}
                        onChange={(e) => setForgotOtpCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        required
                        style={{
                          width: '100%',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-text-primary)',
                          borderRadius: '7px',
                          padding: '8px',
                          color: 'var(--color-text-primary)',
                          fontSize: '1.1rem',
                          fontFamily: "'JetBrains Mono', monospace",
                          letterSpacing: '4px',
                          textAlign: 'center',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: '18px' }}>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                        Set New Password (min. 8 characters)
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        required
                        minLength={8}
                        style={{
                          width: '100%',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '7px',
                          padding: '8px 10px',
                          color: 'var(--color-text-primary)',
                          fontSize: '0.86rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={forgotLoading || forgotOtpCode.length !== 6 || newPassword.length < 8}
                      style={{
                        width: '100%',
                        background: 'var(--color-text-primary)',
                        color: 'var(--color-surface)',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '11px',
                        fontWeight: '600',
                        fontSize: '0.86rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        cursor: (forgotLoading || forgotOtpCode.length !== 6 || newPassword.length < 8) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {forgotLoading ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                      <span>Save Password & Return</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setOtpSent(false); setForgotError(''); setForgotSuccess(''); }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-text-secondary)',
                        fontSize: '0.74rem',
                        marginTop: '12px',
                        cursor: 'pointer',
                        width: '100%',
                        textAlign: 'center',
                        fontWeight: '500'
                      }}
                    >
                      ← Back / Use different email
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
