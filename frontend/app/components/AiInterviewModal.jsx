'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Sparkles, X, Send, Check } from 'lucide-react';

export default function AiInterviewModal() {
  const { isAiModalOpen, setIsAiModalOpen, editingNode, saveNode, API_BASE } = useApp();

  const [aiChat, setAiChat] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [accumulatedNode, setAccumulatedNode] = useState(null);

  const chatBottomRef = useRef(null);

  useEffect(() => {
    if (isAiModalOpen) {
      const greeting = editingNode
        ? `Hey Sam! Let's update intel for **${editingNode.name}**. What new life updates, inside jokes, exam dates, or relationship changes happened?`
        : `Hey Sam! Who is this new person? Tell me their name, how you know them (sister, homie, medicine friend, lover), and their vibe!`;

      setAiChat([{ role: 'assistant', content: greeting }]);
      setAccumulatedNode(editingNode ? { ...editingNode } : { name: '', relationshipToSam: '', connections: [], lore: [] });
    }
  }, [isAiModalOpen, editingNode]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChat]);

  if (!isAiModalOpen) return null;

  const handleSendAiMessage = async (e) => {
    e?.preventDefault();
    if (!aiInput.trim()) return;

    const userMsg = aiInput.trim();
    setAiInput('');
    const newChat = [...aiChat, { role: 'user', content: userMsg }];
    setAiChat(newChat);
    setIsAiTyping(true);

    try {
      const res = await fetch(`${API_BASE}/api/social-graph/ai-interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationHistory: newChat.map(m => ({ role: m.role, content: m.content })),
          userInput: userMsg,
          existingNode: accumulatedNode
        })
      });

      const data = await res.json();
      if (data.success) {
        if (data.node) {
          setAccumulatedNode(prev => ({ ...prev, ...data.node }));
        }
        const reply = data.question || (data.isComplete ? `Got it all down! Review the card on the right and click Save!` : data.summary);
        setAiChat(prev => [...prev, { role: 'assistant', content: reply }]);
      }
    } catch (err) {
      setAiChat(prev => [...prev, {
        role: 'assistant',
        content: `Got that noted! What else should Sam's clone remember about them (handle, connections, or roast style)?`
      }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  const handleSave = () => {
    if (!accumulatedNode?.name) return;
    saveNode(accumulatedNode);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(10px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        style={{
          background: '#09090b',
          border: '1px solid #27272a',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '850px',
          height: '80vh',
          maxHeight: '700px',
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,0.95)'
        }}
        className="modal-inner"
      >
        {/* Left: Chat Interviewer */}
        <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', borderRight: '1px solid #27272a' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="#ffffff" />
              <span style={{ fontWeight: '700', color: '#ffffff', fontSize: '0.92rem' }}>
                AI Knowledge Tree Architect
              </span>
            </div>
            <button
              onClick={() => setIsAiModalOpen(false)}
              style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {aiChat.map((msg, i) => (
              <div
                key={i}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: msg.role === 'user' ? '#ffffff' : '#121214',
                  color: msg.role === 'user' ? '#000000' : '#ffffff',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  fontSize: '0.85rem',
                  lineHeight: '1.45',
                  border: msg.role === 'user' ? 'none' : '1px solid #27272a'
                }}
              >
                {msg.content}
              </div>
            ))}
            {isAiTyping && (
              <div style={{ alignSelf: 'flex-start', background: '#121214', padding: '8px 14px', borderRadius: '12px', color: '#a1a1aa', fontSize: '0.8rem' }}>
                Thinking & analyzing circle...
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSendAiMessage} style={{ padding: '12px 16px', borderTop: '1px solid #27272a', display: 'flex', gap: '8px', background: '#0e0e11' }}>
            <input
              type="text"
              placeholder="Answer AI (e.g. She studies medicine, dad in army, loves hamsters)..."
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              style={{ flex: 1, background: '#000000', border: '1px solid #27272a', borderRadius: '8px', color: '#ffffff', padding: '10px 14px', fontSize: '0.85rem', outline: 'none' }}
            />
            <button
              type="submit"
              disabled={isAiTyping || !aiInput.trim()}
              style={{ background: '#ffffff', color: '#000000', border: 'none', borderRadius: '8px', padding: '0 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Send size={16} />
            </button>
          </form>
        </div>

        {/* Right: Live Preview & Save */}
        <div style={{ flex: 0.8, padding: '24px', background: '#000000', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold' }}>
              Live Node Preview
            </span>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#ffffff', marginTop: '4px' }}>
              {accumulatedNode?.name || '(Waiting for name...)'}
            </h3>
            <span style={{ fontSize: '0.78rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace" }}>
              {accumulatedNode?.instagramHandle || 'No handle specified'}
            </span>

            <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ background: '#121214', padding: '10px', borderRadius: '6px', border: '1px solid #27272a', fontSize: '0.78rem', color: '#ffffff' }}>
                <b>Relation:</b> {accumulatedNode?.relationshipToSam || 'Not clarified yet'}
              </div>

              <div style={{ background: '#121214', padding: '10px', borderRadius: '6px', border: '1px solid #27272a', fontSize: '0.78rem', color: '#ffffff' }}>
                <b>Connections:</b> {(accumulatedNode?.connections || []).map(c => c.targetName).join(', ') || 'None specified'}
              </div>

              {accumulatedNode?.lore?.length > 0 && (
                <div style={{ background: '#121214', padding: '10px', borderRadius: '6px', border: '1px solid #27272a', fontSize: '0.78rem', color: '#ffffff' }}>
                  <b>Lore & Notes:</b>
                  <ul style={{ paddingLeft: '14px', marginTop: '4px' }}>
                    {accumulatedNode.lore.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={handleSave}
              disabled={!accumulatedNode?.name}
              style={{
                background: accumulatedNode?.name ? '#ffffff' : '#27272a',
                color: accumulatedNode?.name ? '#000000' : '#71717a',
                border: 'none',
                padding: '12px',
                borderRadius: '8px',
                fontWeight: '800',
                fontSize: '0.9rem',
                cursor: accumulatedNode?.name ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Check size={16} />
              <span>Save to Knowledge Tree & DB</span>
            </button>
            <button
              onClick={() => setIsAiModalOpen(false)}
              style={{ background: 'transparent', border: '1px solid #27272a', color: '#a1a1aa', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
