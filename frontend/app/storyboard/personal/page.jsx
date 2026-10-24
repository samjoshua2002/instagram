'use client';

import React, { useCallback, useState } from 'react';
import { User, Heart, BookOpen, MapPin, CalendarDays } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import StoryboardCanvas from '../../components/StoryboardCanvas';
import SandboxChat from '../../components/SandboxChat';
import StoryboardHeader from '../StoryboardHeader';

const NODE_TYPES = [
  { key: 'you', label: 'You', color: '#a78bfa', icon: User, hideAdd: true, placeholder: 'How you talk, what you are into' },
  { key: 'person', label: 'Person', color: '#38bdf8', icon: Heart, placeholder: 'Inside jokes, how you know them, how you talk to them' },
  { key: 'lore', label: 'Lore', color: '#f59e0b', icon: BookOpen, placeholder: 'A fact or story about you the AI can bring up' },
  { key: 'place', label: 'Place', color: '#34d399', icon: MapPin, placeholder: 'Where it is and why it matters' },
  { key: 'event', label: 'Event', color: '#f472b6', icon: CalendarDays, placeholder: 'What happened and when' },
];

/** Personal Storyboard: relationship map + character lore (PLAN.md §13 Phase 4). */
export default function PersonalStoryboardPage() {
  const { nodes: contacts, user } = useApp();
  const [chatWith, setChatWith] = useState(null);
  const people = contacts.filter(c => !c.isRoot);

  // Starter layout: you in the middle, up to 8 contacts around you, their links to each other
  const seed = useCallback(() => {
    const cx = 640, cy = 380, r = 260;
    const picked = people.slice(0, 8);
    const you = { id: 'you', type: 'you', label: user?.firstName || 'You', notes: '', contactId: '', x: cx, y: cy };
    const ring = picked.map((p, i) => {
      const a = (i / Math.max(picked.length, 1)) * Math.PI * 2 - Math.PI / 2;
      return { id: `c-${p.id}`, type: 'person', label: p.name, notes: p.relationship || '', contactId: String(p.id), x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * 0.75 * Math.sin(a)) };
    });
    const byName = Object.fromEntries(picked.map(p => [(p.name || '').toLowerCase(), `c-${p.id}`]));
    const edges = ring.map(n => ({ id: `e-you-${n.id}`, from: 'you', to: n.id, label: picked.find(p => `c-${p.id}` === n.id)?.relationship || '' }));
    picked.forEach(p => (p.connections || []).forEach(c => {
      const to = byName[(c.targetName || '').toLowerCase()];
      const from = `c-${p.id}`;
      if (to && to !== from && !edges.some(e => (e.from === to && e.to === from))) {
        edges.push({ id: `e-${from}-${to}`, from, to, label: c.relationship || '' });
      }
    }));
    return { nodes: [you, ...ring], edges };
  }, [people.length, user?.firstName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lets you drop any saved contact onto the board
  const addContact = (addNode, board) => {
    const onBoard = new Set(board.nodes.map(n => n.contactId).filter(Boolean));
    const free = people.filter(p => !onBoard.has(String(p.id)));
    if (!free.length) return null;
    return (
      <select
        className="story-chip"
        value=""
        aria-label="Add a contact"
        onChange={e => {
          const p = free.find(x => String(x.id) === e.target.value);
          if (p) addNode('person', { label: p.name, notes: p.relationship || '', contactId: String(p.id) });
        }}
      >
        <option value="">+ From contacts…</option>
        {free.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    );
  };

  const contact = chatWith?.contactId ? people.find(p => String(p.id) === chatWith.contactId) : null;

  return (
    <div className="page-container story-page">
      <StoryboardHeader
        active="personal"
        code="// PERSONAL STORYBOARD"
        title="Your world, mapped"
        description="Drag people, lore, places and events around, link them, and add notes. Click a person to test how the bot talks to them."
      />
      <div className="story-layout">
        <StoryboardCanvas kind="personal" nodeTypes={NODE_TYPES} seed={seed} onSelect={setChatWith} extraAdd={addContact} />
        <SandboxChat
          senderId={contact?.senderId || `sandbox_${contact?.id || 'friend'}`}
          senderName={contact?.name || 'a new friend'}
        />
      </div>
    </div>
  );
}
