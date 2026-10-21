# Master Implementation Checklist for Claude: Multi-Tenant Instagram AI SaaS

**Reference Architecture:** [`PLAN.md`](file:///Users/samjoshua/Developer/instagram/instagram/PLAN.md)  
**System Audit Report:** [`project.md`](file:///Users/samjoshua/Developer/instagram/instagram/project.md)  
**Target:** Turn single-tenant Instagram bot into a production-ready, multi-tenant SaaS platform supporting Personal Creators, Business Workspaces, BYO-LLM / Local Ollama / A2A MCP AI, Tauri 2.0 Desktop Apps (macOS M1-M4/Intel & Windows x64/x86), and Superadmin Governance.

---

## Non-Negotiable Operating Rules for Claude
Before checking off any task, you must observe these strict constraints:
- [ ] **Rule 1:** Read [`PLAN.md`](file:///Users/samjoshua/Developer/instagram/instagram/PLAN.md) completely before modifying any file.
- [ ] **Rule 2:** Execute strictly one phase at a time. Do not jump ahead until acceptance criteria pass.
- [ ] **Rule 3:** **Never break the existing single-tenant Instagram bot.** Your account (`process.env.INSTAGRAM_ACCOUNT_ID`) must continue working without interruption.
- [ ] **Rule 4:** **Never fall back to global admin tokens** if an external user's account fails resolution. Unresolved accounts must fail safely (HTTP 200 to Meta, 0 outgoing messages).
- [ ] **Rule 5:** **Zero Plaintext Tokens:** All Meta access tokens and BYO-LLM API keys must be encrypted using AES-256-GCM via `cryptoService` before saving to MongoDB.
- [ ] **Rule 6:** **Strict CEL Separation:** Personal slang/banter rules must never execute for business accounts; business compliance rules must never execute for personal accounts.
- [ ] **Rule 7:** **No Stickers for Business:** Media Vault stickers, GIPHY GIFs, and meme drops are strictly disabled for business accounts.
- [ ] **Rule 8:** **Human Mimicry for Personal:** Personal accounts must text like real humans (all lowercase, no stiff periods, natural abbreviations `rn`, `tbh`, `fr`, zero robotic phrases like "How can I help you today?").
- [ ] **Rule 9:** Never log access tokens, auth tags, passwords, or customer phone/email data to console.
- [ ] **Rule 10:** Test every phase using unit tests or scratch scripts before marking a phase complete.

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
- [ ] **1.1 Encryption Service:**
  - [ ] Create `services/cryptoService.js`.
  - [ ] Implement `encrypt(text)` returning `{ encryptedData, iv, authTag }` using AES-256-GCM and `ENCRYPTION_KEY`.
  - [ ] Implement `decrypt({ encryptedData, iv, authTag })` returning decrypted string.
  - [ ] Write unit test in scratch script to verify encryption/decryption roundtrip.
- [ ] **1.2 User Model Updates (`models/User.js`):**
  - [ ] Add `accountType: { type: String, enum: ['personal', 'business'], default: 'personal' }`.
  - [ ] Add structured `instagram` object:
    - [ ] `connected: Boolean`
    - [ ] `accountId: String` (indexed)
    - [ ] `pageId: String`
    - [ ] `username: String`
    - [ ] `accessTokenEncrypted: String`
    - [ ] `iv: String`
    - [ ] `authTag: String`
    - [ ] `tokenExpiresAt: Date`
  - [ ] Add `aiProviderConfig` subdocument for BYO-LLM / Local Ollama / MCP settings.
- [ ] **1.3 Scoped Models & Indexing:**
  - [ ] Update `models/PersonaConfig.js`: add `userId` (required, unique index) and `accountType`.
  - [ ] Update `models/UserMemory.js`: add `ownerId: { type: ObjectId, ref: 'User', required: true, index: true }`.
  - [ ] Add compound index `{ ownerId: 1, senderId: 1 }` (unique: true) in `models/UserMemory.js`.
  - [ ] Update `models/Message.js`: add `ownerId: { type: ObjectId, ref: 'User', required: true, index: true }`.
  - [ ] Create `models/KnowledgeDoc.js`: fields `ownerId`, `title`, `category`, `textContent`, `fileUrl`, `keywords`.
  - [ ] Create `models/Lead.js`: fields `ownerId`, `senderId`, `handle`, `phone`, `email`, `intentSummary`, `capturedAt`.
  - [ ] Create `models/Booking.js`: fields `ownerId`, `senderId`, `handle`, `serviceName`, `bookingTime`, `status`.
  - [ ] Create `models/DesktopDevice.js`: fields `userId`, `platform`, `deviceName`, `pushToken`, `lastActiveAt`.
- [ ] **Phase 1 Sign-Off:** Verify MongoDB schemas compile and indexes build cleanly without errors.

---

## Phase 2: Facebook Login for Business OAuth Implementation
- [ ] **2.1 Backend OAuth Routes (`routes/auth.js`):**
  - [ ] Create `GET /api/auth/instagram/connect`:
    - [ ] Authenticate user via JWT session.
    - [ ] Generate cryptographically secure random `state` (32 bytes hex).
    - [ ] Store state in Redis (`oauth_state:${state}`) with 10-minute TTL.
    - [ ] Construct and return Facebook Login Dialog OAuth URL with required scopes.
  - [ ] Create `GET /api/auth/instagram/callback`:
    - [ ] Verify `state` parameter against Redis. Prevent replay attacks.
    - [ ] Exchange authorization `code` for short-lived User Token via Graph API `oauth/access_token`.
    - [ ] Exchange short-lived token for 60-day Long-Lived User Token (`grant_type=fb_exchange_token`).
    - [ ] Fetch connected accounts via `GET /me/accounts?fields=name,access_token,instagram_business_account`.
    - [ ] Extract Instagram Business Account ID and Page Access Token.
    - [ ] Subscribe Page to webhooks via `POST /{page-id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks`.
    - [ ] Encrypt Page Access Token via `cryptoService.encrypt()`.
    - [ ] Save encrypted credentials, Page ID, and Instagram Account ID to `User.instagram`.
    - [ ] Redirect to frontend settings with `?connected=success`.
  - [ ] Create `POST /api/auth/instagram/disconnect`:
    - [ ] Revoke token if required via Graph API `DELETE /{user-id}/permissions`.
    - [ ] Clear `instagram` credentials in `User` record.
- [ ] **2.2 Instagram Service Dynamic Token Support (`services/instagramService.js`):**
  - [ ] Update `sendTextMessage(recipientId, text, customToken, replyToMid)`.
  - [ ] Update `sendImageMessage(recipientId, imageUrl, customToken, replyToMid)`.
  - [ ] Update `sendSenderAction(recipientId, action, customToken)`.
  - [ ] Update `sendMessageReaction(recipientId, messageId, emoji, customToken)`.
  - [ ] Update `getUserProfile(senderId, customToken)`.
  - [ ] Ensure all functions fall back to `process.env.INSTAGRAM_PAGE_ACCESS_TOKEN` only if `customToken` is null AND account matches admin ID.
- [ ] **Phase 2 Sign-Off:** Test OAuth connection with test account; verify encrypted credentials persist in MongoDB.

---

## Phase 3: Webhook HMAC Validation & Dynamic Tenant Dispatch
- [ ] **3.1 HMAC-SHA256 Signature Middleware (`server.js`):**
  - [ ] Capture raw request buffer on `POST /webhook` via `express.json({ verify: (req, res, buf) => { req.rawBody = buf; } })`.
  - [ ] Calculate expected signature using `crypto.createHmac('sha256', process.env.META_APP_SECRET).update(req.rawBody).digest('hex')`.
  - [ ] Validate against `req.headers['x-hub-signature-256']` using `crypto.timingSafeEqual()`.
  - [ ] Reject forged payloads with HTTP 401 Unauthorized.
- [ ] **3.2 Dynamic Tenant Dispatcher (`server.js`):**
  - [ ] Parse `recipientId` from `event.recipient.id` (or `entry[0].id`).
  - [ ] Query database: `const tenant = await User.findOne({ "instagram.accountId": recipientId });`.
  - [ ] **Legacy Admin Fallback Check:**
    - [ ] If `tenant` is null AND `recipientId === process.env.INSTAGRAM_ACCOUNT_ID`:
      - [ ] Load admin configuration and process message using legacy credentials.
  - [ ] **Safe Drop Check:**
    - [ ] If `tenant` is null AND `recipientId !== process.env.INSTAGRAM_ACCOUNT_ID`:
      - [ ] Log warning: `Unrecognized recipient account ${recipientId}. Dropping event safely.`
      - [ ] Exit execution. **Do NOT reply using admin token.**
  - [ ] Decrypt tenant access token: `const token = cryptoService.decrypt(tenant.instagram);`.
  - [ ] Load tenant-scoped data:
    - [ ] `PersonaConfig.findOne({ userId: tenant._id })`
    - [ ] `UserMemory.find({ ownerId: tenant._id, senderId })`
    - [ ] `SocialGraph.findOne({ ownerId: tenant._id })`
  - [ ] Pass tenant's decrypted token and scoped context to `azureOpenAI.generateReply()` and `instagramService.sendTextMessage()`.
- [ ] **Phase 3 Sign-Off:** Simulate webhooks for Tenant A and Admin account concurrently; verify complete isolation and zero token leakage.

---

## Phase 4: Shared CEL Evaluator with Personal & Business Separation
- [ ] **4.1 Refactor CEL Rule Engine (`services/celRuleEngine.js`):**
  - [ ] Implement `buildPersonalContext({ userMemory, incomingText, isReelShare })`.
  - [ ] Implement `buildBusinessContext({ businessConfig, customerMemory, incomingText })`.
  - [ ] Implement `evaluatePersonal(context, customRules)`:
    - [ ] Evaluate style modes (`tanglish_homie`, `sweet_playful`, `guy_banter`, `chill_creator`, `casual_peer`).
    - [ ] Evaluate length tiers (`ultra_short`, `one_liner`, `short_burst`).
    - [ ] Evaluate `shouldInjectFacts` memory gating.
    - [ ] Set `allowStickers: true` and `autoReactReel: true`.
  - [ ] Implement `evaluateBusiness(context, customRules)`:
    - [ ] Evaluate `isWithinBusinessHours` check.
    - [ ] Evaluate complaint / human escalation keywords.
    - [ ] Evaluate refund / discount policy gates.
    - [ ] Set `allowStickers: false` and `autoReactReel: false`.
- [ ] **4.2 Azure OpenAI Service Integration (`services/azureOpenAI.js`):**
  - [ ] Check `tenant.accountType`.
  - [ ] If `personal`:
    - [ ] Apply personal CEL directives.
    - [ ] Apply anti-AI directives (lowercase, no ending periods, casual shortcuts).
    - [ ] Gated reel emoji reaction (`sendMessageReaction`) and media sticker matching.
  - [ ] If `business`:
    - [ ] Apply business CEL directives.
    - [ ] Enforce professional brand voice and standard capitalization.
    - [ ] Strip any sticker attachments.
- [ ] **Phase 4 Sign-Off:** Test CEL evaluator with personal slang inputs and business support inputs; verify zero cross-contamination.

---

## Phase 5: Modular AI Adapter (BYO-LLM, Local Ollama & A2A MCP)
- [ ] **5.1 Unified LLM Adapter (`services/llmAdapter.js`):**
  - [ ] Implement `completeChat(messages, tenantConfig)` factory.
  - [ ] **Provider 1: Default Azure OpenAI:** Calls existing `services/azureOpenAI.js`.
  - [ ] **Provider 2: Custom Cloud LLMs:**
    - [ ] Decrypt user's API key via `cryptoService.decrypt()`.
    - [ ] Support OpenAI (`gpt-4o`, `gpt-4o-mini`), Anthropic (`claude-3-5-sonnet`), Groq (Llama 3 70B), OpenRouter.
  - [ ] **Provider 3: Local Self-Hosted LLMs:**
    - [ ] Support Ollama / vLLM / LocalAI at user-specified `customEndpoint` (e.g. `http://localhost:11434/v1`).
    - [ ] Test connectivity with 3-second timeout; graceful fallback to default Azure on network timeout.
  - [ ] **Provider 4: A2A MCP Protocol Connector:**
    - [ ] Connect to external agent over SSE / WebSocket MCP protocol.
    - [ ] Forward message event and receive tool-augmented AI reply.
- [ ] **5.2 Settings UI Configuration (`frontend/app/settings/page.jsx`):**
  - [ ] Add "AI Provider Configuration" card.
  - [ ] Radio selector: `Platform Azure`, `Custom OpenAI`, `Anthropic`, `Groq`, `Local Ollama`, `A2A MCP`.
  - [ ] Dynamic input fields: Endpoint URL, Model Name, Encrypted API Key.
  - [ ] "Test Connection" button calling `POST /api/settings/test-llm`.
- [ ] **Phase 5 Sign-Off:** Verify that switching to Local Ollama successfully returns local model chat completions.

---

## Phase 6: Business Knowledge RAG & Document Sharing
- [ ] **6.1 Knowledge Ingestion Service (`services/ragService.js`):**
  - [ ] Implement chunking and category tagging for uploaded runbooks and FAQs.
  - [ ] Save chunks to `KnowledgeDoc` model scoped by `ownerId`.
- [ ] **6.2 Retrieval Engine:**
  - [ ] In `services/ragService.js`, extract keywords and intent from incoming customer message.
  - [ ] Query `KnowledgeDoc.find({ ownerId, category: { $in: allowedCategories } })`.
  - [ ] Format top matching text chunks and verified service URLs.
- [ ] **6.3 Context Injection:**
  - [ ] In `azureOpenAI.js` / `llmAdapter.js`, inject verified document chunks into system prompt.
  - [ ] Instruct model: `"Answer grounded strictly in provided knowledge. If customer asks for documentation, provide this exact link: [fileUrl]"`.
- [ ] **6.4 Document Vault Frontend (`frontend/app/vault/page.jsx` or `/documents`):**
  - [ ] For business accounts, display "Document & Service Vault" instead of "Media Vault".
  - [ ] Drag-and-drop uploader for PDF runbooks, price lists, brochures, and URL bookmarks.
- [ ] **Phase 6 Sign-Off:** Upload a sample product PDF; verify the bot accurately quotes the document and includes the file link in DMs.

---

## Phase 7: Conversion Analytics (Leads & Bookings Tracker)
- [ ] **7.1 Analytics Extractor Service (`services/analyticsService.js`):**
  - [ ] Scan incoming message and AI reply for lead intent:
    - [ ] Regex patterns for phone numbers, email addresses, pricing requests, demo inquiries.
    - [ ] Upsert record in `models/Lead.js` (`ownerId`, `handle`, `phone`, `email`, `intentSummary`).
  - [ ] Scan for booking intent:
    - [ ] Detect appointment scheduling, date/time agreements, table reservations, Calendly clicks.
    - [ ] Upsert record in `models/Booking.js` (`ownerId`, `handle`, `serviceName`, `bookingTime`, `status: 'confirmed'`).
- [ ] **7.2 Business Analytics API (`routes/analytics.js`):**
  - [ ] Create `GET /api/analytics/overview`: returns total conversations, active leads count, confirmed bookings count, resolution rate.
  - [ ] Create `GET /api/analytics/leads`: returns paginated lead list with phone/email exports.
  - [ ] Create `GET /api/analytics/bookings`: returns scheduled bookings calendar feed.
- [ ] **7.3 Dashboard Overview UI (`frontend/app/page.jsx`):**
  - [ ] For business accounts, display KPI Stat Cards:
    - [ ] `💬 Total Conversations`
    - [ ] `🎯 Leads Captured`
    - [ ] `📅 Bookings Confirmed`
    - [ ] `⚡ Automation Rate`
- [ ] **Phase 7 Sign-Off:** Send a test DM containing a phone number and booking time; verify stats increment in real-time.

---

## Phase 8: Dynamic Sidebar, Mobile UI & Desktop Download Portal
- [ ] **8.1 Dynamic Sidebar by Role & Account Type (`frontend/app/components/Sidebar.jsx`):**
  - [ ] If `user.role === 'superadmin'`:
    - [ ] `01 // Platform Console`
    - [ ] `02 // User Workspaces`
    - [ ] `03 // Token Health Radar`
    - [ ] `04 // Desktop Releases`
  - [ ] If `user.accountType === 'personal'`:
    - [ ] `01 // Dashboard`
    - [ ] `02 // People Directory`
    - [ ] `03 // Chat Rules`
    - [ ] `04 // Persona & AI Model`
    - [ ] `05 // Media Vault` (Reactions & Stickers)
    - [ ] `06 // Desktop App` (`/download`)
  - [ ] If `user.accountType === 'business'`:
    - [ ] `01 // Business Dashboard` (KPIs, Leads, Bookings)
    - [ ] `02 // Document & Service Vault` (RAG Documents & Links)
    - [ ] `03 // Business Policy & Hours` (CEL Rules)
    - [ ] `04 // Brand Voice & AI Model` (Tone & BYO-LLM)
    - [ ] `05 // Customer Inbox & Handoff` (Live Queue)
    - [ ] `06 // Desktop App` (`/download`)
- [ ] **8.2 Cross-Platform Download Portal (`frontend/app/download/page.jsx`):**
  - [ ] Detect OS and architecture via `navigator.userAgent`:
    - [ ] macOS Apple Silicon (M1, M2, M3, M4)
    - [ ] macOS Intel (x86_64)
    - [ ] Windows 64-bit (x64)
    - [ ] Windows 32-bit (x86)
  - [ ] Prominent "Download for Your Device" button linking to matching DMG / MSI / EXE installer.
  - [ ] Dropdown for manual build selection with SHA-256 release checksums.
- [ ] **8.3 Mobile-Responsive UI Optimization:**
  - [ ] Implement touch-friendly bottom navigation bar for viewports `<= 768px`.
  - [ ] Optimize cards on `/controls` and `/settings` for 375px mobile screens.
- [ ] **Phase 8 Sign-Off:** Test sidebar menu switching between Personal, Business, and Superadmin; verify mobile layout on 375px screen.

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
- [ ] **10.1 Token Health Radar (`frontend/app/admin/tokens/page.jsx`):**
  - [ ] Build table listing all connected Meta Instagram tokens across all tenants.
  - [ ] Display expiration countdown and color-coded health badges:
    - [ ] Green: >30 days remaining
    - [ ] Amber: <15 days remaining
    - [ ] Red: Expired / Revoked
  - [ ] Add "Force Immediate Refresh" button for any connected account.
- [ ] **10.2 Tenant Directory & Workspace Impersonation (`frontend/app/admin/page.jsx`):**
  - [ ] List all registered users with role, account type, and Instagram handle.
  - [ ] One-click "Enter Workspace" triggering `/api/admin/impersonate` to inspect tenant settings.
  - [ ] Emergency tenant ban and token revoke killswitch.
- [ ] **10.3 Automated Token Refresh Background Worker (`services/reminderService.js`):**
  - [ ] Daily cron job scanning tokens expiring within 15 days.
  - [ ] Call `GET /refresh_access_token` for eligible long-lived tokens.
  - [ ] Update encrypted credentials and `tokenExpiresAt` in MongoDB.
- [ ] **Phase 10 Sign-Off:** Trigger administrative token refresh; confirm new expiration date updates in database.

---

## Final SaaS Verification & Definition of Done
- [ ] Complete test registration and email OTP verification for a new user.
- [ ] Connect Instagram account via Facebook Login for Business OAuth.
- [ ] Verify incoming DM routes exclusively to new user without affecting admin bot.
- [ ] Verify Personal account replies using human-mimicry styling (lowercase, no ending periods, slang).
- [ ] Verify Business account replies using professional tone with RAG document links and zero stickers.
- [ ] Verify switching to custom BYO-LLM / Local Ollama model works seamlessly.
- [ ] Verify Lead and Booking metrics increment in Business Analytics dashboard.
- [ ] Verify Download page correctly detects user OS/chip and serves matching Tauri build.
- [ ] Verify Superadmin can view Token Radar and impersonate tenant workspaces.
- [ ] Confirm zero regressions on existing primary Instagram account.
