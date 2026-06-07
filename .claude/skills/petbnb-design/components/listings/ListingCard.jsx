// Petbnb — ListingCard
// The sitter-first listing card. The HOST is the hero: avatar, name,
// verified ✓, tier, gender, neighborhood. The home photo is secondary
// evidence below. Honest "جديد" badge for hosts with no completed
// stays — never fabricated stats. Composes Avatar + Badge + Card.

import { Card } from '../core/Card.jsx';
import { Avatar } from '../core/Avatar.jsx';
import { Badge } from '../core/Badge.jsx';

export function ListingCard({
  hostName,
  hostPhoto,
  verified = true,
  tier = 'bronze',
  gender = 'female',
  district,
  city,
  distanceKm,
  title,
  price,
  maxPets = 1,
  coverPhoto,
  isNew = true,
  statusBadge,
  onPress,
  ...rest
}) {
  const tierLabel = { gold: 'ذهبي', silver: 'فضي', bronze: 'برونزي' }[tier] ?? 'برونزي';
  const genderLabel = gender === 'female' ? 'مضيفة' : 'مضيف';

  return (
    <Card pad={false} interactive onClick={onPress} style={{ direction: 'rtl' }} {...rest}>
      {/* Sitter header — the hero */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-lg)' }}>
        <Avatar photoUrl={hostPhoto} name={hostName} size={56} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
            <span
              style={{
                flex: 1,
                fontFamily: 'var(--font-heading)',
                fontWeight: 'var(--weight-bold)',
                fontSize: 'var(--text-subhead)',
                color: 'var(--moss-deep)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {hostName}
            </span>
            {verified ? (
              <span style={{ color: 'var(--verified)', fontWeight: 'var(--weight-bold)', fontSize: 14 }} aria-label="موثّق">✓</span>
            ) : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            <Badge label={tierLabel} tone={tier} />
            <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>
              {genderLabel} • 📍 {district}{city ? `، ${city}` : ''}
              {distanceKm != null ? ` · ${distanceKm} كم` : ''}
            </span>
          </div>
          <div>
            {statusBadge ? (
              <Badge label={statusBadge.label} color={statusBadge.color} />
            ) : isNew ? (
              <Badge label="جديد" tone="new" />
            ) : null}
          </div>
        </div>
      </div>

      {/* Secondary home photo */}
      {coverPhoto ? (
        <img src={coverPhoto} alt="" style={{ width: '100%', aspectRatio: '5 / 2', objectFit: 'cover', display: 'block', background: 'var(--surface-inert)' }} />
      ) : (
        <div style={{ width: '100%', aspectRatio: '5 / 2', background: 'var(--surface-inert)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, opacity: 0.4 }}>🏠</div>
      )}

      {/* Footer: title + price + capacity */}
      <div style={{ padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
        {title ? (
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-body-md)', color: 'var(--ink)' }}>{title}</span>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)', color: 'var(--moss-deep)' }}>
            {price} ر.س <span style={{ fontWeight: 'var(--weight-regular)', fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>/ ليلة</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-body-md)', color: 'var(--text-muted)' }}>
            🐈 {maxPets}
          </span>
        </div>
      </div>
    </Card>
  );
}
