# Petbnb App — UI Kit

An interactive, click-through recreation of the Petbnb mobile app (Expo /
React Native original), rebuilt as self-contained web HTML for prototyping.
Arabic-first, RTL, mobile-first, inside an iPhone frame.

## Run it
Open `index.html`. Use the segmented control above the phone to switch the
**persona lens** (owner = cream/moss · host = honey/gold) and watch the whole
screen re-skin. "ابدئي من جديد" resets to onboarding.

## The owner flow (interactive)
1. **Onboarding** — pick a role (owner / host / both) → متابعة
2. **Owner feed** — sitter-first listing cards, female-hosts filter, distance,
   honest "جديد" badges → tap a card
3. **Listing detail** — sitter header, home photo, amenities, price → اطلب الحجز
4. **Booking request** — nights stepper, pet picker, optional add-on, live
   price breakdown in ر.س → إرسال الطلب
5. **Confirmation** — calm "بانتظار رد المضيف" status

## Files
- `index.html` — phone frame, persona toggle, screen state machine, mount.
- `components.jsx` — cosmetic primitives (Btn, Badge, Avatar, Card, TopBar,
  FilterChip) matching the design-system components. Exported to `window`.
- `screens.jsx` — the five screens + sample host data + the `toAr` Arabic-Indic
  digit helper. Exported to `window`.

## Notes & fidelity
- **Self-contained on purpose.** The kit defines its own lightweight components
  (rather than importing the compiled DS bundle) so it renders standalone when a
  designer copies it out for a throwaway prototype. They are 1:1 cosmetic
  matches of the `components/` primitives and read the same `styles.css` tokens.
- Imagery uses the real curated cat photos from `assets/breeds/`.
- Copy is lifted from the real app strings (`src/locales/ar.json`): Saudi
  colloquial, feminine address, ر.س currency, Arabic-Indic digits.
- **Out of scope** (matching the MVP): host listing-creation, condition reports,
  daily updates, messaging, admin dashboard. The persona toggle demonstrates the
  re-skin; host mode here re-skins the same screens rather than showing the host
  dashboard (a Step-7 surface not yet designed in the codebase).
