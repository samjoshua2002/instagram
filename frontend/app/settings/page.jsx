'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  UserCheck, Save, Sparkles, MessageSquare, AlertCircle,
  CheckCircle2, Plus, Trash2, Send, Sliders, Info,
  Code, RefreshCw, Smile, Zap, BookOpen, ShieldAlert
} from 'lucide-react';

export default function SettingsPage() {
  const { API_BASE, showToast } = useApp();

  const [activeTab, setActiveTab] = useState('about');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    creatorName: 'Sam Joshua',
    instagramHandle: '@catovidz',
    personaBio: '',
    aboutMe: '',
    characteristics: '',
    textingHabits: '',
    replyRules: '',
    toneGuidelines: '',
    customKnowledge: '',
    forbiddenWords: [],
    sampleConversations: [],
    typingDelaySeconds: 1.5,
  });

  // State for adding forbidden word
  const [newForbiddenWord, setNewForbiddenWord] = useState('');

  // State for adding sample conversation
  const [newSampleUser, setNewSampleUser] = useState('');
  const [newSampleReply, setNewSampleReply] = useState('');

  // State for Live Test Simulator
  const [testInput, setTestInput] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testMessages, setTestMessages] = useState([
    { role: 'user', text: 'hey bro love your video edits!' },
    { role: 'assistant', text: 'yoo appreciate it so much man! 🙌 which reel did you watch?' }
  ]);

  // Fetch current persona on mount
  useEffect(() => {
    fetchPersona();
  }, []);

  const fetchPersona = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/persona`);
      if (res.ok) {
        const data = await res.json();
        setFormData({
          creatorName: data.creatorName || 'Sam Joshua',
          instagramHandle: data.instagramHandle || '@catovidz',
          personaBio: data.personaBio || '',
          aboutMe: data.aboutMe || '',
          characteristics: data.characteristics || '',
          textingHabits: data.textingHabits || '',
          replyRules: data.replyRules || '',
          toneGuidelines: data.toneGuidelines || '',
          customKnowledge: data.customKnowledge || '',
          forbiddenWords: Array.isArray(data.forbiddenWords) ? data.forbiddenWords : [],
          sampleConversations: Array.isArray(data.sampleConversations) ? data.sampleConversations : [],
          typingDelaySeconds: data.typingDelaySeconds || 1.5,
        });
      }
    } catch (err) {
      console.error('Failed to load persona config:', err);
      setErrorMsg('Could not fetch settings from server. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/persona`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setSaveSuccess(true);
        showToast('Settings & Persona saved successfully! AI updated.');
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to save settings');
      }
    } catch (err) {
      setErrorMsg('Network error while saving settings.');
    } finally {
      setSaving(false);
    }
  };

  // Add / Remove Forbidden Word
  const handleAddForbiddenWord = () => {
    const word = newForbiddenWord.trim().toLowerCase();
    if (!word) return;
    if (formData.forbiddenWords.includes(word)) {
      setNewForbiddenWord('');
      return;
    }
    setFormData(prev => ({
      ...prev,
      forbiddenWords: [...prev.forbiddenWords, word]
    }));
    setNewForbiddenWord('');
  };

  const handleRemoveForbiddenWord = (wordToRemove) => {
    setFormData(prev => ({
      ...prev,
      forbiddenWords: prev.forbiddenWords.filter(w => w !== wordToRemove)
    }));
  };

  // Add / Remove Sample Conversation
  const handleAddSampleConversation = () => {
    if (!newSampleUser.trim() || !newSampleReply.trim()) return;
    setFormData(prev => ({
      ...prev,
      sampleConversations: [
        ...prev.sampleConversations,
        { userMessage: newSampleUser.trim(), myReply: newSampleReply.trim() }
      ]
    }));
    setNewSampleUser('');
    setNewSampleReply('');
  };

  const handleRemoveSampleConversation = (index) => {
    setFormData(prev => ({
      ...prev,
      sampleConversations: prev.sampleConversations.filter((_, i) => i !== index)
    }));
  };

  // Trait chips helper
  const addTraitChip = (traitText) => {
    const current = formData.characteristics || '';
    if (current.toLowerCase().includes(traitText.toLowerCase())) return;
    const updated = current ? `${current}, ${traitText}` : traitText;
    setFormData(prev => ({ ...prev, characteristics: updated }));
  };

  // Texting rule chip helper
  const addTextingRuleChip = (ruleText) => {
    const current = formData.textingHabits || '';
    if (current.toLowerCase().includes(ruleText.toLowerCase())) return;
    const updated = current ? `${current}. ${ruleText}` : ruleText;
    setFormData(prev => ({ ...prev, textingHabits: updated }));
  };

  // Send Test Simulator Message
  const handleSendTestMessage = async (e) => {
    if (e) e.preventDefault();
    const text = testInput.trim();
    if (!text || testSending) return;

    const userMsg = { role: 'user', text };
    setTestMessages(prev => [...prev, userMsg]);
    setTestInput('');
    setTestSending(true);

    try {
      const res = await fetch(`${API_BASE}/api/simulator/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testSenderId: 'test_friend_user',
          testUsername: 'alex_test',
          messageText: text
        })
      });

      const data = await res.json();
      if (data.success && data.reply) {
        setTestMessages(prev => [...prev, { role: 'assistant', text: data.reply }]);
      } else {
        setTestMessages(prev => [...prev, { role: 'assistant', text: '(AI generation error or empty response)' }]);
      }
    } catch (err) {
      setTestMessages(prev => [...prev, { role: 'assistant', text: '(Connection failed to simulator)' }]);
    } finally {
      setTestSending(false);
    }
  };

  const tabs = [
    { id: 'about', label: 'About Me', icon: BookOpen },
    { id: 'characteristics', label: 'My Characteristics', icon: Smile },
    { id: 'texting', label: 'How To Text', icon: MessageSquare },
    { id: 'replying', label: 'How To Reply', icon: Zap },
    { id: 'examples', label: 'Chat Examples', icon: Code },
    { id: 'simulator', label: 'Test My Clone', icon: Send },
  ];

  if (loading) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <RefreshCw size={28} className="animate-spin" style={{ color: '#09090b', marginBottom: '16px' }} />
        <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#71717a' }}>Loading your persona settings...</h3>
      </div>
    );
  }

  return (
    <div className="page-container settings-fullwidth" style={{ maxWidth: '100%', width: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', background: '#09090b', color: '#ffffff', letterSpacing: '0.05em' }}>
              SECTION 04
            </span>
            <span style={{ fontSize: '0.76rem', color: '#71717a', fontWeight: '600' }}>
              AI PERSONA & STYLING ENGINE
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#09090b', letterSpacing: '-0.03em', margin: 0 }}>
            My Persona & Texting Profile
          </h1>
          <p style={{ fontSize: '0.86rem', color: '#71717a', marginTop: '4px', maxWidth: '640px' }}>
            Teach your AI clone who you are, how you text, your characteristics, and reply rules so it talks, banters, and reacts exactly like you.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={fetchPersona}
            className="btn"
            style={{ fontSize: '0.8rem', padding: '8px 14px' }}
            title="Reload settings from server"
          >
            <RefreshCw size={14} />
            <span>Reset</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
            style={{ fontSize: '0.8rem', padding: '8px 18px', background: saveSuccess ? '#16a34a' : '#09090b' }}
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : saveSuccess ? (
              <>
                <CheckCircle2 size={14} />
                <span>Saved ✓</span>
              </>
            ) : (
              <>
                <Save size={14} />
                <span>Save Settings</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error alert if any */}
      {errorMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '8px', color: '#991b1b', marginBottom: '20px', fontSize: '0.85rem' }}>
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '24px', borderBottom: '1px solid #e4e4e7' }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? '#09090b' : 'transparent',
                color: isActive ? '#ffffff' : '#71717a',
                fontSize: '0.84rem',
                fontWeight: isActive ? '700' : '500',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ABOUT ME & PERSONAL DETAILS */}
      {activeTab === 'about' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Identity Header Card */}
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserCheck size={18} />
              <span>Identity & Social Presence</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '20px' }}>
              Your basic name and handle that the AI introduces itself as.
            </p>

            <div className="responsive-form-grid" style={{ marginBottom: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                  Creator Full Name
                </label>
                <input
                  type="text"
                  value={formData.creatorName}
                  onChange={e => setFormData({ ...formData, creatorName: e.target.value })}
                  placeholder="e.g. Sam Joshua"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                  Instagram Handle
                </label>
                <input
                  type="text"
                  value={formData.instagramHandle}
                  onChange={e => setFormData({ ...formData, instagramHandle: e.target.value })}
                  placeholder="e.g. @catovidz"
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                Elevator Bio / One-Liner
              </label>
              <input
                type="text"
                value={formData.personaBio}
                onChange={e => setFormData({ ...formData, personaBio: e.target.value })}
                placeholder="I am Sam Joshua, creator of @catovidz. Video editor, coder, and creative director."
              />
            </div>
          </div>

          {/* Deep About Me Card */}
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BookOpen size={18} />
                <span>About Me & Life Background</span>
              </h3>
              <span style={{ fontSize: '0.72rem', background: '#f4f4f5', color: '#71717a', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                AI Brain Context
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '14px' }}>
              Describe everything the AI should know about your real life: where you live, what you study or work on, your hobbies, favorite video games, tech stack, what projects you are currently building, etc.
            </p>

            <textarea
              rows={6}
              value={formData.aboutMe}
              onChange={e => setFormData({ ...formData, aboutMe: e.target.value })}
              placeholder="e.g. I live in Tamil Nadu, India. Tech enthusiast and video editor. I love Premiere Pro, After Effects, and building web apps. I play Genshin Impact. Love tech gadgets, cameras, and creative visual effects. When friends talk with me, I share what I am currently working on..."
              style={{ lineHeight: '1.5', resize: 'vertical' }}
            />
          </div>

          {/* Custom Knowledge & FAQs Card */}
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={18} />
              <span>My Knowledge Base & Frequent Questions</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '14px' }}>
              List specific answers to questions people ask you frequently (collaborations, software, pricing, camera gear, tutorial plans).
            </p>

            <textarea
              rows={5}
              value={formData.customKnowledge}
              onChange={e => setFormData({ ...formData, customKnowledge: e.target.value })}
              placeholder="e.g.&#10;Account: @catovidz&#10;Editing Software: Premiere Pro & After Effects&#10;Collabs: Open for tech and creative edits. DM portfolio.&#10;Tutorials: Drop questions in DM, making a video soon."
              style={{ lineHeight: '1.5', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem' }}
            />
          </div>
        </div>
      )}

      {/* TAB 2: MY CHARACTERISTICS */}
      {activeTab === 'characteristics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Smile size={18} />
              <span>My Personality Traits & Characteristics</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '16px' }}>
              How do you come across to people? Are you witty, chill, humble, sarcastic, enthusiastic? Tell the AI how your inner vibe works.
            </p>

            {/* Quick Trait Chips */}
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                Quick Click to Add Trait:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  'Chill & Grounded',
                  'Witty & Playful',
                  'Supportive Friend',
                  'Gen-Z Energy',
                  'Humorous Sarcasm',
                  'Humble & Polite',
                  'Sweet with Girls',
                  'Bro Banter with Homies',
                  'Tech Geek',
                  'Creative Mind',
                  'Tanglish Banter'
                ].map(trait => (
                  <button
                    key={trait}
                    type="button"
                    onClick={() => addTraitChip(trait)}
                    style={{
                      background: '#f4f4f5',
                      border: '1px solid #e4e4e7',
                      color: '#09090b',
                      padding: '4px 10px',
                      borderRadius: '16px',
                      fontSize: '0.76rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    + {trait}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              rows={6}
              value={formData.characteristics}
              onChange={e => setFormData({ ...formData, characteristics: e.target.value })}
              placeholder="e.g. Chill, witty, humble, friendly, authentic. Never arrogant. Gentle and sweet with girl friends, humorous and teasing banter with boys/homies. Supportive and present when someone shares their problems or asks for advice."
              style={{ lineHeight: '1.5', resize: 'vertical' }}
            />
          </div>

          {/* Overall Tone Guidelines Card */}
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={18} />
              <span>Overall Tone Guidelines & Rules</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '14px' }}>
              Core numbered rules guiding the AI tone across all conversations.
            </p>

            <textarea
              rows={8}
              value={formData.toneGuidelines}
              onChange={e => setFormData({ ...formData, toneGuidelines: e.target.value })}
              placeholder="1. Talk like a real human on Instagram DM: casual, friendly, relatable, and authentic.&#10;2. NO FORMAL PUNCTUATION...&#10;3. USE NATURAL SHORTCUTS & SLANG..."
              style={{ lineHeight: '1.5', resize: 'vertical', fontSize: '0.84rem' }}
            />
          </div>
        </div>
      )}

      {/* TAB 3: HOW TO TEXT */}
      {activeTab === 'texting' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Texting Habits */}
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={18} />
              <span>How I Text (Texting Habits & Grammar Rules)</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '16px' }}>
              Specify your typing quirks: lowercase text, no ending periods, message length, shortcuts (rn, fr, tbh, idk, wbu), and slang usage.
            </p>

            {/* Quick Texting Habits Chips */}
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                Quick Click to Add Texting Rule:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  'Always casual lowercase',
                  'Never use ending periods (.)',
                  'Use shortcuts: rn, fr, tbh, idk, wbu, haha, yo, ngl',
                  '1 to 2 short lines max',
                  'Mirror the sender language',
                  'Tanglish for Tamil friends (dei, machan, enna da)',
                  'No robotic or formal sentences',
                  'Quick burst texting'
                ].map(rule => (
                  <button
                    key={rule}
                    type="button"
                    onClick={() => addTextingRuleChip(rule)}
                    style={{
                      background: '#f4f4f5',
                      border: '1px solid #e4e4e7',
                      color: '#09090b',
                      padding: '4px 10px',
                      borderRadius: '16px',
                      fontSize: '0.76rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    + {rule}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              rows={6}
              value={formData.textingHabits}
              onChange={e => setFormData({ ...formData, textingHabits: e.target.value })}
              placeholder="e.g. Always casual lowercase. Never use stiff ending periods (.). Use casual shortcuts and abbreviations naturally (u, rn, fr, tbh, idk, wbu, haha, lol, yo, ngl). Keep messages concise (1-2 short lines max) in quick human bursts. Match the sender energy and language (Tanglish for Tamil friends, English for others)."
              style={{ lineHeight: '1.5', resize: 'vertical' }}
            />
          </div>

          {/* Forbidden & Banned Words */}
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={18} style={{ color: '#dc2626' }} />
              <span>Forbidden & Banned Words / Phrases</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '16px' }}>
              Phrases the AI is strictly prohibited from ever typing (e.g. AI assistant cliches or words you never use).
            </p>

            {/* Input to add */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', maxWidth: '480px' }}>
              <input
                type="text"
                value={newForbiddenWord}
                onChange={e => setNewForbiddenWord(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddForbiddenWord(); } }}
                placeholder="Type word or phrase to ban (e.g. as an ai)..."
              />
              <button
                type="button"
                onClick={handleAddForbiddenWord}
                className="btn btn-primary"
                style={{ flexShrink: 0 }}
              >
                <Plus size={15} />
                <span>Add</span>
              </button>
            </div>

            {/* Word Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {formData.forbiddenWords.map((word, idx) => (
                <span
                  key={idx}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    padding: '5px 12px',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: '600'
                  }}
                >
                  <span>"{word}"</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveForbiddenWord(word)}
                    style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                    title="Remove banned phrase"
                  >
                    ×
                  </button>
                </span>
              ))}
              {formData.forbiddenWords.length === 0 && (
                <span style={{ fontSize: '0.82rem', color: '#a1a1aa' }}>No forbidden words added.</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: HOW TO REPLY */}
      {activeTab === 'replying' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} />
              <span>How I Reply (Reaction Rules & Behaviors)</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '16px' }}>
              Specify your rules for replying to different types of Instagram messages (reels, compliments, memes, questions, story replies).
            </p>

            <textarea
              rows={7}
              value={formData.replyRules}
              onChange={e => setFormData({ ...formData, replyRules: e.target.value })}
              placeholder="e.g.&#10;- When someone shares a Reel or Meme: React fast with emojis (😂, 💀, 🔥) or short reaction quips (dei semma, haha no way).&#10;- When someone sends a compliment: Be humble and hype them back.&#10;- When someone asks what I am doing: Tell them I am editing or working on projects.&#10;- When someone texts an emoji alone: React with a matching emoji or casual quip.&#10;- Never send multi-paragraph essays."
              style={{ lineHeight: '1.5', resize: 'vertical' }}
            />
          </div>

          {/* Typing Speed & Latency */}
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={18} />
              <span>Human Typing Delay & Pacing</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '16px' }}>
              Simulates realistic human typing delay with active Instagram "typing..." status before dispatching replies.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', maxWidth: '400px' }}>
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.5"
                value={formData.typingDelaySeconds}
                onChange={e => setFormData({ ...formData, typingDelaySeconds: parseFloat(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span style={{ fontWeight: '700', fontSize: '0.95rem', minWidth: '60px' }}>
                {formData.typingDelaySeconds}s
              </span>
            </div>
            <span style={{ fontSize: '0.76rem', color: '#71717a', marginTop: '8px', display: 'block' }}>
              {formData.typingDelaySeconds <= 1
                ? '⚡ Fast response (great for active testing)'
                : formData.typingDelaySeconds <= 2.5
                ? '✨ Natural human speed (recommended for Instagram)'
                : '⏳ Realistic thoughtful pacing'}
            </span>
          </div>
        </div>
      )}

      {/* TAB 5: FEW-SHOT CHAT EXAMPLES */}
      {activeTab === 'examples' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Code size={18} />
              <span>Real Chat Examples (Few-Shot Prompting)</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '20px' }}>
              These message pairs teach the AI exactly how you reply to real DM scenarios. The AI studies these examples to copy your speech rhythm.
            </p>

            {/* Existing Examples List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              {formData.sampleConversations.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#fafafa',
                    border: '1px solid #e4e4e7',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#71717a', textTransform: 'uppercase' }}>
                          Incoming User DM:
                        </span>
                      </div>
                      <p style={{ fontSize: '0.84rem', color: '#09090b', background: '#ffffff', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e4e4e7' }}>
                        "{item.userMessage}"
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveSampleConversation(idx)}
                      style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px', marginLeft: '12px' }}
                      title="Delete example"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#16a34a', textTransform: 'uppercase' }}>
                        How {formData.creatorName} Replies:
                      </span>
                    </div>
                    <p style={{ fontSize: '0.84rem', color: '#09090b', background: '#f0fdf4', padding: '6px 12px', borderRadius: '6px', border: '1px solid #bbf7d0', fontWeight: '500' }}>
                      "{item.myReply}"
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Add New Example Card */}
            <div style={{ background: '#ffffff', border: '1px dashed #d4d4d8', borderRadius: '8px', padding: '16px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#09090b', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                + Add New Chat Example
              </span>
              <div className="responsive-form-grid" style={{ marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#71717a', marginBottom: '4px' }}>
                    User's Message:
                  </label>
                  <input
                    type="text"
                    value={newSampleUser}
                    onChange={e => setNewSampleUser(e.target.value)}
                    placeholder="e.g. what video editor do you use?"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '600', color: '#71717a', marginBottom: '4px' }}>
                    Your Real Reply:
                  </label>
                  <input
                    type="text"
                    value={newSampleReply}
                    onChange={e => setNewSampleReply(e.target.value)}
                    placeholder="e.g. Premiere Pro & AE mostly! what are you editing on?"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddSampleConversation}
                className="btn btn-primary"
                style={{ fontSize: '0.8rem', padding: '7px 14px' }}
              >
                <Plus size={14} />
                <span>Add Example</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: LIVE TEST SIMULATOR */}
      {activeTab === 'simulator' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Send size={18} />
                <span>Test How AI Talks As You</span>
              </h3>
              <span style={{ fontSize: '0.74rem', background: '#f4f4f5', color: '#09090b', padding: '3px 8px', borderRadius: '4px', fontWeight: '700' }}>
                LIVE PREVIEW
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '18px' }}>
              Send any test DM below to verify how your AI clone texts back using your saved persona and reply rules.
            </p>

            {/* Chat Messages Window */}
            <div
              style={{
                background: '#fafafa',
                border: '1px solid #e4e4e7',
                borderRadius: '8px',
                padding: '16px',
                minHeight: '260px',
                maxHeight: '400px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                marginBottom: '16px'
              }}
            >
              {testMessages.map((msg, i) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isUser ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <span style={{ fontSize: '0.7rem', color: '#a1a1aa', marginBottom: '3px', padding: '0 4px' }}>
                      {isUser ? 'Friend / User' : `${formData.creatorName} (AI Clone)`}
                    </span>
                    <div
                      style={{
                        background: isUser ? '#09090b' : '#ffffff',
                        color: isUser ? '#ffffff' : '#09090b',
                        border: isUser ? 'none' : '1px solid #e4e4e7',
                        padding: '9px 14px',
                        borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                        fontSize: '0.85rem',
                        maxWidth: '80%',
                        wordBreak: 'break-word',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                      }}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })}

              {testSending && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#71717a', fontSize: '0.8rem', fontStyle: 'italic', padding: '4px' }}>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>{formData.creatorName} is typing...</span>
                </div>
              )}
            </div>

            {/* Input bar */}
            <form onSubmit={handleSendTestMessage} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={testInput}
                onChange={e => setTestInput(e.target.value)}
                placeholder="Type a test DM to your AI clone (e.g. what editing tools do u use?)..."
                disabled={testSending}
              />
              <button
                type="submit"
                disabled={testSending || !testInput.trim()}
                className="btn btn-primary"
                style={{ flexShrink: 0 }}
              >
                <Send size={15} />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
