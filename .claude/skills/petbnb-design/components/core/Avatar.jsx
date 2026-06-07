// Petbnb — Avatar
// Host / pet avatar with a fallback hierarchy:
//   1. photoUrl  → the real photo
//   2. name      → first initial in Reem Kufi on a whisper well
//   3. glyph     → 🐈 (pets) on a tinted square
// Circular by default; pass rounded={false} for the square pet thumb.

export function Avatar({
  photoUrl,
  name,
  glyph = '🐈',
  size = 56,
  rounded = true,
  ...rest
}) {
  const radius = rounded ? '50%' : 'var(--radius-md)';
  const base = {
    width: size,
    height: size,
    borderRadius: radius,
    background: 'var(--surface-inert)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name ?? ''}
        style={{ ...base, objectFit: 'cover' }}
        {...rest}
      />
    );
  }

  const initial = name?.trim()?.charAt(0);
  return (
    <div style={base} {...rest}>
      {initial ? (
        <span
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 'var(--weight-bold)',
            fontSize: size * 0.42,
            color: 'var(--moss-deep)',
          }}
        >
          {initial}
        </span>
      ) : (
        <span style={{ fontSize: size * 0.45 }} aria-hidden="true">{glyph}</span>
      )}
    </div>
  );
}
