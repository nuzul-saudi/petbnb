import { describe, expect, it } from 'vitest';

import {
  arrowGlyph,
  clampIndex,
  logicalToRaw,
  nextArrowSide,
  offsetForLogical,
  prevArrowSide,
  rawPageFromOffset,
  stripTranslateX,
  swipeTarget,
} from '@/lib/carousel-paging';

// Part A (2026-07-11): RTL-aware paging math. Pins both directions so
// the LTR behavior can't regress while fixing RTL (acceptance A4/A7).

describe('arrow sides + glyphs', () => {
  it('RTL: next enters from the left; LTR: from the right', () => {
    expect(nextArrowSide(true)).toBe('left');
    expect(prevArrowSide(true)).toBe('right');
    expect(nextArrowSide(false)).toBe('right');
    expect(prevArrowSide(false)).toBe('left');
  });

  it('glyph points off-screen toward its side', () => {
    expect(arrowGlyph('left')).toBe('‹');
    expect(arrowGlyph('right')).toBe('›');
  });
});

describe('logicalToRaw — reversed strip mapping (involution)', () => {
  it('RTL reverses, LTR is identity', () => {
    expect(logicalToRaw(0, 3, true)).toBe(2);
    expect(logicalToRaw(2, 3, true)).toBe(0);
    expect(logicalToRaw(1, 3, true)).toBe(1);
    expect(logicalToRaw(0, 3, false)).toBe(0);
    expect(logicalToRaw(2, 3, false)).toBe(2);
  });

  it('applying twice returns the input', () => {
    for (const i of [0, 1, 2, 3]) {
      expect(logicalToRaw(logicalToRaw(i, 4, true), 4, true)).toBe(i);
    }
  });
});

describe('offset math — LTR-forced strip', () => {
  it('offsetForLogical → rawPageFromOffset → logicalToRaw round-trips (RTL)', () => {
    const W = 375;
    const N = 4;
    for (let logical = 0; logical < N; logical++) {
      const x = offsetForLogical(logical, N, W, true);
      const raw = rawPageFromOffset(x, W, N);
      expect(logicalToRaw(raw, N, true)).toBe(logical);
    }
  });

  it('LTR offsets are plain page*width (unchanged behavior, A4)', () => {
    expect(offsetForLogical(0, 3, 300, false)).toBe(0);
    expect(offsetForLogical(2, 3, 300, false)).toBe(600);
  });

  it('RTL: logical photo 1-of-N sits at the FAR raw end', () => {
    expect(offsetForLogical(0, 3, 300, true)).toBe(600);
    expect(offsetForLogical(2, 3, 300, true)).toBe(0);
  });

  it('rawPageFromOffset clamps out-of-range + mid-scroll offsets', () => {
    expect(rawPageFromOffset(-50, 300, 3)).toBe(0);
    expect(rawPageFromOffset(10_000, 300, 3)).toBe(2);
    expect(rawPageFromOffset(440, 300, 3)).toBe(1); // nearest page
    expect(rawPageFromOffset(100, 0, 3)).toBe(0); // zero width guard
  });
});

describe('stripTranslateX — transform-strip carousel', () => {
  it('LTR slides left (negative); RTL slides right (positive)', () => {
    expect(stripTranslateX(2, 300, false)).toBe(-600);
    expect(stripTranslateX(2, 300, true)).toBe(600); // negative here = the blank-photo bug
    expect(stripTranslateX(0, 300, true)).toBe(0);
  });
});

describe('swipeTarget — reading-direction-aware pan release', () => {
  it('LTR: leftward drag advances; RTL: rightward drag advances', () => {
    expect(swipeTarget(-60, 40, 0, 3, false)).toBe(1);
    expect(swipeTarget(60, 40, 1, 3, false)).toBe(0);
    expect(swipeTarget(60, 40, 0, 3, true)).toBe(1);
    expect(swipeTarget(-60, 40, 1, 3, true)).toBe(0);
  });

  it('under-threshold and at-boundary drags resolve to null', () => {
    expect(swipeTarget(20, 40, 1, 3, false)).toBeNull();
    expect(swipeTarget(60, 40, 0, 3, false)).toBeNull(); // back from photo 1
    expect(swipeTarget(-60, 40, 2, 3, false)).toBeNull(); // fwd from last
  });
});

describe('clampIndex', () => {
  it('clamps into [0, total-1] and guards empty lists', () => {
    expect(clampIndex(-1, 3)).toBe(0);
    expect(clampIndex(5, 3)).toBe(2);
    expect(clampIndex(0, 0)).toBe(0);
  });
});
