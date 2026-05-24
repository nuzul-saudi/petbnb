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
  },
});
