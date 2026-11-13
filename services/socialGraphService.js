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
   * Train / Link Graph from DB: links contacts (UserMemory) to People entries and adds newly talked people.
   * With an ownerId only that creator's data is read. Each creator's contacts and People are loaded once
   * and all changes are written in one bulk call (no per-contact queries).
   */
  async trainGraphFromDB(UserMemoryModel, MessageModel, ownerId = null) {
    try {
      if (!UserMemoryModel) return;
      const owners = ownerId ? [ownerId] : await UserMemoryModel.distinct('ownerId', { ownerId: { $ne: null } });
      for (const oid of owners) {
        try {
          await this.trainOwnerGraph(UserMemoryModel, oid);
        } catch (e) {
          // One creator's bad data must never stop the others
          console.error(`❌ [SocialGraph] Training failed for creator ${oid}:`, e.message);
        }
      }
      this.clearCache(ownerId || undefined);
      console.log('🌳 [SocialGraph] Trained & interlinked social tree from database.');
    } catch (err) {
      console.error('❌ [SocialGraph] Error training graph from DB:', err.message);
    }
  }

  async trainOwnerGraph(UserMemoryModel, ownerId) {
    const genders = SocialGraph.schema.path('gender').enumValues;
    const [memories, nodes] = await Promise.all([
      UserMemoryModel.find({ ownerId }).select('senderId username name nickname gender profilePic relationshipType personalNotes facts').lean(),
      SocialGraph.find({ ownerId }).select('name aliases instagramHandle senderId gender profilePic').lean(),
    ]);

    // Fast lookups over this creator's People
    const bySender = new Map(), byKey = new Map();
    const indexNode = (n) => {
      if (n.senderId) bySender.set(n.senderId, n);
      const keys = [n.name, n.instagramHandle, ...(n.aliases || [])]
        .filter(Boolean).map(k => String(k).replace(/^@/, '').toLowerCase().trim());
      for (const k of keys) if (k && !byKey.has(k)) byKey.set(k, n);
    };
    nodes.forEach(indexNode);

    const ops = [];
    for (const mem of memories) {
      const usernameLower = (mem.username || '').replace(/^@/, '').toLowerCase().trim();
      const nameLower = (mem.name || '').toLowerCase().trim();
      const nicknameLower = (mem.nickname || '').toLowerCase().trim();

      // Skip internal testing accounts
      if (!usernameLower || /^(test_|ig_tester_|catovidz$|me$|user_\d+)/i.test(usernameLower) ||
          /^(test_|ig_tester_|sim_)/i.test(mem.senderId) || mem.senderId === 'me') {
        continue;
      }

      const match = bySender.get(mem.senderId) || byKey.get(usernameLower) || (nameLower && byKey.get(nameLower)) || (nicknameLower && byKey.get(nicknameLower));
      if (match) {
        const set = {};
        if (!match.senderId && mem.senderId) set.senderId = mem.senderId;
        if (mem.username && !match.instagramHandle) set.instagramHandle = `@${usernameLower}`;
        if (mem.gender && genders.includes(mem.gender) && (!match.gender || match.gender === 'unknown')) set.gender = mem.gender;
        if (mem.profilePic && !match.profilePic) set.profilePic = mem.profilePic;
        if (Object.keys(set).length) {
          Object.assign(match, set);
          if (set.senderId) bySender.set(set.senderId, match);
          ops.push({ updateOne: { filter: { _id: match._id, ownerId }, update: { $set: set } } });
        }
        continue;
      }

      // Newly talked person discovered from conversation history
      const cleanDisplayName = mem.name && !mem.name.startsWith('User_') ? mem.name.trim() : (mem.nickname || mem.username);
      const doc = {
        ownerId,
        name: cleanDisplayName,
        aliases: [usernameLower, nameLower, nicknameLower].filter(Boolean),
        instagramHandle: `@${usernameLower}`,
        senderId: mem.senderId,
        profilePic: mem.profilePic || '',
        gender: genders.includes(mem.gender) ? mem.gender : 'unknown',
        relationshipToSam: mem.relationshipType && mem.relationshipType !== 'stranger'
          ? `${mem.relationshipType.charAt(0).toUpperCase() + mem.relationshipType.slice(1)}`
          : 'Follower / Online Contact',
        connections: [],
        lore: mem.personalNotes ? [mem.personalNotes] : ((mem.facts || []).map(f => f.fact).filter(Boolean)),
        languages: ['English'],
        roastStyle: 'Casual & friendly',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // Upsert by sender so a webhook adding the same person at the same moment cannot make a duplicate
      ops.push({ updateOne: { filter: { ownerId, senderId: mem.senderId }, update: { $setOnInsert: doc }, upsert: true } });
      indexNode({ ...doc, _id: null });
    }

    if (ops.length) {
      const r = await SocialGraph.bulkWrite(ops, { ordered: false });
      const added = r.upsertedCount || 0, linked = r.modifiedCount || 0;
      if (added || linked) console.log(`✨ [SocialGraph] Creator ${ownerId}: ${added} new contacts, ${linked} linked.`);
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
        // 1-2 letter nicknames would match almost any message
        if (key.length < 3) continue;

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
        lines.push(`  - Relationship to you: ${senderNode.relationshipToSam}`);
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
          lines.push(`    * Relationship to you: ${node.relationshipToSam}`);
          const directConn = senderNode
            ? (senderNode.connections || []).find(c => (c.targetName || '').toLowerCase() === name.toLowerCase())
            : null;
          if (directConn) {
            lines.push(`    * Connection to ${senderNode.name}: ${directConn.relationship} (${directConn.notes})`);
          }
          // A friend's private lore (facts, birthday, school...) is only shared with someone already
          // connected to them, never with a stranger who just types their name
          if (directConn && node.lore && node.lore.length > 0) {
            lines.push(`    * Shared Lore/Jokes: ${node.lore.join(' ')}`);
          }
        }
        lines.push(`You KNOW these friends, so never say "who is ${Array.from(mentionedNodes.keys()).join('/')}". But never share their private details (birthday, school, location, contact info, personal facts) with the person you are chatting with.`);
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
