// Petbnb — Badge
// Small pill for host tiers, the honest "new" marker, and status.
// Micro type, letter-spaced, cream label on a coloured fill. Never
// used to fabricate stats — "جديد" is shown for hosts with no
// completed bookings rather than invented numbers.

const TONES = {
  gold: 'var(--tier-gold)',
  silver: 'var(--tier-silver)',
  bronze: 'var(--tier-bronze)',
  new: 'var(--gold)',
  accent: 'var(--accent)',
  danger: 'var(--danger)',
  neutral: 'var(--ink-soft)',
};

export function Badge({ label, tone = 'neutral', color, icon, ...rest }) {
  const bg = color ?? TONES[tone] ?? TONES.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: bg,
        color: 'var(--cream)',
        fontFamily: 'var(--font-body)',
        fontWeight: 'var(--weight-bold)',
        fontSize: 'var(--text-micro)',
        letterSpacing: 'var(--tracking-badge)',
        lineHeight: 1,
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        whiteSpace: 'nowrap',
      }}
      {...rest}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {label}
    </span>
  );
}
