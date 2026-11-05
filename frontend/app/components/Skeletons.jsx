/**
 * Page skeletons: grey placeholder shapes that match each page's real layout,
 * shown instantly while a route's code or its data is still loading.
 * Used by every route's loading.jsx and by pages waiting on their first fetch.
 * Server-safe (no hooks), so loading.jsx files can render it straight away.
 */

export function Sk({ w = '100%', h = 14, r = 6, style, className = '' }) {
  return <div className={`skeleton ${className}`} style={{ width: w, height: h, borderRadius: r, flexShrink: 0, ...style }} />;
}

function Header({ actions = 1 }) {
  return (
    <div className="sk-header">
      <div className="sk-col" style={{ gap: 10, flex: 1, minWidth: 0 }}>
        <Sk w="min(260px, 60%)" h={30} r={8} />
        <Sk w="min(380px, 85%)" h={14} />
      </div>
      <div className="sk-row" style={{ gap: 10 }}>
        {Array.from({ length: actions }, (_, i) => <Sk key={i} w={112} h={40} r={999} />)}
      </div>
    </div>
  );
}

function Chips({ n = 5 }) {
  return (
    <div className="sk-row sk-chips">
      {Array.from({ length: n }, (_, i) => <Sk key={i} w={i === 0 ? 52 : 78 + (i % 3) * 14} h={34} r={999} />)}
    </div>
  );
}

function StatTiles({ n = 4 }) {
  return (
    <div className="sk-tiles">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="sk-card sk-col" style={{ gap: 12 }}>
          <Sk w="45%" h={12} />
          <Sk w="60%" h={28} r={8} />
        </div>
      ))}
    </div>
  );
}

function ListRows({ n = 8, avatar = true }) {
  return (
    <div className="sk-card sk-col" style={{ gap: 0, padding: 0 }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="sk-list-row">
          {avatar && <Sk w={40} h={40} r={999} />}
          <div className="sk-col" style={{ gap: 8, flex: 1, minWidth: 0 }}>
            <Sk w={`${42 + ((i * 13) % 30)}%`} h={14} />
            <Sk w={`${22 + ((i * 7) % 20)}%`} h={11} />
          </div>
          <Sk w={72} h={24} r={999} className="sk-hide-sm" />
          <Sk w={28} h={14} />
        </div>
      ))}
    </div>
  );
}

function CardGrid({ n = 8, square = false }) {
  return (
    <div className="sk-grid">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="sk-card sk-col" style={{ gap: 12 }}>
          {square ? <Sk w="100%" h={0} r={12} style={{ paddingBottom: '100%' }} /> : <Sk w={56} h={56} r={999} />}
          <Sk w="70%" h={14} />
          <Sk w="45%" h={11} />
        </div>
      ))}
    </div>
  );
}

function FormBlocks({ sections = 3 }) {
  return (
    <div className="sk-col" style={{ gap: 18 }}>
      {Array.from({ length: sections }, (_, s) => (
        <div key={s} className="sk-card sk-col" style={{ gap: 16 }}>
          <Sk w="min(220px, 50%)" h={18} r={6} />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="sk-form-row">
              <div className="sk-col" style={{ gap: 8, flex: 1, minWidth: 0 }}>
                <Sk w={`${30 + i * 12}%`} h={13} />
                <Sk w={`${50 + i * 9}%`} h={11} />
              </div>
              <Sk w={i === 1 ? 46 : 'min(220px, 38%)'} h={i === 1 ? 26 : 40} r={i === 1 ? 999 : 10} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function HomeBody() {
  return (
    <>
      <div className="sk-scroll-row">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="sk-spot">
            <Sk w={64} h={64} r={999} />
            <div className="sk-col" style={{ gap: 8, marginTop: 'auto' }}>
              <Sk w="70%" h={16} />
              <Sk w="50%" h={12} />
            </div>
          </div>
        ))}
      </div>
      <Sk w={140} h={20} style={{ margin: '26px 0 14px' }} />
      <StatTiles />
      <Sk w={170} h={20} style={{ margin: '26px 0 14px' }} />
      <div className="sk-scroll-row">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="sk-col" style={{ gap: 8, alignItems: 'center', width: 104, flexShrink: 0 }}>
            <Sk w={96} h={96} r={999} />
            <Sk w={70} h={12} />
            <Sk w={50} h={10} />
          </div>
        ))}
      </div>
    </>
  );
}

function ChatBody() {
  return (
    <div className="sk-card sk-col" style={{ gap: 14, minHeight: 360 }}>
      {Array.from({ length: 6 }, (_, i) => (
        <Sk key={i} w={`${36 + ((i * 17) % 34)}%`} h={38} r={16} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start' }} />
      ))}
      <Sk w="100%" h={46} r={999} style={{ marginTop: 'auto' }} />
    </div>
  );
}

function DashboardBody() {
  return (
    <>
      <StatTiles />
      <div className="sk-two">
        <div className="sk-card sk-col" style={{ gap: 14 }}>
          <Sk w="40%" h={16} />
          <Sk w="100%" h={220} r={12} />
        </div>
        <div className="sk-card sk-col" style={{ gap: 14 }}>
          <Sk w="50%" h={16} />
          <Sk w="100%" h={220} r={12} />
        </div>
      </div>
      <ListRows n={5} />
    </>
  );
}

/** The person page hero + tabs (used while a deep-linked contact is still loading). */
function PersonBody() {
  return (
    <>
      <Sk w={44} h={44} r={999} style={{ marginBottom: 16 }} />
      <div className="sk-row" style={{ gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Sk w={132} h={132} r={999} />
        <div className="sk-col" style={{ gap: 12, flex: 1, minWidth: 200 }}>
          <Sk w={90} h={24} r={999} />
          <Sk w="min(340px, 80%)" h={40} r={10} />
          <Sk w="min(220px, 60%)" h={14} />
        </div>
      </div>
      <div className="sk-row" style={{ gap: 12, margin: '24px 0' }}>
        <Sk w={56} h={56} r={999} />
        <Sk w={120} h={40} r={999} />
        <Sk w={120} h={40} r={999} />
      </div>
      <Chips n={4} />
      <FormBlocks sections={2} />
    </>
  );
}

const BODIES = {
  home: () => <HomeBody />,
  table: () => (<><Chips /><ListRows /></>),
  grid: () => (<><Chips n={4} /><CardGrid square /></>),
  cards: () => (<><Chips n={4} /><CardGrid /></>),
  form: () => <FormBlocks />,
  dashboard: () => <DashboardBody />,
  chat: () => <ChatBody />,
  person: () => <PersonBody />,
};

/**
 * Full-page skeleton.
 * variant: home | table | grid | cards | form | dashboard | chat | person
 * header: false hides the title block (when the page already shows its own header).
 * bare: no page padding, for use inside a page that already has it.
 */
export default function PageSkeleton({ variant = 'cards', header = true, bare = false, label = 'Loading' }) {
  const Body = BODIES[variant] || BODIES.cards;
  return (
    <div className={bare ? 'sk-page' : 'page-container sk-page'} role="status" aria-busy="true" aria-label={label}>
      {header && variant !== 'person' && (variant === 'home'
        ? <div className="sk-row" style={{ justifyContent: 'space-between', marginBottom: 20 }}><Sk w="min(280px, 65%)" h={36} r={10} /><Sk w={44} h={44} r={999} /></div>
        : <Header />)}
      <Body />
      <span className="sr-only">{label}…</span>
    </div>
  );
}
