/**
 * The sitter-first listing card — the core object of the owner feed.
 * The host is the hero (avatar, name, verified ✓, tier, gender,
 * neighborhood); the home photo is secondary evidence below. New hosts
 * show an honest "جديد" badge, never fabricated ratings. Prices render
 * in Arabic-Indic digits with the ر.س mark.
 *
 * @startingPoint section="Listings" subtitle="Sitter-first feed card" viewport="380x340"
 */
export interface ListingCardProps {
  hostName: string;
  hostPhoto?: string | null;
  /** Show the trust ✓. Default true. */
  verified?: boolean;
  tier?: 'gold' | 'silver' | 'bronze';
  gender?: 'female' | 'male';
  district?: string;
  city?: string;
  /** Distance in km (already Arabic-Indic formatted, e.g. "٣٫٢"). */
  distanceKm?: string | null;
  title?: string;
  /** Nightly price, Arabic-Indic string (e.g. "٤٥٠"). The ر.س mark + "/ ليلة" are added. */
  price?: string;
  /** Max concurrent pets, Arabic-Indic string. */
  maxPets?: string | number;
  coverPhoto?: string | null;
  /** Show the "جديد" badge (when there's no statusBadge). Default true. */
  isNew?: boolean;
  /** Host-home override pill (e.g. active/inactive listing status). */
  statusBadge?: ListingCardStatusBadge;
  onPress?: () => void;
}

export interface ListingCardStatusBadge {
  label: string;
  color: string;
}

export function ListingCard(props: ListingCardProps): JSX.Element;
