'use client';

import React, { useCallback } from 'react';
import { MessageCircle, HelpCircle, Tag, CalendarCheck, UserCog, Trophy } from 'lucide-react';
import StoryboardCanvas from '../../components/StoryboardCanvas';
import SandboxChat from '../../components/SandboxChat';
import StoryboardHeader from '../StoryboardHeader';

const NODE_TYPES = [
  { key: 'entry', label: 'Entry', color: '#38bdf8', icon: MessageCircle, placeholder: 'Where customers come from: ad, story reply, comment' },
  { key: 'question', label: 'Question', color: '#a78bfa', icon: HelpCircle, placeholder: 'What the bot asks or what customers often ask' },
  { key: 'offer', label: 'Offer', color: '#f59e0b', icon: Tag, placeholder: 'Product, price or catalog link to share' },
  { key: 'booking', label: 'Booking', color: '#34d399', icon: CalendarCheck, placeholder: 'How appointments are offered and confirmed' },
  { key: 'handoff', label: 'Handoff', color: '#f87171', icon: UserCog, placeholder: 'When a person on your team takes over' },
  { key: 'won', label: 'Won', color: '#facc15', icon: Trophy, placeholder: 'What counts as a sale or booked customer' },
];

// Starter customer journey, left to right
const STEPS = [
  ['entry', 'New DM', 'Someone messages from an ad, story or post.'],
  ['question', 'Understand the need', 'Ask what they are looking for and their budget.'],
  ['offer', 'Share the offer', 'Send the matching product or service with price.'],
  ['booking', 'Book a slot', 'Offer open times and confirm the booking.'],
  ['won', 'Customer won', 'Booking confirmed or order placed.'],
];

/** Business Storyboard: customer journey flow (PLAN.md §13 Phase 4). */
export default function BusinessStoryboardPage() {
  const seed = useCallback(() => {
    const nodes = STEPS.map(([type, label, notes], i) => ({ id: `s${i}`, type, label, notes, contactId: '', x: 60 + i * 230, y: 200 + (i % 2) * 90 }));
    nodes.push({ id: 'h', type: 'handoff', label: 'Hand to a person', notes: 'Complaints, custom orders or anything the bot is unsure about.', contactId: '', x: 520, y: 470 });
    const edges = STEPS.slice(1).map((_, i) => ({ id: `e${i}`, from: `s${i}`, to: `s${i + 1}`, label: '' }));
    edges.push({ id: 'eh', from: 's1', to: 'h', label: 'unsure' });
    return { nodes, edges };
  }, []);

  return (
    <div className="page-container story-page">
      <StoryboardHeader
        active="business"
        code="// BUSINESS STORYBOARD"
        title="Customer journey"
        description="Lay out how a DM turns into a customer: entry, questions, offers, bookings and handoffs. Test it as a new customer on the right."
      />
      <div className="story-layout">
        <StoryboardCanvas kind="business" nodeTypes={NODE_TYPES} seed={seed} />
        <SandboxChat senderId="sandbox_customer" senderName="a new customer" placeholder="Hi, what are your prices?" />
      </div>
    </div>
  );
}
