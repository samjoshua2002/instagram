/**
 * The texting-style quiz: realistic DMs, each from a stranger, a friend or a close friend.
 * Four short rounds; some messages come twice from different people, so the quiz learns how
 * your style changes with who you're talking to. (Research: research/reports/Texting style quiz.)
 */
const ROUNDS = [
  { id: 'wyd', title: 'Hey, wyd', items: [
    { from: 'close', text: 'heyyy wyd', measures: 'greeting, length, energy with someone close' },
    { from: 'stranger', text: 'hi', measures: 'how you open with someone new' },
    { from: 'friend', text: 'good morning ☀️', measures: 'morning greetings' },
    { from: 'close', text: 'im so bored entertain me 😭', measures: 'humour, playfulness' },
    { from: 'friend', text: 'u alive? 💀 havent heard from u in days', measures: 'reply after going quiet' },
    { from: 'stranger', text: 'hey i saw ur reels, ur page is cool', measures: 'replying to a new follower' },
  ] },
  { id: 'smalltalk', title: 'Small talk', items: [
    { from: 'friend', text: 'bro did u see the match yesterday', measures: 'enthusiasm on shared topics' },
    { from: 'close', text: 'what did u eat today', measures: 'everyday detail sharing' },
    { from: 'friend', text: 'how was ur day', measures: 'how much you share about yourself' },
    { from: 'close', text: 'cant sleep 😩 talk to me', measures: 'late night chats' },
    { from: 'friend', text: 'any good movie to watch this weekend?', measures: 'recommendations, opinions' },
    { from: 'close', text: 'guess what happened today', measures: 'curiosity, follow-up questions' },
  ] },
  { id: 'banter', title: 'Banter & roasts', items: [
    { from: 'friend', text: 'ur reels are kinda cringe ngl', measures: 'taking a roast' },
    { from: 'close', text: 'ur so dumb sometimes 😭', measures: 'roasting back, how hard' },
    { from: 'friend', text: 'lmaooo look at ur old dp 💀', measures: 'self-deprecation' },
    { from: 'close', text: '[sends a meme about you being lazy]', measures: 'reaction to a meme' },
    { from: 'friend', text: '[sends a funny reel]', measures: 'reel reactions' },
    { from: 'stranger', text: 'lol ur kinda funny', measures: 'humour with someone new' },
  ] },
  { id: 'plans', title: "Plans & no's", items: [
    { from: 'friend', text: 'wanna hang out this weekend?', measures: 'saying yes / maybe' },
    { from: 'close', text: 'come for movie tonight pls pls', measures: 'saying no to someone close' },
    { from: 'friend', text: 'lets play chess now', measures: 'invites in the moment' },
    { from: 'stranger', text: 'can we collab on a video?', measures: 'requests from strangers' },
    { from: 'close', text: 'ur always busy now 😒', measures: 'handling guilt-trips' },
    { from: 'friend', text: 'r u coming to the party or not?? reply fast', measures: 'pressure and deadlines' },
  ] },
  { id: 'favours', title: 'Favours & money', items: [
    { from: 'friend', text: 'can u help me with my assignment tmrw', measures: 'favours' },
    { from: 'friend', text: 'can u lend me 500 on gpay', measures: 'money requests' },
    { from: 'close', text: 'send me that notes pdf pls', measures: 'quick requests from close people' },
    { from: 'stranger', text: 'bro can u promote my page', measures: 'promo requests' },
    { from: 'close', text: 'remind me to call mom at 7', measures: 'reminders' },
    { from: 'friend', text: 'can u fix my laptop, its so slow', measures: 'tech help, being the tech friend' },
  ] },
  { id: 'feels', title: 'Feels & support', items: [
    { from: 'close', text: 'i failed my exam 😞', measures: 'comforting, empathy' },
    { from: 'friend', text: 'i got the job!!!', measures: 'celebrating' },
    { from: 'close', text: 'i miss talking to u like before', measures: 'warmth, emotional depth' },
    { from: 'friend', text: 'my dog died today', measures: 'serious bad news' },
    { from: 'close', text: 'idk im just not okay today', measures: 'when someone is low' },
    { from: 'friend', text: 'should i text my ex? 😭', measures: 'giving advice' },
  ] },
  { id: 'fights', title: 'Fights & late replies', items: [
    { from: 'close', text: 'why didnt u reply yesterday', measures: 'late reply, apology' },
    { from: 'close', text: 'u left me on seen 🙂', measures: 'being called out' },
    { from: 'friend', text: 'that was really rude of u', measures: 'conflict, owning a mistake' },
    { from: 'close', text: 'fine. dont talk to me', measures: 'someone upset, repairing' },
    { from: 'friend', text: 'sorry for yesterday, i was in a bad mood', measures: 'accepting an apology' },
    { from: 'stranger', text: 'why r u ignoring me??', measures: 'pushy strangers' },
  ] },
  { id: 'awkward', title: 'Flirty & awkward', items: [
    { from: 'stranger', text: 'ur so cute', measures: 'compliments from someone new' },
    { from: 'friend', text: 'u looked good in ur story today 👀', measures: 'compliments from friends' },
    { from: 'stranger', text: 'r u single?', measures: 'flirting from strangers' },
    { from: 'close', text: 'who were u talking to so late 🤨', measures: 'jealous or nosy questions' },
    { from: 'friend', text: 'do u have a crush on anyone', measures: 'personal questions, teasing' },
    { from: 'stranger', text: 'can u send a pic', measures: 'uncomfortable requests' },
  ] },
  { id: 'you', title: 'You & Tanglish', items: [
    { from: 'friend', text: 'what r u working on these days', measures: 'talking about your projects' },
    { from: 'close', text: 'enna da panra', measures: 'Tanglish: do you answer in Tanglish?' },
    { from: 'friend', text: 'saptiya?', measures: 'Tanglish small talk' },
    { from: 'close', text: 'machan semma reel da 🔥', measures: 'Tanglish compliments' },
    { from: 'friend', text: 'gtg study, bye', measures: 'when they leave / get busy' },
    { from: 'close', text: 'back! that class was so boring', measures: 'when they come back' },
  ] },
  { id: 'boundaries', title: 'Boundaries', items: [
    { from: 'stranger', text: 'whats ur number?', measures: 'privacy with strangers' },
    { from: 'close', text: 'send ur number da, new phone', measures: 'privacy with close people' },
    { from: 'stranger', text: 'where do u live exactly', measures: 'location boundaries' },
    { from: 'friend', text: 'whos ur mom? whats her name', measures: 'family details' },
    { from: 'stranger', text: 'are u a bot? 🤖', measures: 'bot suspicion' },
    { from: 'stranger', text: 'which college r u in', measures: 'study / work privacy' },
  ] },
];

const FROM_LABEL = { stranger: 'Someone new', friend: 'A friend', close: 'Your close friend' };

/** The flat list of questions in order, each with a stable id. */
function allItems() {
  return ROUNDS.flatMap((r, ri) => r.items.map((it, i) => ({ ...it, id: `${r.id}-${i}`, round: r.id, roundTitle: r.title, roundIndex: ri })));
}

module.exports = { ROUNDS, FROM_LABEL, allItems };
