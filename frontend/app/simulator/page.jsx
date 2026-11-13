'use client';

import React, { useState, useEffect } from 'react';
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

  // Each contact gets a fresh test thread
  useEffect(() => {
    setMessages([]);
    setInputMsg('');
  }, [activeFriendId]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!inputMsg.trim() || !targetFriend) return;

    const userText = inputMsg.trim();
    setInputMsg('');
    setMessages(prev => [...prev, { role: 'user', text: userText, time: 'Just now' }]);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/simulator/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // sim_ prefix keeps test messages out of the real contact's history
          testSenderId: 'sim_' + (targetFriend.senderId || targetFriend.id),
          testUsername: targetFriend.name || 'Friend',
          messageText: userText
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (!data.replyText) throw new Error('The AI returned no reply');
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: data.replyText, time: 'Just now' }
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'error', text: `Simulator error: ${err.message || 'request failed'}`, time: 'Just now' }
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
        <p style={{ color: '#a1a1aa', fontSize: '0.88rem', marginTop: '4px' }}>
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
              background: activeFriendId === f.id ? '#ffffff' : '#09090b',
              color: activeFriendId === f.id ? '#000000' : '#a1a1aa',
              border: '1px solid #27272a',
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
      <div style={{ flex: 1, background: '#09090b', border: '1px solid #27272a', borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {messages.length === 0 && !isLoading && (
            <div style={{ margin: 'auto', textAlign: 'center', color: '#a1a1aa', fontSize: '0.85rem' }}>
              {targetFriend
                ? `Send a test DM as ${targetFriend.name} to see how your AI replies.`
                : 'Add a contact in People first, then test replies here.'}
            </div>
          )}
          {messages.map((msg, i) => msg.role === 'error' ? (
            <div key={i} style={{ alignSelf: 'center', color: '#ef4444', fontSize: '0.78rem', textAlign: 'center' }}>
              {msg.text}
            </div>
          ) : (
            <div
              key={i}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-start' : 'flex-end',
                maxWidth: '75%',
                background: msg.role === 'user' ? '#18181b' : '#ffffff',
                color: msg.role === 'user' ? '#ffffff' : '#000000',
                padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '12px 12px 12px 2px' : '12px 12px 2px 12px',
                fontSize: '0.85rem',
                lineHeight: '1.45',
                border: msg.role === 'user' ? '1px solid #27272a' : 'none'
              }}
            >
              <div>{msg.text}</div>
              <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '4px', textAlign: msg.role === 'user' ? 'left' : 'right' }}>
                {msg.time}
              </div>
            </div>
          ))}
          {isLoading && (
            <div style={{ alignSelf: 'flex-end', background: '#18181b', padding: '10px 16px', borderRadius: '12px', fontSize: '0.78rem', color: '#a1a1aa' }}>
              AI persona is typing...
            </div>
          )}
        </div>

        <form onSubmit={handleSend} style={{ padding: '14px', borderTop: '1px solid #27272a', display: 'flex', gap: '10px', background: '#0e0e11' }}>
          <input
            type="text"
            placeholder={targetFriend ? `Type a DM as ${targetFriend.name}...` : 'No contacts yet'}
            disabled={!targetFriend}
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            style={{ flex: 1, background: '#000000', border: '1px solid #27272a', borderRadius: '8px', color: '#ffffff', padding: '12px 16px', fontSize: '0.85rem', outline: 'none' }}
          />
          <button
            type="submit"
            disabled={isLoading || !inputMsg.trim() || !targetFriend}
            style={{ background: '#ffffff', color: '#000000', border: 'none', borderRadius: '8px', padding: '0 20px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Send size={15} />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
