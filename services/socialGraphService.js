const SocialGraph = require('../models/SocialGraph');

class SocialGraphService {
  constructor() {
    this.cache = new Map();
    this.lastCacheTime = 0;
  }

  /**
   * Initializes and syncs social graph network directly from live MongoDB database (zero hardcoding)
   */
  async seedInitialGraph() {
    try {
      await this.sanitizeExistingNodes();

      // Read purely from live MongoDB database
      const allNodes = await SocialGraph.find({});
      this.clearCache();
      for (const n of allNodes) {
        this.cache.set(n.name.toLowerCase(), n);
        if (n.senderId) this.cache.set(n.senderId, n);
        for (const a of n.aliases || []) {
          this.cache.set(a.toLowerCase(), n);
        }
      }
      this.lastCacheTime = Date.now();
      console.log(`✅ [SocialGraph] Connected live to MongoDB: loaded ${allNodes.length} contacts dynamically from DB (zero hardcoded).`);
    } catch (err) {
      console.error('❌ [SocialGraph] Error loading graph from MongoDB:', err.message);
  }

  /**
   * Sanitizes existing database records to remove any old, repetitive abusive curse phrases
   */
  async sanitizeExistingNodes() {
    try {
      const allNodes = await SocialGraph.find({});
      for (const node of allNodes) {
        let changed = false;
        if (node.roastStyle && /gomma|otha|baadu|lode|bsdk|lodu/i.test(node.roastStyle)) {
          if (node.name.toLowerCase() === 'arun') {
            node.roastStyle = 'Dynamic witty Tamil/Tanglish bro banter: "dei enna da over ah panra", "loosu maari pesadha", "poi vela paaru da", "seri seri podhum", "semma comic da". Never repeat canned insults.';
            changed = true;
          }
        }
        if (Array.isArray(node.lore)) {
          const cleanLore = node.lore.map(l => {
            if (/gomma|otha|baadu/i.test(l)) {
              changed = true;
              return 'Texts in Tamil and Tanglish (dei, summa irunga, enna da, semma). Banter playfully without static bad words.';
            }
            return l;
          });
          if (changed) node.lore = cleanLore;
        }
        if (changed) {
          await node.save();
          console.log(`🧼 [Sanitized Node]: Cleaned outdated roast words for ${node.name}`);
        }
      }
    } catch (err) {
      console.warn('Node sanitization note:', err.message);
    }
  }

  clearCache() {
    this.cache.clear();
    this.lastCacheTime = 0;
  }

  /**
   * Train / Link Graph from DB (scans UserMemory and Messages to auto-connect ids and discovered people)
   */
  async trainGraphFromDB(UserMemoryModel, MessageModel) {
    try {
      if (!UserMemoryModel) return;

      const memories = await UserMemoryModel.find({});
      for (const mem of memories) {
        const usernameLower = (mem.username || '').replace(/^@/, '').toLowerCase().trim();
        const nameLower = (mem.name || '').toLowerCase().trim();
        const nicknameLower = (mem.nickname || '').toLowerCase().trim();

        // Skip internal testing accounts
        if (
          !usernameLower ||
          /^(test_|ig_tester_|catovidz$|me$|user_\d+)/i.test(usernameLower) ||
          /^(test_|ig_tester_)/i.test(mem.senderId) ||
          mem.senderId === 'me'
        ) {
          continue;
        }

        const orConditions = [{ senderId: mem.senderId }];
        if (usernameLower) {
          orConditions.push({ aliases: usernameLower });
          orConditions.push({ instagramHandle: `@${usernameLower}` });
          orConditions.push({ instagramHandle: usernameLower });
        }
        if (nameLower) {
          orConditions.push({ aliases: nameLower });
          orConditions.push({ name: new RegExp(`^${escapeRegex(nameLower)}$`, 'i') });
        }
        if (nicknameLower) {
          orConditions.push({ aliases: nicknameLower });
        }
        if (usernameLower.includes('annie') || nameLower.includes('annie')) {
          orConditions.push({ name: 'Annie' });
        }

        // Check if this memory belongs to an existing node
        const matchingNode = await SocialGraph.findOne({ $or: orConditions });

        if (matchingNode) {
          let updated = false;
          if (!matchingNode.senderId && mem.senderId) {
            matchingNode.senderId = mem.senderId;
            updated = true;
          }
          if (mem.username && !matchingNode.instagramHandle) {
            matchingNode.instagramHandle = `@${usernameLower}`;
            updated = true;
          }
          if (mem.gender && matchingNode.gender === 'unknown') {
            matchingNode.gender = mem.gender;
            updated = true;
          }
          if (mem.profilePic && !matchingNode.profilePic) {
            matchingNode.profilePic = mem.profilePic;
            updated = true;
          }
          if (updated) {
            await matchingNode.save();
            console.log(`🔗 [SocialGraph] Linked senderId ${mem.senderId} (${mem.username}) to node ${matchingNode.name}`);
          }
        } else {
          // Newly talked person discovered from conversation history!
          const cleanDisplayName = mem.name && !mem.name.startsWith('User_') ? mem.name.trim() : (mem.nickname || mem.username);
          const cleanHandle = `@${usernameLower}`;

          // Extra safety duplicate check by name, handle, or senderId
          const exists = await SocialGraph.findOne({
            $or: [
              { name: new RegExp(`^${escapeRegex(cleanDisplayName)}$`, 'i') },
              { instagramHandle: cleanHandle },
              { senderId: mem.senderId }
            ]
          });

          if (!exists) {
            await SocialGraph.create({
              name: cleanDisplayName,
              aliases: [usernameLower, nameLower, nicknameLower].filter(Boolean),
              instagramHandle: cleanHandle,
              senderId: mem.senderId,
              profilePic: mem.profilePic || '',
              gender: mem.gender || 'unknown',
              relationshipToSam: mem.relationshipType && mem.relationshipType !== 'stranger'
                ? `${mem.relationshipType.charAt(0).toUpperCase() + mem.relationshipType.slice(1)}`
                : 'Follower / Online Contact',
              connections: [],
              lore: mem.personalNotes ? [mem.personalNotes] : ((mem.facts || []).map(f => f.fact).filter(Boolean)),
              languages: ['English'],
              roastStyle: 'Casual & friendly'
            });
            console.log(`✨ [SocialGraph] Added newly talked contact to Knowledge Tree: ${cleanDisplayName} (${cleanHandle})`);
          }
        }
      }

      this.clearCache();
      console.log('🌳 [SocialGraph] Trained & interlinked social tree from database.');
    } catch (err) {
      console.error('❌ [SocialGraph] Error training graph from DB:', err.message);
    }
  }

  /**
   * Dynamically add or update a friend connection in the graph
   */
  async recordConnection(personAName, personBName, relationship, notes = '') {
    try {
      const nodeA = await SocialGraph.findOne({ name: new RegExp(`^${personAName}$`, 'i') });
      if (!nodeA) return;

      const existingIndex = (nodeA.connections || []).findIndex(
        c => c.targetName.toLowerCase() === personBName.toLowerCase()
      );

      if (existingIndex >= 0) {
        nodeA.connections[existingIndex].relationship = relationship;
        if (notes) nodeA.connections[existingIndex].notes = notes;
      } else {
        nodeA.connections.push({ targetName: personBName, relationship, notes });
      }

      await nodeA.save();
      this.clearCache();
    } catch (err) {
      console.error('❌ [SocialGraph] Error recording connection:', err.message);
    }
  }

  /**
   * Find relevant entities and social tree connections for an incoming message
   */
  async getContextForConversation(senderId, currentText = '', history = []) {
    try {
      const now = Date.now();
      if (now - this.lastCacheTime > 60000 || this.cache.size === 0) {
        const allNodes = await SocialGraph.find({});
        this.cache.clear();
        for (const n of allNodes) {
          this.cache.set(n.name.toLowerCase(), n);
          if (n.senderId) this.cache.set(n.senderId, n);
          for (const a of n.aliases || []) {
            this.cache.set(a.toLowerCase(), n);
          }
        }
        this.lastCacheTime = now;
      }

      // 1. Identify the current sender in the graph
      let senderNode = this.cache.get(senderId) || null;

      // 2. Identify all people mentioned in the incoming text + recent history
      const fullCorpus = (currentText + ' ' + (history || []).slice(-4).map(m => m.text || '').join(' ')).toLowerCase();
      const mentionedNodes = new Map();

      for (const [key, node] of this.cache.entries()) {
        // Skip senderId keys
        if (key === senderId || /^\d+$/.test(key)) continue;

        // Check if key or alias appears as a word boundary in corpus
        const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escapeRegex(key)}([^a-zA-Z0-9_]|$)`, 'i');
        if (regex.test(fullCorpus)) {
          mentionedNodes.set(node.name, node);
        }
      }

      // If sender itself is in mentionedNodes, remove from mentioned so it doesn't duplicate
      if (senderNode) {
        mentionedNodes.delete(senderNode.name);
      }

      // 3. Format Social Graph Context Prompt Block
      if (!senderNode && mentionedNodes.size === 0) {
        return '';
      }

      let lines = ['\n=== SOCIAL KNOWLEDGE GRAPH & FRIEND NETWORK (TREE CHAIN) ==='];

      if (senderNode) {
        lines.push(`• YOU ARE CURRENTLY CHATTING WITH: ${senderNode.name} (${senderNode.instagramHandle || 'User'})`);
        lines.push(`  - Relationship to you (Sam): ${senderNode.relationshipToSam}`);
        lines.push(`  - Gender: ${senderNode.gender}`);
        if (senderNode.connections && senderNode.connections.length > 0) {
          lines.push(`  - Connected Friends in your circle:`);
          for (const conn of senderNode.connections) {
            lines.push(`    * ${conn.targetName} (${conn.relationship}): ${conn.notes}`);
          }
        }
        if (senderNode.lore && senderNode.lore.length > 0) {
          lines.push(`  - Shared Lore & Inside Jokes: ${senderNode.lore.join(' ')}`);
        }
        if (senderNode.roastStyle) {
          lines.push(`  - How to banter/roast them: ${senderNode.roastStyle}`);
        }
      }

      if (mentionedNodes.size > 0) {
        lines.push(`• FRIENDS MENTIONED IN THIS CONVERSATION (TREE CHAIN):`);
        for (const [name, node] of mentionedNodes.entries()) {
          lines.push(`  - ${name} (${node.instagramHandle || 'Friend'}):`);
          lines.push(`    * Relationship to you (Sam): ${node.relationshipToSam}`);
          if (senderNode) {
            const directConn = (senderNode.connections || []).find(c => c.targetName.toLowerCase() === name.toLowerCase());
            if (directConn) {
              lines.push(`    * Connection to ${senderNode.name}: ${directConn.relationship} (${directConn.notes})`);
            }
          }
          if (node.lore && node.lore.length > 0) {
            lines.push(`    * Shared Lore/Jokes: ${node.lore.join(' ')}`);
          }
        }
        lines.push(`CRITICAL: You KNOW these friends! Never say "who is ${Array.from(mentionedNodes.keys()).join('/')}". Reference their shared inside jokes naturally!`);
      }

      return lines.join('\n');
    } catch (err) {
      console.error('❌ [SocialGraph] Error getting context:', err.message);
      return '';
    }
  }
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = new SocialGraphService();
