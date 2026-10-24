# CHATTER OS // Next-Gen UI Design System & Architecture Specification

> **Aesthetic Philosophy**: High-performance, tactile minimalism inspired by Linear, Raycast, and Stripe. No generic templates, washed-out demo grays, or clunky forms. Every surface feels physical, responsive, and crafted with obsidian precision.

---

## 1. Visual Foundation & Design Tokens

### 1.1 Color Hierarchy & Obsidian Palette
- **Canvas Base**: `#fafafa` (Light mode base) / Deep subtle contrast with `#f4f4f5` section backgrounds.
- **Surface Elevation**: `#ffffff` with micro-borders (`1px solid #e4e4e7` or `rgba(0,0,0,0.06)`).
- **Obsidian Dark / Brand**: `#09090b` (Primary text, primary active pills, hero buttons).
- **Text Hierarchy**:
  - `Display / Titles`: `#09090b` — tight tracking (`letter-spacing: -0.03em`), heavy weights (`800` / `900`).
  - `Body / Descriptions`: `#71717a` — high readability, relaxed line height (`1.5`).
  - `Labels & Metadata`: `#a1a1aa` / `#71717a` — JetBrains Mono uppercase (`letter-spacing: 0.08em`, `font-size: 0.7rem`).
- **Accent Signals**:
  - `Emerald Success`: `#10b981` (Online status, verified tokens, active connections).
  - `Amber Attention`: `#f59e0b` (Expiring tokens, manual review warnings).
  - `Crimson Alert`: `#ef4444` (Revoked tokens, errors, killswitch).
  - `Electric Indigo`: `#6366f1` (AI reasoning, RAG ingestion).

### 1.2 Elevation & Shadow Layers
- **Card Default**: `box-shadow: 0 1px 3px rgba(0,0,0,0.02), 0 8px 24px -4px rgba(0,0,0,0.04);`
- **Card Hover / Active**: `box-shadow: 0 4px 20px -2px rgba(0,0,0,0.08); transform: translateY(-2px);`
- **Floating Modals / Drawers**: `box-shadow: 0 20px 48px -8px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.08);`

### 1.3 Motion & Physics
- **Deceleration Curve**: Quintic / cubic-bezier (`[0.16, 1, 0.3, 1]`).
- **Transitions**: Smooth `150ms` to `300ms` on borders, backgrounds, and transforms.
- **Button Micro-interactions**: `whileTap={{ scale: 0.98 }}`, `whileHover={{ y: -1 }}`.

---

## 2. Component Standards

### 2.1 Option Select Cards (Custom Radio / Toggle Grid)
- **Problem Solved**: Replaces distorted native browser `<input type="radio">` with custom physical cards.
- **Active State**:
  - Dark border: `1.5px solid #09090b`
  - Subtle card glow and background highlight (`#fafafa`)
  - Animated inner dot: `16px` diameter with `4.5px solid #09090b` ring
  - Brand-specific badge pill (`GPT-4o`, `CLAUDE`, `LOCAL`, `FAST`)
- **Hover State**: Elevates `-2px` with smooth spring transition.

### 2.2 Segmented Navigation Tabs
- Clean obsidian pill tabs with subtle rounded containers (`border-radius: 999px` or `12px`).
- Active tab uses dark background `#09090b` with crisp white typography.
- Inactive tabs use gentle hover highlights without visual noise.

### 2.3 Form Fields & Floating Controls
- Inputs use `box-sizing: border-box`, `border-radius: 9px`, crisp border `#e4e4e7`, and clear label hierarchy.
- Focus rings use subtle inner dark stroke (`box-shadow: 0 0 0 1.5px #09090b`).
- Monospace font (`JetBrains Mono`) for tokens, model names, endpoints, and credentials.

---

## 3. Screen Specifications

### 3.1 Profile & Security (`/profile`)
- **Hero Header**: User avatar with online pulse indicator, full name, Instagram handle, and account role badge.
- **Workspace Tier Switcher**: 1-click toggle between **Personal / Creator** and **Business & Brand** workspaces.
- **Personal Information Card**: First/Last name, verified email, mobile, WhatsApp, and location.
- **Instagram Status Card**: Meta Graph API connection status, Page ID, token health chip, and direct reconnect action.
- **Biometric Passkeys Card**: WebAuthn biometric security (Face ID / Touch ID / Windows Hello) with device icons and instant enrollment.

### 3.2 Persona & Styling Engine (`/settings`)
- **Header Action Bar**: Live Test Clone trigger, Reset button, and unified Save button.
- **Segmented Control Tabs**:
  - `About Me`: Creator bio, background facts, and personality summary.
  - `Characteristics`: Trait chips, emotional tone, and humor level.
  - `How To Text`: Message length, capitalization rules, slang vocabulary, and punctuation constraints.
  - `How To Reply`: Gating rules, reel reaction triggers, and fact injection limits.
  - `Chat Examples`: Few-shot pairs teaching the model your exact voice.
  - `AI Provider Hub`: Complete BYO-LLM configuration (Azure, OpenAI, Anthropic Claude, Groq Llama, Local Ollama, A2A MCP).
  - `Test My Clone`: Real-time interactive DM simulator.

### 3.3 Document & Service Vault (`/documents`)
- High-density document card grid with category filtering (`All`, `Pricing`, `FAQ`, `Runbook`, `Links`).
- Drag-and-drop ingestion zone with instant parsing for PDFs and URL bookmarking.
- RAG grounding preview showing keyword tags and token chunks.

### 3.4 Platform Console & Token Health Radar (`/admin/tokens`)
- Real-time token telemetry table with expiration countdown clocks.
- Color-coded badges: Green (>30d), Amber (<15d), Red (Expired).
- One-click immediate token refresh and workspace impersonation.
