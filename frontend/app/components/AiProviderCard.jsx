'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Cpu, Save, PlugZap, CheckCircle2, XCircle, Sparkles, Terminal, Globe, Server, Bot, Zap, Cloud } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Field hints per provider; must match services/llmAdapter.js
const PROVIDERS = [
  { id: 'azure', label: 'Platform Azure', badge: 'DEFAULT', icon: Cloud, desc: 'Included with your plan. Managed high-availability Azure OpenAI deployment.', accent: '#0284c7' },
  { id: 'openai', label: 'Custom OpenAI', badge: 'GPT-4o', icon: Sparkles, desc: 'Direct OpenAI API connection or any compatible inference gateway.', key: true, model: 'gpt-4o-mini', endpoint: 'https://api.openai.com/v1', accent: '#10a37f' },
  { id: 'anthropic', label: 'Anthropic', badge: 'CLAUDE', icon: Zap, desc: 'High-intelligence reasoning with Claude 3.5 Sonnet and Opus.', key: true, model: 'claude-3-5-sonnet-20241022', accent: '#d97706' },
  { id: 'groq', label: 'Groq Cloud', badge: 'ULTRA FAST', icon: Zap, desc: 'Sub-second Llama 3.3 70B inference powered by Groq LPUs.', key: true, model: 'llama-3.3-70b-versatile', accent: '#f97316' },
  { id: 'openrouter', label: 'OpenRouter', badge: 'MULTI-MODEL', icon: Globe, desc: 'Access 200+ models with unified billing through OpenRouter.', key: true, model: 'openai/gpt-4o-mini', accent: '#6366f1' },
  { id: 'ollama', label: 'Local Ollama', badge: 'SELF-HOSTED', icon: Terminal, desc: 'Run locally on your machine via Ollama, vLLM or LocalAI. Zero cloud leaks.', model: 'llama3.1', endpoint: 'http://localhost:11434/v1', optionalKey: true, accent: '#10b981' },
  { id: 'mcp', label: 'A2A MCP', badge: 'AGENT PROTOCOL', icon: Bot, desc: 'Connect to external AI agents over Model Context Protocol (SSE/WebSocket).', model: 'reply', endpoint: 'https://agent.example.com/mcp', optionalKey: true, modelLabel: 'Tool name', accent: '#8b5cf6' },
];

export default function AiProviderCard() {
  const { API_BASE, token, showToast } = useApp();
  const [form, setForm] = useState({ provider: 'azure', model: '', endpoint: '', apiKey: '' });
  const [hasApiKey, setHasApiKey] = useState(false);
  const [savedProvider, setSavedProvider] = useState('azure');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const authHeader = () => {
    const t = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/settings/ai-provider`, { headers: authHeader() })
      .then(r => r.json())
      .then(data => {
        if (!data?.config) return;
        setForm({ provider: data.config.provider, model: data.config.model, endpoint: data.config.endpoint, apiKey: '' });
        setHasApiKey(data.config.hasApiKey);
        setSavedProvider(data.config.provider);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [API_BASE, token]);

  const meta = PROVIDERS.find(p => p.id === form.provider) || PROVIDERS[0];
  const set = (key, value) => { setForm(prev => ({ ...prev, [key]: value })); setTestResult(null); };
  const keySaved = hasApiKey && savedProvider === form.provider;

  const body = () => ({ provider: form.provider, model: form.model, endpoint: form.endpoint, apiKey: form.apiKey });

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings/ai-provider`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ ...body(), clearApiKey: !form.apiKey && savedProvider !== form.provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save AI provider');
      setHasApiKey(data.config.hasApiKey);
      setSavedProvider(data.config.provider);
      setForm(prev => ({ ...prev, apiKey: '' }));
      showToast?.('AI provider configuration updated.', 'success');
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/settings/test-llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(body()),
      });
      const data = await res.json();
      setTestResult(data.ok ? { ok: true, text: `Connected successfully (${data.latencyMs} ms). Output: "${data.reply}"` } : { ok: false, text: data.error || 'Connection failed' });
    } catch (err) {
      setTestResult({ ok: false, text: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="skeleton" style={{ height: '260px', borderRadius: '16px', marginBottom: '24px' }} />;

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e4e4e7',
      borderRadius: '16px',
      padding: '28px',
      marginBottom: '28px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 8px 24px -4px rgba(0,0,0,0.04)',
      transition: 'box-shadow 0.2s ease'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '22px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: '#09090b',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Cpu size={15} />
            </div>
            <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: '0.06em' }}>
              BYO-LLM &amp; INFERENCE ENGINE
            </span>
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#09090b', letterSpacing: '-0.4px', margin: '2px 0 4px' }}>
            AI Model Provider
          </h3>
          <p style={{ fontSize: '0.84rem', color: '#71717a', margin: 0, lineHeight: 1.45 }}>
            Select the intelligence engine powering your Instagram DMs. API credentials are encrypted with AES-256-GCM.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            onClick={test}
            disabled={testing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '9px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: testing ? 'not-allowed' : 'pointer'
            }}
          >
            <PlugZap size={14} /> {testing ? 'Pinging…' : 'Test Connection'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={saving}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '9px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer'
            }}
          >
            <Save size={14} /> {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Provider Selector Cards */}
      <div
        role="radiogroup"
        aria-label="AI provider"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '10px',
          marginBottom: '20px'
        }}
      >
        {PROVIDERS.map(p => {
          const on = form.provider === p.id;
          const IconComponent = p.icon;
          return (
            <motion.div
              key={p.id}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => set('provider', p.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: '12px',
                border: `1.5px solid ${on ? '#09090b' : '#e4e4e7'}`,
                background: on ? '#fafafa' : '#ffffff',
                cursor: 'pointer',
                minHeight: '84px',
                boxShadow: on ? '0 4px 14px rgba(0,0,0,0.06)' : 'none',
                transition: 'border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    background: on ? '#09090b' : '#f4f4f5',
                    color: on ? '#ffffff' : '#71717a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <IconComponent size={13} />
                  </div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#09090b', letterSpacing: '-0.2px' }}>
                    {p.label}
                  </span>
                </div>

                {/* Custom radio indicator circle */}
                <div style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  border: on ? '4.5px solid #09090b' : '1.5px solid #d4d4d8',
                  background: '#ffffff',
                  flexShrink: 0,
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                <span style={{
                  fontSize: '0.62rem',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: on ? '#09090b' : '#f4f4f5',
                  color: on ? '#ffffff' : '#71717a'
                }}>
                  {p.badge}
                </span>
                {savedProvider === p.id && (
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <CheckCircle2 size={11} /> Active
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Description banner */}
      <div style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        padding: '12px 16px',
        fontSize: '0.82rem',
        color: '#475569',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <span style={{ fontWeight: 700, color: '#0f172a' }}>{meta.label}:</span>
        <span>{meta.desc}</span>
      </div>

      {/* Dynamic Endpoint, Model, and Key Fields */}
      {form.provider !== 'azure' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '14px',
            marginBottom: '16px'
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#09090b', marginBottom: '6px' }}>
              {meta.modelLabel || 'Model Name / ID'}
            </label>
            <input
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #e4e4e7',
                background: '#ffffff',
                fontSize: '0.85rem',
                fontFamily: "'JetBrains Mono', monospace"
              }}
              value={form.model}
              onChange={e => set('model', e.target.value)}
              placeholder={meta.model}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#09090b', marginBottom: '6px' }}>
              Endpoint URL {meta.id === 'mcp' ? '' : '(Optional)'}
            </label>
            <input
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #e4e4e7',
                background: '#ffffff',
                fontSize: '0.85rem',
                fontFamily: "'JetBrains Mono', monospace"
              }}
              value={form.endpoint}
              onChange={e => set('endpoint', e.target.value)}
              placeholder={meta.endpoint || 'Default gateway'}
            />
          </div>

          {(meta.key || meta.optionalKey) && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#09090b', marginBottom: '6px' }}>
                API Secret Key {meta.optionalKey ? '(Optional for local)' : ''}
              </label>
              <input
                type="password"
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e4e4e7',
                  background: '#ffffff',
                  fontSize: '0.85rem',
                  fontFamily: "'JetBrains Mono', monospace"
                }}
                value={form.apiKey}
                onChange={e => set('apiKey', e.target.value)}
                placeholder={keySaved ? '•••••••••••••••• (Encrypted in MongoDB — leave blank to keep)' : 'Paste API key here'}
              />
            </div>
          )}
        </motion.div>
      )}

      {/* Test feedback */}
      <AnimatePresence>
        {testResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: testResult.ok ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${testResult.ok ? '#bbf7d0' : '#fecaca'}`,
              color: testResult.ok ? '#15803d' : '#b91c1c'
            }}
          >
            {testResult.ok ? <CheckCircle2 size={16} style={{ flexShrink: 0 }} /> : <XCircle size={16} style={{ flexShrink: 0 }} />}
            <span>{testResult.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
