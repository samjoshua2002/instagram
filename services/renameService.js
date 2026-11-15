/**
 * When you rename a contact, the old name is replaced everywhere the AI learned it, so it never
 * keeps calling them by the old one: their facts, events, notes and summary, their People card
 * lore and notes, and the memory document (which is then rebuilt from their chats).
 */
const UserMemory = require('../models/UserMemory');
const SocialGraph = require('../models/SocialGraph');
const PersonMemory = require('../models/PersonMemory');

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replaces the old name as a whole word (any case), keeping "'s" etc. Pure, so it is unit tested. */
function swapName(text, oldName, newName) {
  if (!text || !oldName || !newName) return text;
  return String(text).replace(new RegExp(`(^|[^\\p{L}\\p{N}_])${esc(oldName)}(?=$|[^\\p{L}\\p{N}_])`, 'giu'), (m, pre) => `${pre}${newName}`);
}

async function renameEverywhere({ ownerId = null, senderId, oldName, newName }) {
  if (!senderId || !oldName || !newName || oldName.toLowerCase() === newName.toLowerCase()) return { changed: 0 };
  let changed = 0;
  const sw = t => swapName(t, oldName, newName);

  const mem = await UserMemory.findOne({ ownerId, senderId });
  if (mem) {
    mem.name = newName;
    (mem.facts || []).forEach(f => { f.fact = sw(f.fact); });
    (mem.lifeEvents || []).forEach(e => { e.title = sw(e.title); e.details = sw(e.details); });
    (mem.importantDates || []).forEach(d => { d.title = sw(d.title); d.details = sw(d.details); });
    if (mem.personalNotes) mem.personalNotes = sw(mem.personalNotes);
    if (mem.rollingSummary) mem.rollingSummary = sw(mem.rollingSummary);
    await mem.save();
    changed++;
  }
  const node = await SocialGraph.findOne({ ownerId, senderId });
  if (node) {
    node.lore = (node.lore || []).map(sw);
    if (node.personalNotes) node.personalNotes = sw(node.personalNotes);
    (node.connections || []).forEach(c => { c.notes = sw(c.notes); c.targetName = sw(c.targetName); });
    await node.save();
    changed++;
  }
  const pm = await PersonMemory.findOne({ ownerId, senderId });
  if (pm) {
    pm.name = newName;
    pm.doc = sw(pm.doc);
    pm.notes = (pm.notes || []).map(sw);
    pm.bondReason = sw(pm.bondReason);
    pm.rebuildDoc = true;
    pm.priority = Date.now();
    pm.dirty = true;
    await pm.save();
    changed++;
  }
  // Things they shared, alerts and reminders were saved with the name of the time
  const SharedItem = require('../models/SharedItem');
  const Reminder = require('../models/Reminder');
  for (const item of await SharedItem.find({ ownerId, senderId })) {
    item.name = newName;
    item.summary = sw(item.summary);
    item.description = sw(item.description);
    await item.save().catch(() => {});
    changed++;
  }
  for (const r of await Reminder.find({ ownerId, senderId })) {
    r.name = newName;
    r.what = sw(r.what);
    await r.save().catch(() => {});
    changed++;
  }
  console.log(`✏️ [Rename] ${oldName} -> ${newName} for ${senderId} (${changed} records)`);
  return { changed };
}

module.exports = { renameEverywhere, swapName };
