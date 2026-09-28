// Chatter AI - Frontend Application Logic

let activeSenderId = null;
let currentMemory = null;
let personaConfig = null;

// DOM Elements
const navBtns = document.querySelectorAll('.nav-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const toastEl = document.getElementById('toast');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  await loadStatus();
  await loadConversations();
  await loadPersona();
  setupEventListeners();
  setupSimulator();
});

// Toast notification helper
function showToast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.style.borderColor = isError ? '#ef4444' : 'var(--border-glass)';
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3000);
}

// Tab navigation
function setupNavigation() {
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      navBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(t => t.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab)?.classList.add('active');
    });
  });
}

// -------------------------------------------------------------
// 1. Status & Dashboard Info
// -------------------------------------------------------------
async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    document.getElementById('creatorHandle').textContent = data.instagramHandle || '@chipichappa.daily';
    document.getElementById('displayCreatorName').textContent = data.creatorName || 'Sam Joshua';
    document.getElementById('displayModelName').textContent = data.azureModel || 'GPT-4o';
    document.getElementById('globalBotToggle').checked = data.globalBotActive ?? true;

    // Webhook setup info
    document.getElementById('verifyTokenDisplay').textContent = data.webhookVerifyToken;
    document.getElementById('webhookCallbackDisplay').textContent = `${window.location.origin}/webhook`;
    document.getElementById('displayAppId').textContent = `Meta App: chatter (${data.appId})`;

    const tokenBadge = document.getElementById('tokenStatusBadge');
    if (data.hasPageAccessToken) {
      tokenBadge.textContent = 'Token Connected';
      tokenBadge.className = 'status-pill status-success';
    } else {
      tokenBadge.textContent = 'Page Access Token Needed';
      tokenBadge.className = 'status-pill status-warning';
    }
  } catch (err) {
    console.error('Error loading status:', err);
  }
}

// Global Bot Toggle
document.getElementById('globalBotToggle').addEventListener('change', async (e) => {
  const active = e.target.checked;
  try {
    await fetch('/api/persona', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ globalBotActive: active })
    });
    document.getElementById('systemStatusText').textContent = active ? 'Auto-Pilot Active' : 'Auto-Pilot Paused';
    showToast(active ? 'AI Auto-Pilot activated' : 'AI Auto-Pilot paused');
  } catch (err) {
    showToast('Failed to toggle AI auto-pilot', true);
  }
});

// -------------------------------------------------------------
// 2. Conversations & Inbox
// -------------------------------------------------------------
async function loadConversations() {
  try {
    const res = await fetch('/api/conversations');
    const convos = await res.json();

    const container = document.getElementById('convoListContainer');
    document.getElementById('inboxCountBadge').textContent = convos.length;

    if (convos.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No messages yet. Send a test message in the <b>AI Simulator</b> or connect your webhook!</p>
        </div>`;
      return;
    }

    container.innerHTML = '';
    convos.forEach(item => {
      const u = item.user;
      const lastMsg = item.lastMessage;
      const initial = (u.name || u.username || 'U')[0].toUpperCase();

    container.innerHTML = '';
    convos.forEach(item => {
      const u = item.user;
      const lastMsg = item.lastMessage;
      const initial = (u.name || u.username || 'U')[0].toUpperCase();

      let badgesHtml = '';
      if (!u.aiEnabled) {
        badgesHtml += `<span class="badge-pill pill-paused">⏸️ AI Paused</span>`;
      } else {
        const textOn = u.replyToMessages !== false;
        const reelsOn = u.replyToReelsAndPosts !== false;
        if (textOn && reelsOn) {
          badgesHtml += `<span class="badge-pill pill-active">💬 Text + 🎬 Reels</span>`;
        } else if (textOn) {
          badgesHtml += `<span class="badge-pill pill-text">💬 Messages Only</span>`;
        } else if (reelsOn) {
          badgesHtml += `<span class="badge-pill pill-reels">🎬 Reels Only</span>`;
        } else {
          badgesHtml += `<span class="badge-pill pill-paused">⏸️ Paused</span>`;
        }
        if (u.remindersEnabled !== false) {
          badgesHtml += `<span class="badge-pill pill-remind">⏰ Remind</span>`;
        }
      }

      const div = document.createElement('div');
      div.className = `convo-item ${activeSenderId === u.senderId ? 'active' : ''}`;
      div.setAttribute('data-id', u.senderId);
      div.innerHTML = `
        <div class="convo-avatar">${initial}</div>
        <div class="convo-info">
          <div class="convo-top">
            <span class="convo-name">${escapeHtml(u.name || u.username)}</span>
            <span class="convo-time">${lastMsg ? formatTime(lastMsg.timestamp) : ''}</span>
          </div>
          <p class="convo-snippet">${lastMsg ? (lastMsg.role === 'assistant' ? 'Sam: ' : '') + escapeHtml(lastMsg.text) : 'No messages'}</p>
          <div class="convo-badges">${badgesHtml}</div>
        </div>
      `;

      div.addEventListener('click', () => selectConversation(u.senderId));
      container.appendChild(div);
    });
  } catch (err) {
    console.error('Error fetching conversations:', err);
  }
}

async function selectConversation(senderId) {
  activeSenderId = senderId;

  // Highlight in list
  document.querySelectorAll('.convo-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-id') === senderId);
  });

  try {
    const res = await fetch(`/api/conversations/${senderId}/messages`);
    const data = await res.json();
    currentMemory = data.memory;

    // Header info
    document.getElementById('activeChatUsername').textContent = currentMemory.name || currentMemory.username;
    document.getElementById('activeChatRelation').textContent = `Style: ${currentMemory.conversationStyle || 'Casual'} • ${currentMemory.relationshipType || 'User'}`;
    document.getElementById('activeChatAvatar').textContent = (currentMemory.name || currentMemory.username || 'U')[0].toUpperCase();
    document.getElementById('chatHeaderActions').style.display = 'flex';
    document.getElementById('chatInputBar').style.display = 'flex';

    // Update Person Rules UI
    updatePersonRulesUI(currentMemory);

    // Messages
    const stream = document.getElementById('messagesStream');
    stream.innerHTML = '';

    if (data.messages.length === 0) {
      stream.innerHTML = '<div class="empty-state">No messages in this conversation yet.</div>';
    } else {
      data.messages.forEach(msg => {
        const isSam = msg.role === 'assistant';
        const row = document.createElement('div');
        row.className = `msg-row ${isSam ? 'outgoing' : 'incoming'}`;
        row.innerHTML = `
          <div class="msg-bubble">${escapeHtml(msg.text)}</div>
          <div class="msg-meta">
            ${isSam && msg.sentByAI ? '<span class="ai-tag">AI Clone</span>' : ''}
            <span>${formatTime(msg.timestamp || msg.createdAt)}</span>
          </div>
        `;
        stream.appendChild(row);
      });
      stream.scrollTop = stream.scrollHeight;
    }

    renderMemoryPanel(currentMemory);
  } catch (err) {
    console.error('Error loading messages:', err);
  }
}

function updatePersonRulesUI(memory) {
  if (!memory) return;
  const aiMaster = memory.aiEnabled !== false;
  const replyMsg = memory.replyToMessages !== false;
  const replyReels = memory.replyToReelsAndPosts !== false;
  const reminders = memory.remindersEnabled !== false;

  // Drawer toggles
  const masterToggle = document.getElementById('ruleAiMasterToggle');
  const msgToggle = document.getElementById('ruleReplyMessagesToggle');
  const reelsToggle = document.getElementById('ruleReplyReelsToggle');
  const remindToggle = document.getElementById('ruleRemindersToggle');

  if (masterToggle) masterToggle.checked = aiMaster;
  if (msgToggle) msgToggle.checked = replyMsg;
  if (reelsToggle) reelsToggle.checked = replyReels;
  if (remindToggle) remindToggle.checked = reminders;

  const nickInput = document.getElementById('prefNicknameInput');
  const genderSelect = document.getElementById('prefGenderSelect');
  const notesText = document.getElementById('prefPersonalNotes');

  if (nickInput) nickInput.value = memory.nickname || '';
  if (genderSelect) genderSelect.value = memory.gender || 'unknown';
  if (notesText) notesText.value = memory.personalNotes || '';

  const statusPill = document.getElementById('personRulesStatus');
  if (statusPill) {
    if (!aiMaster) {
      statusPill.textContent = 'AI Paused';
      statusPill.className = 'live-pill paused';
    } else {
      statusPill.textContent = 'AI Active';
      statusPill.className = 'live-pill';
    }
  }

  // Quick Mode Pills in Header
  const qmAll = document.getElementById('qmAll');
  const qmMsg = document.getElementById('qmMsg');
  const qmReels = document.getElementById('qmReels');
  const qmPause = document.getElementById('qmPause');
  const qmRemind = document.getElementById('qmRemind');

  if (qmAll) qmAll.classList.toggle('active', aiMaster && replyMsg && replyReels);
  if (qmMsg) qmMsg.classList.toggle('active', aiMaster && replyMsg && !replyReels);
  if (qmReels) qmReels.classList.toggle('active', aiMaster && !replyMsg && replyReels);
  if (qmPause) qmPause.classList.toggle('active', !aiMaster);

  if (qmRemind) {
    qmRemind.textContent = reminders ? '⏰ Reminders: ON' : '⏰ Reminders: OFF';
    qmRemind.classList.toggle('active', reminders);
  }
}

async function savePersonPreferences(updates) {
  if (!activeSenderId) return;
  try {
    const res = await fetch(`/api/conversations/${activeSenderId}/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (data.success) {
      currentMemory = data.memory;
      updatePersonRulesUI(currentMemory);
      loadConversations();
      showToast('Updated rules for @' + (currentMemory.username || 'user'));
    }
  } catch (err) {
    showToast('Failed to save rules: ' + err.message, true);
  }
}

// Manual reply as Sam Joshua
document.getElementById('sendManualReplyBtn').addEventListener('click', sendManualReply);
document.getElementById('manualReplyText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendManualReply();
  }
});

async function sendManualReply() {
  const textInput = document.getElementById('manualReplyText');
  const text = textInput.value.trim();
  if (!text || !activeSenderId) return;

  try {
    const res = await fetch(`/api/conversations/${activeSenderId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();

    if (data.success) {
      textInput.value = '';
      selectConversation(activeSenderId);
      loadConversations();
    } else {
      showToast('Error sending message', true);
    }
  } catch (err) {
    showToast('Failed to send message: ' + err.message, true);
  }
}

// Memory Drawer Handlers
document.getElementById('viewMemoryBtn').addEventListener('click', () => {
  document.getElementById('memoryPanel').classList.toggle('open');
});
document.getElementById('closeMemoryBtn').addEventListener('click', () => {
  document.getElementById('memoryPanel').classList.remove('open');
});

function renderMemoryPanel(memory) {
  if (!memory) return;
  document.getElementById('memRelation').textContent = memory.relationshipType || 'Stranger';
  document.getElementById('memStyle').textContent = memory.conversationStyle || 'Casual';
  document.getElementById('memSummary').textContent = memory.rollingSummary || 'New conversation';

  const factsUl = document.getElementById('memFactsList');
  factsUl.innerHTML = '';
  if (memory.facts && memory.facts.length > 0) {
    memory.facts.forEach(f => {
      const li = document.createElement('li');
      li.textContent = f.fact;
      factsUl.appendChild(li);
    });
  } else {
    factsUl.innerHTML = '<li>No specific facts learned yet.</li>';
  }
}

// Add custom fact manually
document.getElementById('addFactBtn').addEventListener('click', async () => {
  const input = document.getElementById('customFactInput');
  const newFact = input.value.trim();
  if (!newFact || !activeSenderId || !currentMemory) return;

  currentMemory.facts = currentMemory.facts || [];
  currentMemory.facts.push({ fact: newFact });

  try {
    await fetch(`/api/conversations/${activeSenderId}/memory`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: currentMemory.facts })
    });
    input.value = '';
    renderMemoryPanel(currentMemory);
    showToast('Fact added to user memory!');
  } catch (err) {
    showToast('Failed to add fact', true);
  }
});

// Refresh button
document.getElementById('refreshConvosBtn').addEventListener('click', () => {
  loadConversations();
  if (activeSenderId) selectConversation(activeSenderId);
  showToast('Refreshed conversations');
});

// -------------------------------------------------------------
// 3. AI Persona & Style Studio
// -------------------------------------------------------------
async function loadPersona() {
  try {
    const res = await fetch('/api/persona');
    personaConfig = await res.json();

    document.getElementById('cfgCreatorName').value = personaConfig.creatorName || 'Sam Joshua';
    document.getElementById('cfgInstagramHandle').value = personaConfig.instagramHandle || '@chipichappa.daily';
    document.getElementById('cfgPersonaBio').value = personaConfig.personaBio || '';
    document.getElementById('cfgToneGuidelines').value = personaConfig.toneGuidelines || '';
    document.getElementById('cfgTypingDelay').value = personaConfig.typingDelaySeconds || 1.5;
    document.getElementById('cfgKnowledge').value = personaConfig.customKnowledge || '';
    document.getElementById('cfgForbidden').value = (personaConfig.forbiddenWords || []).join(', ');
    
    if (personaConfig.instagramPageAccessToken) {
      document.getElementById('inputPageToken').value = personaConfig.instagramPageAccessToken;
    }

    renderSampleConversations(personaConfig.sampleConversations || []);
  } catch (err) {
    console.error('Error loading persona:', err);
  }
}

function renderSampleConversations(samples) {
  const container = document.getElementById('samplesContainer');
  container.innerHTML = '';

  samples.forEach((sample, idx) => {
    const div = document.createElement('div');
    div.className = 'sample-pair';
    div.innerHTML = `
      <div class="form-group" style="margin:0;">
        <label>User Says:</label>
        <input type="text" class="sample-user" value="${escapeHtml(sample.userMessage || '')}">
      </div>
      <div class="form-group" style="margin:0;">
        <label>Sam Joshua Replies:</label>
        <input type="text" class="sample-sam" value="${escapeHtml(sample.myReply || '')}">
      </div>
      <button class="btn-delete" title="Delete" onclick="removeSample(${idx})">🗑️</button>
    `;
    container.appendChild(div);
  });
}

window.removeSample = function(idx) {
  personaConfig.sampleConversations.splice(idx, 1);
  renderSampleConversations(personaConfig.sampleConversations);
};

document.getElementById('addSampleBtn').addEventListener('click', () => {
  personaConfig.sampleConversations = personaConfig.sampleConversations || [];
  personaConfig.sampleConversations.push({
    userMessage: 'hey, how are you doing?',
    myReply: 'all good bro! just working on some new edits 🙌'
  });
  renderSampleConversations(personaConfig.sampleConversations);
});

document.getElementById('savePersonaBtn').addEventListener('click', async () => {
  // Collect sample pairs
  const pairs = [];
  document.querySelectorAll('.sample-pair').forEach(el => {
    const u = el.querySelector('.sample-user').value.trim();
    const s = el.querySelector('.sample-sam').value.trim();
    if (u && s) pairs.push({ userMessage: u, myReply: s });
  });

  const forbidden = document.getElementById('cfgForbidden').value
    .split(',')
    .map(w => w.trim().toLowerCase())
    .filter(Boolean);

  const payload = {
    creatorName: document.getElementById('cfgCreatorName').value.trim(),
    instagramHandle: document.getElementById('cfgInstagramHandle').value.trim(),
    personaBio: document.getElementById('cfgPersonaBio').value.trim(),
    toneGuidelines: document.getElementById('cfgToneGuidelines').value.trim(),
    typingDelaySeconds: parseFloat(document.getElementById('cfgTypingDelay').value) || 1.5,
    customKnowledge: document.getElementById('cfgKnowledge').value.trim(),
    forbiddenWords: forbidden,
    sampleConversations: pairs,
  };

  try {
    const res = await fetch('/api/persona', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('🎉 Persona and Tone Rules saved!');
      loadStatus();
    }
  } catch (err) {
    showToast('Failed to save persona: ' + err.message, true);
  }
});

// -------------------------------------------------------------
// 4. Simulator / Live Sandbox
// -------------------------------------------------------------
function setupSimulator() {
  const userSelect = document.getElementById('simUserSelect');
  const simCurrentUsername = document.getElementById('simCurrentUsername');

  userSelect.addEventListener('change', () => {
    const selected = userSelect.options[userSelect.selectedIndex].text;
    simCurrentUsername.textContent = selected.split(' ')[1] || selected;
    clearSimulator();
  });

  document.getElementById('sendSimMsgBtn').addEventListener('click', sendSimMessage);
  document.getElementById('simInputText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendSimMessage();
  });
  document.getElementById('clearSimBtn').addEventListener('click', clearSimulator);
}

function clearSimulator() {
  const stream = document.getElementById('simMessagesStream');
  stream.innerHTML = '<div class="bubble bubble-system">Simulated conversation cleared. Send a new message!</div>';
  document.getElementById('simStyleVal').textContent = 'Analyzing...';
  document.getElementById('simSummaryVal').textContent = 'First interaction initiated.';
  document.getElementById('simFactsVal').innerHTML = '<li>Send a message to see facts dynamically extracted!</li>';
}

async function sendSimMessage() {
  const input = document.getElementById('simInputText');
  const text = input.value.trim();
  if (!text) return;

  const userSelect = document.getElementById('simUserSelect');
  const senderId = userSelect.value;
  const username = userSelect.options[userSelect.selectedIndex].text.split(' ')[1]?.replace(/[()]/g, '') || senderId;

  // Append user bubble
  const stream = document.getElementById('simMessagesStream');
  const userBubble = document.createElement('div');
  userBubble.className = 'bubble bubble-user';
  userBubble.textContent = text;
  stream.appendChild(userBubble);
  input.value = '';
  stream.scrollTop = stream.scrollHeight;

  // Typing indicator
  const typingBubble = document.createElement('div');
  typingBubble.className = 'typing-bubble';
  typingBubble.textContent = 'Sam Joshua is typing...';
  stream.appendChild(typingBubble);
  stream.scrollTop = stream.scrollHeight;

  try {
    const res = await fetch('/api/simulator/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testSenderId: senderId,
        testUsername: username,
        messageText: text,
      })
    });
    const data = await res.json();

    typingBubble.remove();

    if (data.replyText) {
      const samBubble = document.createElement('div');
      samBubble.className = 'bubble bubble-sam';
      samBubble.textContent = data.replyText;
      stream.appendChild(samBubble);
      stream.scrollTop = stream.scrollHeight;

      // Update Live Intel Box
      if (data.userMemory) {
        const mem = data.userMemory;
        document.getElementById('simStyleVal').textContent = mem.conversationStyle || 'Casual';
        document.getElementById('simRelationVal').textContent = mem.relationshipType || 'User';
        document.getElementById('simSummaryVal').textContent = mem.rollingSummary || 'In progress';

        const factsList = document.getElementById('simFactsVal');
        factsList.innerHTML = '';
        if (mem.facts && mem.facts.length > 0) {
          mem.facts.forEach(f => {
            const li = document.createElement('li');
            li.textContent = f.fact;
            factsList.appendChild(li);
          });
        } else {
          factsList.innerHTML = '<li>Chatting with Sam...</li>';
        }
      }

      // Also refresh live inbox list
      loadConversations();
    }
  } catch (err) {
    typingBubble.remove();
    showToast('Simulation error: ' + err.message, true);
  }
}

// -------------------------------------------------------------
// 5. Meta Token Management
// -------------------------------------------------------------
document.getElementById('saveTokenBtn').addEventListener('click', async () => {
  const token = document.getElementById('inputPageToken').value.trim();
  if (!token) return showToast('Please enter an Access Token', true);

  try {
    const res = await fetch('/api/persona', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instagramPageAccessToken: token })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Page Access Token saved securely!');
      loadStatus();
    }
  } catch (err) {
    showToast('Error saving token', true);
  }
});

document.getElementById('testTokenBtn').addEventListener('click', async () => {
  const token = document.getElementById('inputPageToken').value.trim();
  const resultDiv = document.getElementById('tokenTestResult');
  resultDiv.style.display = 'block';
  resultDiv.textContent = 'Verifying token with Meta Graph API...';
  resultDiv.className = 'test-result-box status-warning';

  try {
    const res = await fetch('/api/test-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();

    if (data.success) {
      resultDiv.className = 'test-result-box status-success';
      resultDiv.innerHTML = `✅ Token Valid! Connected to: <b>${escapeHtml(data.data.name || data.data.id)}</b>`;
    } else {
      resultDiv.className = 'test-result-box status-warning';
      resultDiv.innerHTML = `❌ Meta Error: ${escapeHtml(JSON.stringify(data.error))}`;
    }
  } catch (err) {
    resultDiv.className = 'test-result-box status-warning';
    resultDiv.innerHTML = `❌ Request failed: ${err.message}`;
  }
});

function setupEventListeners() {
  document.getElementById('convoSearchInput')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.convo-item').forEach(el => {
      const name = el.querySelector('.convo-name')?.textContent.toLowerCase() || '';
      const snip = el.querySelector('.convo-snippet')?.textContent.toLowerCase() || '';
      el.style.display = (name.includes(q) || snip.includes(q)) ? 'flex' : 'none';
    });
  });

  // Quick Mode Pills (Chat Header)
  document.getElementById('qmAll')?.addEventListener('click', () => {
    savePersonPreferences({ aiEnabled: true, replyToMessages: true, replyToReelsAndPosts: true });
  });

  document.getElementById('qmMsg')?.addEventListener('click', () => {
    savePersonPreferences({ aiEnabled: true, replyToMessages: true, replyToReelsAndPosts: false });
  });

  document.getElementById('qmReels')?.addEventListener('click', () => {
    savePersonPreferences({ aiEnabled: true, replyToMessages: false, replyToReelsAndPosts: true });
  });

  document.getElementById('qmPause')?.addEventListener('click', () => {
    savePersonPreferences({ aiEnabled: false });
  });

  document.getElementById('qmRemind')?.addEventListener('click', () => {
    const current = currentMemory ? currentMemory.remindersEnabled !== false : true;
    savePersonPreferences({ remindersEnabled: !current });
  });

  // Memory Drawer Custom Toggles
  document.getElementById('ruleAiMasterToggle')?.addEventListener('change', (e) => {
    savePersonPreferences({ aiEnabled: e.target.checked });
  });

  document.getElementById('ruleReplyMessagesToggle')?.addEventListener('change', (e) => {
    savePersonPreferences({ replyToMessages: e.target.checked });
  });

  document.getElementById('ruleReplyReelsToggle')?.addEventListener('change', (e) => {
    savePersonPreferences({ replyToReelsAndPosts: e.target.checked });
  });

  document.getElementById('ruleRemindersToggle')?.addEventListener('change', (e) => {
    savePersonPreferences({ remindersEnabled: e.target.checked });
  });

  // Save Person Preferences button
  document.getElementById('savePreferencesBtn')?.addEventListener('click', () => {
    const nickname = document.getElementById('prefNicknameInput')?.value;
    const gender = document.getElementById('prefGenderSelect')?.value;
    const personalNotes = document.getElementById('prefPersonalNotes')?.value;
    const aiEnabled = document.getElementById('ruleAiMasterToggle')?.checked;
    const replyToMessages = document.getElementById('ruleReplyMessagesToggle')?.checked;
    const replyToReelsAndPosts = document.getElementById('ruleReplyReelsToggle')?.checked;
    const remindersEnabled = document.getElementById('ruleRemindersToggle')?.checked;

    savePersonPreferences({
      aiEnabled,
      replyToMessages,
      replyToReelsAndPosts,
      remindersEnabled,
      nickname,
      gender,
      personalNotes,
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
