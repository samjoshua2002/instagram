/**
 * Sends the reminders people asked for in DMs (models/Reminder.js), checked every minute.
 * - For them: a short DM in your voice at the time, if Instagram still allows it (within 24 h
 *   of their last message). Otherwise you get an email so you can remind them yourself.
 * - For you: an email at the time.
 */
const Reminder = require('../models/Reminder');
const Message = require('../models/Message');
const User = require('../models/User');

const WINDOW_MS = 23.5 * 3600 * 1000;

async function writeReminderText(reminder) {
  try {
    const azureOpenAI = require('./azureOpenAI');
    const { TOP_MODEL } = require('./models');
    const { toHumanText } = require('./replyStyle');
    const text = await azureOpenAI.completeWithFallback(TOP_MODEL, [
      { role: 'system', content: 'You are texting a friend on Instagram. They asked you earlier to remind them of something, and it is time now. Write ONE short casual line reminding them, like a friend would ("hey its 5, call ur mom"). No emoji, no quotes, no "as requested".' },
      { role: 'user', content: `What to remind: ${reminder.what}\nWhat they had asked: ${reminder.sourceText}` },
    ], { maxTokens: 60, temperature: 0.8 });
    return toHumanText(text).trim() || null;
  } catch {
    return null;
  }
}

async function emailOwner(reminder, why) {
  const owner = reminder.ownerId ? await User.findById(reminder.ownerId, { email: 1 }).lean() : null;
  if (!owner?.email) return false;
  const authService = require('./authService');
  const subject = reminder.forWhom === 'owner'
    ? `Reminder: ${reminder.what}`
    : `Remind ${reminder.name || 'them'}: ${reminder.what}`;
  const text = `${why}\n\nWhat: ${reminder.what}\nThey wrote: "${reminder.sourceText}"`;
  const esc = s => String(s || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px">
    <h2 style="margin:0 0 10px;font-size:20px">${esc(subject)}</h2>
    <p style="margin:0 0 12px;color:#52525b">${esc(why)}</p>
    <p style="margin:0;padding:12px 14px;background:#f4f4f5;border-radius:10px">"${esc(reminder.sourceText)}"</p></div>`;
  await authService.deliverEmail(owner.email, subject, text, html);
  return true;
}

async function sendOne(reminder) {
  if (reminder.forWhom === 'owner') {
    const ok = await emailOwner(reminder, `${reminder.name || 'Someone'} asked you to do this now.`);
    return ok ? { status: 'emailed' } : { status: 'failed', note: 'no owner email' };
  }
  const lastTheirs = await Message.findOne({ ownerId: reminder.ownerId || null, senderId: reminder.senderId, role: 'user' })
    .sort({ createdAt: -1 }).select('createdAt').lean();
  const inWindow = lastTheirs && Date.now() - new Date(lastTheirs.createdAt).getTime() < WINDOW_MS;
  const { getOwnerSendToken } = require('./instagramTokenService');
  const token = inWindow ? await getOwnerSendToken(reminder.ownerId) : '';
  if (inWindow && token) {
    const text = (await writeReminderText(reminder)) || `hey reminder: ${reminder.what}`;
    const instagramService = require('./instagramService');
    const res = await instagramService.sendTextMessage(reminder.senderId, text, token).catch(err => ({ success: false, error: err.message }));
    if (res?.success) {
      await Message.create({
        ownerId: reminder.ownerId || null, senderId: 'me', recipientId: reminder.senderId, role: 'assistant',
        text, mid: res?.data?.message_id || `reminder_${reminder._id}`, sentByAI: true, isReminder: true, timestamp: new Date(),
      });
      return { status: 'sent', note: text };
    }
  }
  const why = inWindow
    ? `The AI could not message ${reminder.name || 'them'} on Instagram just now. Remind them yourself.`
    : `Instagram only lets the AI message someone within 24 hours of their last message, so remind ${reminder.name || 'them'} yourself.`;
  const ok = await emailOwner(reminder, why);
  return ok ? { status: 'emailed', note: 'outside window or send failed' } : { status: 'failed', note: 'could not send or email' };
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    for (let i = 0; i < 20; i++) {
      // Claim one due reminder at a time so two servers never send the same one
      const r = await Reminder.findOneAndUpdate(
        { status: 'pending', dueAt: { $lte: new Date() } },
        { $set: { status: 'failed', note: 'sending' } },
        { sort: { dueAt: 1 }, returnDocument: 'after' },
      );
      if (!r) break;
      const out = await sendOne(r).catch(err => ({ status: 'failed', note: err.message }));
      await Reminder.updateOne({ _id: r._id }, { $set: { status: out.status, note: out.note || '', sentAt: new Date() } });
      console.log(`⏰ [Reminder] ${r.name || r.senderId}: ${out.status} (${r.what})`);
    }
  } catch (err) {
    console.error('❌ [Reminder] tick failed:', err.message);
  } finally {
    running = false;
  }
}

function startScheduler() {
  const t = setInterval(tick, 60 * 1000);
  if (t.unref) t.unref();
  console.log('⏰ [Reminder] Scheduled reminders checked every minute');
}

module.exports = { startScheduler, tick, sendOne };
