'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Send, MessageSquare, RotateCcw } from 'lucide-react';
import { useApp } from '../context/AppContext';

/**
 * Mock Instagram DM sandbox (PLAN.md §13 Phase 4): sends test messages through
 * the real reply pipeline (/api/simulator/chat) as the chosen sender.
 */
export default function SandboxChat({ senderId, senderName, placeholder = 'Type a test DM…' }) {
  const { API_BASE, token } = useApp();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  // New sender, fresh thread
  useEffect(() => { setMessages([]); }, [senderId]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);

  const send = async e => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/simulator/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ testSenderId: senderId, testUsername: senderName, messageText: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No reply');
      // The pipeline may answer in several short bubbles
      const parts = Array.isArray(data.replyParts) && data.replyParts.length ? data.replyParts : [data.replyText].filter(Boolean);
      setMessages(prev => [...prev, ...(parts.length ? parts : ['(no reply: the bot chose to stay quiet)']).map(t => ({ role: 'assistant', text: t }))]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', text: err.message || 'Could not reach the reply engine' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sandbox">
      <div className="sandbox-head">
        <MessageSquare size={15} />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Test chat as <strong>{senderName}</strong>
        </span>
        <button type="button" className="story-icon-btn" onClick={() => setMessages([])} aria-label="Clear test chat" title="Clear">
          <RotateCcw size={14} />
        </button>
      </div>
      <div className="sandbox-list" ref={listRef}>
        {messages.length === 0 && <div className="sandbox-empty">Send a message to see how your bot replies. Nothing is sent to Instagram.</div>}
        {messages.map((m, i) => <div key={i} className={`sandbox-bubble ${m.role}`}>{m.text}</div>)}
        {loading && <div className="sandbox-bubble assistant typing"><span /><span /><span /></div>}
      </div>
      <form className="sandbox-form" onSubmit={send}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder} maxLength={1000} aria-label="Test message" />
        <button type="submit" disabled={loading || !input.trim()} aria-label="Send"><Send size={16} /></button>
      </form>
    </div>
  );
}
