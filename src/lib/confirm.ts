// Single confirm-dialog helper. Audit S2 (2026-06-11) found 16 call
// sites across 8 files using two patterns:
//   - window.confirm  (web — synchronous)
//   - Alert.alert     (native — async with callbacks)
// Each screen had its own platform-guarded wrapper, and several
// wrappers silently AUTO-ACCEPTED on native (returned true with no
// prompt). For a destructive action like delete-photo / discard-draft
// / deactivate-listing that's a real landmine in any future mobile
// build. This helper consolidates all 16 sites:
//
//   confirmDialog(message): Promise<boolean>
//     web    → wraps window.confirm
//     native → wraps Alert.alert with two buttons; resolves true on
//              the destructive choice, false on cancel/dismiss
//
// Callers should AWAIT the result and gate the destructive action
// on it. There is no separate title — Alert.alert without a title
// just shows the message, matching window.confirm's single-string
// shape.
//
// Web's window.confirm is synchronous but we return a Promise so
// callers don't need to platform-branch their await/no-await.

import { Alert, Platform } from 'react-native';

export function confirmDialog(message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return Promise.resolve(true);
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert(
      // The first arg is the title slot; we use the message there so
      // the dialog reads naturally without a separate title field.
      message,
      undefined,
      [
        { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
        { text: 'تأكيد', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
