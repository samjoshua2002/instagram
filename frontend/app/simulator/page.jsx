'use client';

import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { MessageSquare, Send, Sparkles } from 'lucide-react';

export default function SimulatorPage() {
  const { nodes, API_BASE } = useApp();
  const [selectedFriendId, setSelectedFriendId] = useState('bhavani');
  const [inputMsg, setInputMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'user', text: 'hey sam! how is everything going with the video projects?', time: '10:45 AM' },
    { role: 'assistant', text: 'yoo! going good fr! just finishing up a motion graphic reel. hows your medicine study going? how are the hamsters doing haha 🐹', time: '10:46 AM' }
  ]);

  const friendList = nodes.filter(n => !n.isRoot);
  const targetFriend = friendList.find(f => f.id === selectedFriendId) || friendList[0];

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!inputMsg.trim()) return;

    const userText = inputMsg.trim();
    setInputMsg('');
    setMessages(prev => [...prev, { role: 'user', text: userText, time: 'Just now' }]);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/simulator/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testSenderId: targetFriend?.senderId || 'test_sim_id',
          testUsername: targetFriend?.name || 'Friend',
          messageText: userText
        })
      });
      const data = await res.json();
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: data.replyText || 'haha chill bro got it', time: 'Just now' }
      ]);
    } catch (e) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: 'yoo wassup! (local simulation reply)', time: 'Just now' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '850px', height: '100%', minHeight: 'calc(100vh - 70px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '0.72rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold' }}>
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
              background: selectedFriendId === f.id ? 'var(--color-surface)' : 'var(--color-text-primary)',
              color: selectedFriendId === f.id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
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
            placeholder={`Type a DM as ${targetFriend?.name || 'Friend'}...`}
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            style={{ flex: 1, background: 'var(--color-text-primary)', border: '1px solid var(--color-text-secondary)', borderRadius: '8px', color: 'var(--color-surface)', padding: '12px 16px', fontSize: '0.85rem', outline: 'none' }}
          />
          <button
            type="submit"
            disabled={isLoading || !inputMsg.trim()}
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
