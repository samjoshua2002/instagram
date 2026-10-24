'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import SuperadminWorkspacePrompt from '../../components/SuperadminWorkspacePrompt';
import AiProviderCard from '../../components/AiProviderCard';
import { isFeatureOn } from '../../lib/workspaceFeatures';

/**
 * AI model page (PLAN.md §13 Phase 7): provider forms + test ping for Azure,
 * OpenAI, Anthropic, Groq, OpenRouter, local Ollama and A2A MCP agents.
 */
export default function ModelSettingsPage() {
  const { user, isImpersonating, workspaceFeatures, updateWorkspaceFeatures } = useApp();

  if (user?.role === 'superadmin' && !isImpersonating) {
    return (
      <SuperadminWorkspacePrompt
        sectionTitle="AI Model"
        sectionCode="10 // MODEL"
        sectionDescription="The AI provider is chosen per creator workspace. Choose a workspace below to manage its model."
      />
    );
  }

  const byoOn = isFeatureOn(workspaceFeatures, 'byoLlmCustomEndpoint');

  return (
    <div className="page-container" style={{ maxWidth: '860px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/settings" className="feature-back">
          <ArrowLeft size={14} /> Settings
        </Link>
        <div className="mono" style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 'bold' }}>// AI MODEL</div>
        <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.6px', margin: '4px 0 6px' }}>
          Your AI model
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: 0, lineHeight: 1.5 }}>
          Keep the built-in model, or connect your own: OpenAI, Anthropic, Groq, OpenRouter, a local Ollama model or an A2A MCP agent. Use Test Connection before saving.
        </p>
      </div>

      {!byoOn && (
        <div className="download-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: '200px', fontSize: '0.86rem', color: 'var(--color-text-secondary)' }}>
            &ldquo;Bring your own AI model&rdquo; is off, so replies use the built-in model even if you save another one here.
          </span>
          <button type="button" className="story-chip" onClick={() => updateWorkspaceFeatures({ enabledFeatures: { byoLlmCustomEndpoint: true } })}>
            Turn it on
          </button>
        </div>
      )}

      <AiProviderCard />
    </div>
  );
}
