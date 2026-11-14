/**
 * Ready-made starter boards for the Storyboard template picker.
 * Each template: { id, name, description, build(ctx) -> { nodes, edges } }.
 * ctx (personal only): { people, user } so a template can use saved contacts.
 */

const node = (id, type, label, notes = '', x = 0, y = 0, extra = {}) => ({ id, type, label, notes, contactId: '', x, y, ...extra });

/** Main steps left to right (zig-zag); side cards sit in a row below, linked to a main step. */
function flow(main, side = []) {
  const nodes = main.map(([type, label, notes], i) => node(`s${i}`, type, label, notes, 80 + i * 300, 140 + (i % 2) * 80));
  const edges = main.slice(1).map((_, i) => ({ id: `e${i}`, from: `s${i}`, to: `s${i + 1}`, label: '' }));
  side.forEach(([type, label, notes, from, edgeLabel = ''], i) => {
    nodes.push(node(`x${i}`, type, label, notes, 160 + i * 340, 520));
    if (from !== null && from !== undefined) edges.push({ id: `ex${i}`, from: `s${from}`, to: `x${i}`, label: edgeLabel });
  });
  return { nodes, edges };
}

/** "You" in the middle, cards in a ring around you, each linked to you. */
function ring(youLabel, items) {
  // Spaced for the node-editor cards (about 240 wide, up to ~200 tall when open)
  const cx = 1000, cy = 640, rx = 600, ry = 440;
  const you = node('you', 'you', youLabel || 'You', '', cx, cy);
  const nodes = items.map(([type, label, notes, extra = {}], i) => {
    const a = (i / Math.max(items.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return node(`t${i}`, type, label, notes, Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a)), extra);
  });
  const edges = nodes.map((n, i) => ({ id: `et${i}`, from: 'you', to: n.id, label: items[i][3]?.edge || '' }));
  nodes.forEach(n => { delete n.edge; });
  return { nodes: [you, ...nodes], edges };
}

export const PERSONAL_TEMPLATES = [
  {
    id: 'contacts',
    name: 'My contacts',
    description: 'You in the middle with up to 8 of your saved contacts and how they link to each other.',
    build: ({ people = [], user } = {}) => {
      const picked = people.slice(0, 8);
      const board = ring(user?.firstName, picked.map(p => ['person', p.name, p.relationship || '', { contactId: String(p.id), senderId: p.senderId || '', circle: '', edge: p.relationship || '' }]));
      // Map contact ids onto the ring cards, then add their links to each other
      const byName = {};
      board.nodes.forEach(n => { if (n.contactId) byName[(n.label || '').toLowerCase()] = n.id; });
      picked.forEach((p, i) => (p.connections || []).forEach(c => {
        const from = `t${i}`;
        const to = byName[(c.targetName || '').toLowerCase()];
        if (to && to !== from && !board.edges.some(e => (e.from === to && e.to === from) || (e.from === from && e.to === to))) {
          board.edges.push({ id: `e-${from}-${to}`, from, to, label: c.rel || c.relationship || '' });
        }
      }));
      return board;
    },
  },
  {
    id: 'friends',
    name: 'Friends & hangouts',
    description: 'Best friend, friend group, inside jokes, your usual spot and plans.',
    build: ({ user } = {}) => ring(user?.firstName, [
      ['person', 'Best friend', 'Known them for years. Very casual, lots of teasing.', { circle: 'close', edge: 'best friend' }],
      ['person', 'Friend group', 'The group chat crowd. Short, fun replies.', { circle: 'online', edge: 'friends' }],
      ['lore', 'Inside jokes', 'Running jokes the bot can bring up with close friends.'],
      ['place', 'Usual hangout', 'The cafe or spot where you always meet.'],
      ['event', 'Weekend plans', 'What you usually do on weekends.'],
      ['secret', 'Private stuff', 'Money, health and anything you never share in DMs.'],
    ]),
  },
  {
    id: 'dating',
    name: 'Dating & flirting',
    description: 'Someone you are talking to, your vibe, date ideas and topics to avoid.',
    build: ({ user } = {}) => ring(user?.firstName, [
      ['person', 'Someone special', 'Playful and warm. Ask about their day, remember small details.', { circle: 'close', edge: 'talking' }],
      ['lore', 'My vibe', 'What you are into: music, food, hobbies you like talking about.'],
      ['place', 'Favourite date spot', 'Where you like to go and why.'],
      ['event', 'First date', 'When it was and what happened.'],
      ['secret', 'Exes & past', 'Never talk about past relationships.'],
    ]),
  },
  {
    id: 'creator',
    name: 'Creator & fans',
    description: 'Fans, collab partners, your content, next drop and private deals.',
    build: ({ user } = {}) => ring(user?.firstName, [
      ['person', 'Fans', 'Friendly and thankful. Short replies, emojis are fine.', { circle: 'online', edge: 'fans' }],
      ['person', 'Collab partners', 'Brands and creators. Polite, point them to email for deals.', { circle: 'professional', edge: 'work' }],
      ['lore', 'My content', 'What you post about and how often.'],
      ['event', 'Next drop', 'Your next video, launch or live stream.'],
      ['secret', 'Earnings & deals', 'Never share income, rates or contract details.'],
    ]),
  },
  {
    id: 'family',
    name: 'Family',
    description: 'Parents, siblings, home town and family events.',
    build: ({ user } = {}) => ring(user?.firstName, [
      ['person', 'Parents', 'Respectful and caring. Check in on their health.', { circle: 'family', edge: 'parents' }],
      ['person', 'Siblings', 'Casual, lots of teasing.', { circle: 'family', edge: 'siblings' }],
      ['place', 'Home town', 'Where you grew up.'],
      ['event', 'Family events', 'Birthdays, festivals and get-togethers.'],
      ['secret', 'Family matters', 'Private family issues stay out of chats.'],
    ]),
  },
  {
    id: 'blank',
    name: 'Blank',
    description: 'Just you. Add your own people and lore.',
    build: ({ user } = {}) => ({ nodes: [node('you', 'you', user?.firstName || 'You', '', 1000, 640)], edges: [] }),
  },
];

export const BUSINESS_TEMPLATES = [
  {
    id: 'bookings',
    name: 'Bookings',
    description: 'Salon, clinic, studio or coach: understand the need, share the offer, book a slot.',
    build: () => flow([
      ['trigger', 'New DM', 'Someone messages from an ad, story or post.'],
      ['condition', 'Understand the need', 'Ask what they are looking for and their budget.'],
      ['offer', 'Share the offer', 'Send the matching product or service with price.'],
      ['action', 'Book a slot', 'Offer open times and confirm the booking.'],
      ['won', 'Customer won', 'Booking confirmed or order placed.'],
    ], [
      ['handoff', 'Hand to a person', 'Complaints, custom orders or anything the bot is unsure about.', 1, 'unsure'],
    ]),
  },
  {
    id: 'store',
    name: 'Online store',
    description: 'Product questions, size and stock, checkout link, shipping and returns.',
    build: () => flow([
      ['trigger', 'Product DM', 'Someone asks about a product from a post, reel or ad.'],
      ['condition', 'Pick the item', 'Confirm which product, size or colour they want.'],
      ['offer', 'Price & stock', 'Share the price, stock and product link.'],
      ['action', 'Send checkout link', 'Send the payment or checkout link.'],
      ['won', 'Order placed', 'Payment done and order confirmed.'],
    ], [
      ['knowledge', 'Shipping & returns', 'Delivery times, shipping cost and return policy.', 2],
      ['handoff', 'Order problems', 'Late, damaged or wrong orders go to a person.', 3, 'problem'],
      ['secret', 'Suppliers & margins', 'Never share suppliers, costs or margins.', null],
    ]),
  },
  {
    id: 'leads',
    name: 'Lead capture',
    description: 'Agency, real estate or services: qualify the lead and book a call.',
    build: () => flow([
      ['trigger', 'New inquiry', 'Someone asks about your services.'],
      ['condition', 'Qualify', 'Ask what they need, their budget and timeline.'],
      ['offer', 'Suggest a package', 'Share the package that fits, with a starting price.'],
      ['action', 'Book a call', 'Share the calendar link and confirm a time.'],
      ['won', 'Call booked', 'A discovery call is on the calendar.'],
    ], [
      ['knowledge', 'Services & past work', 'What you offer and a few past results to mention.', 2],
      ['handoff', 'Big deals', 'Large budgets or custom requests go to the owner.', 1, 'big budget'],
    ]),
  },
  {
    id: 'restaurant',
    name: 'Restaurant / cafe',
    description: 'Menu and hours, table reservations, large groups and complaints.',
    build: () => flow([
      ['trigger', 'New DM', 'Someone asks about the menu, hours or a table.'],
      ['condition', 'Dine in or order', 'Ask if they want a table, takeaway or delivery.'],
      ['action', 'Reserve a table', 'Take the date, time and number of people.'],
      ['won', 'Table booked', 'Reservation confirmed.'],
    ], [
      ['knowledge', 'Menu, hours & location', 'Opening hours, address, menu link and popular dishes.', 0],
      ['handoff', 'Events & complaints', 'Large groups, private events and complaints go to a person.', 1, 'event'],
    ]),
  },
  {
    id: 'blank',
    name: 'Blank',
    description: 'A single starting card. Build your own journey.',
    build: () => ({ nodes: [node('s0', 'trigger', 'New DM', 'Where customers come from.', 200, 300)], edges: [] }),
  },
];
