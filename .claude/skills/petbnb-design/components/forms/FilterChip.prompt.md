Toggleable filter pill — fills with the accent and shows a ✓ when active.

```jsx
<FilterChip label="مضيفات فقط" active={femaleOnly} onPress={() => setFemaleOnly(v => !v)} />
```

Inert state is paper + whisper border + muted label; active fills with the persona accent and flips the label to cream bold with a leading ✓.
