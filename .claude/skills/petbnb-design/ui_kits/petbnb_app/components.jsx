// Petbnb app — UI-kit cosmetic primitives.
// Self-contained recreations matching the design-system components, so
// the kit renders standalone (no bundle dependency). All styling reads
// the real CSS tokens from styles.css. Exported to window for the
// screen files.

function Btn({ label, variant = 'primary', size = 'normal', full, loading, disabled, icon, onClick }) {
  const sizes = {
    normal: { minHeight: 'var(--tap-min)', padding: '12px 24px', fontSize: 'var(--text-body-lg)' },
    compact: { minHeight: 'var(--tap-compact)', padding: '8px 14px', fontSize: 'var(--text-body-sm)' },
  };
  const v = {
    primary: { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--text-on-accent)' },
    secondary: { background: 'transparent', borderColor: 'var(--accent-ink)', color: 'var(--accent-ink)' },
    destructive: { background: 'transparent', borderColor: 'var(--danger)', color: 'var(--danger)' },
  }[variant];
  const off = loading || disabled;
  return (
    <button onClick={off ? undefined : onClick} disabled={off}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: full ? '100%' : 'auto', ...sizes[size], ...v,
        fontFamily: 'var(--font-body)', fontWeight: 700, lineHeight: 1,
        borderRadius: 'var(--radius-lg)', borderWidth: 1, borderStyle: 'solid',
        cursor: off ? 'default' : 'pointer', opacity: off ? 0.5 : 1, transition: 'opacity 120ms' }}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

function Badge({ label, tone = 'neutral', color, icon }) {
  const tones = { gold: 'var(--tier-gold)', silver: 'var(--tier-silver)', bronze: 'var(--tier-bronze)',
    new: 'var(--gold)', accent: 'var(--accent)', danger: 'var(--danger)', neutral: 'var(--ink-soft)' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: color ?? tones[tone],
      color: 'var(--cream)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-micro)',
      letterSpacing: '0.5px', lineHeight: 1, padding: '4px 10px', borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap' }}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}{label}
    </span>
  );
}

function Avatar({ photoUrl, name, glyph = '🐈', size = 56, rounded = true }) {
  const base = { width: size, height: size, borderRadius: rounded ? '50%' : 'var(--radius-md)',
    background: 'var(--surface-inert)', flexShrink: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'center', overflow: 'hidden' };
  if (photoUrl) return <img src={photoUrl} alt={name ?? ''} style={{ ...base, objectFit: 'cover' }} />;
  const initial = name?.trim()?.charAt(0);
  return (
    <div style={base}>
      {initial
        ? <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: size * 0.42, color: 'var(--moss-deep)' }}>{initial}</span>
        : <span style={{ fontSize: size * 0.45 }} aria-hidden="true">{glyph}</span>}
    </div>
  );
}

function Card({ children, pad = true, onClick, interactive, style }) {
  return (
    <div onClick={onClick}
      style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-card)',
        overflow: 'hidden', padding: pad ? 'var(--space-lg)' : 0, cursor: interactive ? 'pointer' : 'default', ...style }}>
      {children}
    </div>
  );
}

function TopBar({ title, onBack, locale = 'ar' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', height: 56, padding: '0 var(--space-lg)',
      background: 'var(--surface-screen)', borderBottom: '1px solid var(--border-hairline)', flexShrink: 0 }}>
      {onBack ? (
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4,
          fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-body-md)', color: 'var(--accent)' }}>
          → رجوع
        </button>
      ) : null}
      {title ? <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-heading)', color: 'var(--moss-deep)' }}>{title}</span> : null}
      <span style={{ marginInlineStart: 'auto', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-body-sm)', color: 'var(--accent)' }}>{locale === 'ar' ? 'EN' : 'ع'}</span>
    </div>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
      fontFamily: 'var(--font-body)', fontWeight: active ? 700 : 400, fontSize: 'var(--text-caption)',
      color: active ? 'var(--text-on-accent)' : 'var(--text-muted)', background: active ? 'var(--accent)' : 'var(--surface-card)',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border-hairline)'}`, borderRadius: 'var(--radius-pill)',
      padding: '6px 14px', cursor: 'pointer' }}>
      {active ? <span aria-hidden="true">✓</span> : null}{label}
    </button>
  );
}

Object.assign(window, { Btn, Badge, Avatar, Card, TopBar, FilterChip });
