// Petbnb — AppHeader
// The 56px top bar. Tints with the active persona (cream in owner,
// honey in host) via --surface-screen. Nav items show a muted label;
// the active item bolds + takes the persona accent. A language toggle
// (ع / EN) sits at the trailing edge. Optional persona switch for
// role="both" users.

export function AppHeader({
  items = [],
  locale = 'ar',
  onLanguageToggle,
  personaToggleLabel,
  onPersonaToggle,
  pendingCount = 0,
  ...rest
}) {
  return (
    <header
      dir="rtl"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-lg)',
        height: 56,
        padding: '0 var(--space-lg)',
        background: 'var(--surface-screen)',
        borderBottom: '1px solid var(--border-hairline)',
        fontFamily: 'var(--font-body)',
      }}
      {...rest}
    >
      <nav style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
        {items.map((it, i) => (
          <button
            key={i}
            type="button"
            onClick={it.onPress}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px 0',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body-md)',
              fontWeight: it.active ? 'var(--weight-bold)' : 'var(--weight-regular)',
              color: it.active ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            {it.label}
          </button>
        ))}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginInlineStart: 'auto' }}>
        {personaToggleLabel ? (
          <button
            type="button"
            onClick={onPersonaToggle}
            style={{
              position: 'relative',
              background: 'transparent',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              fontFamily: 'var(--font-body)',
              fontWeight: 'var(--weight-bold)',
              fontSize: '11px',
              borderRadius: 'var(--radius-pill)',
              padding: '4px 12px',
              cursor: 'pointer',
            }}
          >
            {personaToggleLabel}
            {pendingCount > 0 ? (
              <span
                style={{
                  position: 'absolute',
                  top: -6,
                  insetInlineEnd: -6,
                  minWidth: 16,
                  height: 16,
                  padding: '0 4px',
                  borderRadius: 8,
                  background: 'var(--danger)',
                  color: 'var(--cream)',
                  fontSize: 9,
                  fontWeight: 'var(--weight-bold)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onLanguageToggle}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 8px',
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--weight-bold)',
            fontSize: 'var(--text-body-sm)',
            color: 'var(--accent)',
          }}
        >
          {locale === 'ar' ? 'EN' : 'ع'}
        </button>
      </div>
    </header>
  );
}
