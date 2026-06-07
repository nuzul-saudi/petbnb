The shared top app bar — persona-tinted, with nav items + language toggle.

```jsx
<AppHeader
  locale="ar"
  onLanguageToggle={toggle}
  items={[
    { label: 'الرئيسية', active: true, onPress: goHome },
    { label: 'حجوزاتي', onPress: goBookings },
    { label: 'حسابي', onPress: goProfile },
  ]}
/>
```

For role="both" add `personaToggleLabel` (names the persona you'd switch TO) + `onPersonaToggle`, and `pendingCount` for the host-requests badge. The bar background is `--surface-screen`, so wrapping it in `data-persona="host"` tints it honey.
