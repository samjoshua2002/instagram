'use client';

import React, { useState, useEffect, useRef } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import {
  Fingerprint,
  X,
  Shield,
  Plus,
  Trash2,
  QrCode,
  User,
  Phone,
  Instagram,
  Check,
  AlertCircle,
  RefreshCw,
  Camera,
  Upload,
  Edit2,
  Save,
  Laptop,
  Smartphone,
  MapPin
} from 'lucide-react';
import { useApp } from '../context/AppContext';

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
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return 'MacBook (Touch ID)';
  }
  if (/Windows/i.test(ua)) return 'Windows PC (Windows Hello)';
  if (/CrOS/i.test(ua)) return 'Chromebook (Fingerprint)';
  if (/Linux/i.test(ua)) return 'Linux (Security Key)';
  return 'Security Key / Biometrics';
}

export default function PasskeyManagerModal({ isOpen, onClose }) {
  const { user, token, updateUserProfile, showToast } = useApp();
  const [activeTab, setActiveTab] = useState('passkeys'); // 'passkeys' | 'profile' | 'oneauth'

  // Passkey state
  const [passkeys, setPasskeys] = useState([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyName, setPasskeyName] = useState('Biometric Passkey');
  const [editingPasskeyId, setEditingPasskeyId] = useState(null);
  const [editingPasskeyName, setEditingPasskeyName] = useState('');

  // TOTP QR Code state
  const [totpData, setTotpData] = useState(null);
  const [totpLoading, setTotpLoading] = useState(false);

  // Profile fields state (dynamic from user)
  const [profileData, setProfileData] = useState({
    profilePicUrl: '',
    firstName: '',
    lastName: '',
    mobileNumber: '',
    whatsappNumber: '',
    instagramUsername: '',
    address: {
      street: '',
      city: '',
      state: '',
      country: '',
      postalCode: '',
    }
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setPasskeyName(detectCurrentDevice());
      loadUserData();
    }
  }, [isOpen]);

  const getAuthHeaders = () => {
    let authToken = token;
    if (!authToken && typeof window !== 'undefined') {
      try {
        authToken = localStorage.getItem('chatter_jwt_token') || '';
      } catch (e) {
        authToken = '';
      }
    }
    return {
      'Content-Type': 'application/json',
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
    };
  };

  const loadUserData = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setPasskeys(data.passkeys || []);
        setProfileData({
          profilePicUrl: data.profilePicUrl || '',
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          mobileNumber: data.mobileNumber || '',
          whatsappNumber: data.whatsappNumber || '',
          instagramUsername: data.instagramUsername || '',
          address: {
            street: data.address?.street || '',
            city: data.address?.city || '',
            state: data.address?.state || '',
            country: data.address?.country || '',
            postalCode: data.address?.postalCode || '',
          }
        });
      }
    } catch (err) {
      console.warn('Failed loading user info:', err);
    }
  };

  const handleRegisterPasskey = async () => {
    setPasskeyLoading(true);
    try {
      const optionsRes = await fetch(`${API_BASE}/api/auth/passkey/register-options`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const options = await optionsRes.json().catch(() => ({}));
      if (!optionsRes.ok) throw new Error(options.error || 'Failed to start passkey registration');

      const registration = await startRegistration({ optionsJSON: options });
      const finalDeviceName = passkeyName.trim() || detectCurrentDevice();

      const verifyRes = await fetch(`${API_BASE}/api/auth/passkey/register-verify`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          response: registration,
          name: finalDeviceName,
        }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) throw new Error(verifyData.error || 'Failed to verify passkey');

      showToast?.(`Passkey for ${finalDeviceName} linked successfully!`, 'success');
      loadUserData();
      // Update remembered account in localStorage
      try {
        const cached = localStorage.getItem('chatter_remembered_account');
        if (cached) {
          const parsed = JSON.parse(cached);
          localStorage.setItem('chatter_remembered_account', JSON.stringify({
            ...parsed,
            hasPasskeys: true,
          }));
        }
      } catch (e) {}
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        showToast?.('Passkey registration was cancelled.', 'warning');
      } else {
        showToast?.(err.message || 'Passkey setup failed.', 'error');
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleDeletePasskey = async (credentialId) => {
    if (!confirm('Are you sure you want to remove this passkey?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/passkeys/${encodeURIComponent(credentialId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        showToast?.('Passkey removed', 'success');
        setPasskeys(prev => prev.filter(p => p.id !== credentialId));
      }
    } catch (err) {
      showToast?.(err.message, 'error');
    }
  };

  const handleRenamePasskey = async (credentialId) => {
    if (!editingPasskeyName.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/passkeys/${encodeURIComponent(credentialId)}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: editingPasskeyName.trim() }),
      });
      if (res.ok) {
        showToast?.('Passkey name updated', 'success');
        setPasskeys(prev => prev.map(p => p.id === credentialId ? { ...p, name: editingPasskeyName.trim() } : p));
        setEditingPasskeyId(null);
      }
    } catch (err) {
      showToast?.(err.message, 'error');
    }
  };

  const loadTotpQrCode = async () => {
    setTotpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/totp-setup`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setTotpData(data);
      }
    } catch (err) {
      showToast?.('Failed to load TOTP setup', 'error');
    } finally {
      setTotpLoading(false);
    }
  };

  // Client-side image compression downscales large phone/camera images
  const compressImage = (file, maxWidth = 480, maxHeight = 480, quality = 0.85) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target.result;
      };
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Image Upload handler (compresses to smooth lightweight JPEG)
  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedDataUrl = await compressImage(file, 480, 480, 0.85);
      setProfileData(prev => ({ ...prev, profilePicUrl: compressedDataUrl }));
    } catch (err) {
      console.warn('Image compression fallback:', err);
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Url = event.target?.result;
        if (base64Url) {
          setProfileData(prev => ({ ...prev, profilePicUrl: base64Url }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async (e) => {
    e?.preventDefault();
    setProfileSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/profile`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(profileData),
      });
      const responseText = await res.text();
      let data = {};
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error('Server returned an invalid response. Image may be too large.');
      }
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');

      if (data.user) {
        updateUserProfile?.(data.user);
        setProfileData(prev => ({
          ...prev,
          profilePicUrl: data.user.profilePicUrl || prev.profilePicUrl,
          firstName: data.user.firstName || prev.firstName,
          lastName: data.user.lastName || prev.lastName,
          mobileNumber: data.user.mobileNumber || prev.mobileNumber,
          whatsappNumber: data.user.whatsappNumber || prev.whatsappNumber,
          instagramUsername: data.user.instagramUsername || prev.instagramUsername,
          address: data.user.address || prev.address,
        }));
      }

      // Update remembered account in localStorage so avatar reflects on login page too
      try {
        const cached = localStorage.getItem('chatter_remembered_account');
        if (cached) {
          const parsed = JSON.parse(cached);
          localStorage.setItem('chatter_remembered_account', JSON.stringify({
            ...parsed,
            profilePicUrl: data.user?.profilePicUrl || profileData.profilePicUrl,
            firstName: data.user?.firstName || profileData.firstName,
            lastName: data.user?.lastName || profileData.lastName,
          }));
        }
      } catch (e) {}
      showToast?.('Profile updated successfully!', 'success');
    } catch (err) {
      showToast?.(err.message || 'Failed to update profile', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(9, 9, 11, 0.45)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9998,
      padding: '20px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <div style={{
        background: '#ffffff',
        border: '1px solid #e4e4e7',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '560px',
        color: '#09090b',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid #f4f4f5'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#09090b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: '700', margin: 0, letterSpacing: '-0.3px', color: '#09090b' }}>
                Account & Security Settings
              </h2>
              <p style={{ fontSize: '0.74rem', color: '#71717a', margin: 0 }}>
                Manage passkeys, profile picture, and Zoho OneAuth
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid #f4f4f5', background: '#fafafa', padding: '0 16px' }}>
          <button
            onClick={() => setActiveTab('passkeys')}
            style={{
              padding: '12px 16px',
              border: 'none',
              background: 'none',
              fontSize: '0.82rem',
              fontWeight: activeTab === 'passkeys' ? '700' : '500',
              color: activeTab === 'passkeys' ? '#09090b' : '#71717a',
              borderBottom: activeTab === 'passkeys' ? '2px solid #09090b' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Fingerprint size={16} />
            <span>Passkeys ({passkeys.length})</span>
          </button>
          <button
            onClick={() => { setActiveTab('oneauth'); if (!totpData) loadTotpQrCode(); }}
            style={{
              padding: '12px 16px',
              border: 'none',
              background: 'none',
              fontSize: '0.82rem',
              fontWeight: activeTab === 'oneauth' ? '700' : '500',
              color: activeTab === 'oneauth' ? '#09090b' : '#71717a',
              borderBottom: activeTab === 'oneauth' ? '2px solid #09090b' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <QrCode size={16} />
            <span>Zoho OneAuth</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            style={{
              padding: '12px 16px',
              border: 'none',
              background: 'none',
              fontSize: '0.82rem',
              fontWeight: activeTab === 'profile' ? '700' : '500',
              color: activeTab === 'profile' ? '#09090b' : '#71717a',
              borderBottom: activeTab === 'profile' ? '2px solid #09090b' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <User size={16} />
            <span>Profile & Details</span>
          </button>
        </div>

        {/* Tab Body */}
        <div style={{ padding: '24px', maxHeight: '500px', overflowY: 'auto' }}>
          {/* TAB 1: PASSKEYS */}
          {activeTab === 'passkeys' && (
            <div>
              <div style={{ marginBottom: '18px' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '700', margin: '0 0 4px', color: '#09090b' }}>
                  Biometric Passkey Authentication
                </h4>
                <p style={{ fontSize: '0.78rem', color: '#71717a', margin: 0 }}>
                  Add Face ID, Touch ID, or fingerprint sensors from any phone, laptop, or desktop.
                </p>
              </div>

              {/* Add New Passkey Box */}
              <div style={{ background: '#f4f4f5', borderRadius: '10px', padding: '14px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.74rem', fontWeight: '600', color: '#52525b', textTransform: 'uppercase' }}>
                    Device Label
                  </label>
                  <span style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: '500' }}>
                    Auto-detected
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={passkeyName}
                    onChange={(e) => setPasskeyName(e.target.value)}
                    placeholder="e.g. iPhone 15 Pro, Pixel 8, Windows Hello"
                    style={{
                      flex: 1,
                      background: '#ffffff',
                      border: '1px solid #e4e4e7',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '0.84rem',
                      outline: 'none',
                      color: '#09090b'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleRegisterPasskey}
                    disabled={passkeyLoading}
                    style={{
                      background: '#09090b',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontSize: '0.82rem',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: passkeyLoading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {passkeyLoading ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                    <span>{passkeyLoading ? 'Prompting...' : 'Add Passkey'}</span>
                  </button>
                </div>
              </div>

              {/* Registered Passkeys List */}
              <h5 style={{ fontSize: '0.76rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', margin: '0 0 10px' }}>
                Your Registered Devices ({passkeys.length})
              </h5>
              {passkeys.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 12px', color: '#a1a1aa', fontSize: '0.82rem', border: '1px dashed #e4e4e7', borderRadius: '10px' }}>
                  No biometric passkeys registered yet on this account.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {passkeys.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                        <Fingerprint size={20} color="#09090b" style={{ flexShrink: 0 }} />
                        {editingPasskeyId === p.id ? (
                          <div style={{ display: 'flex', gap: '6px', flex: 1, marginRight: '10px' }}>
                            <input
                              type="text"
                              value={editingPasskeyName}
                              onChange={(e) => setEditingPasskeyName(e.target.value)}
                              autoFocus
                              style={{ flex: 1, padding: '4px 8px', border: '1px solid #09090b', borderRadius: '6px', fontSize: '0.82rem' }}
                            />
                            <button
                              onClick={() => handleRenamePasskey(p.id)}
                              style={{ background: '#09090b', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.74rem' }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingPasskeyId(null)}
                              style={{ background: 'none', border: '1px solid #e4e4e7', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.74rem' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize: '0.84rem', fontWeight: '700', color: '#09090b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{p.name}</span>
                              <button
                                onClick={() => { setEditingPasskeyId(p.id); setEditingPasskeyName(p.name); }}
                                style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', padding: 0 }}
                                title="Rename device"
                              >
                                <Edit2 size={12} />
                              </button>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#71717a' }}>Added {new Date(p.createdAt).toLocaleDateString()}</div>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeletePasskey(p.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                        title="Remove passkey"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ZOHO ONEAUTH TOTP */}
          {activeTab === 'oneauth' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '700', margin: '0 0 4px', color: '#09090b' }}>
                  Zoho OneAuth 2FA
                </h4>
                <p style={{ fontSize: '0.78rem', color: '#71717a', margin: 0 }}>
                  Scan this QR code in Zoho OneAuth or Google Authenticator to generate 6-digit codes.
                </p>
              </div>

              {totpLoading ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#71717a', fontSize: '0.84rem' }}>
                  Generating QR Code...
                </div>
              ) : totpData ? (
                <div style={{ textAlign: 'center', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '20px' }}>
                  <img
                    src={totpData.qrDataUrl}
                    alt="OneAuth QR Code"
                    style={{ width: '180px', height: '180px', margin: '0 auto 14px', borderRadius: '8px', border: '1px solid #e4e4e7' }}
                  />
                  <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: '#71717a', marginBottom: '4px' }}>Manual Secret Key</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.95rem', background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '6px', padding: '6px 12px', display: 'inline-block', letterSpacing: '1.5px' }}>
                    {totpData.secret}
                  </div>
                  <p style={{ fontSize: '0.74rem', color: '#71717a', marginTop: '12px' }}>
                    Enter this secret key in Zoho OneAuth if scanning does not work.
                  </p>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <button onClick={loadTotpQrCode} style={{ background: '#09090b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                    Load QR Code
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ACCOUNT PROFILE & PROFILE PICTURE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile}>
              {/* Profile Picture Upload Section */}
              <div style={{
                background: '#fafafa',
                border: '1px solid #e4e4e7',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  {profileData.profilePicUrl ? (
                    <img
                      src={profileData.profilePicUrl}
                      alt="Profile Avatar"
                      style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: '16px',
                        objectFit: 'cover',
                        border: '2px solid #09090b',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '72px',
                      height: '72px',
                      borderRadius: '16px',
                      background: '#09090b',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.6rem',
                      fontWeight: '800'
                    }}>
                      {profileData.firstName ? profileData.firstName.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload avatar"
                    style={{
                      position: 'absolute',
                      right: '-6px',
                      bottom: '-6px',
                      background: '#09090b',
                      color: '#ffffff',
                      border: '2px solid #ffffff',
                      borderRadius: '50%',
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                    }}
                  >
                    <Camera size={14} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    style={{ display: 'none' }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: '700', color: '#09090b', marginBottom: '4px' }}>
                    Profile Picture
                  </div>
                  <p style={{ fontSize: '0.74rem', color: '#71717a', margin: '0 0 10px', lineHeight: 1.35 }}>
                    Upload any photo from your phone or device. Automatically compressed for instant load times.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        background: '#09090b',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '0.76rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <Upload size={13} />
                      <span>{profileData.profilePicUrl ? 'Change Photo' : 'Upload Photo'}</span>
                    </button>
                    {profileData.profilePicUrl && (
                      <button
                        type="button"
                        onClick={() => setProfileData(prev => ({ ...prev, profilePicUrl: '' }))}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #e4e4e7',
                          color: '#b91c1c',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '0.76rem',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Names */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#52525b', marginBottom: '4px' }}>First Name</label>
                  <input
                    type="text"
                    value={profileData.firstName}
                    onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
                    placeholder="First Name"
                    style={{ width: '100%', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '8px 10px', fontSize: '0.84rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#52525b', marginBottom: '4px' }}>Last Name</label>
                  <input
                    type="text"
                    value={profileData.lastName}
                    onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                    placeholder="Last Name"
                    style={{ width: '100%', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '8px 10px', fontSize: '0.84rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Phone & WhatsApp */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#52525b', marginBottom: '4px' }}>Mobile Number</label>
                  <input
                    type="text"
                    value={profileData.mobileNumber}
                    onChange={(e) => setProfileData({ ...profileData, mobileNumber: e.target.value })}
                    placeholder="+91..."
                    style={{ width: '100%', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '8px 10px', fontSize: '0.84rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#52525b', marginBottom: '4px' }}>WhatsApp Number</label>
                  <input
                    type="text"
                    value={profileData.whatsappNumber}
                    onChange={(e) => setProfileData({ ...profileData, whatsappNumber: e.target.value })}
                    placeholder="+91..."
                    style={{ width: '100%', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '8px 10px', fontSize: '0.84rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Instagram Handle */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#52525b', marginBottom: '4px' }}>Instagram Handle / Username</label>
                <input
                  type="text"
                  value={profileData.instagramUsername}
                  onChange={(e) => setProfileData({ ...profileData, instagramUsername: e.target.value })}
                  placeholder="username without @"
                  style={{ width: '100%', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '8px 10px', fontSize: '0.84rem', boxSizing: 'border-box' }}
                />
              </div>

              {/* Address Fields */}
              <div style={{ background: '#fafafa', padding: '12px', borderRadius: '8px', border: '1px solid #f4f4f5', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <MapPin size={13} color="#71717a" />
                  <span style={{ fontSize: '0.74rem', fontWeight: '600', color: '#52525b', textTransform: 'uppercase' }}>Address (Optional)</span>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={profileData.address?.street || ''}
                    onChange={(e) => setProfileData({ ...profileData, address: { ...profileData.address, street: e.target.value } })}
                    placeholder="Street Address"
                    style={{ width: '100%', background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '6px', padding: '6px 8px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input
                    type="text"
                    value={profileData.address?.city || ''}
                    onChange={(e) => setProfileData({ ...profileData, address: { ...profileData.address, city: e.target.value } })}
                    placeholder="City"
                    style={{ width: '100%', background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '6px', padding: '6px 8px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                  />
                  <input
                    type="text"
                    value={profileData.address?.country || ''}
                    onChange={(e) => setProfileData({ ...profileData, address: { ...profileData.address, country: e.target.value } })}
                    placeholder="Country"
                    style={{ width: '100%', background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '6px', padding: '6px 8px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="submit"
                  disabled={profileSaving}
                  style={{
                    background: '#09090b',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 18px',
                    fontWeight: '700',
                    fontSize: '0.82rem',
                    cursor: profileSaving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {profileSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  <span>{profileSaving ? 'Saving...' : 'Save Profile Changes'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
