'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Cpu, Save, PlugZap, CheckCircle2, XCircle } from 'lucide-react';

// Field hints per provider; must match services/llmAdapter.js
const PROVIDERS = [
  { id: 'azure', label: 'Platform Azure', desc: 'Included with your plan. Nothing to set up.' },
  { id: 'openai', label: 'Custom OpenAI', desc: 'Your own OpenAI key (or any OpenAI-compatible URL).', key: true, model: 'gpt-4o-mini', endpoint: 'https://api.openai.com/v1' },
  { id: 'anthropic', label: 'Anthropic', desc: 'Claude models with your Anthropic key.', key: true, model: 'claude-opus-5-5' },
  { id: 'groq', label: 'Groq', desc: 'Fast Llama models with your Groq key.', key: true, model: 'llama-3.3-70b-versatile' },
  { id: 'openrouter', label: 'OpenRouter', desc: 'Hundreds of models with one OpenRouter key.', key: true, model: 'openai/gpt-4o-mini' },
  { id: 'ollama', label: 'Local Ollama', desc: 'Ollama, vLLM or LocalAI on your own machine. Falls back to Azure if it is offline.', model: 'llama3.1', endpoint: 'http://localhost:11434/v1', optionalKey: true },
  { id: 'mcp', label: 'A2A MCP', desc: 'Forward each DM to your own agent over MCP (HTTP, SSE or WebSocket).', model: 'reply', endpoint: 'https://agent.example.com/mcp', optionalKey: true, modelLabel: 'Tool name' },
];

const labelStyle = { fontSize: '0.78rem', fontWeight: 700, color: '#09090b', display: 'block', marginBottom: '6px' };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '0.86rem', fontFamily: 'inherit', background: '#ffffff', color: '#09090b' };

/**
 * AI Provider Configuration: BYO-LLM, local models and A2A MCP (services/llmAdapter.js)
 */
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
        // A saved key belongs to one provider; switching providers without a new key clears it
        body: JSON.stringify({ ...body(), clearApiKey: !form.apiKey && savedProvider !== form.provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save AI provider');
      setHasApiKey(data.config.hasApiKey);
      setSavedProvider(data.config.provider);
      setForm(prev => ({ ...prev, apiKey: '' }));
      showToast?.('AI provider saved.', 'success');
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
      setTestResult(data.ok ? { ok: true, text: `Connected in ${data.latencyMs} ms: "${data.reply}"` } : { ok: false, text: data.error || 'Connection failed' });
    } catch (err) {
      setTestResult({ ok: false, text: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="skeleton" style={{ height: '220px', borderRadius: '12px', marginBottom: '24px' }} />;

  return (
    <div className="controls-card-container" style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={13} /> AI PROVIDER CONFIGURATION
          </div>
          <div style={{ fontSize: '0.85rem', color: '#71717a', marginTop: '2px' }}>Choose which AI writes your replies. Keys are stored encrypted.</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={test} disabled={testing}>
            <PlugZap size={14} /> {testing ? 'Testing…' : 'Test Connection'}
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save Provider'}
          </button>
        </div>
      </div>

      <div role="radiogroup" aria-label="AI provider" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', marginBottom: '16px' }}>
        {PROVIDERS.map(p => {
          const on = form.provider === p.id;
          return (
            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${on ? '#09090b' : '#e4e4e7'}`, background: on ? '#fafafa' : '#ffffff', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 700, minHeight: '44px' }}>
              <input type="radio" name="ai-provider" value={p.id} checked={on} onChange={() => set('provider', p.id)} />
              {p.label}
            </label>
          );
        })}
      </div>

      <div style={{ fontSize: '0.8rem', color: '#71717a', marginBottom: '14px' }}>{meta.desc}</div>

      {form.provider !== 'azure' && (
        <div className="responsive-form-grid" style={{ marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>{meta.modelLabel || 'Model name'}</label>
            <input style={inputStyle} value={form.model} onChange={e => set('model', e.target.value)} placeholder={meta.model} />
          </div>
          <div>
            <label style={labelStyle}>Endpoint URL {meta.id === 'mcp' ? '' : '(optional)'}</label>
            <input style={inputStyle} value={form.endpoint} onChange={e => set('endpoint', e.target.value)} placeholder={meta.endpoint || 'Default'} />
          </div>
          {(meta.key || meta.optionalKey) && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>API key {meta.optionalKey ? '(optional)' : ''}</label>
              <input type="password" autoComplete="off" style={inputStyle} value={form.apiKey} onChange={e => set('apiKey', e.target.value)}
                placeholder={keySaved ? '•••••••• saved — leave blank to keep' : 'Paste your API key'} />
            </div>
          )}
        </div>
      )}

      {testResult && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.8rem', color: testResult.ok ? '#15803d' : '#b91c1c', wordBreak: 'break-word' }}>
          {testResult.ok ? <CheckCircle2 size={15} style={{ flexShrink: 0 }} /> : <XCircle size={15} style={{ flexShrink: 0 }} />}
          {testResult.text}
        </div>
      )}
    </div>
  );
}
