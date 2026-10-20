'use client';

import React, { useState, useEffect } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, X, Shield, Plus, Trash2, QrCode, User, Phone, Instagram, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://instagram-ai-bot-64tf.onrender.com';

export default function PasskeyManagerModal({ isOpen, onClose }) {
  const { user, updateUserProfile, showToast } = useApp();
  const [activeTab, setActiveTab] = useState('passkeys'); // 'passkeys' | 'profile' | 'oneauth'

  // Passkey state
  const [passkeys, setPasskeys] = useState([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyName, setPasskeyName] = useState('My MacBook Touch ID');

  // TOTP QR Code state
  const [totpData, setTotpData] = useState(null);
  const [totpLoading, setTotpLoading] = useState(false);

  // Profile fields state
  const [profileData, setProfileData] = useState({
    firstName: 'Sam',
    lastName: 'Joshua',
    mobileNumber: '8610866413',
    whatsappNumber: '8610866413',
    instagramUsername: 'catovidz',
  });
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadUserData();
    }
  }, [isOpen]);

  const loadUserData = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`);
      if (res.ok) {
        const data = await res.json();
        setPasskeys(data.passkeys || []);
        setProfileData({
          firstName: data.firstName || 'Sam',
          lastName: data.lastName || 'Joshua',
          mobileNumber: data.mobileNumber || '8610866413',
          whatsappNumber: data.whatsappNumber || '8610866413',
          instagramUsername: data.instagramUsername || 'catovidz',
        });
      }
    } catch (err) {
      console.warn('Failed loading user info:', err);
    }
  };

  const handleRegisterPasskey = async () => {
    setPasskeyLoading(true);
    try {
      // 1. Get WebAuthn creation options from server
      const optionsRes = await fetch(`${API_BASE}/api/auth/passkey/register-options`, {
        method: 'POST',
      });
      if (!optionsRes.ok) throw new Error('Failed to start passkey registration');
      const options = await optionsRes.json();

      // 2. Prompt browser TouchID / FaceID prompt
      const registration = await startRegistration({ optionsJSON: options });

      // 3. Verify registration with backend
      const verifyRes = await fetch(`${API_BASE}/api/auth/passkey/register-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: registration,
          name: passkeyName || 'Biometric Touch ID',
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || 'Failed to verify passkey');

      showToast?.('Passkey added successfully! You can now log in with fingerprint.', 'success');
      loadUserData();
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
      });
      if (res.ok) {
        showToast?.('Passkey removed', 'success');
        setPasskeys(prev => prev.filter(p => p.id !== credentialId));
      }
    } catch (err) {
      showToast?.(err.message, 'error');
    }
  };

  const loadTotpQrCode = async () => {
    setTotpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/totp-setup`);
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

  const handleSaveProfile = async (e) => {
    e?.preventDefault();
    setProfileSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');

      updateUserProfile?.(data.user);
      showToast?.('Profile updated successfully!', 'success');
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9998,
      padding: '20px',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    }}>
      <div style={{
        background: '#ffffff',
        border: '1px solid #e4e4e7',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '560px',
        color: '#09090b',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
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
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#09090b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: '800', margin: 0, letterSpacing: '-0.3px' }}>Security & Profile Settings</h2>
              <p style={{ fontSize: '0.74rem', color: '#71717a', margin: 0 }}>Passkeys, Zoho OneAuth 2FA, and Account Information</p>
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
            <span>Zoho OneAuth 2FA</span>
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
            <span>Account Profile</span>
          </button>
        </div>

        {/* Tab Body */}
        <div style={{ padding: '24px', maxHeight: '480px', overflowY: 'auto' }}>
          {/* TAB 1: PASSKEYS */}
          {activeTab === 'passkeys' && (
            <div>
              <div style={{ marginBottom: '18px' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '700', margin: '0 0 4px' }}>Fingerprint & Touch ID Sign-In</h4>
                <p style={{ fontSize: '0.78rem', color: '#71717a', margin: 0 }}>
                  Link your MacBook Touch ID, iPhone Face ID, or Windows Hello key to sign in with 1 click without entering passwords.
                </p>
              </div>

              {/* Add New Passkey Box */}
              <div style={{ background: '#f4f4f5', borderRadius: '10px', padding: '14px', marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#52525b', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Device Name
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={passkeyName}
                    onChange={(e) => setPasskeyName(e.target.value)}
                    placeholder="e.g. MacBook Pro Touch ID"
                    style={{
                      flex: 1,
                      background: '#ffffff',
                      border: '1px solid #e4e4e7',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '0.84rem',
                      outline: 'none'
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
              <h5 style={{ fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', margin: '0 0 10px' }}>
                Active Passkeys ({passkeys.length})
              </h5>
              {passkeys.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 12px', color: '#a1a1aa', fontSize: '0.82rem', border: '1px dashed #e4e4e7', borderRadius: '10px' }}>
                  No biometric passkeys registered yet. Click &quot;Add Passkey&quot; above to link your Touch ID.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {passkeys.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Fingerprint size={20} color="#09090b" />
                        <div>
                          <div style={{ fontSize: '0.84rem', fontWeight: '700' }}>{p.name}</div>
                          <div style={{ fontSize: '0.72rem', color: '#71717a' }}>Added {new Date(p.createdAt).toLocaleDateString()}</div>
                        </div>
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
                <h4 style={{ fontSize: '0.9rem', fontWeight: '700', margin: '0 0 4px' }}>Zoho OneAuth 2FA Configuration</h4>
                <p style={{ fontSize: '0.78rem', color: '#71717a', margin: 0 }}>
                  Scan this QR code in Zoho OneAuth or Google Authenticator to generate your 6-digit login codes.
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
                    Type this secret key manually into Zoho OneAuth if your camera cannot scan the code.
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

          {/* TAB 3: ACCOUNT PROFILE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#52525b', marginBottom: '4px' }}>First Name</label>
                  <input
                    type="text"
                    value={profileData.firstName}
                    onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
                    style={{ width: '100%', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '8px 10px', fontSize: '0.84rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#52525b', marginBottom: '4px' }}>Last Name</label>
                  <input
                    type="text"
                    value={profileData.lastName}
                    onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                    style={{ width: '100%', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '8px 10px', fontSize: '0.84rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#52525b', marginBottom: '4px' }}>Mobile Number</label>
                  <input
                    type="text"
                    value={profileData.mobileNumber}
                    onChange={(e) => setProfileData({ ...profileData, mobileNumber: e.target.value })}
                    style={{ width: '100%', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '8px 10px', fontSize: '0.84rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#52525b', marginBottom: '4px' }}>WhatsApp Number</label>
                  <input
                    type="text"
                    value={profileData.whatsappNumber}
                    onChange={(e) => setProfileData({ ...profileData, whatsappNumber: e.target.value })}
                    style={{ width: '100%', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '8px 10px', fontSize: '0.84rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#52525b', marginBottom: '4px' }}>Instagram Username</label>
                <input
                  type="text"
                  value={profileData.instagramUsername}
                  onChange={(e) => setProfileData({ ...profileData, instagramUsername: e.target.value })}
                  style={{ width: '100%', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '8px 10px', fontSize: '0.84rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="submit"
                  disabled={profileSaving}
                  style={{ background: '#09090b', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px 18px', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' }}
                >
                  {profileSaving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
