const SocialGraph = require('../models/SocialGraph');

class SocialGraphService {
  constructor() {
    // Per-creator lookup caches: ownerKey -> { time, map }. Never shared between tenants.
    this.ownerCaches = new Map();
  }

  ownerKey(ownerId) {
    return ownerId ? String(ownerId) : 'none';
  }

  buildLookup(nodes) {
    const map = new Map();
    for (const n of nodes) {
      map.set(n.name.toLowerCase(), n);
      if (n.senderId) map.set(n.senderId, n);
      for (const a of n.aliases || []) {
        map.set(a.toLowerCase(), n);
      }
    }
    return map;
  }

  async getOwnerLookup(ownerId) {
    const key = this.ownerKey(ownerId);
    const cached = this.ownerCaches.get(key);
    if (cached && Date.now() - cached.time < 60000) return cached.map;
    const nodes = ownerId ? await SocialGraph.find({ ownerId }) : [];
    const map = this.buildLookup(nodes);
    this.ownerCaches.set(key, { time: Date.now(), map });
    return map;
  }

  /**
   * Initializes and syncs social graph network directly from live MongoDB database (zero hardcoding)
   */
  async seedInitialGraph() {
    try {
      await this.sanitizeExistingNodes();

      // Per-creator caches are built lazily on first use
      this.clearCache();
      const total = await SocialGraph.countDocuments({});
      console.log(`✅ [SocialGraph] Connected live to MongoDB: ${total} contacts across all creators.`);
    } catch (err) {
      console.error('❌ [SocialGraph] Error loading graph from MongoDB:', err.message);
    }
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
      // Clean up duplicate records sharing senderId or instagramHandle WITHIN the same creator only
      // (the same fan can legitimately be a contact of several creators)
      const seenSenderIds = new Map();
      const seenHandles = new Map();
      for (const node of allNodes) {
        const owner = node.ownerId ? String(node.ownerId) : 'none';
        const sIdRaw = (node.senderId || '').trim();
        const hRaw = (node.instagramHandle || '').replace(/^@/, '').toLowerCase().trim();
        const sId = sIdRaw ? `${owner}:${sIdRaw}` : '';
        const h = hRaw ? `${owner}:${hRaw}` : '';
        if (sId) {
          if (seenSenderIds.has(sId)) {
            const prevNode = seenSenderIds.get(sId);
            const keepNew = (node.name || '').length >= (prevNode.name || '').length || (node.updatedAt || 0) > (prevNode.updatedAt || 0);
            const toDelete = keepNew ? prevNode : node;
            const toKeep = keepNew ? node : prevNode;
            await SocialGraph.deleteOne({ _id: toDelete._id });
            seenSenderIds.set(sId, toKeep);
            console.log(`🧼 [Sanitize] Removed duplicate node "${toDelete.name}" in favor of "${toKeep.name}"`);
            continue;
          } else {
            seenSenderIds.set(sId, node);
          }
        }
        if (h) {
          if (seenHandles.has(h)) {
            const prevNode = seenHandles.get(h);
            const keepNew = (node.name || '').length >= (prevNode.name || '').length || (node.updatedAt || 0) > (prevNode.updatedAt || 0);
            const toDelete = keepNew ? prevNode : node;
            const toKeep = keepNew ? node : prevNode;
            await SocialGraph.deleteOne({ _id: toDelete._id });
            seenHandles.set(h, toKeep);
            console.log(`🧼 [Sanitize] Removed duplicate handle node "${toDelete.name}" in favor of "${toKeep.name}"`);
            continue;
          } else {
            seenHandles.set(h, node);
          }
        }
      }
    } catch (err) {
      console.warn('Node sanitization note:', err.message);
    }
  }

  clearCache(ownerId = null) {
    if (ownerId) this.ownerCaches.delete(this.ownerKey(ownerId));
    else this.ownerCaches.clear();
  }

  /**
   * Train / Link Graph from DB (scans UserMemory and Messages to auto-connect ids and discovered people)
   */
  async trainGraphFromDB(UserMemoryModel, MessageModel) {
    try {
      if (!UserMemoryModel) return;

      // Only memories that belong to a creator are linked, and only into that creator's graph
      const memories = await UserMemoryModel.find({ ownerId: { $ne: null } });
      for (const mem of memories) {
        const ownerId = mem.ownerId;
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

        // Check if this memory belongs to an existing node
        const matchingNode = await SocialGraph.findOne({ ownerId, $or: orConditions });

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
            ownerId,
            $or: [
              { name: new RegExp(`^${escapeRegex(cleanDisplayName)}$`, 'i') },
              { instagramHandle: cleanHandle },
              { senderId: mem.senderId }
            ]
          });

          if (!exists) {
            await SocialGraph.create({
              ownerId,
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
  async recordConnection(personAName, personBName, relationship, notes = '', ownerId = null) {
    try {
      if (!ownerId || typeof personAName !== 'string' || typeof personBName !== 'string') return;
      const nodeA = await SocialGraph.findOne({ ownerId, name: new RegExp(`^${escapeRegex(personAName)}$`, 'i') });
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
      this.clearCache(ownerId);
    } catch (err) {
      console.error('❌ [SocialGraph] Error recording connection:', err.message);
    }
  }

  /**
   * Find relevant entities and social tree connections for an incoming message
   */
  async getContextForConversation(senderId, currentText = '', history = [], ownerId = null) {
    try {
      // Only this creator's own contacts are ever used as AI context
      const lookup = await this.getOwnerLookup(ownerId);

      // 1. Identify the current sender in the graph
      let senderNode = lookup.get(senderId) || null;

      // 2. Identify all people mentioned in the incoming text + recent history
      const fullCorpus = (currentText + ' ' + (history || []).slice(-4).map(m => m.text || '').join(' ')).toLowerCase();
      const mentionedNodes = new Map();

      for (const [key, node] of lookup.entries()) {
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
