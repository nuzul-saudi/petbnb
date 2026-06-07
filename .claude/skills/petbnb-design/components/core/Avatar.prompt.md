Host / pet avatar with photo → initial → glyph fallback.

```jsx
<Avatar photoUrl={host.avatar} name="نورة" size={56} />
<Avatar name="نورة" />               {/* initial fallback */}
<Avatar size={72} rounded={false} /> {/* 🐈 square pet thumb */}
```

Circular by default. Falls back to the first initial in Reem Kufi, then a 🐈 glyph on a whisper well. Used in listing cards (56), listing detail (64), and pet thumbs.
