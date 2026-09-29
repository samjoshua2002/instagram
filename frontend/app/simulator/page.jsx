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
          testSenderId: targetFriend.senderId || 'test_sim_id',
          testUsername: targetFriend.name,
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
    <div style={{ padding: '36px 32px 60px 32px', maxWidth: '850px', margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '0.72rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold' }}>
          // INSTANT PERSONA TESTING PLAYGROUND
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.6px', marginTop: '4px' }}>
          Live DM Simulator
        </h1>
        <p style={{ color: '#a1a1aa', fontSize: '0.88rem', marginTop: '4px' }}>
          Test how Sam Joshua&apos;s clone responds to specific friends like Bhavani or Rajveer without texting on Instagram.
        </p>
      </div>

      {/* Target Friend Switcher */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        {friendList.map(f => (
          <button
            key={f.id}
            onClick={() => setSelectedFriendId(f.id)}
            style={{
              background: selectedFriendId === f.id ? '#ffffff' : '#09090b',
              color: selectedFriendId === f.id ? '#000000' : '#a1a1aa',
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
          {messages.map((msg, i) => (
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
              Sam&apos;s clone is typing...
            </div>
          )}
        </div>

        <form onSubmit={handleSend} style={{ padding: '14px', borderTop: '1px solid #27272a', display: 'flex', gap: '10px', background: '#0e0e11' }}>
          <input
            type="text"
            placeholder={`Type a DM as ${targetFriend.name}...`}
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            style={{ flex: 1, background: '#000000', border: '1px solid #27272a', borderRadius: '8px', color: '#ffffff', padding: '12px 16px', fontSize: '0.85rem', outline: 'none' }}
          />
          <button
            type="submit"
            disabled={isLoading || !inputMsg.trim()}
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
