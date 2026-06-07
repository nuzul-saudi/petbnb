The sitter-first listing card — host is the hero, home photo is evidence.

```jsx
<ListingCard
  hostName="نورة العتيبي" hostPhoto={url} verified
  tier="gold" gender="female" district="الملقا" city="الرياض"
  distanceKm="٣٫٢" title="منزل دافئ وهادئ لقطتك"
  price="٤٥٠" maxPets="٢" coverPhoto={homeUrl}
  onPress={openListing}
/>
```

Composes Avatar + Badge inside a Card. New hosts show "جديد" automatically; pass `statusBadge={{label,color}}` to override (host-home active/inactive). All numbers should be pre-formatted Arabic-Indic strings.
