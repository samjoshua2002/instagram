'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Clock, ShieldAlert, Receipt, Tag, Plus, Trash2, Save } from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EMPTY_POLICY = {
  timezone: 'Asia/Kolkata',
  workingDays: [1, 2, 3, 4, 5, 6],
  openTime: '09:00',
  closeTime: '18:00',
  outOfHoursMessage: '',
  escalationKeywords: [],
  refundPolicy: '',
  allowDiscounts: false,
  discountPolicy: '',
  customRules: [],
};

const labelStyle = { fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-primary)', display: 'block', marginBottom: '6px' };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '0.86rem', fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text-primary)' };
const sectionTitle = { display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.95rem', margin: '0 0 12px' };

/**
 * Business Policy & Hours: inputs for the business CEL evaluator (celRuleEngine.evaluateBusiness)
 */
export default function BusinessPolicyCard() {
  const { API_BASE, token, showToast } = useApp();
  const [policy, setPolicy] = useState(EMPTY_POLICY);
  const [keywordsText, setKeywordsText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const authHeader = () => {
    const t = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/persona`, { headers: authHeader() })
      .then(r => r.json())
      .then(cfg => {
        const p = { ...EMPTY_POLICY, ...(cfg?.businessPolicy || {}) };
        setPolicy(p);
        setKeywordsText((p.escalationKeywords || []).join(', '));
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [API_BASE, token]);

  const set = (key, value) => setPolicy(prev => ({ ...prev, [key]: value }));

  const toggleDay = (d) => set('workingDays', policy.workingDays.includes(d)
    ? policy.workingDays.filter(x => x !== d)
    : [...policy.workingDays, d].sort());

  const updateRule = (i, key, value) => set('customRules', policy.customRules.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        businessPolicy: {
          ...policy,
          escalationKeywords: keywordsText.split(',').map(s => s.trim()).filter(Boolean),
          customRules: policy.customRules.filter(r => r.when && r.directive),
        },
      };
      const res = await fetch(`${API_BASE}/api/persona`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save policy');
      showToast?.('Business policy saved.', 'success');
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="skeleton" style={{ height: '220px', borderRadius: '12px', marginBottom: '24px' }} />;

  return (
    <div className="controls-card-container" style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>BUSINESS POLICY & HOURS</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>The AI follows these rules for every customer DM.</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save Policy'}
        </button>
      </div>

      {/* Hours */}
      <h3 style={sectionTitle}><Clock size={16} /> Business hours</h3>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {DAYS.map((name, d) => {
          const on = policy.workingDays.includes(d);
          return (
            <button key={name} type="button" onClick={() => toggleDay(d)}
              style={{ padding: '7px 12px', borderRadius: '999px', border: `1px solid ${on ? 'var(--color-text-primary)' : 'var(--color-border)'}`, background: on ? 'var(--color-text-primary)' : 'var(--color-surface)', color: on ? 'var(--color-surface)' : 'var(--color-text-secondary)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', minHeight: '36px' }}>
              {name}
            </button>
          );
        })}
      </div>
      <div className="responsive-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1.4fr', marginBottom: '12px' }}>
        <div><label style={labelStyle}>Opens</label><input type="time" style={inputStyle} value={policy.openTime} onChange={e => set('openTime', e.target.value)} /></div>
        <div><label style={labelStyle}>Closes</label><input type="time" style={inputStyle} value={policy.closeTime} onChange={e => set('closeTime', e.target.value)} /></div>
        <div><label style={labelStyle}>Time zone</label><input style={inputStyle} value={policy.timezone} onChange={e => set('timezone', e.target.value)} placeholder="Asia/Kolkata" /></div>
      </div>
      <label style={labelStyle}>After-hours message (optional)</label>
      <textarea rows={2} style={{ ...inputStyle, resize: 'vertical', marginBottom: '20px' }} value={policy.outOfHoursMessage}
        onChange={e => set('outOfHoursMessage', e.target.value)} placeholder="Thanks for reaching out! We're closed right now and will reply first thing tomorrow." />

      {/* Escalation */}
      <h3 style={sectionTitle}><ShieldAlert size={16} /> Human handoff</h3>
      <label style={labelStyle}>Extra escalation keywords (comma separated)</label>
      <input style={{ ...inputStyle, marginBottom: '6px' }} value={keywordsText} onChange={e => setKeywordsText(e.target.value)} placeholder="late delivery, wrong size, invoice" />
      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
        Complaints and requests for a human are always detected. The bot replies once, then pauses that chat for your team.
      </div>

      {/* Refunds & discounts */}
      <div className="responsive-form-grid" style={{ marginBottom: '20px' }}>
        <div>
          <h3 style={sectionTitle}><Receipt size={16} /> Refund policy</h3>
          <textarea rows={4} style={{ ...inputStyle, resize: 'vertical' }} value={policy.refundPolicy} onChange={e => set('refundPolicy', e.target.value)}
            placeholder="Leave empty to always send refund requests to your team." />
        </div>
        <div>
          <h3 style={sectionTitle}><Tag size={16} /> Discounts</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={policy.allowDiscounts} onChange={e => set('allowDiscounts', e.target.checked)} />
            AI may mention discounts
          </label>
          <textarea rows={3} style={{ ...inputStyle, resize: 'vertical' }} value={policy.discountPolicy} disabled={!policy.allowDiscounts}
            onChange={e => set('discountPolicy', e.target.value)} placeholder="e.g. 10% off orders above ₹2000 with code WELCOME10" />
        </div>
      </div>

      {/* Custom CEL rules */}
      <h3 style={sectionTitle}>Advanced rules (CEL)</h3>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
        When the condition is true, the instruction is added for that reply. Example condition: <code>message.isQuestion &amp;&amp; customer.isReturning</code>
      </div>
      {policy.customRules.map((rule, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <input style={{ ...inputStyle, flex: '1 1 200px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }} value={rule.when}
            onChange={e => updateRule(i, 'when', e.target.value)} placeholder="message.asksForDiscount" />
          <input style={{ ...inputStyle, flex: '2 1 240px' }} value={rule.directive}
            onChange={e => updateRule(i, 'directive', e.target.value)} placeholder="Mention our loyalty program." />
          <button type="button" className="btn" onClick={() => set('customRules', policy.customRules.filter((_, idx) => idx !== i))} title="Remove rule">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="btn" onClick={() => set('customRules', [...policy.customRules, { when: '', directive: '' }])}>
        <Plus size={14} /> Add rule
      </button>
    </div>
  );
}
