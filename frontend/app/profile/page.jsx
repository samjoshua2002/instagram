'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  User,
  Shield,
  Fingerprint,
  Instagram,
  CheckCircle2,
  AlertCircle,
  Save,
  Trash2,
  Plus,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Lock,
  Smartphone,
  Laptop,
  Check,
  Building2,
  Briefcase,
  ExternalLink,
  Sparkles,
  Key,
  Copy,
  Camera,
  UploadCloud
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { startRegistration } from '@simplewebauthn/browser';

const formatAddress = (addr) => {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  if (typeof addr === 'object') {
    const parts = [addr.street, addr.city, addr.state, addr.country, addr.postalCode].filter(Boolean);
    return parts.join(', ');
  }
  return '';
};

export default function ProfilePage() {
  const { user, token, API_BASE, updateUserProfile, showToast, updateWorkspaceFeatures } = useApp();

  const [saving, setSaving] = useState(false);
  const [switchingTier, setSwitchingTier] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const [avatarHover, setAvatarHover] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const fileInputRef = useRef(null);
  const longPressTimerRef = useRef(null);

  // Profile form state
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    username: user?.username || '',
    email: user?.email || '',
    mobileNumber: user?.mobileNumber || '',
    whatsappNumber: user?.whatsappNumber || '',
    instagramUsername: user?.instagramUsername || '',
    address: formatAddress(user?.address),
    accountType: user?.accountType || 'personal',
    profilePicUrl: user?.profilePicUrl || '',
  });

  // Passkeys state
  const [passkeys, setPasskeys] = useState([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        email: user.email || '',
        mobileNumber: user.mobileNumber || '',
        whatsappNumber: user.whatsappNumber || '',
        instagramUsername: user?.instagramUsername || '',
        address: formatAddress(user.address),
        accountType: user.accountType || 'personal',
        profilePicUrl: user.profilePicUrl || '',
      });
      fetchPasskeys();
    }
    // Only when a different account is shown: other user updates must not wipe unsaved edits
  }, [user?.id, user?._id]);

  const fetchPasskeys = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPasskeys(data.passkeys || []);
      }
    } catch (e) {
      console.error('Failed to load passkeys:', e);
    }
  };

  // Immediate 1-click Workspace Tier Switcher
  const handleSwitchTier = async (newTier) => {
    if (formData.accountType === newTier || switchingTier) return;
    setSwitchingTier(true);
    setFormData(prev => ({ ...prev, accountType: newTier }));

    // Goes through the Feature Store so the mode, nav and reply voice stay in step
    const ok = await updateWorkspaceFeatures({ activeMode: newTier });
    if (ok) {
      showToast?.(`Switched to ${newTier === 'business' ? 'Business & Brand' : 'Personal Creator'} tier!`, 'success');
    } else {
      setFormData(prev => ({ ...prev, accountType: user?.accountType || 'personal' }));
    }
    setSwitchingTier(false);
  };


  // Avatar Upload Handler
  const handleAvatarFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast?.('Please choose an image file (PNG, JPG, WebP)', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast?.('Image size should be under 5MB', 'error');
      return;
    }

    setUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Url = reader.result;
      try {
        const res = await fetch(`${API_BASE}/api/auth/profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ profilePicUrl: base64Url })
        });
        const data = await res.json();
        if (res.ok) {
          setFormData(prev => ({ ...prev, profilePicUrl: base64Url }));
          if (updateUserProfile) {
            updateUserProfile(data.user || { ...user, profilePicUrl: base64Url });
          }
          showToast?.('Profile picture updated successfully!', 'success');
        } else {
          throw new Error(data.error || 'Could not update profile picture');
        }
      } catch (err) {
        showToast?.(err.message, 'error');
      } finally {
        setUploadingAvatar(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Mobile Long Press Handlers
  const handleTouchStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      fileInputRef.current?.click();
    }, 450);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  };

  const handleSaveProfile = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Profile details saved successfully!');
        if (updateUserProfile) {
          updateUserProfile(data.user || { ...user, ...formData });
        }
        showToast?.('Profile updated successfully', 'success');
        setTimeout(() => setSuccessMsg(''), 3500);
      } else {
        setErrorMsg(data.error || 'Failed to update profile');
      }
    } catch (err) {
      setErrorMsg('Network error while saving profile');
    } finally {
      setSaving(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setPasskeyLoading(true);
    setErrorMsg('');
    try {
      const optRes = await fetch(`${API_BASE}/api/auth/passkey/register-options`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!optRes.ok) throw new Error('Could not get registration options');
      const options = await optRes.json();

      const regResponse = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch(`${API_BASE}/api/auth/passkey/register-verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(regResponse)
      });

      const verifyData = await verifyRes.json();
      if (verifyRes.ok && verifyData.verified) {
        showToast?.('Biometric Passkey registered successfully!', 'success');
        fetchPasskeys();
      } else {
        throw new Error(verifyData.error || 'Verification failed');
      }
    } catch (e) {
      if (e.name !== 'NotAllowedError') {
        setErrorMsg(e.message || 'Passkey enrollment failed');
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleDeletePasskey = async (credentialId) => {
    if (!confirm('Are you sure you want to remove this biometric passkey?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/passkeys/${encodeURIComponent(credentialId)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showToast?.('Passkey removed', 'success');
        fetchPasskeys();
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || 'Failed to delete passkey');
      }
    } catch (e) {
      setErrorMsg('Failed to delete passkey');
    }
  };

  const copyId = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  const isBusiness = ['business', 'agency'].includes(formData.accountType);

  return (
    <div className="page-container settings-fullwidth" style={{ maxWidth: '1400px', width: '100%', margin: '0 auto', padding: '24px 20px 80px' }}>
      {/* Hidden file input for avatar */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarFileSelect}
        style={{ display: 'none' }}
      />

      {/* Top Breadcrumb & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{
            fontSize: '0.7rem',
            fontWeight: 800,
            fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--color-text-secondary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '4px'
          }}>
            WORKSPACE // IDENTITY &amp; SECURITY
          </div>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: 900,
            color: 'var(--text, var(--color-text-primary))',
            letterSpacing: '-0.7px',
            margin: 0
          }}>
            Account Profile
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted, var(--color-text-secondary))', marginTop: '4px', margin: '4px 0 0' }}>
            Manage your personal profile, connected Instagram Meta account, and biometric security keys.
          </p>
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={saving}
          style={{
            background: 'var(--primary, var(--ambient-dominant))',
            color: 'var(--color-surface)',
            border: 'none',
            borderRadius: '10px',
            padding: '10px 22px',
            fontSize: '0.84rem',
            fontWeight: 800,
            cursor: saving ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
            transition: 'all 0.15s ease'
          }}
        >
          {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
          <span>{saving ? 'Saving...' : 'Save Profile'}</span>
        </button>
      </div>

      {/* Alerts */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              background: 'color-mix(in srgb, #ef4444 12%, transparent)',
              border: '1px solid color-mix(in srgb, #ef4444 35%, transparent)',
              color: '#f87171',
              borderRadius: '12px',
              padding: '14px 18px',
              fontSize: '0.86rem',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 2px 8px rgba(239,68,68,0.06)'
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </motion.div>
        )}

        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              background: 'color-mix(in srgb, #22c55e 12%, transparent)',
              border: '1px solid color-mix(in srgb, #22c55e 35%, transparent)',
              color: '#4ade80',
              borderRadius: '12px',
              padding: '14px 18px',
              fontSize: '0.86rem',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 2px 8px rgba(22,163,74,0.06)'
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Identity Card with Avatar Hover / Mobile Long-Press */}
      <div style={{
        background: 'var(--bg-card, var(--color-surface))',
        border: '1px solid var(--border, var(--color-border))',
        borderRadius: '18px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
          {/* Avatar with hover / long-press overlay */}
          <div
            onMouseEnter={() => setAvatarHover(true)}
            onMouseLeave={() => setAvatarHover(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onClick={() => fileInputRef.current?.click()}
            style={{
              position: 'relative',
              width: '72px',
              height: '72px',
              borderRadius: '18px',
              cursor: 'pointer',
              overflow: 'hidden',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
            }}
            title="Click or hover to change photo"
          >
            {formData.profilePicUrl ? (
              <img
                src={formData.profilePicUrl}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block'
                }}
              />
            ) : (
              <div style={{
                width: '100%',
                height: '100%',
                background: 'var(--color-text-primary)',
                color: 'var(--color-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.65rem',
                fontWeight: 800
              }}>
                {(formData.firstName || user?.username || 'U').charAt(0).toUpperCase()}
              </div>
            )}

            {/* Hover / Long-press camera overlay */}
            <AnimatePresence>
              {(avatarHover || uploadingAvatar) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(9, 9, 11, 0.75)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    gap: '2px'
                  }}
                >
                  {uploadingAvatar ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : (
                    <>
                      <Camera size={18} />
                      <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Change</span>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Online indicator */}
            <span style={{
              position: 'absolute',
              right: '2px',
              bottom: '2px',
              width: '13px',
              height: '13px',
              borderRadius: '50%',
              background: '#10b981',
              border: '2px solid var(--color-surface)',
              zIndex: 2
            }} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--color-text-primary)', letterSpacing: '-0.4px' }}>
                {formData.firstName || user?.username || 'Account Owner'} {formData.lastName || ''}
              </span>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                background: isBusiness ? 'var(--color-text-primary)' : 'var(--color-surface-hover)',
                color: isBusiness ? 'var(--color-surface)' : 'var(--color-text-secondary)',
                padding: '3px 10px',
                borderRadius: '999px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                {formData.accountType} Tier
              </span>
            </div>
            <div style={{ fontSize: '0.86rem', color: 'var(--color-text-secondary)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>@{user?.instagramUsername || user?.username || 'user'}</span>
              <span>•</span>
              <span>{user?.email}</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Tap or hover photo to update avatar
            </div>
          </div>
        </div>

        {/* Workspace Mode Switcher (Instant 1-Click Toggle) */}
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace", marginBottom: '6px', textAlign: 'right' }}>
            WORKSPACE ENVIRONMENT
          </div>
          <div style={{
            background: 'var(--color-surface-hover)',
            border: '1px solid var(--color-border)',
            borderRadius: '14px',
            padding: '5px',
            display: 'flex',
            gap: '5px'
          }}>
            <button
              type="button"
              onClick={() => handleSwitchTier('personal')}
              disabled={switchingTier}
              style={{
                border: 'none',
                borderRadius: '10px',
                padding: '9px 18px',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: switchingTier ? 'wait' : 'pointer',
                background: formData.accountType === 'personal' ? 'var(--color-surface)' : 'transparent',
                color: formData.accountType === 'personal' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                boxShadow: formData.accountType === 'personal' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              Personal Creator
            </button>
            <button
              type="button"
              onClick={() => handleSwitchTier('business')}
              disabled={switchingTier}
              style={{
                border: 'none',
                borderRadius: '10px',
                padding: '9px 18px',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: switchingTier ? 'wait' : 'pointer',
                background: formData.accountType === 'business' ? 'var(--color-text-primary)' : 'transparent',
                color: formData.accountType === 'business' ? 'var(--color-surface)' : 'var(--color-text-secondary)',
                boxShadow: formData.accountType === 'business' ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
                transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              Business &amp; Brand
            </button>
          </div>
        </div>
      </div>

      {/* Main 2-Column Responsive Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
        gap: '24px'
      }}>
        {/* Left Column: Personal Information */}
        <div style={{
          background: 'var(--bg-card, var(--color-surface))',
          border: '1px solid var(--border, var(--color-border))',
          borderRadius: '18px',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'var(--color-text-primary)',
              color: 'var(--color-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <User size={15} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.3px' }}>
              Personal Identity
            </h3>
          </div>

          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                  First Name
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                  Last Name
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                Primary Email
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  value={formData.email}
                  disabled
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-hover)',
                    color: 'var(--color-text-secondary)',
                    fontSize: '0.85rem',
                    cursor: 'not-allowed'
                  }}
                />
                <Lock size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                  Mobile Number
                </label>
                <input
                  type="tel"
                  value={formData.mobileNumber}
                  onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                  WhatsApp Direct
                </label>
                <input
                  type="tel"
                  value={formData.whatsappNumber}
                  onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                Operating Location
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="City, Country"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              style={{
                background: 'var(--color-text-primary)',
                color: 'var(--color-surface)',
                border: 'none',
                borderRadius: '8px',
                padding: '11px 18px',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '6px'
              }}
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              <span>Save Details</span>
            </button>
          </form>
        </div>        {/* Right Column: Instagram & Biometric Passkeys */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Instagram Account Card */}
          <div style={{
            background: 'var(--bg-card, var(--color-surface))',
            border: '1px solid var(--border, var(--color-border))',
            borderRadius: '18px',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: 'var(--primary, var(--ambient-dominant))',
                  color: 'var(--color-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Instagram size={15} />
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text, var(--color-text-primary))', margin: 0, letterSpacing: '-0.3px' }}>
                  Connected Instagram
                </h3>
              </div>

              <span style={{
                fontSize: '0.68rem',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 800,
                background: (user?.hasInstagramToken || user?.instagramPageAccessToken) ? 'var(--success-container, color-mix(in srgb, #22c55e 12%, transparent))' : 'var(--danger-container, color-mix(in srgb, #ef4444 14%, transparent))',
                color: (user?.hasInstagramToken || user?.instagramPageAccessToken) ? 'var(--success, #4ade80)' : 'var(--danger, #f87171)',
                padding: '3px 10px',
                borderRadius: '6px'
              }}>
                {(user?.hasInstagramToken || user?.instagramPageAccessToken) ? 'ACTIVE & ENCRYPTED' : 'NOT LINKED'}
              </span>
            </div>

            <div style={{
              background: 'var(--bg-subtle, var(--color-surface-elevated))',
              border: '1px solid var(--border, var(--color-border))',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, var(--color-text-secondary))', fontWeight: 700 }}>Instagram Username</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text, var(--color-text-primary))' }}>
                  @{user?.instagramUsername || user?.username || 'None'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, var(--color-text-secondary))', fontWeight: 700 }}>Page Account ID</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text, var(--color-text-secondary))' }}>
                    {user?.instagramId || user?.instagramAccountId || 'Unlinked'}
                  </span>
                  {(user?.instagramId || user?.instagramAccountId) && (
                    <button
                      type="button"
                      onClick={() => copyId(user?.instagramId || user?.instagramAccountId)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-muted, var(--color-text-secondary))' }}
                      title="Copy ID"
                    >
                      {copiedId ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, var(--color-text-secondary))', fontWeight: 700 }}>Security Status</span>
                <span style={{ fontSize: '0.76rem', color: 'var(--success, #16a34a)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Shield size={13} /> AES-256-GCM Encrypted
                </span>
              </div>
            </div>
          </div>

          {/* Biometric Passkeys Card */}
          <div style={{
            background: 'var(--bg-card, var(--color-surface))',
            border: '1px solid var(--border, var(--color-border))',
            borderRadius: '18px',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: 'var(--color-text-primary)',
                  color: 'var(--color-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Fingerprint size={15} />
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.3px' }}>
                  Biometric Passkeys
                </h3>
              </div>

              <button
                type="button"
                onClick={handleRegisterPasskey}
                disabled={passkeyLoading}
                style={{
                  background: 'var(--color-text-primary)',
                  color: 'var(--color-surface)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '7px 14px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: passkeyLoading ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <Plus size={13} />
                <span>{passkeyLoading ? 'Enrolling...' : 'Add Passkey'}</span>
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', margin: '0 0 16px', lineHeight: 1.45 }}>
              Authenticate instantly with Touch ID, Face ID, or Windows Hello without typing passwords.
            </p>

            {passkeys.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {passkeys.map(pk => (
                  <div
                    key={pk.id}
                    style={{
                      background: 'var(--color-surface-elevated)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '10px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Laptop size={16} color="var(--color-text-secondary)" />
                      <div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                          {pk.deviceType || pk.name || 'Biometric Device'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                          Registered on {new Date(pk.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeletePasskey(pk.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: '4px'
                      }}
                      title="Remove passkey"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                background: 'var(--color-surface-elevated)',
                border: '1px dashed var(--color-border-strong)',
                borderRadius: '10px',
                padding: '20px',
                textAlign: 'center',
                fontSize: '0.82rem',
                color: 'var(--color-text-secondary)'
              }}>
                No biometric passkeys configured yet. Click <strong>Add Passkey</strong> to enroll Face ID / Touch ID.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
