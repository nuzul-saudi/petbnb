Role chooser card — owner / host / both, with glyph, title, desc, and a selected ✓.

```jsx
<RoleCard role="owner" title="أبحث عن مكان لقطتي" desc="ابحثي عن مضيفة موثوقة قريبة منكِ" selected />
<RoleCard role="host" title="أستضيف القطط في منزلي" desc="استقبلي الحيوانات واكسبي دخلاً" />
<RoleCard role="both" title="كلاهما" desc="أحتاج كلا الدورين" />
```

Selected state is a 2px accent border + whisper fill + a ✓. Default glyphs: owner 🐈, host 🏠, both ⚭. Used in onboarding (`/role`) and the profile switcher.
