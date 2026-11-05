'use client';

import React from 'react';

/**
 * One full-screen layout for 404, crash and no-internet screens.
 * Styles: .status-screen-* in globals.css.
 *   actions: [{ label, onClick, href, variant: 'primary' | 'ghost', icon }]
 */
export default function StatusScreen({ icon: Icon, code, title, message, actions = [], detail, overlay = false }) {
  return (
    <div className={`status-screen ${overlay ? 'status-screen-overlay' : ''}`} role={overlay ? 'alertdialog' : 'main'} aria-modal={overlay || undefined} aria-labelledby="status-screen-title">
      <div className="status-screen-card">
        {Icon && <div className="status-screen-icon"><Icon size={30} strokeWidth={2} /></div>}
        {code && <div className="status-screen-code">{code}</div>}
        <h1 id="status-screen-title" className="status-screen-title">{title}</h1>
        {message && <p className="status-screen-message">{message}</p>}
        {actions.length > 0 && (
          <div className="status-screen-actions">
            {actions.map(({ label, onClick, href, variant = 'primary', icon: AIcon, disabled }) => {
              const cls = `dialog-btn ${variant === 'ghost' ? 'dialog-btn-ghost' : 'dialog-btn-primary'}`;
              const inner = <>{AIcon && <AIcon size={16} />}{label}</>;
              return href
                ? <a key={label} href={href} className={cls}>{inner}</a>
                : <button key={label} type="button" className={cls} onClick={onClick} disabled={disabled}>{inner}</button>;
            })}
          </div>
        )}
        {detail && <pre className="status-screen-detail">{detail}</pre>}
      </div>
    </div>
  );
}
