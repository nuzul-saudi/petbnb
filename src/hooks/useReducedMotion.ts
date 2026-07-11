// useReducedMotion — respects the OS / browser "reduce motion" setting
// (Wave 1b, S9 / 2026-07-11).
//
// On web, react-native-web's AccessibilityInfo maps this to the
// `prefers-reduced-motion` media query; on native it reads the OS
// accessibility toggle. Consumers use it to drop non-essential
// transition durations to 0 (e.g. the photo-gallery crossfades) so
// motion-sensitive users aren't forced through animations.

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (v) => setReduced(v),
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
