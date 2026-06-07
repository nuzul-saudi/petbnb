// Petbnb — FilterChip
// The toggleable filter pill (e.g. "مضيفات فقط" female-hosts-only).
// Inert: paper fill + whisper border + muted label. Active: fills with
// the persona accent, label flips to cream + bold, with a leading ✓.

export function FilterChip({ label, active = false, onPress, ...rest }) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={active}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontFamily: 'var(--font-body)',
        fontWeight: active ? 'var(--weight-bold)' : 'var(--weight-regular)',
        fontSize: 'var(--text-caption)',
        color: active ? 'var(--text-on-accent)' : 'var(--text-muted)',
        background: active ? 'var(--accent)' : 'var(--surface-card)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-hairline)'}`,
        borderRadius: 'var(--radius-pill)',
        padding: '6px 14px',
        cursor: 'pointer',
        transition: 'background 120ms ease, color 120ms ease',
        WebkitTapHighlightColor: 'transparent',
      }}
      {...rest}
    >
      {active ? <span aria-hidden="true">✓</span> : null}
      {label}
    </button>
  );
}
