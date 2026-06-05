// Host action buttons for a booking — Accept+Decline (requested),
// Start (accepted), Complete (active). Presentational only: the parent
// owns hostFlight state, the four async handlers, and the isHost gate.
// Extracted verbatim from src/app/bookings/[id].tsx — same buttons,
// variants, i18n labels, and single-in-flight disabling.

import { StyleSheet, Text } from "react-native";

import { Button } from "@/components/Button";
import type { BookingDetail } from "@/lib/bookings";
import { useTranslation } from "@/lib/i18n";
import { colors, fonts } from "@/theme/tokens";

export type HostFlight =
  | "accept"
  | "decline"
  | "start"
  | "complete"
  | null;

export type HostActionsProps = {
  status: BookingDetail["status"];
  hostFlight: HostFlight;
  hostError: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onStart: () => void;
  onComplete: () => void;
  /**
   * Suppress the active-state Complete button. Used when CheckOutSection
   * is the active path to completion (active booking + no check-out
   * report yet). When a check-out report exists but the booking is still
   * active (the seam-retry case), this should be false so the host has a
   * Complete button to finish the stay.
   */
  hideComplete?: boolean;
};

export function HostActions({
  status,
  hostFlight,
  hostError,
  onAccept,
  onDecline,
  onStart,
  onComplete,
  hideComplete = false,
}: HostActionsProps) {
  const { t } = useTranslation();

  return (
    <>
      {hostError ? (
        <Text style={styles.errorText}>{hostError}</Text>
      ) : null}
      {status === "requested" ? (
        <>
          <Button
            label={
              hostFlight === "accept"
                ? t("booking.host_accepting")
                : t("booking.host_accept_button")
            }
            onPress={onAccept}
            variant="primary"
            loading={hostFlight === "accept"}
            disabled={!!hostFlight && hostFlight !== "accept"}
            fullWidth
          />
          <Button
            label={
              hostFlight === "decline"
                ? t("booking.host_declining")
                : t("booking.host_decline_button")
            }
            onPress={onDecline}
            variant="destructive"
            loading={hostFlight === "decline"}
            disabled={!!hostFlight && hostFlight !== "decline"}
            fullWidth
          />
        </>
      ) : null}
      {status === "accepted" ? (
        <Button
          label={
            hostFlight === "start"
              ? t("booking.host_starting")
              : t("booking.host_start_button")
          }
          onPress={onStart}
          variant="primary"
          loading={hostFlight === "start"}
          disabled={!!hostFlight && hostFlight !== "start"}
          fullWidth
        />
      ) : null}
      {status === "active" && !hideComplete ? (
        <Button
          label={
            hostFlight === "complete"
              ? t("booking.host_completing")
              : t("booking.host_complete_button")
          }
          onPress={onComplete}
          variant="primary"
          loading={hostFlight === "complete"}
          disabled={!!hostFlight && hostFlight !== "complete"}
          fullWidth
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Mirrors styles.errorText in src/app/bookings/[id].tsx so the
  // extracted block renders identically without threading a style prop
  // through from the parent.
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.terracotta,
    textAlign: "center",
  },
});
