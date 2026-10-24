'use client';

import React, { useState } from 'react';
import { User, Briefcase, Layers } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { WORKSPACE_MODES, currentMode } from '../lib/workspaceFeatures';

const MODE_ICONS = { personal: User, business: Briefcase, hybrid: Layers };

/**
 * Personal <-> Business <-> Hybrid switch (PLAN.md §13 Phase 3). Switching loads
 * that mode's feature preset; the reply voice follows (Hybrid keeps personal).
 * `compact` drops the labels to icons + short text for the desktop sidebar.
 */
export default function WorkspaceModeSwitch({ compact = false }) {
  const { user, workspaceFeatures, updateWorkspaceFeatures, showToast } = useApp();
  const [switching, setSwitching] = useState(false);
  const mode = currentMode(workspaceFeatures, user);

  const switchMode = async next => {
    if (next === mode || switching) return;
    setSwitching(true);
    const ok = await updateWorkspaceFeatures({ activeMode: next });
    setSwitching(false);
    if (ok) showToast?.(`Switched to ${WORKSPACE_MODES.find(m => m.key === next).label} mode`, 'success');
  };

  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={next => next && switchMode(next)}
      disabled={switching}
      className={`mode-segment${compact ? ' compact' : ''}`}
      aria-label="Workspace mode"
    >
      {WORKSPACE_MODES.map(({ key, label, hint }) => {
        const Icon = MODE_ICONS[key];
        return (
          <ToggleGroupItem key={key} value={key} title={hint} className={mode === key ? 'active' : ''}>
            <Icon size={compact ? 13 : 16} /> {label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
