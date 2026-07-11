// RTL-aware carousel paging math (Part A, 2026-07-11 brief).
//
// PURE module — no React, no platform imports — shared by
// PhotoGallery (ScrollView paging), ListingPhotoCarousel (transform
// strip) and PhotoLightbox (single-image stepper). Every function is
// direction-explicit: callers pass isRTL (derived from the app locale,
// per src/theme/rtl.ts — I18nManager.isRTL doesn't track web direction).
//
// THE RULE (see docs/batch-decisions.md, "RTL horizontal paging on
// web"): never do LTR offset math against an RTL-laid-out strip.
// Browsers disagree about RTL scroll geometry (negative vs reverse
// scrollLeft models), so the ScrollView-based gallery forces its strip
// to LTR geometry (style direction:'ltr') and renders photos in RAW
// (reversed-for-RTL) order — all offsets stay positive LTR math, and
// these helpers map logical (reading-order) indices to raw positions.
// The transform-strip carousel keeps logical order and flips the
// translate SIGN instead.

export type ArrowSide = 'left' | 'right';

/** Physical side the NEXT arrow sits on — the side the next photo
 *  visually enters from: RTL → left, LTR → right. */
export function nextArrowSide(isRTL: boolean): ArrowSide {
  return isRTL ? 'left' : 'right';
}

/** Physical side of the PREV arrow — opposite of next. */
export function prevArrowSide(isRTL: boolean): ArrowSide {
  return isRTL ? 'right' : 'left';
}

/** Chevron glyph for an arrow on the given physical side: it points
 *  off-screen toward that side ('‹' on the left, '›' on the right). */
export function arrowGlyph(side: ArrowSide): '‹' | '›' {
  return side === 'left' ? '‹' : '›';
}

/** Clamp an index into [0, total-1] (0 when the list is empty). */
export function clampIndex(i: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, i));
}

/**
 * Map a logical (reading-order) index to its raw strip position for an
 * LTR-forced strip that renders photos reversed under RTL. Involution:
 * rawToLogical is the same function.
 */
export function logicalToRaw(
  logical: number,
  total: number,
  isRTL: boolean,
): number {
  return isRTL ? total - 1 - logical : logical;
}

/** Raw page index from an LTR scroll offset, clamped. The SOLE source
 *  of truth for scroll-derived state — no optimistic writes. */
export function rawPageFromOffset(
  offsetX: number,
  pageWidth: number,
  total: number,
): number {
  if (pageWidth <= 0) return 0;
  return clampIndex(Math.round(offsetX / pageWidth), total);
}

/** LTR scroll offset that shows the given logical page. */
export function offsetForLogical(
  logical: number,
  total: number,
  pageWidth: number,
  isRTL: boolean,
): number {
  return logicalToRaw(clampIndex(logical, total), total, isRTL) * pageWidth;
}

/**
 * translateX for a transform-strip carousel that KEEPS logical render
 * order. Under RTL a flex row lays photos right-to-left and the strip
 * right-aligns, so revealing photo i means sliding the strip RIGHT
 * (+); under LTR, LEFT (−). (Translating negative under RTL slides
 * past the strip's edge — the blank-photo bug.)
 */
export function stripTranslateX(
  logical: number,
  pageWidth: number,
  isRTL: boolean,
): number {
  return (isRTL ? 1 : -1) * logical * pageWidth;
}

/**
 * Resolve a horizontal pan release to a target logical index, or null
 * when the drag is under the threshold. Reading direction flips under
 * RTL: the next photo sits to the LEFT, so a RIGHTWARD drag (positive
 * dx, pulling the strip right) advances.
 */
export function swipeTarget(
  dx: number,
  threshold: number,
  logical: number,
  total: number,
  isRTL: boolean,
): number | null {
  if (Math.abs(dx) < threshold) return null;
  const forward = isRTL ? dx > 0 : dx < 0;
  const target = clampIndex(logical + (forward ? 1 : -1), total);
  return target === logical ? null : target;
}
