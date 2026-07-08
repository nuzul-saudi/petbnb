// TEMP DIAGNOSTIC ROUTE (/debug) — remove with the other PostHog debug
// lines once the init failure is diagnosed. Phone-readable, English-only,
// no i18n, no auth, NO data access. It only reads observability config
// presence + the window stage trackers set by analytics.ts / sentry.ts,
// and runs the dynamic import('posthog-js') end-to-end as the "chunk test"
// (replaces the DevTools Network-tab check on desktop). Unlinked — reach
// it by typing /debug.
/* eslint-disable @typescript-eslint/no-explicit-any */

import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

type ExtraShape = {
  posthogKey?: string;
  posthogHost?: string;
  sentryDsn?: string;
};

export default function DebugScreen() {
  const [chunkResult, setChunkResult] = useState('running…');
  const [eventResult, setEventResult] = useState('(not run)');
  const [tick, setTick] = useState(0);

  // THE CHUNK TEST — attempt the exact dynamic import PostHog init uses,
  // from the real runtime. Resolved = the split chunk loads; threw = the
  // chunk 404s / is served HTML / CSP-blocked (the error string tells us
  // which). This is the phone-side replacement for the Network tab.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('posthog-js');
        if (!cancelled) {
          setChunkResult(`RESOLVED (default is ${typeof mod.default})`);
        }
      } catch (e) {
        if (!cancelled) setChunkResult(`THREW — ${String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const extra = (Constants.expoConfig?.extra ?? {}) as ExtraShape;
  const key = extra.posthogKey;
  const w: any = typeof window !== 'undefined' ? window : {};

  const phErr = w.__POSTHOG_INIT_ERROR__;
  const phStack =
    phErr && phErr.stack
      ? String(phErr.stack).split('\n').slice(0, 3).join('\n')
      : '';
  const snErr = w.__SENTRY_INIT_ERROR__;
  const snStack =
    snErr && snErr.stack
      ? String(snErr.stack).split('\n').slice(0, 3).join('\n')
      : '';

  const runEvent = () => {
    const ph = w.posthog;
    if (ph && typeof ph.capture === 'function') {
      try {
        ph.capture('debug_test');
        setEventResult('SENT (posthog.capture called)');
      } catch (e) {
        setEventResult(`THREW — ${String(e)}`);
      }
    } else {
      setEventResult('window.posthog missing — not sent');
    }
  };

  const lines: string[] = [
    '=== PETBNB /debug (temporary) ===',
    `refreshed tick: ${tick}`,
    '',
    '-- PostHog config --',
    `1. posthogKey present: ${key ? 'YES' : 'NO'}`,
    `   preview: ${key ? `${key.slice(0, 8)}… (len ${key.length})` : '—'}`,
    `2. posthogHost: ${extra.posthogHost ?? '(unset)'}`,
    '',
    '-- PostHog init path --',
    `3. __POSTHOG_STAGE__: ${w.__POSTHOG_STAGE__ ?? '(undefined)'}`,
    `   __POSTHOG_INIT_ERROR__: ${phErr ? String(phErr) : '(none)'}`,
    ...(phStack ? [`   stack:`, phStack] : []),
    `4. window.posthog defined: ${w.posthog ? 'YES' : 'NO'}`,
    '',
    '-- Sentry differential (same import mechanism) --',
    `5. sentryDsn present: ${extra.sentryDsn ? 'YES' : 'NO'}`,
    `   __SENTRY_STAGE__: ${w.__SENTRY_STAGE__ ?? '(undefined)'}`,
    `   __SENTRY_INIT_ERROR__: ${snErr ? String(snErr) : '(none)'}`,
    ...(snStack ? [`   stack:`, snStack] : []),
    `   window.__SENTRY__ defined: ${w.__SENTRY__ ? 'YES' : 'NO'}`,
    '',
    '-- Chunk test (import posthog-js from runtime) --',
    `6. ${chunkResult}`,
    '',
    '-- Test event --',
    `7. ${eventResult}`,
    '',
    `Platform.OS: ${Platform.OS}`,
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#111' }}
      contentContainerStyle={{ padding: 16, paddingTop: 48 }}
    >
      <Text
        selectable
        style={{
          fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
          fontSize: 13,
          lineHeight: 19,
          color: '#e8e8e8',
        }}
      >
        {lines.join('\n')}
      </Text>

      <View style={{ height: 20 }} />
      <Pressable
        onPress={runEvent}
        style={{
          backgroundColor: '#2D4A2F',
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 8,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontFamily: 'monospace', fontSize: 14 }}>
          RUN TEST EVENT
        </Text>
      </Pressable>

      <View style={{ height: 12 }} />
      <Pressable
        onPress={() => setTick((n) => n + 1)}
        style={{
          backgroundColor: '#333',
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 8,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontFamily: 'monospace', fontSize: 14 }}>
          REFRESH READOUT
        </Text>
      </Pressable>
    </ScrollView>
  );
}
