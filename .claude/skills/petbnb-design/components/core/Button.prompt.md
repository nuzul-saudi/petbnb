The single reusable button — use for every tappable action; accent auto-resolves to the persona (moss owner / gold host).

```jsx
<Button label="اطلب الحجز" variant="primary" fullWidth onPress={book} />
<Button label="مضيفات فقط" variant="secondary" size="compact" />
<Button label="إلغاء الطلب" variant="destructive" />
<Button label="جارٍ الإرسال…" loading />
```

Variants: `primary` (solid accent), `secondary` (outlined accent-ink), `destructive` (outlined terracotta). Sizes: `normal` (44px), `compact` (32px). `loading` implies `disabled` and renders a spinner — swap the label text yourself. Wrap in `[data-persona="host"]` to see the gold treatment.
