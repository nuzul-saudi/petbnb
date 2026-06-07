// Petbnb — Card
// The recurring object: paper fill, 22px radius, soft card shadow.
// `pad` toggles interior padding; `interactive` adds a gentle lift on
// hover for tappable cards. Set overflow hidden by default so cover
// photos clip to the rounding.

export function Card({
  children,
  pad = true,
  interactive = false,
  sunken = false,
  style,
  ...rest
}) {
  return (
    <div
      style={{
        background: sunken ? 'var(--surface-sunken)' : 'var(--surface-card)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: sunken ? 'none' : 'var(--shadow-card)',
        overflow: 'hidden',
        padding: pad ? 'var(--space-lg)' : 0,
        cursor: interactive ? 'pointer' : 'default',
        transition: 'box-shadow 150ms ease, transform 150ms ease',
        ...(interactive
          ? { ['--hover-shadow']: 'var(--shadow-lift)' }
          : {}),
        ...style,
      }}
      onMouseEnter={
        interactive
          ? (e) => {
              e.currentTarget.style.boxShadow = 'var(--shadow-lift)';
            }
          : undefined
      }
      onMouseLeave={
        interactive
          ? (e) => {
              e.currentTarget.style.boxShadow = 'var(--shadow-card)';
            }
          : undefined
      }
      {...rest}
    >
      {children}
    </div>
  );
}
