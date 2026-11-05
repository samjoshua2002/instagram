'use client';

import React from 'react';
import { Zap, GitBranch, BookOpen, Tag, CalendarCheck, UserCog, Trophy, Lock } from 'lucide-react';
import StoryboardCanvas from '../../components/StoryboardCanvas';
import SandboxChat from '../../components/SandboxChat';
import StoryboardHeader from '../StoryboardHeader';
import { BUSINESS_TEMPLATES } from '../templates';

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

/** Business Storyboard: customer journey flow (PLAN.md §13 Phase 4). */
export default function BusinessStoryboardPage() {
  return (
    <div className="page-container story-page spx-page">
      <StoryboardHeader
        active="business"
        code="// BUSINESS STORYBOARD"
        title="Customer journey"
        description="Lay out how a DM turns into a customer: entry, questions, offers, bookings and handoffs. Test it as a new customer on the right."
      />
      <div className="story-layout">
        <StoryboardCanvas kind="business" nodeTypes={NODE_TYPES} templates={BUSINESS_TEMPLATES} />
        <SandboxChat senderId="sandbox_customer" senderName="a new customer" placeholder="Hi, what are your prices?" />
      </div>
    </div>
  );
}
