'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Wand2, X, Send, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';

/**
 * "Fix with AI": a floating button on a person's page that opens a chat. Tell it what's wrong
 * ("her name is Mochi", "Rajveer is my friend not hers", "she's my cousin", "turn AI off for her")
 * and it updates their records everywhere, then lists what it changed.
 */
const IDEAS = ['Her real name is …', 'Remove a wrong fact', 'They are my cousin', 'Make them top priority'];

export default function FixWithAI({ senderId, name }) {
  const { API_BASE, showToast, syncBackend } = useApp();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { setMsgs([]); setText(''); }, [senderId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const send = async e => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    const next = [...msgs, { role: 'user', content: t }];
    setMsgs(next);
    setText('');
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/people/${encodeURIComponent(senderId)}/fix-chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not reach the AI');
      setMsgs(m => [...m, { role: 'assistant', content: d.reply, changes: d.changes || [] }]);
      if (d.changes?.length) {
        syncBackend?.();
        window.dispatchEvent(new CustomEvent('person-updated', { detail: { senderId } }));
      }
    } catch (err) {
      showToast?.(err.message, 'error');
      setMsgs(m => m.slice(0, -1));
      setText(t);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="fx-fab" onClick={() => setOpen(true)} aria-label={`Fix what the AI knows about ${name}`}>
        <Wand2 size={18} /> <span>Fix with AI</span>
      </button>
      {open && createPortal(
        <div className="fx-panel" role="dialog" aria-label={`Fix ${name} with AI`}>
          <div className="fx-head">
            <span className="fx-av"><Wand2 size={16} /></span>
            <div><b>Fix {name}</b><small>Tell me what's wrong. I'll update everything.</small></div>
            <button type="button" className="fx-x" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="fx-body">
            {msgs.length === 0 && (
              <div className="fx-empty">
                <p>Names, relationships, facts, people in their life, privacy, priority, AI on or off. Just say it.</p>
                <div className="fx-ideas">{IDEAS.map(i => <button key={i} type="button" onClick={() => setText(i.replace(' …', ' '))}>{i}</button>)}</div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`fx-msg ${m.role}`}>
                <div className="fx-bubble">{m.content}</div>
                {m.changes?.length > 0 && (
                  <ul className="fx-changes">{m.changes.map((c, k) => <li key={k}><Check size={12} /> {c}</li>)}</ul>
                )}
              </div>
            ))}
            {busy && <div className="fx-msg assistant"><div className="fx-bubble fx-typing"><i /><i /><i /></div></div>}
            <div ref={endRef} />
          </div>
          <form className="fx-compose" onSubmit={send}>
            <input autoFocus value={text} onChange={e => setText(e.target.value)} maxLength={1500} disabled={busy}
              placeholder={`What should I fix about ${name}?`} aria-label="Your correction" />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send"><Send size={16} /></button>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
