// Chatter AI - Frontend Application Logic

let activeSenderId = null;
let currentMemory = null;

// DOM Elements
const navBtns = document.querySelectorAll('.nav-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const toastEl = document.getElementById('toast');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  await loadStatus();
  await loadConversations();
  await loadSocialGraph();
  setupEventListeners();
  setupSimulator();
});

// Toast notification helper
function showToast(msg, isError = false) {
  if (!toastEl) return;
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

    const handleEl = document.getElementById('creatorHandle');
    if (handleEl) handleEl.textContent = data.instagramHandle || '@catovidz';

    const nameEl = document.getElementById('displayCreatorName');
    if (nameEl) nameEl.textContent = data.creatorName || 'Sam Joshua';

    const modelEl = document.getElementById('displayModelName');
    if (modelEl) modelEl.textContent = data.azureModel || 'GPT-4o';

    const botToggle = document.getElementById('globalBotToggle');
    if (botToggle) botToggle.checked = data.globalBotActive ?? true;

    const sysStatus = document.getElementById('systemStatusText');
    if (sysStatus) {
      sysStatus.textContent = (data.globalBotActive ?? true) ? 'Auto-Pilot Active' : 'Auto-Pilot Paused';
    }
  } catch (err) {
    console.error('Error loading status:', err);
  }
}

// Global Bot Toggle
document.getElementById('globalBotToggle')?.addEventListener('change', async (e) => {
  const active = e.target.checked;
  try {
    await fetch('/api/persona', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ globalBotActive: active })
    });
    const sysStatus = document.getElementById('systemStatusText');
    if (sysStatus) {
      sysStatus.textContent = active ? 'Auto-Pilot Active' : 'Auto-Pilot Paused';
    }
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
    const badge = document.getElementById('inboxCountBadge');
    if (badge) badge.textContent = Array.isArray(convos) ? convos.length : 0;

    if (!Array.isArray(convos) || convos.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No messages yet. Send a DM on Instagram or test in the <b>AI Simulator</b>!</p>
        </div>`;
      return;
    }

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

    // Auto-select first conversation if none selected yet
    if (!activeSenderId && convos.length > 0) {
      selectConversation(convos[0].user.senderId);
    }
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

    // Messages stream
    const stream = document.getElementById('messagesStream');
    stream.innerHTML = '';

    if (!data.messages || data.messages.length === 0) {
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
document.getElementById('sendManualReplyBtn')?.addEventListener('click', sendManualReply);
document.getElementById('manualReplyText')?.addEventListener('keydown', (e) => {
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
document.getElementById('viewMemoryBtn')?.addEventListener('click', () => {
  document.getElementById('memoryPanel')?.classList.toggle('open');
});
document.getElementById('closeMemoryBtn')?.addEventListener('click', () => {
  document.getElementById('memoryPanel')?.classList.remove('open');
});

function renderMemoryPanel(memory) {
  if (!memory) return;
  const relEl = document.getElementById('memRelation');
  if (relEl) relEl.textContent = memory.relationshipType || 'Stranger';

  const styleEl = document.getElementById('memStyle');
  if (styleEl) styleEl.textContent = memory.conversationStyle || 'Casual';

  const sumEl = document.getElementById('memSummary');
  if (sumEl) sumEl.textContent = memory.rollingSummary || 'New conversation';

  const factsUl = document.getElementById('memFactsList');
  if (factsUl) {
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
}

// Add custom fact manually
document.getElementById('addFactBtn')?.addEventListener('click', async () => {
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
document.getElementById('refreshConvosBtn')?.addEventListener('click', () => {
  loadConversations();
  if (activeSenderId) selectConversation(activeSenderId);
  showToast('Refreshed conversations');
});

// -------------------------------------------------------------
// 3. Simulator / Live Sandbox
// -------------------------------------------------------------
function setupSimulator() {
  const userSelect = document.getElementById('simUserSelect');
  const simCurrentUsername = document.getElementById('simCurrentUsername');

  userSelect?.addEventListener('change', () => {
    const selected = userSelect.options[userSelect.selectedIndex].text;
    if (simCurrentUsername) simCurrentUsername.textContent = selected.split(' ')[1] || selected;
    clearSimulator();
  });

  document.getElementById('sendSimMsgBtn')?.addEventListener('click', sendSimMessage);
  document.getElementById('simInputText')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendSimMessage();
  });
  document.getElementById('clearSimBtn')?.addEventListener('click', clearSimulator);
}

function clearSimulator() {
  const stream = document.getElementById('simMessagesStream');
  if (stream) stream.innerHTML = '<div class="bubble bubble-system">Simulated conversation cleared. Send a new message!</div>';
  const styleEl = document.getElementById('simStyleVal');
  if (styleEl) styleEl.textContent = 'Analyzing...';
  const sumEl = document.getElementById('simSummaryVal');
  if (sumEl) sumEl.textContent = 'First interaction initiated.';
  const factsEl = document.getElementById('simFactsVal');
  if (factsEl) factsEl.innerHTML = '<li>Send a message to see facts dynamically extracted!</li>';
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
        const sVal = document.getElementById('simStyleVal');
        if (sVal) sVal.textContent = mem.conversationStyle || 'Casual';
        const rVal = document.getElementById('simRelationVal');
        if (rVal) rVal.textContent = mem.relationshipType || 'User';
        const sumVal = document.getElementById('simSummaryVal');
        if (sumVal) sumVal.textContent = mem.rollingSummary || 'In progress';

        const factsList = document.getElementById('simFactsVal');
        if (factsList) {
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
      }

      // Also refresh live inbox list
      loadConversations();
    }
  } catch (err) {
    typingBubble.remove();
    showToast('Simulation error: ' + err.message, true);
  }
}

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

  // Sync Social Tree button
  document.getElementById('syncTreeBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('syncTreeBtn');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Training & Syncing...</span>';
    try {
      const res = await fetch('/api/social-graph/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`🌳 Synced ${data.count} friends in the Social Tree!`);
        await loadSocialGraph();
      } else {
        showToast('Sync failed: ' + data.error, true);
      }
    } catch (err) {
      showToast('Error syncing tree: ' + err.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>🔄 Sync & Retrain from DB</span>';
    }
  });
}

async function loadSocialGraph() {
  try {
    const res = await fetch('/api/social-graph');
    const data = await res.json();
    if (!data.success) return;

    const grid = document.getElementById('friendsGrid');
    const badge = document.getElementById('friendsCountBadge');
    if (badge) badge.textContent = data.nodes.length;
    if (!grid) return;

    grid.innerHTML = data.nodes.map(node => {
      const initials = (node.name || '?').slice(0, 2).toUpperCase();
      const connectionsChips = (node.connections || []).map(c => 
        `<span class="tree-chip" title="${escapeHtml(c.notes)}">🔗 <b>${escapeHtml(c.targetName)}</b> (${escapeHtml(c.relationship)})</span>`
      ).join('');

      const loreItems = (node.lore || []).map(l => `• ${escapeHtml(l)}`).join('<br>');

      return `
        <div class="friend-card">
          <div class="friend-card-top">
            <div class="friend-profile">
              <div class="friend-avatar">${initials}</div>
              <div>
                <div class="friend-name">${escapeHtml(node.name)}</div>
                <div class="friend-handle">${escapeHtml(node.instagramHandle || 'No handle')}</div>
              </div>
            </div>
            <span class="friend-rel-badge">${escapeHtml(node.relationshipToSam || 'Friend')}</span>
          </div>

          ${connectionsChips ? `
            <div class="tree-connections-block">
              <div class="tree-connections-title">Connected Friends (Tree Chain)</div>
              <div class="tree-chips">${connectionsChips}</div>
            </div>
          ` : ''}

          ${loreItems ? `
            <div class="friend-lore-block">
              <div class="friend-lore-title">Shared Lore & Inside Jokes</div>
              <div>${loreItems}</div>
            </div>
          ` : ''}

          ${node.roastStyle ? `
            <div class="friend-roast-block">
              <div class="friend-roast-title">⚡ Cuss / Roast Style</div>
              <div>${escapeHtml(node.roastStyle)}</div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading social graph:', err);
  }
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
