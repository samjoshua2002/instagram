'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Download, Monitor, Apple, Check, Copy, ChevronDown, ExternalLink } from 'lucide-react';

/**
 * Best guess of the visitor's OS and CPU. Browsers hide Apple Silicon behind an
 * "Intel" user agent, so the architecture comes from userAgentData or the GPU name.
 */
async function detectBuildId() {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';

  if (/Windows/i.test(ua)) {
    return /Win64|x64|WOW64|amd64/i.test(ua) ? 'win-x64' : 'win-x86';
  }

  if (/Macintosh|Mac OS X/i.test(ua)) {
    try {
      const hints = await navigator.userAgentData?.getHighEntropyValues?.(['architecture']);
      if (hints?.architecture) return hints.architecture === 'arm' ? 'mac-arm64' : 'mac-x64';
    } catch (_) {}
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
      if (/Apple M\d|Apple GPU/i.test(renderer)) return 'mac-arm64';
      if (/Intel|AMD|Radeon/i.test(renderer)) return 'mac-x64';
    } catch (_) {}
    // Every Mac sold since late 2020 is Apple Silicon
    return 'mac-arm64';
  }

  return null;
}

export default function DownloadPage() {
  const { API_BASE } = useApp();
  const [release, setRelease] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [detectedId, setDetectedId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/desktop/releases`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Could not load releases'))))
      .then(setRelease)
      .catch(err => setLoadError(err.message));
    detectBuildId().then(id => {
      setDetectedId(id);
      setSelectedId(id);
    });
  }, [API_BASE]);

  const builds = release?.builds || [];
  const recommended = builds.find(b => b.id === detectedId);
  const selected = builds.find(b => b.id === selectedId) || recommended || builds[0];

  const copyChecksum = async (build) => {
    try {
      await navigator.clipboard.writeText(build.sha256);
      setCopiedId(build.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (_) {}
  };

  const OsIcon = ({ build, size = 18 }) =>
    build?.os === 'macos' ? <Apple size={size} /> : <Monitor size={size} />;

  return (
    <div className="page-container" style={{ maxWidth: '860px' }}>
      <div style={{ marginBottom: '24px' }}>
        <div className="mono" style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 'bold' }}>
          // DESKTOP APP {release?.version ? `v${release.version}` : ''}
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.6px', margin: '4px 0 6px' }}>
          Chatter OS for Desktop
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: 0, lineHeight: 1.5 }}>
          Get native notifications for new leads and DMs, and keep your bot running from the system tray.
        </p>
      </div>

      {loadError && (
        <div className="download-card" style={{ borderColor: 'color-mix(in srgb, #ef4444 14%, transparent)', color: '#f87171' }}>
          {loadError}. Please try again in a moment.
        </div>
      )}

      {!loadError && !release && <div className="skeleton" style={{ height: '180px', borderRadius: '16px' }} />}

      {release && (
        <>
          {/* Recommended build */}
          <div className="download-card download-hero">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <div className="download-icon"><OsIcon build={recommended || selected} size={22} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {recommended ? 'Detected your device' : 'Choose your device below'}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.02rem' }}>{(recommended || selected)?.label}</div>
              </div>
            </div>
            <a className="btn btn-primary download-btn" href={(recommended || selected)?.url}>
              <Download size={16} /> Download for Your Device
            </a>
          </div>

          {/* Manual selection */}
          <div className="download-card">
            <label htmlFor="build-select" style={{ fontWeight: 700, fontSize: '0.9rem', display: 'block', marginBottom: '8px' }}>
              Other platforms
            </label>
            <div style={{ position: 'relative' }}>
              <select
                id="build-select"
                value={selected?.id || ''}
                onChange={(e) => setSelectedId(e.target.value)}
                className="download-select"
              >
                {builds.map(b => (
                  <option key={b.id} value={b.id}>{b.label}{b.id === detectedId ? ' (recommended)' : ''}</option>
                ))}
              </select>
              <ChevronDown size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
            </div>

            {selected && (
              <div className="download-build-row">
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 600, wordBreak: 'break-all' }}>{selected.fileName}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>SHA-256</div>
                  {selected.sha256 ? (
                    <button type="button" onClick={() => copyChecksum(selected)} className="download-checksum mono" title="Copy checksum">
                      <span>{selected.sha256}</span>
                      {copiedId === selected.id ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                    </button>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Published with the next release.</div>
                  )}
                </div>
                <a className="btn" href={selected.url} style={{ flexShrink: 0 }}>
                  <Download size={15} /> Download
                </a>
              </div>
            )}
          </div>

          {release.releaseNotesUrl && (
            <a href={release.releaseNotesUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Release notes <ExternalLink size={13} />
            </a>
          )}
        </>
      )}
    </div>
  );
}
