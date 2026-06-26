// Expo Router web-only HTML shell override.
//
// 2026-06-26 — written to fix iOS Safari layout clipping reported by
// the founder (category strip + filter chips sliced after the address
// bar settles, listing-card price clipped behind the bottom toolbar).
//
// Two changes vs Expo Router's default shell:
//
//   1. viewport-fit=cover added to the viewport meta. Without it,
//      iOS Safari returns 0 for env(safe-area-inset-*) even on
//      devices with a notch / home indicator, so SafeAreaView has
//      nothing to measure and applies no safe-area padding.
//
//   2. <style id="petbnb-viewport-fix"> placed AFTER
//      ScrollViewStyleReset to override its
//        html, body, #root { height: 100% }
//      with a dvh-aware sizing chain:
//        html, body, #root { height: 100vh; height: 100dvh; }
//      The vh comes first as a fallback for browsers that don't
//      support dvh; the dvh redeclaration overrides it on supporting
//      browsers (Safari 15.4+, Chrome 108+). dvh reacts to iOS
//      Safari's dynamic toolbar — when the address bar appears, the
//      viewport actually shrinks and our root container shrinks with
//      it, preventing the visual clipping that 100% / 100vh causes.
//
// What is deliberately NOT in here:
//   - body { padding: env(safe-area-inset-*) }. Adding it would
//     double-pad on web because react-native-safe-area-context's
//     SafeAreaView already applies the same env values as padding
//     (see node_modules/.../NativeSafeAreaProvider.web.js: probe div
//     measures env() directly, independent of body padding). The
//     SafeAreaView on the home screen already wraps content; with
//     viewport-fit=cover now in place, its measurements become
//     meaningful and produce the correct insets.
//
// This file is web-only. Native builds don't run +html.tsx at all,
// so iOS / Android native renders are byte-identical to before.

import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style
          id="petbnb-viewport-fix"
          dangerouslySetInnerHTML={{
            __html:
              // Order matters — vh first, dvh second so the dvh declaration
              // overrides the vh on browsers that support it; old browsers
              // ignore the second line and keep the vh fallback.
              'html,body,#root{height:100vh;height:100dvh}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
