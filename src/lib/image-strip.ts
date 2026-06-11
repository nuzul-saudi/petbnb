// EXIF/GPS-stripping for user-uploaded images.
//
// Privacy-critical: a female host's home photo with embedded GPS
// coordinates de-anonymizes her home address. Strip EXIF on the upload
// path so the photo lands in storage with no location metadata.
//
// Web: re-encoding through a <canvas> implicitly drops all EXIF.
// Native: expo-image-manipulator's manipulateAsync drops EXIF as a
// side effect of any transform (we resize + re-encode JPEG).
//
// Note on fidelity: web canvas re-encode is lossy on each pass — JPEG
// artifacts compound if a user re-uploads a previously-stripped photo.
// Acceptable for MVP; if this becomes a visible quality issue, switch
// to a piexifjs-style "only strip the EXIF segment, leave pixels alone"
// approach. piexifjs is ~30 KB; not worth bundling now.

import { Platform } from 'react-native';

export async function stripExif(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    return new Promise<string>((resolve, reject) => {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        // SSR / pre-hydration fallback — return as-is. Won't actually
        // run in upload paths since those are user-triggered.
        resolve(uri);
        return;
      }
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No canvas 2D context'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        // Re-encode as JPEG. quality 0.92 is a deliberate balance —
        // 0.9 is the standard JPEG default; 0.92 keeps a hair more
        // fidelity for the second-pass-is-lossy concern above.
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = () => reject(new Error('Failed to load image for EXIF strip'));
      img.src = uri;
    });
  }

  // Native (iOS/Android). manipulateAsync is marked @deprecated in
  // expo-image-manipulator 55.0.17 in favor of the contextual
  // ImageManipulator.manipulate(source)... fluent form — but the
  // deprecated function is still present, simpler at the call site,
  // and not slated for removal. Migrate to the fluent form when the
  // deprecation actually starts breaking builds.
  const ImageManipulator = await import('expo-image-manipulator');
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    {
      format: ImageManipulator.SaveFormat.JPEG,
      compress: 0.92,
    },
  );
  return result.uri;
}


/**
 * Materialize a picked photo source into a stripped-EXIF JPEG Blob.
 * Single source of truth for every photo-upload path (listing photos,
 * pet photos, condition-report photos, daily-update photos). Each of
 * those flows used to read the source into a Blob preserving the
 * original extension (jpg/png/webp); after this helper they're all
 * JPEG because stripExif always re-encodes.
 *
 * Returned Blob has its EXIF metadata (including GPS coordinates)
 * stripped. The `ext` is always `'jpg'` after the strip pass.
 */
export type PickedSource =
  | { kind: 'web-file'; file: File }
  | { kind: 'native-uri'; uri: string; mimeType?: string };

export async function materializeSourceToStrippedBlob(
  source: PickedSource,
): Promise<{ blob: Blob; ext: string }> {
  let strippedUri: string;

  if (source.kind === 'web-file') {
    // Web: read the File into a transient object URL, strip via
    // canvas (which returns a data URL), then revoke the object URL
    // so we don't leak it in browser memory.
    const objectUrl = URL.createObjectURL(source.file);
    try {
      strippedUri = await stripExif(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } else {
    // Native: pass the uri straight to the manipulator.
    strippedUri = await stripExif(source.uri);
  }

  // Fetch the stripped output (data-URL on web, file:// on native)
  // back to a Blob the storage layer can upload as-is.
  const resp = await fetch(strippedUri);
  const blob = await resp.blob();
  return { blob, ext: 'jpg' };
}
