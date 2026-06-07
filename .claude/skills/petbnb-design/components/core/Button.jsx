// Petbnb — Button
// The single button for the whole app. Three variants, two sizes.
// Accent resolves through the active persona theme via CSS custom
// properties (--accent / --accent-ink), so the same button renders
// moss in owner mode and deep-gold in host mode automatically.

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'normal',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  type = 'button',
  ...rest
}) {
  const isDisabled = disabled || loading;

  const sizes = {
    normal: { minHeight: 'var(--tap-min)', padding: '12px 24px', fontSize: 'var(--text-body-lg)' },
    compact: { minHeight: 'var(--tap-compact)', padding: '8px 12px', fontSize: 'var(--text-body-sm)' },
  };

  const variants = {
    primary: {
      background: 'var(--accent)',
      borderColor: 'var(--accent)',
      color: 'var(--text-on-accent)',
    },
    secondary: {
      background: 'transparent',
      borderColor: 'var(--accent-ink)',
      color: 'var(--accent-ink)',
    },
    destructive: {
      background: 'transparent',
      borderColor: 'var(--danger)',
      color: 'var(--danger)',
    },
  };

  const v = variants[variant] ?? variants.primary;
  const s = sizes[size] ?? sizes.normal;

  return (
    <button
      type={type}
      onClick={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-sm)',
        width: fullWidth ? '100%' : 'auto',
        minHeight: s.minHeight,
        padding: s.padding,
        fontSize: s.fontSize,
        fontFamily: 'var(--font-body)',
        fontWeight: 'var(--weight-bold)',
        lineHeight: 1,
        borderRadius: 'var(--radius-lg)',
        borderWidth: '1px',
        borderStyle: 'solid',
        cursor: isDisabled ? 'default' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        transition: 'opacity 120ms ease',
        WebkitTapHighlightColor: 'transparent',
        ...v,
      }}
      {...rest}
    >
      {loading ? <Spinner color={v.color} /> : icon ? <span aria-hidden="true">{icon}</span> : null}
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </button>
  );
}

function Spinner({ color }) {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        border: `2px solid ${color}`,
        borderTopColor: 'transparent',
        display: 'inline-block',
        animation: 'petbnb-spin 0.7s linear infinite',
      }}
    >
      <style>{'@keyframes petbnb-spin{to{transform:rotate(360deg)}}'}</style>
    </span>
  );
}
