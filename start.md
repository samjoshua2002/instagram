# Developer Kickoff Guide: Multi-Tenant Instagram AI SaaS

Welcome to the project. This guide is your single entry point for understanding the codebase and beginning implementation.

---

## 1. Documentation Index

Before writing any code, review these core architectural documents:

1. [`project.md`](file:///Users/samjoshua/Developer/instagram/instagram/project.md) — **Current System Audit**
   - Detailed inspection of the live application.
   - Explains the existing single-tenant architecture, data models, Azure OpenAI setup, and Meta webhook routing.
   - Documents what is implemented today and what works in production.

2. [`PLAN.md`](file:///Users/samjoshua/Developer/instagram/instagram/PLAN.md) — **Target Architecture & Multi-Tenant Blueprint**
   - The end-state vision for transforming the bot into a multi-tenant SaaS.
   - Details Facebook Login for Business OAuth, dynamic webhook routing, and dual CEL rule engines.
   - Covers Personal human-mimicry vs. Business RAG document sharing, BYO-LLM/Local Ollama/MCP support, conversion analytics, and the Tauri 2.0 desktop roadmap.

3. [`checklist.md`](file:///Users/samjoshua/Developer/instagram/instagram/checklist.md) — **Execution Tracking & Acceptance Criteria**
   - Phased, task-by-task checklist (Phase 0 through Phase 10).
   - Contains explicit non-negotiable operating rules, security guardrails, and verification sign-offs.

---

## 2. Core Operating Principles

When implementing features, adhere strictly to these rules:

- **Zero Regression:** The current working account (`process.env.INSTAGRAM_ACCOUNT_ID`) must never be broken. Keep the existing single-tenant integration as an active fallback.
- **Fail Safe on Foreign Accounts:** If an incoming webhook event arrives for an unrecognized account, drop it safely. **Never fall back to global admin credentials** to reply to another user's DMs.
- **Encryption at Rest:** All Meta Page Access Tokens and custom AI API keys must be encrypted using AES-256-GCM before saving to MongoDB.
- **Strict Role Separation:**
  - *Personal Accounts:* Human-mimicry prompts (lowercase, no ending periods, natural slang), optional reel emoji reactions, and Media Vault sticker drops.
  - *Business Accounts:* Professional brand tone, grounded RAG document links, lead/booking tracking, and **strictly zero stickers**.
- **Phase-by-Phase Execution:** Work on one phase at a time. Do not begin Phase N+1 until Phase N passes its acceptance criteria.

---

## 3. Quick Start: How to Begin

### Step 1: Pre-Flight Verification (Phase 0)
1. Open [`checklist.md`](file:///Users/samjoshua/Developer/instagram/instagram/checklist.md) and review **Phase 0**.
2. Inspect `.env` to verify `META_APP_ID`, `META_APP_SECRET`, and `WEBHOOK_VERIFY_TOKEN`.
3. In the Meta App Dashboard, verify permission tiers (`Standard Access` vs. `Advanced Access`) and OAuth redirect URIs.
4. Check off the Phase 0 items in `checklist.md`.

### Step 2: Foundation & Data Isolation (Phase 1)
1. Create `services/cryptoService.js` with AES-256-GCM encryption/decryption.
2. Update Mongoose models ([User.js](file:///Users/samjoshua/Developer/instagram/instagram/models/User.js), [PersonaConfig.js](file:///Users/samjoshua/Developer/instagram/instagram/models/PersonaConfig.js), [UserMemory.js](file:///Users/samjoshua/Developer/instagram/instagram/models/UserMemory.js), [Message.js](file:///Users/samjoshua/Developer/instagram/instagram/models/Message.js)) with `ownerId` and compound indexes.
3. Add new models: `KnowledgeDoc.js`, `Lead.js`, `Booking.js`, `DesktopDevice.js`.
4. Run validation tests and check off Phase 1 in `checklist.md`.

### Step 3: OAuth & Dynamic Routing (Phases 2 & 3)
1. Implement Facebook Login for Business OAuth endpoints in [routes/auth.js](file:///Users/samjoshua/Developer/instagram/instagram/routes/auth.js).
2. Update [services/instagramService.js](file:///Users/samjoshua/Developer/instagram/instagram/services/instagramService.js) to accept dynamic per-user access tokens.
3. Add `X-Hub-Signature-256` HMAC validation and dynamic tenant dispatch in [server.js](file:///Users/samjoshua/Developer/instagram/instagram/server.js).

### Subsequent Phases
Proceed through the remaining phases as outlined in [`checklist.md`](file:///Users/samjoshua/Developer/instagram/instagram/checklist.md):
- **Phase 4:** Dual CEL Evaluator (Personal vs. Business)
- **Phase 5:** Modular AI Adapter Factory (Azure, BYO-LLM, Local Ollama, MCP)
- **Phase 6:** Business RAG Engine & Document Sharing
- **Phase 7:** Conversion Analytics (Leads & Bookings Tracker)
- **Phase 8:** Dynamic Sidebar, Mobile-Responsive UI & Download Portal
- **Phase 9:** Tauri 2.0 Native Desktop Client
- **Phase 10:** Superadmin Console & Token Health Radar

---

## 4. Environment & Repository Map

```
instagram/
├── start.md               <-- You are here (Developer Kickoff Guide)
├── checklist.md           <-- Master implementation checklist & progress tracker
├── PLAN.md                <-- Target multi-tenant architecture & specifications
├── project.md             <-- Current system audit & baseline findings
├── server.js              <-- Main Express backend & webhook handler
├── routes/auth.js         <-- Auth, session management, and OAuth routes
├── models/                <-- Mongoose data models
├── services/              <-- Core services (AI, CEL, Instagram Graph API, Redis)
└── frontend/              <-- Next.js 14 App Router dashboard
```

Begin with **Phase 0** in [`checklist.md`](file:///Users/samjoshua/Developer/instagram/instagram/checklist.md).
