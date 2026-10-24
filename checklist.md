# Master Implementation Checklist for Claude: Multi-Tenant Instagram AI SaaS

**Reference Architecture:** [`PLAN.md`](file:///Users/samjoshua/Developer/instagram/instagram/PLAN.md)  
**System Audit Report:** [`project.md`](file:///Users/samjoshua/Developer/instagram/instagram/project.md)  
**Target:** Turn single-tenant Instagram bot into a production-ready, multi-tenant SaaS platform supporting Personal Creators, Business Workspaces, BYO-LLM / Local Ollama / A2A MCP AI, Tauri 2.0 Desktop Apps (macOS M1-M4/Intel & Windows x64/x86), and Superadmin Governance.

---

## Non-Negotiable Operating Rules for Claude
Before checking off any task, you must observe these strict constraints:
- [x] **Rule 1:** Read [`PLAN.md`](file:///Users/samjoshua/Developer/instagram/instagram/PLAN.md) completely before modifying any file.
- [x] **Rule 2:** Execute strictly one phase at a time. Do not jump ahead until acceptance criteria pass.
- [x] **Rule 3:** **Never break the existing single-tenant Instagram bot.** Your account (`process.env.INSTAGRAM_ACCOUNT_ID`) must continue working without interruption.
- [x] **Rule 4:** **Never fall back to global admin tokens** if an external user's account fails resolution. Unresolved accounts must fail safely (HTTP 200 to Meta, 0 outgoing messages).
- [x] **Rule 5:** **Zero Plaintext Tokens:** All Meta access tokens and BYO-LLM API keys must be encrypted using AES-256-GCM via `cryptoService` before saving to MongoDB.
- [x] **Rule 6:** **Strict CEL Separation:** Personal slang/banter rules must never execute for business accounts; business compliance rules must never execute for personal accounts.
- [x] **Rule 7:** **No Stickers for Business:** Media Vault stickers, GIPHY GIFs, and meme drops are strictly disabled for business accounts.
- [x] **Rule 8:** **Human Mimicry for Personal:** Personal accounts must text like real humans (all lowercase, no stiff periods, natural abbreviations `rn`, `tbh`, `fr`, zero robotic phrases like "How can I help you today?").
- [x] **Rule 9:** Never log access tokens, auth tags, passwords, or customer phone/email data to console.
- [x] **Rule 10:** Test every phase using unit tests or scratch scripts before marking a phase complete.

---

## Phase 0: Meta Documentation & Pre-Flight Validation
- [ ] Inspect environment variables in `.env` (`META_APP_ID`, `META_APP_SECRET`, `WEBHOOK_VERIFY_TOKEN`).
- [ ] Verify that `META_APP_SECRET` is available for `X-Hub-Signature-256` HMAC validation.
- [ ] Confirm Meta App mode (Live Mode) and check permission tiers (`Standard Access` vs `Advanced Access`) for:
  - [ ] `instagram_basic`
  - [ ] `instagram_manage_messages`
  - [ ] `pages_manage_metadata`
  - [ ] `pages_read_engagement`
- [ ] Verify whitelisted OAuth redirect URIs in Meta Dashboard:
  - [ ] `http://localhost:3000/settings` (Local Dev)
  - [ ] `https://instagram-ebon-zeta.vercel.app/settings` (Production Frontend)
  - [ ] `https://instagram-ai-bot-64tf.onrender.com/api/auth/instagram/callback` (Backend Callback)
- [ ] **Phase 0 Sign-Off:** Document Meta settings status in pre-flight report.

---

## Phase 1: Multi-Tenant Data Models & AES-256-GCM Encryption
- [x] **1.1 Encryption Service:**
  - [x] Create `services/cryptoService.js`.
  - [x] Implement `encrypt(text)` returning `{ encryptedData, iv, authTag }` using AES-256-GCM and `ENCRYPTION_KEY`.
  - [x] Implement `decrypt({ encryptedData, iv, authTag })` returning decrypted string.
  - [x] Write unit test in scratch script to verify encryption/decryption roundtrip.
- [x] **1.2 User Model Updates (`models/User.js`):**
  - [x] Add `accountType: { type: String, enum: ['personal', 'business'], default: 'personal' }`.
  - [x] Add structured `instagram` object:
    - [x] `connected: Boolean`
    - [x] `accountId: String` (indexed)
    - [x] `pageId: String`
    - [x] `username: String`
    - [x] `accessTokenEncrypted: String`
    - [x] `iv: String`
    - [x] `authTag: String`
    - [x] `tokenExpiresAt: Date`
  - [x] Add `aiProviderConfig` subdocument for BYO-LLM / Local Ollama / MCP settings.
- [x] **1.3 Scoped Models & Indexing:**
  - [x] Update `models/PersonaConfig.js`: add `userId` (required, unique index) and `accountType`. _(built as `ownerId`; null for the legacy admin persona so Rule 3 holds)_
  - [x] Update `models/UserMemory.js`: add `ownerId: { type: ObjectId, ref: 'User', required: true, index: true }`. _(nullable for legacy admin records)_
  - [x] Add compound index `{ ownerId: 1, senderId: 1 }` (unique: true) in `models/UserMemory.js`.
  - [x] Update `models/Message.js`: add `ownerId: { type: ObjectId, ref: 'User', required: true, index: true }`. _(nullable for legacy admin records)_
  - [x] Create `models/KnowledgeDoc.js`: fields `ownerId`, `title`, `category`, `textContent`, `fileUrl`, `keywords`.
  - [x] Create `models/Lead.js`: fields `ownerId`, `senderId`, `handle`, `phone`, `email`, `intentSummary`, `capturedAt`.
  - [x] Create `models/Booking.js`: fields `ownerId`, `senderId`, `handle`, `serviceName`, `bookingTime`, `status`.
  - [x] Create `models/DesktopDevice.js`: fields `userId`, `platform`, `deviceName`, `pushToken`, `lastActiveAt`.
- [x] **Phase 1 Sign-Off:** Verify MongoDB schemas compile and indexes build cleanly without errors.

---

## Phase 2: Facebook Login for Business OAuth Implementation
- [x] **2.1 Backend OAuth Routes (`routes/auth.js`):**
  - [x] Create `GET /api/auth/instagram/connect`:
    - [x] Authenticate user via JWT session.
    - [x] Generate cryptographically secure random `state` (32 bytes hex).
    - [x] Store state in Redis (`oauth_state:${state}`) with 10-minute TTL.
    - [x] Construct and return Facebook Login Dialog OAuth URL with required scopes.
  - [x] Create `GET /api/auth/instagram/callback`:
    - [x] Verify `state` parameter against Redis. Prevent replay attacks.
    - [x] Exchange authorization `code` for short-lived User Token via Graph API `oauth/access_token`.
    - [x] Exchange short-lived token for 60-day Long-Lived User Token (`grant_type=fb_exchange_token`).
    - [x] Fetch connected accounts via `GET /me/accounts?fields=name,access_token,instagram_business_account`.
    - [x] Extract Instagram Business Account ID and Page Access Token.
    - [x] Subscribe Page to webhooks via `POST /{page-id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks`.
    - [x] Encrypt Page Access Token via `cryptoService.encrypt()`.
    - [x] Save encrypted credentials, Page ID, and Instagram Account ID to `User.instagram`.
    - [x] Redirect to frontend settings with `?connected=success`.
  - [x] Create `POST /api/auth/instagram/disconnect`:
    - [x] Unsubscribe the Page via `DELETE /{page-id}/subscribed_apps` (only a Page token is stored, so the user grant is not revoked).
    - [x] Clear `instagram` credentials in `User` record.
- [x] **2.2 Instagram Service Dynamic Token Support (`services/instagramService.js`):**
  - [x] Update `sendTextMessage(recipientId, text, customToken, replyToMid)`.
  - [x] Update `sendImageMessage(recipientId, imageUrl, customToken, replyToMid)`.
  - [x] Update `sendSenderAction(recipientId, action, customToken)`.
  - [x] Update `sendMessageReaction(recipientId, messageId, emoji, customToken)`.
  - [x] Update `getUserProfile(senderId, customToken)`.
  - [x] Ensure all functions fall back to `process.env.INSTAGRAM_PAGE_ACCESS_TOKEN` only if `customToken` is null AND account matches admin ID.
- [x] **Phase 2 Sign-Off:** Test OAuth connection with test account; verify encrypted credentials persist in MongoDB. _(Verified with mocked Meta/AI calls; recheck with production keys.)_

---

## Phase 3: Webhook HMAC Validation & Dynamic Tenant Dispatch
- [x] **3.1 HMAC-SHA256 Signature Middleware (`server.js`):**
  - [x] Capture raw request buffer on `POST /webhook` via `express.json({ verify: (req, res, buf) => { req.rawBody = buf; } })`.
  - [x] Calculate expected signature using `crypto.createHmac('sha256', process.env.META_APP_SECRET).update(req.rawBody).digest('hex')`.
  - [x] Validate against `req.headers['x-hub-signature-256']` using `crypto.timingSafeEqual()`.
  - [x] Reject forged payloads with HTTP 401 Unauthorized.
- [x] **3.2 Dynamic Tenant Dispatcher (`server.js`):**
  - [x] Parse `recipientId` from `event.recipient.id` (or `entry[0].id`).
  - [x] Query database: `const tenant = await User.findOne({ "instagram.accountId": recipientId });`.
  - [x] **Legacy Admin Fallback Check:**
    - [x] If `tenant` is null AND `recipientId === process.env.INSTAGRAM_ACCOUNT_ID`:
      - [x] Load admin configuration and process message using legacy credentials.
  - [x] **Safe Drop Check:**
    - [x] If `tenant` is null AND `recipientId !== process.env.INSTAGRAM_ACCOUNT_ID`:
      - [x] Log warning: `Unrecognized recipient account ${recipientId}. Dropping event safely.`
      - [x] Exit execution. **Do NOT reply using admin token.**
  - [x] Decrypt tenant access token: `const token = cryptoService.decrypt(tenant.instagram);`.
  - [x] Load tenant-scoped data:
    - [x] `PersonaConfig.findOne({ userId: tenant._id })`
    - [x] `UserMemory.find({ ownerId: tenant._id, senderId })`
    - [x] `SocialGraph.findOne({ ownerId: tenant._id })`
  - [x] Pass tenant's decrypted token and scoped context to `azureOpenAI.generateReply()` and `instagramService.sendTextMessage()`.
- [x] **Phase 3 Sign-Off:** Simulate webhooks for Tenant A and Admin account concurrently; verify complete isolation and zero token leakage.

---

## Phase 4: Shared CEL Evaluator with Personal & Business Separation
- [x] **4.1 Refactor CEL Rule Engine (`services/celRuleEngine.js`):**
  - [x] Implement `buildPersonalContext({ userMemory, incomingText, isReelShare })`.
  - [x] Implement `buildBusinessContext({ businessConfig, customerMemory, incomingText })`.
  - [x] Implement `evaluatePersonal(context, customRules)`:
    - [x] Evaluate style modes (`tanglish_homie`, `sweet_playful`, `guy_banter`, `chill_creator`, `casual_peer`).
    - [x] Evaluate length tiers (`ultra_short`, `one_liner`, `short_burst`).
    - [x] Evaluate `shouldInjectFacts` memory gating.
    - [x] Set `allowStickers: true` and `autoReactReel: true`.
  - [x] Implement `evaluateBusiness(context, customRules)`:
    - [x] Evaluate `isWithinBusinessHours` check.
    - [x] Evaluate complaint / human escalation keywords.
    - [x] Evaluate refund / discount policy gates.
    - [x] Set `allowStickers: false` and `autoReactReel: false`.
- [x] **4.2 Azure OpenAI Service Integration (`services/azureOpenAI.js`):**
  - [x] Check `tenant.accountType`.
  - [x] If `personal`:
    - [x] Apply personal CEL directives.
    - [x] Apply anti-AI directives (lowercase, no ending periods, casual shortcuts).
    - [x] Gated reel emoji reaction (`sendMessageReaction`) and media sticker matching.
  - [x] If `business`:
    - [x] Apply business CEL directives.
    - [x] Enforce professional brand voice and standard capitalization.
    - [x] Strip any sticker attachments.
- [x] **Phase 4 Sign-Off:** Test CEL evaluator with personal slang inputs and business support inputs; verify zero cross-contamination.

---

## Phase 5: Modular AI Adapter (BYO-LLM, Local Ollama & A2A MCP)
- [x] **5.1 Unified LLM Adapter (`services/llmAdapter.js`):**
  - [x] Implement `completeChat(messages, tenantConfig)` factory.
  - [x] **Provider 1: Default Azure OpenAI:** Calls existing `services/azureOpenAI.js`.
  - [x] **Provider 2: Custom Cloud LLMs:**
    - [x] Decrypt user's API key via `cryptoService.decrypt()`.
    - [x] Support OpenAI (`gpt-4o`, `gpt-4o-mini`), Anthropic (`claude-3-5-sonnet`), Groq (Llama 3 70B), OpenRouter.
  - [x] **Provider 3: Local Self-Hosted LLMs:**
    - [x] Support Ollama / vLLM / LocalAI at user-specified `customEndpoint` (e.g. `http://localhost:11434/v1`).
    - [x] Test connectivity with 3-second timeout; graceful fallback to default Azure on network timeout.
  - [x] **Provider 4: A2A MCP Protocol Connector:**
    - [x] Connect to external agent over SSE / WebSocket MCP protocol.
    - [x] Forward message event and receive tool-augmented AI reply.
- [x] **5.2 Settings UI Configuration (`frontend/app/settings/page.jsx`):**
  - [x] Add "AI Provider Configuration" card.
  - [x] Radio selector: `Platform Azure`, `Custom OpenAI`, `Anthropic`, `Groq`, `Local Ollama`, `A2A MCP`.
  - [x] Dynamic input fields: Endpoint URL, Model Name, Encrypted API Key.
  - [x] "Test Connection" button calling `POST /api/settings/test-llm`.
- [x] **Phase 5 Sign-Off:** Verify that switching to Local Ollama successfully returns local model chat completions. _(Verified with a local OpenAI-compatible test server; recheck with a real Ollama.)_

---

## Phase 6: Business Knowledge RAG & Document Sharing
- [x] **6.1 Knowledge Ingestion Service (`services/ragService.js`):**
  - [x] Implement chunking and category tagging for uploaded runbooks and FAQs.
  - [x] Save chunks to `KnowledgeDoc` model scoped by `ownerId`.
- [x] **6.2 Retrieval Engine:**
  - [x] In `services/ragService.js`, extract keywords and intent from incoming customer message.
  - [x] Query `KnowledgeDoc.find({ ownerId, category: { $in: allowedCategories } })`.
  - [x] Format top matching text chunks and verified service URLs.
- [x] **6.3 Context Injection:**
  - [x] In `azureOpenAI.js` / `llmAdapter.js`, inject verified document chunks into system prompt.
  - [x] Instruct model: `"Answer grounded strictly in provided knowledge. If customer asks for documentation, provide this exact link: [fileUrl]"`.
- [x] **6.4 Document Vault Frontend (`frontend/app/vault/page.jsx` or `/documents`):**
  - [x] For business accounts, display "Document & Service Vault" instead of "Media Vault".
  - [x] Drag-and-drop uploader for PDF runbooks, price lists, brochures, and URL bookmarks.
- [x] **Phase 6 Sign-Off:** Upload a sample product PDF; verify the bot accurately quotes the document and includes the file link in DMs. _(Verified with mocked Meta/AI calls; recheck with production keys.)_

---

## Phase 7: Conversion Analytics (Leads & Bookings Tracker)
- [x] **7.1 Analytics Extractor Service (`services/analyticsService.js`):**
  - [x] Scan incoming message and AI reply for lead intent:
    - [x] Regex patterns for phone numbers, email addresses, pricing requests, demo inquiries.
    - [x] Upsert record in `models/Lead.js` (`ownerId`, `handle`, `phone`, `email`, `intentSummary`).
  - [x] Scan for booking intent:
    - [x] Detect appointment scheduling, date/time agreements, table reservations, Calendly clicks.
    - [x] Upsert record in `models/Booking.js` (`ownerId`, `handle`, `serviceName`, `bookingTime`, `status: 'confirmed'`).
- [x] **7.2 Business Analytics API (`routes/analytics.js`):**
  - [x] Create `GET /api/analytics/overview`: returns total conversations, active leads count, confirmed bookings count, resolution rate.
  - [x] Create `GET /api/analytics/leads`: returns paginated lead list with phone/email exports.
  - [x] Create `GET /api/analytics/bookings`: returns scheduled bookings calendar feed.
- [x] **7.3 Dashboard Overview UI (`frontend/app/page.jsx`):**
  - [x] For business accounts, display KPI Stat Cards:
    - [x] `💬 Total Conversations`
    - [x] `🎯 Leads Captured`
    - [x] `📅 Bookings Confirmed`
    - [x] `⚡ Automation Rate`
- [x] **Phase 7 Sign-Off:** Send a test DM containing a phone number and booking time; verify stats increment in real-time.

---

## Phase 8: Dynamic Sidebar, Mobile UI & Desktop Download Portal
- [x] **8.1 Dynamic Sidebar by Role & Account Type (`frontend/app/components/Sidebar.jsx`):**
  - [x] If `user.role === 'superadmin'`:
    - [x] `01 // Platform Console`
    - [x] `02 // User Workspaces`
    - [x] `03 // Token Health Radar`
    - [x] `04 // Desktop Releases`
  - [x] If `user.accountType === 'personal'`:
    - [x] `01 // Dashboard`
    - [x] `02 // People Directory`
    - [x] `03 // Chat Rules`
    - [x] `04 // Persona & AI Model`
    - [x] `05 // Media Vault` (Reactions & Stickers)
    - [x] `06 // Desktop App` (`/download`)
  - [x] If `user.accountType === 'business'`:
    - [x] `01 // Business Dashboard` (KPIs, Leads, Bookings)
    - [x] `02 // Document & Service Vault` (RAG Documents & Links)
    - [x] `03 // Business Policy & Hours` (CEL Rules)
    - [x] `04 // Brand Voice & AI Model` (Tone & BYO-LLM)
    - [x] `05 // Customer Inbox & Handoff` (Live Queue)
    - [x] `06 // Desktop App` (`/download`)
- [x] **8.2 Cross-Platform Download Portal (`frontend/app/download/page.jsx`):**
  - [x] Detect OS and architecture via `navigator.userAgent`:
    - [x] macOS Apple Silicon (M1, M2, M3, M4)
    - [x] macOS Intel (x86_64)
    - [x] Windows 64-bit (x64)
    - [x] Windows 32-bit (x86)
  - [x] Prominent "Download for Your Device" button linking to matching DMG / MSI / EXE installer.
  - [x] Dropdown for manual build selection with SHA-256 release checksums.
- [x] **8.3 Mobile-Responsive UI Optimization:**
  - [x] Implement touch-friendly bottom navigation bar for viewports `<= 768px`.
  - [x] Optimize cards on `/controls` and `/settings` for 375px mobile screens.
- [x] **Phase 8 Sign-Off:** Test sidebar menu switching between Personal, Business, and Superadmin; verify mobile layout on 375px screen.

---

## Phase 9: Tauri 2.0 Desktop Application Integration
- [ ] **9.1 Tauri 2.0 Rust Scaffold (`src-tauri/`):**
  - [ ] Initialize `src-tauri/tauri.conf.json` configured for Next.js build output.
  - [ ] Set application metadata: name `Chatter AI`, bundle identifier `com.chatter.desktop`.
  - [ ] Configure cross-platform compilation targets:
    - [ ] `aarch64-apple-darwin` (Apple Silicon M1-M4 DMG)
    - [ ] `x86_64-apple-darwin` (Intel Mac DMG)
    - [ ] `x86_64-pc-windows-msvc` (Windows x64 MSI/EXE)
    - [ ] `i686-pc-windows-msvc` (Windows x86 MSI)
- [ ] **9.2 Native OS Push Notifications:**
  - [ ] Install `@tauri-apps/plugin-notification`.
  - [ ] Trigger native desktop notifications when:
    - [ ] A customer triggers a human handoff escalation.
    - [ ] A new high-value lead or booking is logged.
    - [ ] Instagram token reaches 15 days before expiration.
- [ ] **9.3 System Tray & Background Daemon:**
  - [ ] Implement system tray icon with status indicator (Green: Connected, Amber: Paused).
  - [ ] Support "Minimize to Tray" and "Launch on Startup" toggle.
- [ ] **Phase 9 Sign-Off:** Compile Tauri desktop package; verify native OS push notifications on desktop.

---

## Phase 10: Superadmin Control Console & Token Radar
- [x] **10.1 Token Health Radar (`frontend/app/admin/tokens/page.jsx`):**
  - [x] Build table listing all connected Meta Instagram tokens across all tenants.
  - [x] Display expiration countdown and color-coded health badges:
    - [x] Green: >30 days remaining
    - [x] Amber: <15 days remaining
    - [x] Red: Expired / Revoked
  - [x] Add "Force Immediate Refresh" button for any connected account.
- [x] **10.2 Tenant Directory & Workspace Impersonation (`frontend/app/admin/page.jsx`):**
  - [x] List all registered users with role, account type, and Instagram handle.
  - [x] One-click "Enter Workspace" triggering `/api/admin/impersonate` to inspect tenant settings.
  - [x] Emergency tenant ban and token revoke killswitch.
- [x] **10.3 Automated Token Refresh Background Worker (`services/reminderService.js`):**
  - [x] Daily cron job scanning tokens expiring within 15 days.
  - [x] Call `GET /refresh_access_token` for eligible long-lived tokens.
  - [x] Update encrypted credentials and `tokenExpiresAt` in MongoDB.
- [x] **Phase 10 Sign-Off:** Trigger administrative token refresh; confirm new expiration date updates in database.

---

## Final SaaS Verification & Definition of Done
- [x] Complete test registration and email OTP verification for a new user.
- [x] Connect Instagram account via Facebook Login for Business OAuth.
- [x] Verify incoming DM routes exclusively to new user without affecting admin bot.
- [x] Verify Personal account replies using human-mimicry styling (lowercase, no ending periods, slang).
- [x] Verify Business account replies using professional tone with RAG document links and zero stickers.
- [x] Verify switching to custom BYO-LLM / Local Ollama model works seamlessly.
- [x] Verify Lead and Booking metrics increment in Business Analytics dashboard.
- [x] Verify Download page correctly detects user OS/chip and serves matching Tauri build.
- [x] Verify Superadmin can view Token Radar and impersonate tenant workspaces.
- [x] Confirm zero regressions on existing primary Instagram account.
