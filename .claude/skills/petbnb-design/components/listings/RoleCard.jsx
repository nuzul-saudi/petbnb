// Petbnb — RoleCard
// The role chooser card (owner / host / both) from onboarding + the
// profile role switcher. Glyph + title + description, with a ✓ when
// selected. Selected = 2px accent border + whisper fill. Composes Card.

export function RoleCard({ role, title, desc, icon, selected = false, onPress, ...rest }) {
  const glyph = icon ?? { owner: '🐈', host: '🏠', both: '⚭' }[role] ?? '🐈';
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={selected}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)',
        width: '100%',
        textAlign: 'start',
        background: selected ? 'var(--surface-inert)' : 'var(--surface-card)',
        border: `2px solid ${selected ? 'var(--accent)' : 'var(--border-hairline)'}`,
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-card)',
        padding: 'var(--space-lg)',
        cursor: 'pointer',
        direction: 'rtl',
        transition: 'border-color 120ms ease, background 120ms ease',
      }}
      {...rest}
    >
      <span style={{ fontSize: 32, lineHeight: 1 }} aria-hidden="true">{glyph}</span>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)', color: 'var(--ink)' }}>{title}</span>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>{desc}</span>
      </span>
      {selected ? (
        <span style={{ fontSize: 22, color: 'var(--accent)', fontWeight: 'var(--weight-bold)' }} aria-hidden="true">✓</span>
      ) : null}
    </button>
  );
}
