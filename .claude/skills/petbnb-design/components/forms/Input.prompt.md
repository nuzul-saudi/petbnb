Text field — paper fill, whisper hairline, RTL-aware, accent focus.

```jsx
<Input label="الاسم" value={name} onChange={setName} placeholder="نورة العتيبي" />
<Input label="العمر (بالأشهر)" type="number" error="العمر غير صحيح" />
```

Optional `label`, `helper`, and `error` (reddens the border + shows a terracotta line). `onChange` receives the raw string. Focus border resolves to the persona accent.
