# Chatter AI - Headless Instagram DM Automation Engine

An autonomous, 24/7 AI-powered Instagram DM auto-reply engine that mimics Sam Joshua's exact voice and tone using Azure OpenAI (GPT-4o), Instagram Graph API, and MongoDB long-term memory.

## Features
- **Headless 24/7 Auto-Reply:** Runs completely in the background via webhooks.
- **Human-like Persona Engine:** Powered by Azure OpenAI GPT-4o with short, casual replies and authentic style.
- **Dynamic Memory Extraction:** Automatically remembers user facts, relationship depth, and context over time in MongoDB.
- **Multi-Account Support:** Handles multiple Instagram Creator/Business accounts seamlessly.
- **Meta Graph API v26.0 Integration:** Ready for production with privacy policy and data deletion webhooks.

## Deployment on Render
1. Create a **New Web Service** connected to this repository.
2. Build Command: `npm install`
3. Start Command: `node server.js`
4. Add Environment Variables from `.env.example`.
5. Update Callback URL in Meta Developer Portal to your Render URL: `https://<your-app>.onrender.com/webhook`
