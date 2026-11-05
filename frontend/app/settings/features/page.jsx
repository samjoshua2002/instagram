'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import PageHero from '../../components/PageHero';
import { ArrowLeft, Layers } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import SuperadminWorkspacePrompt from '../../components/SuperadminWorkspacePrompt';
import WorkspaceModeSwitch from '../../components/WorkspaceModeSwitch';
import { Switch } from '../../components/ui/switch';
import { FEATURE_GROUPS, WORKSPACE_MODES, currentMode } from '../../lib/workspaceFeatures';

/**
 * Feature Store (PLAN.md §4, §13 Phase 3): pick a mode, then switch single
 * capabilities on or off. Changes reach the nav at once and the reply
 * pipeline within its 30s cache.
 */
export default function FeatureStorePage() {
  const { user, isImpersonating, workspaceFeatures, workspaceFeaturesError, reloadWorkspaceFeatures, updateWorkspaceFeatures } = useApp();
  const [savingKey, setSavingKey] = useState(null);

  if (user?.role === 'superadmin' && !isImpersonating) {
    return (
      <SuperadminWorkspacePrompt
        sectionTitle="Feature Store"
        sectionCode="09 // FEATURES"
        sectionDescription="Modes and feature toggles are set per creator workspace. Choose a workspace below to manage its features."
      />
    );
  }

  const mode = currentMode(workspaceFeatures, user);
  const modeInfo = WORKSPACE_MODES.find(m => m.key === mode);
  const enabled = workspaceFeatures?.enabledFeatures;
  const enabledCount = enabled ? Object.values(enabled).filter(Boolean).length : 0;

  const toggle = async key => {
    if (!enabled || savingKey) return;
    setSavingKey(key);
    await updateWorkspaceFeatures({ enabledFeatures: { [key]: !enabled[key] } });
    setSavingKey(null);
  };

  return (
    <div className="page-container settings-fullwidth spx-page">
      <PageHero
        seed="page-features"
        icon={<Layers size={96} strokeWidth={2} />}
        eyebrow="Feature store"
        title="Workspace features"
        desc="Choose a mode for sensible defaults, then turn single capabilities on or off. Nothing is deleted when you switch."
        meta={enabled ? `${enabledCount} of ${Object.keys(enabled).length} features on` : 'Loading features'}
      >
        <Link href="/settings" className="spx-outline"><ArrowLeft size={14} /> Back to settings</Link>
      </PageHero>

      <section className="download-card">
        <div className="sheet-label">Mode</div>
        <WorkspaceModeSwitch />
        <p className="feature-hint" style={{ marginTop: '10px' }}>
          {modeInfo.hint}. Switching loads that mode&apos;s defaults; your own AI model setting is kept.
        </p>
      </section>

      {!enabled && workspaceFeaturesError && (
        <section className="download-card">
          <p className="feature-hint" style={{ margin: '0 0 10px' }}>Your features could not be loaded.</p>
          <button type="button" className="btn" onClick={reloadWorkspaceFeatures}>Retry</button>
        </section>
      )}
      {!enabled && !workspaceFeaturesError && <div className="skeleton" style={{ height: '320px', borderRadius: '20px' }} />}

      {enabled && FEATURE_GROUPS.map(group => (
        <section key={group.title} className="download-card">
          <div className="sheet-label">{group.title}</div>
          <div className="feature-list">
            {group.features.map(({ key, label, hint, setupHref }) => (
              <label key={key} className="feature-row">
                <span style={{ minWidth: 0 }}>
                  <span className="feature-name">{label}</span>
                  <span className="feature-hint">
                    {hint}
                    {setupHref && <> <Link href={setupHref} className="feature-setup">Set up</Link></>}
                  </span>
                </span>
                <Switch
                  checked={enabled[key]}
                  disabled={savingKey !== null}
                  onCheckedChange={() => toggle(key)}
                  aria-label={label}
                />
              </label>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
