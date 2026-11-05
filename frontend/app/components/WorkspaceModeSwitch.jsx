'use client';

import React, { useState } from 'react';
import { User, Briefcase, Layers } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { WORKSPACE_MODES, currentMode } from '../lib/workspaceFeatures';
import { SegIndicator, useSegId } from './ui/motion';

const MODE_ICONS = { personal: User, business: Briefcase, hybrid: Layers };

/**
 * Personal <-> Business <-> Hybrid switch (PLAN.md §13 Phase 3). Switching loads
 * that mode's feature preset; the reply voice follows (Hybrid keeps personal).
 * `compact` drops the labels to icons + short text for the desktop sidebar.
 */
export default function WorkspaceModeSwitch({ compact = false }) {
  const { user, workspaceFeatures, updateWorkspaceFeatures, showToast } = useApp();
  const [switching, setSwitching] = useState(false);
  // The pill slides the moment you tap (optimistic); it slides back if saving fails
  const [pending, setPending] = useState(null);
  const saved = currentMode(workspaceFeatures, user);
  const mode = pending || saved;
  const seg = useSegId();

  const switchMode = async next => {
    if (next === mode || switching) return;
    setSwitching(true);
    setPending(next);
    const ok = await updateWorkspaceFeatures({ activeMode: next });
    setPending(null);
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
            {mode === key && <SegIndicator id={seg} />}
            <Icon size={compact ? 13 : 16} /> {label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
