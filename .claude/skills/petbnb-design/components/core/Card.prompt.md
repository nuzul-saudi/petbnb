The recurring elevated surface — paper, 22px radius, soft shadow, clipped overflow.

```jsx
<Card>محتوى البطاقة</Card>
<Card pad={false} interactive>{/* full-bleed photo + footer */}</Card>
<Card sunken>{/* recessed sand section */}</Card>
```

Set `pad={false}` when a photo bleeds to the edges (the rounding clips it). `interactive` lifts on hover for tappable cards. `sunken` is the recessed sand variant with no shadow.
