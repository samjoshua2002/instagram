'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Sparkles, X, Send, Check, User, Link2, Calendar, FileText } from 'lucide-react';
import ContactAvatar from './ContactAvatar';

export default function AiInterviewModal() {
  const { isAiModalOpen, setIsAiModalOpen, editingNode, saveNode, API_BASE, lookupContact, showToast } = useApp();

  const [aiChat, setAiChat] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [accumulatedNode, setAccumulatedNode] = useState(null);

  const chatBottomRef = useRef(null);

  useEffect(() => {
    if (isAiModalOpen) {
      const greeting = editingNode
        ? `Hey Sam! Let's update intel for ${editingNode.name}. What new life updates, inside jokes, exam dates, or relationship changes happened?`
        : `Hey Sam! Who is this new person? Tell me their name, Instagram @username, relation to you (sister, homie, medicine friend), and what they're like!`;

      setAiChat([{ role: 'assistant', content: greeting }]);
      setAccumulatedNode(editingNode ? { ...editingNode } : {
        name: '',
        instagramHandle: '',
        senderId: '',
        relationshipToSam: '',
        category: 'online_friend',
        dob: '',
        connections: [],
        lore: [],
        personalNotes: '',
        roastStyle: ''
      });
    }
  }, [isAiModalOpen, editingNode]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChat]);

  // When handle is updated in accumulatedNode, auto-lookup senderId and profilePic
  useEffect(() => {
    if (accumulatedNode?.instagramHandle && !accumulatedNode.senderId) {
      lookupContact(accumulatedNode.instagramHandle).then(info => {
        if (info && info.senderId) {
          setAccumulatedNode(prev => ({
            ...prev,
            senderId: info.senderId,
            profilePic: info.profilePic || prev.profilePic,
            name: prev.name || info.name
          }));
        }
      });
    }
  }, [accumulatedNode?.instagramHandle, accumulatedNode?.senderId, lookupContact]);

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

      const data = await res.json().catch(() => ({}));
      if (data.success) {
        if (data.node) {
          // If handle was mentioned, check if DB knows them
          let matchedSenderId = accumulatedNode?.senderId || '';
          let matchedPic = accumulatedNode?.profilePic || '';
          const h = data.node.instagramHandle || accumulatedNode?.instagramHandle;
          if (h && !matchedSenderId) {
            const lookup = await lookupContact(h);
            if (lookup?.senderId) {
              matchedSenderId = lookup.senderId;
              matchedPic = lookup.profilePic || '';
            }
          }

          setAccumulatedNode(prev => ({
            ...prev,
            ...data.node,
            senderId: matchedSenderId || prev.senderId,
            profilePic: matchedPic || prev.profilePic
          }));
        }
        const reply = data.question || (data.isComplete ? `Got all details saved to preview. Review the attributes and click Save Person!` : data.summary);
        setAiChat(prev => [...prev, { role: 'assistant', content: reply }]);
      } else {
        throw new Error(data.error || 'The AI did not answer');
      }
    } catch (err) {
      setAiChat(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, that did not go through (${err.message}). Please send it again.`
      }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  const handleSave = async () => {
    if (!accumulatedNode?.name) {
      showToast('Name is required');
      return;
    }

    const payload = {
      ...accumulatedNode,
      name: accumulatedNode.name.trim(),
      handle: accumulatedNode.instagramHandle,
      relationship: accumulatedNode.relationshipToSam,
      category: accumulatedNode.category || 'online_friend',
      dob: accumulatedNode.dob || '',
      personalNotes: accumulatedNode.personalNotes || (accumulatedNode.lore || []).join('\n')
    };

    await saveNode(payload);
    setIsAiModalOpen(false);
    showToast(`Added ${payload.name} to People Directory`);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(9, 9, 11, 0.4)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        className="interview-modal-container"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '860px',
          height: '84vh',
          maxHeight: '680px',
          display: 'flex',
          overflow: 'hidden',
          boxShadow: '0 20px 45px rgba(0,0,0,0.1)'
        }}
      >
        {/* Left: Chat Interviewer */}
        <div className="interview-chat-pane" style={{ flex: 1.2, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ background: 'var(--color-text-primary)', color: 'var(--color-surface)', padding: '4px 6px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}>
                <Sparkles size={14} />
              </div>
              <span style={{ fontWeight: '800', color: 'var(--color-text-primary)', fontSize: '0.9rem' }}>
                Add Person (AI Interview)
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {accumulatedNode?.name && (
                <button
                  onClick={handleSave}
                  className="mobile-header-save-btn"
                  style={{
                    background: 'var(--color-text-primary)',
                    color: 'var(--color-surface)',
                    border: 'none',
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Save
                </button>
              )}
              <button
                onClick={() => setIsAiModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--color-surface-elevated)' }}>
            {aiChat.map((msg, i) => (
              <div
                key={i}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: msg.role === 'user' ? 'var(--color-text-primary)' : 'var(--color-surface)',
                  color: msg.role === 'user' ? 'var(--color-surface)' : 'var(--color-text-primary)',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  fontSize: '0.84rem',
                  lineHeight: '1.45',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--color-border)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                }}
              >
                {msg.content}
              </div>
            ))}
            {isAiTyping && (
              <div style={{ alignSelf: 'flex-start', background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '8px 12px', borderRadius: '8px', color: 'var(--color-text-secondary)', fontSize: '0.78rem' }}>
                Analyzing attributes & connecting...
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSendAiMessage} style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '8px', background: 'var(--color-surface)' }}>
            <input
              type="text"
              placeholder="Answer AI (e.g. She studies medicine, @handle, loves hamsters)..."
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              style={{ flex: 1, background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-primary)', padding: '10px 14px', fontSize: '0.84rem', outline: 'none' }}
            />
            <button
              type="submit"
              disabled={isAiTyping || !aiInput.trim()}
              style={{ background: 'var(--color-text-primary)', color: 'var(--color-surface)', border: 'none', borderRadius: '8px', padding: '0 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>

        {/* Right: Live Preview & Save */}
        <div className="interview-preview-pane" style={{ flex: 0.85, padding: '22px', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
              LIVE PROFILE PREVIEW
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
              <ContactAvatar contact={{ ...accumulatedNode, handle: accumulatedNode?.instagramHandle }} size={44} />
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0 }}>
                  {accumulatedNode?.name || '(Waiting for name...)'}
                </h3>
                <span style={{ fontSize: '0.76rem', color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace" }}>
                  {accumulatedNode?.instagramHandle || 'No handle set'}
                </span>
              </div>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ background: 'var(--color-surface-hover)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.78rem', color: 'var(--color-text-primary)' }}>
                <span style={{ fontWeight: '700', color: 'var(--color-text-secondary)' }}>RELATION: </span>
                <span>{accumulatedNode?.relationshipToSam || 'Not clarified yet'}</span>
              </div>

              {accumulatedNode?.dob && (
                <div style={{ background: 'var(--color-surface-hover)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.78rem', color: 'var(--color-text-primary)' }}>
                  <span style={{ fontWeight: '700', color: 'var(--color-text-secondary)' }}>DATE OF BIRTH: </span>
                  <span>{accumulatedNode.dob}</span>
                </div>
              )}

              <div style={{ background: 'var(--color-surface-hover)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.78rem', color: 'var(--color-text-primary)' }}>
                <span style={{ fontWeight: '700', color: 'var(--color-text-secondary)' }}>CONNECTIONS: </span>
                <span>{(accumulatedNode?.connections || []).map(c => c.targetName || c).join(', ') || 'None specified'}</span>
              </div>

              {(accumulatedNode?.lore?.length > 0 || accumulatedNode?.personalNotes) && (
                <div style={{ background: 'var(--color-surface-hover)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.78rem', color: 'var(--color-text-primary)', maxHeight: '120px', overflowY: 'auto' }}>
                  <span style={{ fontWeight: '700', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>LORE & NOTES:</span>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                    {accumulatedNode.personalNotes || (accumulatedNode.lore || []).join('\n')}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
            <button
              onClick={handleSave}
              disabled={!accumulatedNode?.name}
              style={{
                background: accumulatedNode?.name ? 'var(--color-text-primary)' : 'var(--color-surface-hover)',
                color: accumulatedNode?.name ? 'var(--color-surface)' : 'var(--color-text-muted)',
                border: 'none',
                padding: '11px',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '0.84rem',
                cursor: accumulatedNode?.name ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Check size={14} />
              <span>Save Person to Directory</span>
            </button>
            <button
              onClick={() => setIsAiModalOpen(false)}
              style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
