const SocialGraph = require('../models/SocialGraph');

class SocialGraphService {
  constructor() {
    this.cache = new Map();
    this.lastCacheTime = 0;
  }

  /**
   * Seed / update default social graph nodes for Sam's circle
   */
  async seedInitialGraph() {
    try {
      const defaultNodes = [
        {
          name: 'Rajveer',
          aliases: ['rajveer', 'gs', 'unpredictable_2k26', 'rajveerr', 'rajveerrrrrrrrrrrrr'],
          instagramHandle: '@unpredictable_2k26',
          senderId: '877566845441453',
          gender: 'male',
          relationshipToSam: 'Day-one Homie / Brother',
          connections: [
            { targetName: 'Roni', relationship: 'close buddy / favorite running joke target', notes: 'Constantly trolls Roni uncle about his bank account, legal team, and Toji soul.' },
            { targetName: 'Moksha', relationship: 'close friend / banter partner', notes: 'Very close with Moksha; sometimes texts from her Instagram account saying "This is Rajveer".' },
            { targetName: 'Fami', relationship: 'friend in circle', notes: 'Plots to ragebait Fami with inside jokes.' }
          ],
          lore: [
            'Calls himself drama king; talks in Hinglish and Hindi ("bhai", "bro", "lmao").',
            'Running gag about Roni uncle: fake bank account, court cases, axe of justice, Nami simping.',
            'Threatens to nuke chats or cry dramatically. When he roasts or insults, roast him back hard like guy friends do.'
          ],
          languages: ['Hindi', 'Hinglish', 'English'],
          roastStyle: 'Savage Hindi/Hinglish bro banter: "abe chal na lode", "aukaat mein reh bsdk", "dramebaaz chup baith", "teri itni himmat lodu".',
        },
        {
          name: 'Roni',
          aliases: ['roni', 'roni uncle', 'roni_uncle', 'roniuncle'],
          instagramHandle: '',
          senderId: '',
          gender: 'male',
          relationshipToSam: 'Close friend / Group running joke legend',
          connections: [
            { targetName: 'Rajveer', relationship: 'close buddy', notes: 'Rajveer and Sam constantly clown Roni.' }
          ],
          lore: [
            'Legendary running gag friend of the circle (referred to as "roni uncle").',
            'Jokes: Roni bank account, legal team on speed dial, Area 51 research, alien biryani 2024, Toji cursed energy fusion, "axe of justice", simping over Nami and Robin.',
            'Whenever Rajveer or anyone brings up Roni, immediately lean into this lore with playful banter! We know exactly who Roni is!'
          ],
          languages: ['Hinglish', 'English'],
          roastStyle: 'Clown his anime protagonist delusions, legal team, and axe of justice jokes.',
        },
        {
          name: 'Moksha',
          aliases: ['moksha', '1fyz_2', 'fyz', 'mokshaaa'],
          instagramHandle: '@1fyz_2',
          senderId: '1337018008317393',
          gender: 'female',
          relationshipToSam: 'Close friend / Sister figure / Drama queen',
          connections: [
            { targetName: 'Rajveer', relationship: 'close friend / account sharer', notes: 'Very close with Rajveer; Rajveer sometimes texts from her account.' },
            { targetName: 'Fami', relationship: 'friend', notes: 'Enjoys ragebaiting Fami together.' }
          ],
          lore: [
            'High-voltage drama queen. Uses hardcore Hindi cuss words when angry or teasing ("abey lovde", "teri gaaand faad dungi", "bkl", "mkc", "samm").',
            'NEVER be a polite assistant with her. When she cusses, cuss and roast her right back in Hindi: "chup kar chudail", "apni gaand mat phula dramebaaz", "bkl chill kar", "teri aukaat nahi hai", "abe lodu chup baith".'
          ],
          languages: ['Hindi', 'Hinglish', 'English'],
          roastStyle: 'Savage Hindi sister/drama queen roast: "chup kar chudail", "abe lodu chup baith", "bkl drama factory", "apni gaand mat phula dramebaaz".',
        },
        {
          name: 'Fami',
          aliases: ['fami', 'fami_', 'famine'],
          instagramHandle: '',
          senderId: '',
          gender: 'female',
          relationshipToSam: 'Friend in circle',
          connections: [
            { targetName: 'Rajveer', relationship: 'friend', notes: 'Gets easily ragebaited by Rajveer.' },
            { targetName: 'Moksha', relationship: 'friend', notes: 'Friend in circle.' }
          ],
          lore: [
            'Friend in the circle who gets super easily ragebaited ("fami will get so ragebaited").',
            'Also jokingly referenced with the Chainsaw Man Famine Devil character.'
          ],
          languages: ['English', 'Hinglish'],
          roastStyle: 'Tease her about getting easily ragebaited or confused.',
        },
        {
          name: 'Arun',
          aliases: ['arun', 'graphicsbyarun'],
          instagramHandle: '@graphicsbyarun',
          senderId: '1144338295203170',
          gender: 'male',
          relationshipToSam: 'Close Tamil homie / Graphic designer bro',
          connections: [
            { targetName: 'Rubesh', relationship: 'homie / inside joke couple', notes: 'Sam and friends jokingly call Arun and Rubesh gay lovers.' }
          ],
          lore: [
            'Texts in Tamil and Tanglish ("dei", "summa irunga", "gay Lord", "one moon one sun you only gay").',
            'When he roasts or calls Sam gay, abuse him back in Tamil: "dei mooditu poda gomma", "otha summa iru da", "ne tha da periya gay lord", "poi vela paaru da baadu", "vantaan periya ivan maari".'
          ],
          languages: ['Tamil', 'Tanglish', 'English'],
          roastStyle: 'Tamil roast: "dei poi vela paaru da", "ne tha da gay lord", "otha mooditu po gomma", "vantaan periya ivan maari".',
        },
        {
          name: 'Rubesh',
          aliases: ['rubesh', 'rupesh'],
          instagramHandle: '',
          senderId: '',
          gender: 'male',
          relationshipToSam: 'Friend in the group',
          connections: [
            { targetName: 'Arun', relationship: 'homie / inside joke couple', notes: 'Shipped as a couple with Arun as a running joke.' }
          ],
          lore: [
            'Running joke partner with Arun ("U and Rubesh gay lovers breakup ha").'
          ],
          languages: ['Tamil', 'English'],
          roastStyle: 'Bring up the Arun ship joke.',
        },
        {
          name: 'Bhavani',
          aliases: ['bhavani', 'yk_bhavani._.xo', 'bhavani🐹'],
          instagramHandle: '@yk_bhavani._.xo',
          senderId: '29005624469042002',
          gender: 'female',
          relationshipToSam: 'Close female friend',
          connections: [],
          lore: [
            'Close female friend. Strictly NEVER call her "bro", "da", or "man". Be warm, casual, and friendly.'
          ],
          languages: ['English', 'Tamil'],
          roastStyle: 'Playful and gentle, no hard insults.',
        },
        {
          name: 'Mavis',
          aliases: ['mavis', 'm4visyzx', 'moi', 'mavisyzx'],
          instagramHandle: '@m4visyzx',
          senderId: '2144547476275057',
          gender: 'female',
          relationshipToSam: 'Very close friend ("moi")',
          connections: [],
          lore: [
            'Close friend known as "moi". High emotional connection, shares personal thoughts.'
          ],
          languages: ['English'],
          roastStyle: 'Cute playful banter.',
        }
      ];

      for (const node of defaultNodes) {
        await SocialGraph.findOneAndUpdate(
          { name: node.name },
          { $set: node },
          { upsert: true, returnDocument: 'after' }
        );
      }
      this.clearCache();
      console.log('✅ [SocialGraph] Seeded & synced default friend network tree chain.');
    } catch (err) {
      console.error('❌ [SocialGraph] Error seeding graph:', err.message);
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
        const usernameLower = (mem.username || '').toLowerCase();
        const nameLower = (mem.name || '').toLowerCase();
        const nicknameLower = (mem.nickname || '').toLowerCase();

        const orConditions = [{ senderId: mem.senderId }];
        if (usernameLower) orConditions.push({ aliases: usernameLower });
        if (nameLower) {
          orConditions.push({ aliases: nameLower });
          orConditions.push({ name: new RegExp(`^${escapeRegex(nameLower)}$`, 'i') });
        }
        if (nicknameLower) orConditions.push({ aliases: nicknameLower });

        // Check if this memory belongs to an existing node
        const matchingNode = await SocialGraph.findOne({ $or: orConditions });

        if (matchingNode) {
          let updated = false;
          if (!matchingNode.senderId && mem.senderId) {
            matchingNode.senderId = mem.senderId;
            updated = true;
          }
          if (mem.username && !matchingNode.instagramHandle) {
            matchingNode.instagramHandle = `@${mem.username}`;
            updated = true;
          }
          if (mem.gender && matchingNode.gender === 'unknown') {
            matchingNode.gender = mem.gender;
            updated = true;
          }
          if (updated) {
            await matchingNode.save();
            console.log(`🔗 [SocialGraph] Linked senderId ${mem.senderId} (${mem.username}) to node ${matchingNode.name}`);
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
