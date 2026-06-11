# Petbnb

A Saudi Arabia-first, Arabic-language, RTL marketplace connecting pet owners
with verified hosts who board pets in their own homes.

## Status

Pre-launch MVP. Steps 1–8 complete. See `CLAUDE.md` for the full spec and
`ONBOARDING.md` for the developer onboarding doc.

## Stack

Expo (React Native) · TypeScript strict · Supabase · Vitest · GitHub Actions CI

## Development

    node -v          # Must be v20.x or v22.x — Node 24 breaks Metro
    npm ci
    npx expo start --clear

## CI

    npm run ci       # i18n parity → tsc → vitest

## License

Proprietary. All rights reserved.
