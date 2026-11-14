'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { MessageSquare, Send, Sparkles } from 'lucide-react';

export default function SimulatorPage() {
  const { nodes, API_BASE } = useApp();
  const [selectedFriendId, setSelectedFriendId] = useState(null);
  const [inputMsg, setInputMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState([]);

  const friendList = nodes.filter(n => !n.isRoot);
  const targetFriend = friendList.find(f => f.id === selectedFriendId) || friendList[0];
  const activeFriendId = targetFriend?.id || null;

  // A reply still on its way for the previously selected contact is dropped, never shown as this one's
  const activeFriendRef = useRef(activeFriendId);
  useEffect(() => {
    activeFriendRef.current = activeFriendId;
    setIsLoading(false);
    // Each contact gets a fresh test thread, on the server too (otherwise the bot keeps the old test's context)
    setMessages([]);
    setInputMsg('');
    if (targetFriend) {
      fetch(`${API_BASE}/api/simulator/chat?testSenderId=${encodeURIComponent(`test_sim_${targetFriend.senderId || targetFriend.id}`)}`, { method: 'DELETE' }).catch(() => {});
    }
  }, [activeFriendId]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!inputMsg.trim() || !targetFriend) return;

    const userText = inputMsg.trim();
    const sentFor = activeFriendId;
    const stillActive = () => activeFriendRef.current === sentFor;
    setInputMsg('');
    setMessages(prev => [...prev, { role: 'user', text: userText, time: 'Just now' }]);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/simulator/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // test_ prefix: the server keeps it as a separate per-account test sender, so these
          // made-up DMs never land in the real contact's chat history or memory
          testSenderId: `test_sim_${targetFriend.senderId || targetFriend.id}`,
          testUsername: targetFriend.name || 'Friend',
          messageText: userText
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!stillActive()) return;
      // Never invent a reply: a failure must look like a failure, not a working bot
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: (res.ok && data.replyText) || `(No reply: ${data.error || 'the AI returned nothing'})`, time: 'Just now' }
      ]);
    } catch (e) {
      if (!stillActive()) return;
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: '(No reply: could not reach the server)', time: 'Just now' }
      ]);
    } finally {
      if (stillActive()) setIsLoading(false);
    }
  };

  return (
    <div className="page-container" style={{ height: '100%', minHeight: 'calc(100vh - 70px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--color-success)', fontFamily: "var(--font-label)", fontWeight: 'bold' }}>
          // INSTANT PERSONA TESTING PLAYGROUND
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.6px', marginTop: '4px' }}>
          Live DM Simulator
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', marginTop: '4px' }}>
          Test how your AI persona responds to specific contacts without texting on Instagram.
        </p>
      </div>

      {/* Target Friend Switcher */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        {friendList.map(f => (
          <button
            key={f.id}
            onClick={() => setSelectedFriendId(f.id)}
            style={{
              background: activeFriendId === f.id ? 'var(--color-surface)' : 'var(--color-text-primary)',
              color: activeFriendId === f.id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              border: '1px solid var(--color-text-secondary)',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: '600',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {f.name}
          </button>
        ))}
      </div>

      {/* Chat Window */}
      <div style={{ flex: 1, background: 'var(--color-text-primary)', border: '1px solid var(--color-text-secondary)', borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-start' : 'flex-end',
                maxWidth: '75%',
                background: msg.role === 'user' ? 'var(--color-text-primary)' : 'var(--color-surface)',
                color: msg.role === 'user' ? 'var(--color-surface)' : 'var(--color-text-primary)',
                padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '12px 12px 12px 2px' : '12px 12px 2px 12px',
                fontSize: '0.85rem',
                lineHeight: '1.45',
                border: msg.role === 'user' ? '1px solid var(--color-text-secondary)' : 'none'
              }}
            >
              <div>{msg.text}</div>
              <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '4px', textAlign: msg.role === 'user' ? 'left' : 'right' }}>
                {msg.time}
              </div>
            </div>
          ))}
          {isLoading && (
            <div style={{ alignSelf: 'flex-end', background: 'var(--color-text-primary)', padding: '10px 16px', borderRadius: '12px', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              AI persona is typing...
            </div>
          )}
        </div>

        <form onSubmit={handleSend} style={{ padding: '14px', borderTop: '1px solid var(--color-text-secondary)', display: 'flex', gap: '10px', background: 'var(--color-text-primary)' }}>
          <input
            type="text"
            placeholder={targetFriend ? `Type a DM as ${targetFriend.name}...` : 'Add a contact in People first'}
            disabled={!targetFriend}
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            style={{ flex: 1, background: 'var(--color-text-primary)', border: '1px solid var(--color-text-secondary)', borderRadius: '8px', color: 'var(--color-surface)', padding: '12px 16px', fontSize: '0.85rem', outline: 'none' }}
          />
          <button
            type="submit"
            disabled={isLoading || !inputMsg.trim() || !targetFriend}
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-primary)', border: 'none', borderRadius: '8px', padding: '0 20px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Send size={15} />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
