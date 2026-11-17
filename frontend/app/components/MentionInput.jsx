'use client';

import { forwardRef, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';

/**
 * A text input where typing "@" lets you pick one of your people. It inserts "@handle" (or
 * "@[Name]" when they have no Instagram handle); the server turns that into "Name (@handle)" so the
 * AI links the right person (see lib/mentions.js). Drop-in for <input>: same value / onChange(e) /
 * onKeyDown props, everything else is passed through.
 */
const tokenOf = p => (p.handle ? `@${String(p.handle).replace(/^@+/, '')}` : `@[${p.name}]`);

const MentionInput = forwardRef(function MentionInput({ value = '', onChange, onKeyDown, className = '', exclude = '', ...rest }, outerRef) {
  const { nodes } = useApp();
  const innerRef = useRef(null);
  const ref = outerRef || innerRef;
  const [query, setQuery] = useState(null); // text after "@", or null when not typing a mention
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return (nodes || [])
      .filter(p => p?.name && String(p.senderId || '') !== String(exclude || '') && !/^test_/.test(String(p.senderId || '')))
      .filter(p => !q || `${p.name} ${p.handle || ''}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [nodes, query, exclude]);

  const readQuery = (text, caret) => {
    const m = String(text).slice(0, caret).match(/(?:^|\s)@([\p{L}\p{N}._]{0,30})$/u);
    setQuery(m ? m[1] : null);
    setActive(0);
  };
  const emit = text => onChange?.({ target: { value: text } });

  const pick = p => {
    const el = ref.current;
    const caret = el?.selectionStart ?? String(value).length;
    const before = String(value).slice(0, caret).replace(/@[\p{L}\p{N}._]{0,30}$/u, `${tokenOf(p)} `);
    const next = before + String(value).slice(caret);
    emit(next);
    setQuery(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange?.(before.length, before.length); });
  };

  const open = query !== null && matches.length > 0;
  return (
    <span className="mention-wrap">
      <input
        {...rest}
        ref={ref}
        className={className}
        value={value}
        autoComplete="off"
        onChange={e => { onChange?.(e); readQuery(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
        onKeyDown={e => {
          if (open) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % matches.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + matches.length) % matches.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[active]); return; }
            if (e.key === 'Escape') { e.preventDefault(); setQuery(null); return; }
          }
          onKeyDown?.(e);
        }}
        onBlur={e => { setTimeout(() => setQuery(null), 120); rest.onBlur?.(e); }}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && (
        <ul className="mention-menu" role="listbox" aria-label="Tag someone">
          {matches.map((p, i) => (
            <li key={p.senderId || p.id || p.name} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'on' : ''} onMouseDown={e => { e.preventDefault(); pick(p); }} onMouseEnter={() => setActive(i)}>
                {p.profilePic ? <img src={p.profilePic} alt="" referrerPolicy="no-referrer" /> : <span className="mention-av">{(p.name || '?')[0]}</span>}
                <span className="mention-name"><b>{p.name}</b>{p.handle && <small>@{String(p.handle).replace(/^@+/, '')}</small>}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
});

export default MentionInput;
