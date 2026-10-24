'use client';

import React, { useCallback } from 'react';
import { Zap, GitBranch, BookOpen, Tag, CalendarCheck, UserCog, Trophy, Lock } from 'lucide-react';
import StoryboardCanvas from '../../components/StoryboardCanvas';
import SandboxChat from '../../components/SandboxChat';
import StoryboardHeader from '../StoryboardHeader';

// Card types from PLAN.md §13; boards saved with the old entry/question/booking keys still show
const NODE_TYPES = [
  { key: 'trigger', label: 'Trigger', color: '#38bdf8', icon: Zap, placeholder: 'Where customers come from: ad, story reply, comment, keyword' },
  { key: 'condition', label: 'Condition', color: '#a78bfa', icon: GitBranch, placeholder: 'What the bot checks or asks before moving on (budget, size, date)' },
  { key: 'knowledge', label: 'Knowledge', color: '#22d3ee', icon: BookOpen, placeholder: 'Facts the bot can use: hours, location, policies, FAQs' },
  { key: 'offer', label: 'Offer', color: '#f59e0b', icon: Tag, placeholder: 'Product, price or catalog link to share' },
  { key: 'action', label: 'Action', color: '#34d399', icon: CalendarCheck, placeholder: 'What the bot does: book a slot, take an order, send a link' },
  { key: 'handoff', label: 'Handoff', color: '#f87171', icon: UserCog, placeholder: 'When a person on your team takes over' },
  { key: 'won', label: 'Goal', color: '#facc15', icon: Trophy, placeholder: 'What counts as a sale or booked customer' },
  { key: 'secret', label: 'Off-limits', color: '#94a3b8', icon: Lock, placeholder: 'Topics the bot must never discuss (margins, suppliers, internal plans)' },
  { key: 'entry', label: 'Trigger', color: '#38bdf8', icon: Zap, hideAdd: true },
  { key: 'question', label: 'Condition', color: '#a78bfa', icon: GitBranch, hideAdd: true },
  { key: 'booking', label: 'Action', color: '#34d399', icon: CalendarCheck, hideAdd: true },
];

// Starter customer journey, left to right
const STEPS = [
  ['trigger', 'New DM', 'Someone messages from an ad, story or post.'],
  ['condition', 'Understand the need', 'Ask what they are looking for and their budget.'],
  ['offer', 'Share the offer', 'Send the matching product or service with price.'],
  ['action', 'Book a slot', 'Offer open times and confirm the booking.'],
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
