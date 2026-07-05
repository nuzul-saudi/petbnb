import type { ConfigContext, ExpoConfig } from 'expo/config';

// Bridges .env values into the running app via Constants.expoConfig.extra.
// The base config still lives in app.json — we just merge `extra` onto it.
// Expo auto-loads .env files at config-eval time, so process.env works here.

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Petbnb',
  slug: config.slug ?? 'Petbnb',
  extra: {
    ...config.extra,
    supabaseUrl: process.env.SUPABASE_URL,
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    // Phase 1 observability — all optional. Each consumer no-ops when its
    // value is absent, so dev + preview builds run fine with none set.
    sentryDsn: process.env.SENTRY_DSN,
    posthogKey: process.env.POSTHOG_KEY,
    posthogHost: process.env.POSTHOG_HOST,
  },
});
