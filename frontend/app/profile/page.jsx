'use client';

import React, { useState, useEffect } from 'react';
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
  Check
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function ProfilePage() {
  const { user, token, API_BASE, updateUserProfile, showToast } = useApp();

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Profile form state
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    username: user?.username || '',
    email: user?.email || '',
    mobileNumber: user?.mobileNumber || '',
    whatsappNumber: user?.whatsappNumber || '',
    instagramUsername: user?.instagramUsername || '',
    address: user?.address || '',
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
        instagramUsername: user.instagramUsername || '',
        address: user.address || '',
      });
      fetchPasskeys();
    }
  }, [user]);

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
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');

      updateUserProfile(data.user || formData);
      setSuccessMsg('Profile details updated successfully!');
      showToast?.('Profile updated!', 'success');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message || 'Error updating profile');
    } finally {
      setSaving(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setPasskeyLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/passkey/register-options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const options = await res.json();
      if (!res.ok) throw new Error(options.error || 'Failed to initialize WebAuthn');

      // Convert options for navigator.credentials.create
      options.challenge = Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      options.user.id = Uint8Array.from(atob(options.user.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

      const credential = await navigator.credentials.create({ publicKey: options });

      const verifyRes = await fetch(`${API_BASE}/api/auth/passkey/register-verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          credentialId: credential.id,
          rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
          response: {
            clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(credential.response.clientDataJSON))),
            attestationObject: btoa(String.fromCharCode(...new Uint8Array(credential.response.attestationObject)))
          },
          deviceType: navigator.userAgent.includes('Mac') ? 'macOS / Touch ID' : navigator.userAgent.includes('iPhone') ? 'iOS Face ID' : 'Security Key'
        })
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || 'Verification failed');

      showToast?.('Biometric passkey enrolled successfully!', 'success');
      fetchPasskeys();
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        showToast?.(err.message || 'Passkey setup cancelled', 'error');
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleDeletePasskey = async (credentialId) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/passkey/${encodeURIComponent(credentialId)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showToast?.('Passkey deleted.', 'info');
        fetchPasskeys();
      }
    } catch (e) {
      showToast?.('Failed to delete passkey', 'error');
    }
  };

  return (
    <div style={{
      width: '100%',
      minHeight: '100%',
      padding: '32px 36px',
      background: '#ffffff',
      boxSizing: 'border-box',
      overflowY: 'auto'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        {/* Page Header */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{
            fontSize: '0.68rem',
            fontWeight: '800',
            fontFamily: "'JetBrains Mono', monospace",
            color: '#a1a1aa',
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            marginBottom: '6px'
          }}>
            WORKSPACE // ACCOUNT &amp; SECURITY
          </div>
          <h1 style={{
            fontSize: '1.75rem',
            fontWeight: '800',
            color: '#09090b',
            letterSpacing: '-0.5px',
            margin: '0 0 6px 0'
          }}>
            Profile &amp; Security Settings
          </h1>
          <p style={{ fontSize: '0.86rem', color: '#71717a', margin: 0 }}>
            Manage your personal identity details, connected Instagram account, and biometric passkeys.
          </p>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            borderRadius: '10px',
            padding: '12px 16px',
            fontSize: '0.84rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#15803d',
            borderRadius: '10px',
            padding: '12px 16px',
            fontSize: '0.84rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 2-Column Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
          {/* Column 1: Personal Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{
              background: '#fafafa',
              border: '1px solid #e4e4e7',
              borderRadius: '14px',
              padding: '24px'
            }}>
              <h2 style={{
                fontSize: '1.05rem',
                fontWeight: '700',
                color: '#09090b',
                margin: '0 0 16px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <User size={18} />
                <span>Personal Information</span>
              </h2>

              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#52525b', marginBottom: '4px' }}>
                      First Name
                    </label>
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #e4e4e7',
                        background: '#ffffff',
                        fontSize: '0.84rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#52525b', marginBottom: '4px' }}>
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #e4e4e7',
                        background: '#ffffff',
                        fontSize: '0.84rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#52525b', marginBottom: '4px' }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    disabled
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #e4e4e7',
                      background: '#f4f4f5',
                      color: '#71717a',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box',
                      cursor: 'not-allowed'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#52525b', marginBottom: '4px' }}>
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      value={formData.mobileNumber}
                      onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })}
                      placeholder="+1 (555) 000-0000"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #e4e4e7',
                        background: '#ffffff',
                        fontSize: '0.84rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#52525b', marginBottom: '4px' }}>
                      WhatsApp Number
                    </label>
                    <input
                      type="tel"
                      value={formData.whatsappNumber}
                      onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                      placeholder="+1 (555) 000-0000"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #e4e4e7',
                        background: '#ffffff',
                        fontSize: '0.84rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#52525b', marginBottom: '4px' }}>
                    Location / Address
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="City, Country"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #e4e4e7',
                      background: '#ffffff',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: '#09090b',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '11px 18px',
                    fontSize: '0.84rem',
                    fontWeight: '700',
                    cursor: saving ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    marginTop: '8px'
                  }}
                >
                  {saving ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Save size={15} />
                      <span>Save Profile Details</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Column 2: Instagram Status & Biometric Passkeys */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Instagram Connection Card */}
            <div style={{
              background: '#fafafa',
              border: '1px solid #e4e4e7',
              borderRadius: '14px',
              padding: '24px'
            }}>
              <h2 style={{
                fontSize: '1.05rem',
                fontWeight: '700',
                color: '#09090b',
                margin: '0 0 16px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Instagram size={18} />
                <span>Connected Instagram</span>
              </h2>

              <div style={{
                background: '#ffffff',
                border: '1px solid #e4e4e7',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#52525b' }}>Handle</span>
                  <span style={{ fontSize: '0.84rem', fontWeight: '800', color: '#09090b' }}>
                    @{user?.instagramUsername || user?.username || 'None'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#52525b' }}>Account ID</span>
                  <span style={{ fontSize: '0.76rem', fontFamily: "'JetBrains Mono', monospace", color: '#71717a' }}>
                    {user?.instagramId || user?.instagramAccountId || 'Unlinked'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#52525b' }}>Token Status</span>
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: '800',
                    fontFamily: "'JetBrains Mono', monospace",
                    background: (user?.hasInstagramToken || user?.instagramPageAccessToken) ? '#dcfce7' : '#fee2e2',
                    color: (user?.hasInstagramToken || user?.instagramPageAccessToken) ? '#15803d' : '#b91c1c',
                    padding: '2px 8px',
                    borderRadius: '4px'
                  }}>
                    {(user?.hasInstagramToken || user?.instagramPageAccessToken) ? 'ENCRYPTED & ACTIVE' : 'MISSING'}
                  </span>
                </div>
              </div>

              <p style={{ fontSize: '0.75rem', color: '#71717a', lineHeight: 1.45, margin: 0 }}>
                To change your AI persona, texting tone, or access token, visit the <strong>Persona &amp; Style</strong> tab in the navigation menu.
              </p>
            </div>

            {/* Passkeys & Security Card */}
            <div style={{
              background: '#fafafa',
              border: '1px solid #e4e4e7',
              borderRadius: '14px',
              padding: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h2 style={{
                  fontSize: '1.05rem',
                  fontWeight: '700',
                  color: '#09090b',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Fingerprint size={18} />
                  <span>Biometric Passkeys</span>
                </h2>
                <button
                  type="button"
                  onClick={handleRegisterPasskey}
                  disabled={passkeyLoading}
                  style={{
                    background: '#09090b',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '7px',
                    padding: '6px 12px',
                    fontSize: '0.74rem',
                    fontWeight: '700',
                    cursor: passkeyLoading ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Plus size={13} />
                  <span>Add Passkey</span>
                </button>
              </div>

              <p style={{ fontSize: '0.78rem', color: '#71717a', marginBottom: '14px', lineHeight: 1.45 }}>
                Log in instantly without typing passwords using Face ID, Touch ID, Windows Hello, or hardware security keys.
              </p>

              {passkeys.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {passkeys.map(pk => (
                    <div
                      key={pk.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e4e4e7',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Laptop size={15} color="#71717a" />
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#09090b' }}>
                            {pk.deviceType || pk.name || 'Biometric Passkey'}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#a1a1aa' }}>
                            Created: {new Date(pk.createdAt).toLocaleDateString()}
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
                        title="Delete passkey"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  background: '#ffffff',
                  border: '1px dashed #d4d4d8',
                  borderRadius: '8px',
                  padding: '16px',
                  textAlign: 'center',
                  fontSize: '0.78rem',
                  color: '#71717a'
                }}>
                  No biometric passkeys enrolled yet. Click &quot;Add Passkey&quot; above to enroll Touch ID or Face ID.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
