'use client';

// Person page: "What the AI knows". What it just learned from the chat (with when), then every fact newest first,
// searchable, with remove and add. Keyed by person on the page, so the search clears when you switch people.
import { useState } from 'react';
import { X } from 'lucide-react';

const ago = (at) => {
  const s = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const isFresh = (at) => Date.now() - new Date(at).getTime() < 6 * 3600 * 1000;

export default function PersonFacts({ person, personName, onAdd, onRemove }) {
  const [factSearch, setFactSearch] = useState('');
  const [newFact, setNewFact] = useState('');
  const allFacts = [...(person.facts || person.lore || [])].reverse();
  const factQuery = factSearch.trim().toLowerCase();
  const shownFacts = factQuery ? allFacts.filter(f => String(f).toLowerCase().includes(factQuery)) : allFacts;
  const learned = (person.learned || []).filter(l => l && l.fact);

  const submit = (e) => {
    e.preventDefault();
    if (!newFact.trim()) return;
    onAdd(newFact);
    setNewFact('');
  };

  return (
    <section className="person-glass-card">
      <h2 className="person-card-title">What the AI knows</h2>
      <div className="person-card-sub person-live">
        <span className="person-live-dot" aria-hidden="true" />
        {allFacts.length.toLocaleString()} fact{allFacts.length === 1 ? '' : 's'} · newest first · updates live
      </div>

      {(learned.length > 0 || person.chatSummary) && !factQuery && (
        <div className="person-learned" aria-live="polite">
          <div className="person-learned-head">
            <span>Just learned from your chat</span>
            {learned[0]?.at && <span className="person-learned-when">{ago(learned[0].at)}</span>}
          </div>
          {person.chatSummary && <p className="person-learned-summary">{person.chatSummary}</p>}
          {learned.slice(0, 5).map(l => (
            <div key={`${l.at}-${l.fact}`} className={`person-learned-row${isFresh(l.at) ? ' is-fresh' : ''}`}>
              <span className="person-learned-fact">{l.fact}</span>
              {isFresh(l.at) ? <span className="person-learned-new">New</span> : <span className="person-learned-when">{ago(l.at)}</span>}
            </div>
          ))}
        </div>
      )}

      <input
        type="search"
        className="person-search"
        placeholder={`Search ${allFacts.length.toLocaleString()} facts`}
        aria-label="Search facts"
        value={factSearch}
        onChange={e => setFactSearch(e.target.value)}
      />

      <div className="person-facts">
        {allFacts.length === 0 ? (
          <div className="person-empty">No facts yet. The AI learns them from your DMs, or add one below.</div>
        ) : shownFacts.length === 0 ? (
          <div className="person-empty">No facts match “{factSearch.trim()}”.</div>
        ) : (
          shownFacts.map((fact, i) => (
            <div key={`${i}-${fact}`} className="person-fact">
              <span>{fact}</span>
              <button type="button" className="person-x" onClick={() => onRemove(fact)} aria-label="Remove this fact" title="Remove this fact">
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <form className="person-inline-form" onSubmit={submit}>
        <input
          type="text"
          placeholder={`Tell the AI something new about ${personName}`}
          aria-label="New fact"
          value={newFact}
          onChange={e => setNewFact(e.target.value)}
        />
        <button type="submit" className="person-light-btn" disabled={!newFact.trim()}>Add</button>
      </form>
    </section>
  );
}
