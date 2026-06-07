/* @ds-bundle: {"format":3,"namespace":"PetbnbDesignSystem_4fc49b","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"FilterChip","sourcePath":"components/forms/FilterChip.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"ListingCard","sourcePath":"components/listings/ListingCard.jsx"},{"name":"RoleCard","sourcePath":"components/listings/RoleCard.jsx"},{"name":"AppHeader","sourcePath":"components/navigation/AppHeader.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"47bf73d0e51e","components/core/Badge.jsx":"39b35827cd99","components/core/Button.jsx":"66fee1264cb3","components/core/Card.jsx":"449c59a524b1","components/forms/FilterChip.jsx":"a7fe687931db","components/forms/Input.jsx":"d762c6f0e73c","components/listings/ListingCard.jsx":"0485f7d6ea9e","components/listings/RoleCard.jsx":"4ed9f8b119e2","components/navigation/AppHeader.jsx":"17cccb01ede6","ui_kits/petbnb_app/components.jsx":"c6c5cf5d5625","ui_kits/petbnb_app/screens.jsx":"e172a00af7f3"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.PetbnbDesignSystem_4fc49b = window.PetbnbDesignSystem_4fc49b || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Petbnb — Avatar
// Host / pet avatar with a fallback hierarchy:
//   1. photoUrl  → the real photo
//   2. name      → first initial in Reem Kufi on a whisper well
//   3. glyph     → 🐈 (pets) on a tinted square
// Circular by default; pass rounded={false} for the square pet thumb.

function Avatar({
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
    overflow: 'hidden'
  };
  if (photoUrl) {
    return /*#__PURE__*/React.createElement("img", _extends({
      src: photoUrl,
      alt: name ?? '',
      style: {
        ...base,
        objectFit: 'cover'
      }
    }, rest));
  }
  const initial = name?.trim()?.charAt(0);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: base
  }, rest), initial ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-heading)',
      fontWeight: 'var(--weight-bold)',
      fontSize: size * 0.42,
      color: 'var(--moss-deep)'
    }
  }, initial) : /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: size * 0.45
    },
    "aria-hidden": "true"
  }, glyph));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
  neutral: 'var(--ink-soft)'
};
function Badge({
  label,
  tone = 'neutral',
  color,
  icon,
  ...rest
}) {
  const bg = color ?? TONES[tone] ?? TONES.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
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
      whiteSpace: 'nowrap'
    }
  }, rest), icon ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, icon) : null, label);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Petbnb — Button
// The single button for the whole app. Three variants, two sizes.
// Accent resolves through the active persona theme via CSS custom
// properties (--accent / --accent-ink), so the same button renders
// moss in owner mode and deep-gold in host mode automatically.

function Button({
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
    normal: {
      minHeight: 'var(--tap-min)',
      padding: '12px 24px',
      fontSize: 'var(--text-body-lg)'
    },
    compact: {
      minHeight: 'var(--tap-compact)',
      padding: '8px 12px',
      fontSize: 'var(--text-body-sm)'
    }
  };
  const variants = {
    primary: {
      background: 'var(--accent)',
      borderColor: 'var(--accent)',
      color: 'var(--text-on-accent)'
    },
    secondary: {
      background: 'transparent',
      borderColor: 'var(--accent-ink)',
      color: 'var(--accent-ink)'
    },
    destructive: {
      background: 'transparent',
      borderColor: 'var(--danger)',
      color: 'var(--danger)'
    }
  };
  const v = variants[variant] ?? variants.primary;
  const s = sizes[size] ?? sizes.normal;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    onClick: isDisabled ? undefined : onPress,
    disabled: isDisabled,
    "aria-busy": loading || undefined,
    style: {
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
      ...v
    }
  }, rest), loading ? /*#__PURE__*/React.createElement(Spinner, {
    color: v.color
  }) : icon ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, icon) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, label));
}
function Spinner({
  color
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 14,
      borderRadius: '50%',
      border: `2px solid ${color}`,
      borderTopColor: 'transparent',
      display: 'inline-block',
      animation: 'petbnb-spin 0.7s linear infinite'
    }
  }, /*#__PURE__*/React.createElement("style", null, '@keyframes petbnb-spin{to{transform:rotate(360deg)}}'));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Petbnb — Card
// The recurring object: paper fill, 22px radius, soft card shadow.
// `pad` toggles interior padding; `interactive` adds a gentle lift on
// hover for tappable cards. Set overflow hidden by default so cover
// photos clip to the rounding.

function Card({
  children,
  pad = true,
  interactive = false,
  sunken = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: sunken ? 'var(--surface-sunken)' : 'var(--surface-card)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: sunken ? 'none' : 'var(--shadow-card)',
      overflow: 'hidden',
      padding: pad ? 'var(--space-lg)' : 0,
      cursor: interactive ? 'pointer' : 'default',
      transition: 'box-shadow 150ms ease, transform 150ms ease',
      ...(interactive ? {
        ['--hover-shadow']: 'var(--shadow-lift)'
      } : {}),
      ...style
    },
    onMouseEnter: interactive ? e => {
      e.currentTarget.style.boxShadow = 'var(--shadow-lift)';
    } : undefined,
    onMouseLeave: interactive ? e => {
      e.currentTarget.style.boxShadow = 'var(--shadow-card)';
    } : undefined
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/forms/FilterChip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Petbnb — FilterChip
// The toggleable filter pill (e.g. "مضيفات فقط" female-hosts-only).
// Inert: paper fill + whisper border + muted label. Active: fills with
// the persona accent, label flips to cream + bold, with a leading ✓.

function FilterChip({
  label,
  active = false,
  onPress,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: onPress,
    "aria-pressed": active,
    style: {
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
      WebkitTapHighlightColor: 'transparent'
    }
  }, rest), active ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, "\u2713") : null, label);
}
Object.assign(__ds_scope, { FilterChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/FilterChip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Petbnb — Input
// Text field matching the in-app style: paper fill, whisper hairline,
// 16px radius, Tajawal. RTL by default. Supports an optional label and
// a helper / error line. Focus thickens the border to the accent.

function Input({
  label,
  value,
  onChange,
  placeholder,
  helper,
  error,
  type = 'text',
  disabled = false,
  id,
  ...rest
}) {
  const inputId = id ?? (label ? `in-${label}` : undefined);
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xs)'
    }
  }, label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-caption)',
      color: 'var(--text-body)'
    }
  }, label) : null, /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    type: type,
    value: value,
    disabled: disabled,
    placeholder: placeholder,
    onChange: onChange ? e => onChange(e.target.value) : undefined,
    dir: "auto",
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-body-lg)',
      color: 'var(--text-body)',
      background: 'var(--surface-card)',
      border: `1px solid ${error ? 'var(--danger)' : 'var(--border-hairline)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '12px 16px',
      minHeight: 'var(--tap-min)',
      outline: 'none',
      opacity: disabled ? 0.5 : 1,
      transition: 'border-color 120ms ease'
    },
    onFocus: e => {
      if (!error) e.target.style.borderColor = 'var(--accent)';
    },
    onBlur: e => {
      if (!error) e.target.style.borderColor = 'var(--border-hairline)';
    }
  }, rest)), error || helper ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-caption)',
      color: error ? 'var(--danger)' : 'var(--text-muted)'
    }
  }, error ?? helper) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/listings/ListingCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Petbnb — ListingCard
// The sitter-first listing card. The HOST is the hero: avatar, name,
// verified ✓, tier, gender, neighborhood. The home photo is secondary
// evidence below. Honest "جديد" badge for hosts with no completed
// stays — never fabricated stats. Composes Avatar + Badge + Card.

function ListingCard({
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
  const tierLabel = {
    gold: 'ذهبي',
    silver: 'فضي',
    bronze: 'برونزي'
  }[tier] ?? 'برونزي';
  const genderLabel = gender === 'female' ? 'مضيفة' : 'مضيف';
  return /*#__PURE__*/React.createElement(__ds_scope.Card, _extends({
    pad: false,
    interactive: true,
    onClick: onPress,
    style: {
      direction: 'rtl'
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    photoUrl: hostPhoto,
    name: hostName,
    size: 56
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xs)',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-xs)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-heading)',
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-subhead)',
      color: 'var(--moss-deep)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, hostName), verified ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--verified)',
      fontWeight: 'var(--weight-bold)',
      fontSize: 14
    },
    "aria-label": "\u0645\u0648\u062B\u0651\u0642"
  }, "\u2713") : null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-sm)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    label: tierLabel,
    tone: tier
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-caption)',
      color: 'var(--text-muted)'
    }
  }, genderLabel, " \u2022 \uD83D\uDCCD ", district, city ? `، ${city}` : '', distanceKm != null ? ` · ${distanceKm} كم` : '')), /*#__PURE__*/React.createElement("div", null, statusBadge ? /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    label: statusBadge.label,
    color: statusBadge.color
  }) : isNew ? /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    label: "\u062C\u062F\u064A\u062F",
    tone: "new"
  }) : null))), coverPhoto ? /*#__PURE__*/React.createElement("img", {
    src: coverPhoto,
    alt: "",
    style: {
      width: '100%',
      aspectRatio: '5 / 2',
      objectFit: 'cover',
      display: 'block',
      background: 'var(--surface-inert)'
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      aspectRatio: '5 / 2',
      background: 'var(--surface-inert)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 44,
      opacity: 0.4
    }
  }, "\uD83C\uDFE0"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-lg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xs)'
    }
  }, title ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-body-md)',
      color: 'var(--ink)'
    }
  }, title) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-sm)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-subhead)',
      color: 'var(--moss-deep)'
    }
  }, price, " \u0631.\u0633 ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--weight-regular)',
      fontSize: 'var(--text-caption)',
      color: 'var(--text-muted)'
    }
  }, "/ \u0644\u064A\u0644\u0629")), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-body-md)',
      color: 'var(--text-muted)'
    }
  }, "\uD83D\uDC08 ", maxPets))));
}
Object.assign(__ds_scope, { ListingCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/listings/ListingCard.jsx", error: String((e && e.message) || e) }); }

// components/listings/RoleCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Petbnb — RoleCard
// The role chooser card (owner / host / both) from onboarding + the
// profile role switcher. Glyph + title + description, with a ✓ when
// selected. Selected = 2px accent border + whisper fill. Composes Card.

function RoleCard({
  role,
  title,
  desc,
  icon,
  selected = false,
  onPress,
  ...rest
}) {
  const glyph = icon ?? {
    owner: '🐈',
    host: '🏠',
    both: '⚭'
  }[role] ?? '🐈';
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: onPress,
    "aria-pressed": selected,
    style: {
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
      transition: 'border-color 120ms ease, background 120ms ease'
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 32,
      lineHeight: 1
    },
    "aria-hidden": "true"
  }, glyph), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-subhead)',
      color: 'var(--ink)'
    }
  }, title), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-body-sm)',
      color: 'var(--text-muted)'
    }
  }, desc)), selected ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 22,
      color: 'var(--accent)',
      fontWeight: 'var(--weight-bold)'
    },
    "aria-hidden": "true"
  }, "\u2713") : null);
}
Object.assign(__ds_scope, { RoleCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/listings/RoleCard.jsx", error: String((e && e.message) || e) }); }

// components/navigation/AppHeader.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Petbnb — AppHeader
// The 56px top bar. Tints with the active persona (cream in owner,
// honey in host) via --surface-screen. Nav items show a muted label;
// the active item bolds + takes the persona accent. A language toggle
// (ع / EN) sits at the trailing edge. Optional persona switch for
// role="both" users.

function AppHeader({
  items = [],
  locale = 'ar',
  onLanguageToggle,
  personaToggleLabel,
  onPersonaToggle,
  pendingCount = 0,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("header", _extends({
    dir: "rtl",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-lg)',
      height: 56,
      padding: '0 var(--space-lg)',
      background: 'var(--surface-screen)',
      borderBottom: '1px solid var(--border-hairline)',
      fontFamily: 'var(--font-body)'
    }
  }, rest), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-lg)'
    }
  }, items.map((it, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    type: "button",
    onClick: it.onPress,
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '8px 0',
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-body-md)',
      fontWeight: it.active ? 'var(--weight-bold)' : 'var(--weight-regular)',
      color: it.active ? 'var(--accent)' : 'var(--text-muted)'
    }
  }, it.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-sm)',
      marginInlineStart: 'auto'
    }
  }, personaToggleLabel ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onPersonaToggle,
    style: {
      position: 'relative',
      background: 'transparent',
      border: '1px solid var(--accent)',
      color: 'var(--accent)',
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-bold)',
      fontSize: '11px',
      borderRadius: 'var(--radius-pill)',
      padding: '4px 12px',
      cursor: 'pointer'
    }
  }, personaToggleLabel, pendingCount > 0 ? /*#__PURE__*/React.createElement("span", {
    style: {
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
      justifyContent: 'center'
    }
  }, pendingCount > 9 ? '9+' : pendingCount) : null) : null, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onLanguageToggle,
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '4px 8px',
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-body-sm)',
      color: 'var(--accent)'
    }
  }, locale === 'ar' ? 'EN' : 'ع')));
}
Object.assign(__ds_scope, { AppHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/AppHeader.jsx", error: String((e && e.message) || e) }); }

// ui_kits/petbnb_app/components.jsx
try { (() => {
// Petbnb app — UI-kit cosmetic primitives.
// Self-contained recreations matching the design-system components, so
// the kit renders standalone (no bundle dependency). All styling reads
// the real CSS tokens from styles.css. Exported to window for the
// screen files.

function Btn({
  label,
  variant = 'primary',
  size = 'normal',
  full,
  loading,
  disabled,
  icon,
  onClick
}) {
  const sizes = {
    normal: {
      minHeight: 'var(--tap-min)',
      padding: '12px 24px',
      fontSize: 'var(--text-body-lg)'
    },
    compact: {
      minHeight: 'var(--tap-compact)',
      padding: '8px 14px',
      fontSize: 'var(--text-body-sm)'
    }
  };
  const v = {
    primary: {
      background: 'var(--accent)',
      borderColor: 'var(--accent)',
      color: 'var(--text-on-accent)'
    },
    secondary: {
      background: 'transparent',
      borderColor: 'var(--accent-ink)',
      color: 'var(--accent-ink)'
    },
    destructive: {
      background: 'transparent',
      borderColor: 'var(--danger)',
      color: 'var(--danger)'
    }
  }[variant];
  const off = loading || disabled;
  return /*#__PURE__*/React.createElement("button", {
    onClick: off ? undefined : onClick,
    disabled: off,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      width: full ? '100%' : 'auto',
      ...sizes[size],
      ...v,
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      lineHeight: 1,
      borderRadius: 'var(--radius-lg)',
      borderWidth: 1,
      borderStyle: 'solid',
      cursor: off ? 'default' : 'pointer',
      opacity: off ? 0.5 : 1,
      transition: 'opacity 120ms'
    }
  }, icon ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, icon) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: 'nowrap'
    }
  }, label));
}
function Badge({
  label,
  tone = 'neutral',
  color,
  icon
}) {
  const tones = {
    gold: 'var(--tier-gold)',
    silver: 'var(--tier-silver)',
    bronze: 'var(--tier-bronze)',
    new: 'var(--gold)',
    accent: 'var(--accent)',
    danger: 'var(--danger)',
    neutral: 'var(--ink-soft)'
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: color ?? tones[tone],
      color: 'var(--cream)',
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 'var(--text-micro)',
      letterSpacing: '0.5px',
      lineHeight: 1,
      padding: '4px 10px',
      borderRadius: 'var(--radius-pill)',
      whiteSpace: 'nowrap'
    }
  }, icon ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, icon) : null, label);
}
function Avatar({
  photoUrl,
  name,
  glyph = '🐈',
  size = 56,
  rounded = true
}) {
  const base = {
    width: size,
    height: size,
    borderRadius: rounded ? '50%' : 'var(--radius-md)',
    background: 'var(--surface-inert)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  };
  if (photoUrl) return /*#__PURE__*/React.createElement("img", {
    src: photoUrl,
    alt: name ?? '',
    style: {
      ...base,
      objectFit: 'cover'
    }
  });
  const initial = name?.trim()?.charAt(0);
  return /*#__PURE__*/React.createElement("div", {
    style: base
  }, initial ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-heading)',
      fontWeight: 700,
      fontSize: size * 0.42,
      color: 'var(--moss-deep)'
    }
  }, initial) : /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: size * 0.45
    },
    "aria-hidden": "true"
  }, glyph));
}
function Card({
  children,
  pad = true,
  onClick,
  interactive,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-card)',
      overflow: 'hidden',
      padding: pad ? 'var(--space-lg)' : 0,
      cursor: interactive ? 'pointer' : 'default',
      ...style
    }
  }, children);
}
function TopBar({
  title,
  onBack,
  locale = 'ar'
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      height: 56,
      padding: '0 var(--space-lg)',
      background: 'var(--surface-screen)',
      borderBottom: '1px solid var(--border-hairline)',
      flexShrink: 0
    }
  }, onBack ? /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 4,
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 'var(--text-body-md)',
      color: 'var(--accent)'
    }
  }, "\u2192 \u0631\u062C\u0648\u0639") : null, title ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-heading)',
      fontWeight: 700,
      fontSize: 'var(--text-heading)',
      color: 'var(--moss-deep)'
    }
  }, title) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      marginInlineStart: 'auto',
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 'var(--text-body-sm)',
      color: 'var(--accent)'
    }
  }, locale === 'ar' ? 'EN' : 'ع'));
}
function FilterChip({
  label,
  active,
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontFamily: 'var(--font-body)',
      fontWeight: active ? 700 : 400,
      fontSize: 'var(--text-caption)',
      color: active ? 'var(--text-on-accent)' : 'var(--text-muted)',
      background: active ? 'var(--accent)' : 'var(--surface-card)',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border-hairline)'}`,
      borderRadius: 'var(--radius-pill)',
      padding: '6px 14px',
      cursor: 'pointer'
    }
  }, active ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, "\u2713") : null, label);
}
Object.assign(window, {
  Btn,
  Badge,
  Avatar,
  Card,
  TopBar,
  FilterChip
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/petbnb_app/components.jsx", error: String((e && e.message) || e) }); }

// ui_kits/petbnb_app/screens.jsx
try { (() => {
// Petbnb app — UI-kit screens + interactive state machine.
// A faithful cosmetic recreation of the real Expo screens (owner feed →
// listing detail → booking request → confirmation), plus the onboarding
// role chooser and a persona toggle that re-skins host mode honey/gold.
// Uses the cosmetic primitives from components.jsx.

const {
  Btn,
  Badge,
  Avatar,
  Card,
  TopBar,
  FilterChip
} = window;
const A = '../../assets/breeds/'; // breed photos as host/home imagery

const HOSTS = [{
  id: 'h1',
  name: 'نورة العتيبي',
  photo: A + 'ragdoll.jpg',
  home: A + 'maine_coon.jpg',
  tier: 'gold',
  gender: 'female',
  district: 'الملقا',
  city: 'الرياض',
  km: '٣٫٢',
  title: 'منزل دافئ وهادئ لقطتك مع رعاية شخصية',
  price: '٤٥٠',
  max: '٢',
  desc: 'أستقبل قطتك في منزل هادئ ونظيف، مع متابعة يومية بالصور. خبرة ٥ سنوات في رعاية القطط، ولا يوجد لدي حيوانات مقيمة تزعجها.',
  grooming: true,
  resident: false
}, {
  id: 'h2',
  name: 'سارة القحطاني',
  photo: A + 'persian.jpg',
  home: A + 'british_shorthair.jpg',
  tier: 'silver',
  gender: 'female',
  district: 'النرجس',
  city: 'الرياض',
  km: '٥٫٨',
  title: 'رعاية محبة في بيت عائلي واسع',
  price: '٣٨٠',
  max: '٣',
  desc: 'بيت عائلي واسع مع حديقة آمنة. أحب القطط وأعاملها كأنها قططي. متاحة للتواصل في أي وقت خلال الإقامة.',
  grooming: false,
  resident: true
}, {
  id: 'h3',
  name: 'منى الدوسري',
  photo: A + 'siamese.jpg',
  home: A + 'scottish_fold.jpg',
  tier: 'bronze',
  gender: 'female',
  district: 'العقيق',
  city: 'الرياض',
  km: '٧٫١',
  title: 'شقة هادئة قريبة من العيادة البيطرية',
  price: '٣٢٠',
  max: '١',
  desc: 'شقة هادئة بإطلالة جميلة، قريبة من عيادة بيطرية موثوقة. مثالية لقطة واحدة تحتاج هدوءاً واهتماماً.',
  grooming: true,
  resident: false
}];
const ADDONS = [{
  key: 'grooming',
  label: 'استحمام',
  price: 80
}, {
  key: 'vet',
  label: 'زيارة بيطرية',
  price: 150
}, {
  key: 'transport',
  label: 'توصيل',
  price: 60
}];
const toAr = n => String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);

// ───────────────────────── Onboarding (role chooser) ─────────────────────
function Onboarding({
  onPick
}) {
  const [role, setRole] = React.useState('owner');
  const roles = [{
    v: 'owner',
    icon: '🐈',
    t: 'أبحث عن مكان لقطتي',
    d: 'ابحثي عن مضيفة موثوقة قريبة منكِ'
  }, {
    v: 'host',
    icon: '🏠',
    t: 'أستضيف القطط في منزلي',
    d: 'استقبلي الحيوانات واكسبي دخلاً'
  }, {
    v: 'both',
    icon: '⚭',
    t: 'كلاهما',
    d: 'أحتاج كلا الدورين'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: 'var(--space-xl)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-sm)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-heading)',
      fontWeight: 700,
      fontSize: 'var(--text-display)',
      color: 'var(--moss-deep)'
    }
  }, "\u0623\u0647\u0644\u0627\u064B \u0628\u0643\u0650 \u0641\u064A Petbnb"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-body-md)',
      color: 'var(--text-muted)',
      marginTop: 4
    }
  }, "\u0643\u064A\u0641 \u062A\u0631\u064A\u062F\u064A\u0646 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 Petbnb\u061F")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)'
    }
  }, roles.map(r => {
    const sel = role === r.v;
    return /*#__PURE__*/React.createElement("button", {
      key: r.v,
      onClick: () => setRole(r.v),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)',
        width: '100%',
        textAlign: 'start',
        background: sel ? 'var(--surface-inert)' : 'var(--surface-card)',
        border: `2px solid ${sel ? 'var(--accent)' : 'var(--border-hairline)'}`,
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-card)',
        padding: 'var(--space-lg)',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 32
      },
      "aria-hidden": "true"
    }, r.icon), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        fontFamily: 'var(--font-body)',
        fontWeight: 700,
        fontSize: 'var(--text-subhead)',
        color: 'var(--ink)'
      }
    }, r.t), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-body-sm)',
        color: 'var(--text-muted)',
        marginTop: 2
      }
    }, r.d)), sel ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 22,
        color: 'var(--accent)',
        fontWeight: 700
      },
      "aria-hidden": "true"
    }, "\u2713") : null);
  })), /*#__PURE__*/React.createElement(Btn, {
    label: "\u0645\u062A\u0627\u0628\u0639\u0629",
    full: true,
    onClick: () => onPick(role)
  }));
}

// ───────────────────────── Owner feed ─────────────────────
function Feed({
  onOpen,
  greeting
}) {
  const [fem, setFem] = React.useState(true);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-xl) var(--space-xl) var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-heading)',
      fontWeight: 700,
      fontSize: 'var(--text-title)',
      color: 'var(--moss-deep)'
    }
  }, "\u0627\u0644\u0645\u0636\u064A\u0641\u0648\u0646 \u0641\u064A \u0627\u0644\u0631\u064A\u0627\u0636"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-caption)',
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, greeting)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      padding: '0 var(--space-xl) var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement(FilterChip, {
    label: "\u0645\u0636\u064A\u0641\u0627\u062A \u0641\u0642\u0637",
    active: fem,
    onClick: () => setFem(v => !v)
  }), /*#__PURE__*/React.createElement(FilterChip, {
    label: "\u0627\u0644\u0623\u0642\u0631\u0628 \u0625\u0644\u064A\u0643",
    active: false
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)',
      padding: '0 var(--space-xl) var(--space-xxl)'
    }
  }, HOSTS.map(h => /*#__PURE__*/React.createElement(Card, {
    key: h.id,
    pad: false,
    interactive: true,
    onClick: () => onOpen(h)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    photoUrl: h.photo,
    name: h.name,
    size: 56
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-heading)',
      fontWeight: 700,
      fontSize: 'var(--text-subhead)',
      color: 'var(--moss-deep)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, h.name), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--verified)',
      fontWeight: 700,
      fontSize: 14
    },
    "aria-label": "\u0645\u0648\u062B\u0651\u0642"
  }, "\u2713")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    label: {
      gold: 'ذهبي',
      silver: 'فضي',
      bronze: 'برونزي'
    }[h.tier],
    tone: h.tier
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-caption)',
      color: 'var(--text-muted)'
    }
  }, "\u0645\u0636\u064A\u0641\u0629 \u2022 \uD83D\uDCCD ", h.district, "\u060C ", h.city, " \xB7 ", h.km, " \u0643\u0645")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    label: "\u062C\u062F\u064A\u062F",
    tone: "new"
  })))), /*#__PURE__*/React.createElement("img", {
    src: h.home,
    alt: "",
    style: {
      width: '100%',
      aspectRatio: '5 / 2',
      objectFit: 'cover',
      display: 'block',
      background: 'var(--surface-inert)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 'var(--text-body-md)',
      color: 'var(--ink)'
    }
  }, h.title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 'var(--text-subhead)',
      color: 'var(--moss-deep)'
    }
  }, h.price, " \u0631.\u0633 ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 400,
      fontSize: 'var(--text-caption)',
      color: 'var(--text-muted)'
    }
  }, "/ \u0644\u064A\u0644\u0629")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 'var(--text-body-md)',
      color: 'var(--text-muted)'
    }
  }, "\uD83D\uDC08 ", h.max)))))));
}

// ───────────────────────── Listing detail ─────────────────────
function Listing({
  host,
  onBack,
  onRequest
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      paddingBottom: 'var(--space-xxl)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      background: 'var(--surface-card)',
      margin: 'var(--space-xl)',
      marginBottom: 'var(--space-md)',
      padding: 'var(--space-lg)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-card)'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    photoUrl: host.photo,
    name: host.name,
    size: 64
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-heading)',
      fontWeight: 700,
      fontSize: 'var(--text-heading)',
      color: 'var(--moss-deep)'
    }
  }, host.name), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--verified)',
      fontWeight: 700,
      fontSize: 16
    }
  }, "\u2713")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-body-sm)',
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, "\u0645\u0636\u064A\u0641\u0629 \u2022 \uD83D\uDCCD ", host.district), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    label: {
      gold: 'ذهبي',
      silver: 'فضي',
      bronze: 'برونزي'
    }[host.tier],
    tone: host.tier
  }), /*#__PURE__*/React.createElement(Badge, {
    label: "\u062C\u062F\u064A\u062F",
    tone: "new"
  })))), /*#__PURE__*/React.createElement("img", {
    src: host.home,
    alt: "",
    style: {
      width: '100%',
      height: 240,
      objectFit: 'cover',
      display: 'block',
      background: 'var(--surface-inert)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-xl)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-heading)',
      fontWeight: 700,
      fontSize: 'var(--text-title)',
      color: 'var(--moss-deep)'
    }
  }, host.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 'var(--text-subhead)',
      color: 'var(--ink)'
    }
  }, host.price, " \u0631.\u0633 ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 400,
      fontSize: 'var(--text-body-sm)',
      color: 'var(--text-muted)'
    }
  }, "/ \u0644\u064A\u0644\u0629")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-body-lg)',
      color: 'var(--ink)',
      lineHeight: 1.6
    }
  }, host.desc), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      marginTop: 8,
      paddingTop: 'var(--space-lg)',
      borderTop: '1px solid var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement(Amenity, {
    label: `يستوعب حتى ${host.max}`
  }), /*#__PURE__*/React.createElement(Amenity, {
    label: host.resident ? 'يوجد حيوانات مقيمة' : 'لا يوجد حيوانات مقيمة'
  }), host.grooming ? /*#__PURE__*/React.createElement(Amenity, {
    label: "\u062E\u062F\u0645\u0629 \u0627\u0644\u0627\u0633\u062A\u062D\u0645\u0627\u0645 \u0645\u062A\u0648\u0641\u0631\u0629"
  }) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(Btn, {
    label: "\u0627\u0637\u0644\u0628 \u0627\u0644\u062D\u062C\u0632",
    full: true,
    onClick: onRequest
  }))));
}
function Amenity({
  label
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--moss)',
      fontWeight: 700,
      fontSize: 16,
      width: 18
    }
  }, "\u2713"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-body-md)',
      color: 'var(--ink)'
    }
  }, label));
}

// ───────────────────────── Booking request ─────────────────────
function Request({
  host,
  onBack,
  onSubmit
}) {
  const [nights, setNights] = React.useState(3);
  const [addon, setAddon] = React.useState(null);
  const base = +host.price.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)) || 450;
  const baseTotal = base * nights;
  const addonObj = ADDONS.find(a => a.key === addon);
  const total = baseTotal + (addonObj ? addonObj.price : 0);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: 'var(--space-xl)',
      paddingBottom: 'var(--space-xxl)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-heading)',
      fontWeight: 700,
      fontSize: 'var(--text-title)',
      color: 'var(--moss-deep)'
    }
  }, "\u0637\u0644\u0628 \u062D\u062C\u0632"), /*#__PURE__*/React.createElement(Field, {
    label: "\u0639\u062F\u062F \u0627\u0644\u0644\u064A\u0627\u0644\u064A"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Stepper, {
    onClick: () => setNights(n => Math.max(1, n - 1))
  }, "\u2212"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 'var(--text-heading)',
      color: 'var(--ink)',
      minWidth: 60,
      textAlign: 'center'
    }
  }, toAr(nights), " \u0644\u064A\u0627\u0644\u064D"), /*#__PURE__*/React.createElement(Stepper, {
    onClick: () => setNights(n => n + 1)
  }, "+"))), /*#__PURE__*/React.createElement(Field, {
    label: "\u0642\u0637\u062A\u0643"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      background: 'var(--surface-inert)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    glyph: "\uD83D\uDC08",
    size: 44,
    rounded: false
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 'var(--text-body-md)',
      color: 'var(--ink)'
    }
  }, "\u0644\u0648\u0644\u0648 \xB7 \u0634\u064A\u0631\u0627\u0632\u064A"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginInlineStart: 'auto',
      color: 'var(--accent)',
      fontWeight: 700
    }
  }, "\u2713"))), /*#__PURE__*/React.createElement(Field, {
    label: "\u062E\u062F\u0645\u0629 \u0625\u0636\u0627\u0641\u064A\u0629 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(FilterChip, {
    label: "\u0628\u062F\u0648\u0646",
    active: addon === null,
    onClick: () => setAddon(null)
  }), ADDONS.map(a => /*#__PURE__*/React.createElement(FilterChip, {
    key: a.key,
    label: `${a.label} +${toAr(a.price)}`,
    active: addon === a.key,
    onClick: () => setAddon(a.key)
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      paddingTop: 'var(--space-lg)',
      borderTop: '1px solid var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement(Row, {
    label: `الإقامة (${toAr(nights)} ليالٍ × ${host.price})`,
    value: `${toAr(baseTotal)} ر.س`
  }), addonObj ? /*#__PURE__*/React.createElement(Row, {
    label: addonObj.label,
    value: `${toAr(addonObj.price)} ر.س`
  }) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 'var(--text-subhead)',
      color: 'var(--ink)'
    }
  }, "\u0627\u0644\u0645\u062C\u0645\u0648\u0639"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 'var(--text-title)',
      color: 'var(--moss-deep)'
    }
  }, toAr(total), " \u0631.\u0633"))), /*#__PURE__*/React.createElement(Btn, {
    label: "\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628",
    full: true,
    onClick: () => onSubmit({
      nights,
      total,
      addon: addonObj
    })
  }));
}
function Field({
  label,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 'var(--text-caption)',
      color: 'var(--text-body)'
    }
  }, label), children);
}
function Stepper({
  children,
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      width: 40,
      height: 40,
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--accent-ink)',
      background: 'transparent',
      color: 'var(--accent-ink)',
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 20,
      cursor: 'pointer'
    }
  }, children);
}
function Row({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-body-sm)',
      color: 'var(--text-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 'var(--text-body-sm)',
      color: 'var(--ink)'
    }
  }, value));
}

// ───────────────────────── Confirmation ─────────────────────
function Confirm({
  host,
  info,
  onHome
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: 'var(--space-xl)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-md)',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 72,
      height: 72,
      borderRadius: '50%',
      background: 'var(--surface-inert)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 34,
      color: 'var(--moss)',
      fontWeight: 700
    }
  }, "\u2713"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-heading)',
      fontWeight: 700,
      fontSize: 'var(--text-title)',
      color: 'var(--moss-deep)'
    }
  }, "\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-body-md)',
      color: 'var(--text-muted)'
    }
  }, "\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0631\u062F \u0627\u0644\u0645\u0636\u064A\u0641"), /*#__PURE__*/React.createElement(Card, {
    style: {
      width: '100%',
      marginTop: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    photoUrl: host.photo,
    name: host.name,
    size: 48
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-heading)',
      fontWeight: 700,
      fontSize: 'var(--text-subhead)',
      color: 'var(--moss-deep)'
    }
  }, host.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-caption)',
      color: 'var(--text-muted)'
    }
  }, toAr(info.nights), " \u0644\u064A\u0627\u0644\u064D")), /*#__PURE__*/React.createElement(Badge, {
    label: "\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0631\u062F",
    color: "var(--gold-deep)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      paddingTop: 12,
      borderTop: '1px solid var(--border-hairline)',
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-body-sm)',
      color: 'var(--text-muted)'
    }
  }, "\u0627\u0644\u0645\u062C\u0645\u0648\u0639"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 'var(--text-subhead)',
      color: 'var(--moss-deep)'
    }
  }, toAr(info.total), " \u0631.\u0633"))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      marginTop: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement(Btn, {
    label: "\u0627\u0644\u0639\u0648\u062F\u0629 \u0625\u0644\u0649 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629",
    variant: "secondary",
    full: true,
    onClick: onHome
  })));
}
Object.assign(window, {
  Onboarding,
  Feed,
  Listing,
  Request,
  Confirm,
  HOSTS
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/petbnb_app/screens.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.FilterChip = __ds_scope.FilterChip;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.ListingCard = __ds_scope.ListingCard;

__ds_ns.RoleCard = __ds_scope.RoleCard;

__ds_ns.AppHeader = __ds_scope.AppHeader;

})();
