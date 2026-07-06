// =============================================================================
// Petbnb — Database type definitions
//
// HAND-MAINTAINED for the MVP. The Supabase CLI's remote type-gen requires
// reaching api.supabase.com, which is currently blocked from this machine's
// network. The shape below mirrors what
//   `npx supabase gen types typescript --project-id <ref> --schema public`
// would produce against migrations 0001 / 0002 / 0003.
//
// When the network becomes friendly (e.g., from a different network or once
// McAfee TLS inspection is relaxed for node.exe), regenerate this file with:
//
//   $env:SUPABASE_ACCESS_TOKEN = '<pat>'
//   npx supabase gen types typescript --project-id <ref> --schema public `
//     | Out-File -Encoding utf8 src\types\database.ts
//
// Whenever you change the SQL migrations, update this file in the same
// commit so types and schema stay in lock-step.
// =============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      // ---------------------------------------------------------------------
      profiles: {
        Row: {
          id: string; // uuid, FK -> auth.users(id)
          full_name: string;
          full_name_en: string | null;
          phone: string | null;
          role: Database['public']['Enums']['user_role'];
          avatar_url: string | null;
          nafath_verified: boolean;
          id_document_url: string | null;
          is_verified: boolean;
          is_suspended: boolean;
          locale: string;
          // 0048 — PDPL consent stamp; NULL for pre-consent accounts.
          // Forward-only via guard_profile_tos_stamp (column-scoped).
          tos_accepted_at: string | null;
          // ── 0039: host application fields ─────────────────────
          host_application_status:
            | Database['public']['Enums']['host_application_status']
            | null;
          host_application_submitted_at: string | null;
          host_application_reviewed_at: string | null;
          host_application_reviewer_id: string | null;
          host_application_admin_notes: string | null;
          host_gender: Database['public']['Enums']['host_gender'] | null;
          host_city: string | null;
          host_neighborhood: string | null;
          host_pet_type_accepted:
            | Database['public']['Enums']['host_pet_type_accepted']
            | null;
          host_experience_years: number | null;
          host_bio_ar: string | null;
          host_profile_complete: boolean;
          created_at: string;
        };
        Insert: {
          id: string; // required — must equal auth.uid()
          full_name?: string;
          full_name_en?: string | null;
          phone?: string | null;
          role?: Database['public']['Enums']['user_role'];
          avatar_url?: string | null;
          nafath_verified?: boolean;
          tos_accepted_at?: string | null;
          id_document_url?: string | null;
          is_verified?: boolean;
          is_suspended?: boolean;
          locale?: string;
          host_application_status?:
            | Database['public']['Enums']['host_application_status']
            | null;
          host_application_submitted_at?: string | null;
          host_application_reviewed_at?: string | null;
          host_application_reviewer_id?: string | null;
          host_application_admin_notes?: string | null;
          host_gender?: Database['public']['Enums']['host_gender'] | null;
          host_city?: string | null;
          host_neighborhood?: string | null;
          host_pet_type_accepted?:
            | Database['public']['Enums']['host_pet_type_accepted']
            | null;
          host_experience_years?: number | null;
          host_bio_ar?: string | null;
          host_profile_complete?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          full_name_en?: string | null;
          phone?: string | null;
          role?: Database['public']['Enums']['user_role'];
          avatar_url?: string | null;
          nafath_verified?: boolean;
          tos_accepted_at?: string | null;
          id_document_url?: string | null;
          is_verified?: boolean;
          is_suspended?: boolean;
          locale?: string;
          host_application_status?:
            | Database['public']['Enums']['host_application_status']
            | null;
          host_application_submitted_at?: string | null;
          host_application_reviewed_at?: string | null;
          host_application_reviewer_id?: string | null;
          host_application_admin_notes?: string | null;
          host_gender?: Database['public']['Enums']['host_gender'] | null;
          host_city?: string | null;
          host_neighborhood?: string | null;
          host_pet_type_accepted?:
            | Database['public']['Enums']['host_pet_type_accepted']
            | null;
          host_experience_years?: number | null;
          host_bio_ar?: string | null;
          host_profile_complete?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey';
            columns: ['id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      pets: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          species: string;
          breed: string | null;
          breed_other: string | null;
          age_months: number | null;
          vaccination_doc_url: string | null;
          rabies_vaccinated_at: string | null;
          fvrcp_vaccinated_at: string | null;
          care_notes: string | null;
          behavioral_notes: string | null;
          medical_needs: string | null;
          dietary_restrictions: string | null;
          medications: string | null;
          photo_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          species?: string;
          breed?: string | null;
          breed_other?: string | null;
          age_months?: number | null;
          vaccination_doc_url?: string | null;
          rabies_vaccinated_at?: string | null;
          fvrcp_vaccinated_at?: string | null;
          care_notes?: string | null;
          behavioral_notes?: string | null;
          medical_needs?: string | null;
          dietary_restrictions?: string | null;
          medications?: string | null;
          photo_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          species?: string;
          breed?: string | null;
          breed_other?: string | null;
          age_months?: number | null;
          vaccination_doc_url?: string | null;
          rabies_vaccinated_at?: string | null;
          fvrcp_vaccinated_at?: string | null;
          care_notes?: string | null;
          behavioral_notes?: string | null;
          medical_needs?: string | null;
          dietary_restrictions?: string | null;
          medications?: string | null;
          photo_url?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pets_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      listings: {
        Row: {
          id: string;
          host_id: string;
          title_ar: string;
          title_en: string | null;
          description_ar: string | null;
          description_en: string | null;
          city: 'riyadh' | 'dammam';
          neighborhood: string;
          nightly_price_sar: number;
          max_concurrent_pets: number;
          has_resident_pets: boolean;
          resident_pets_note: string | null;
          // Step 8 visibility column. is_active was dropped in 8i
          // (migration 0024) along with its bridge trigger.
          status: 'pending' | 'approved' | 'paused' | 'admin_disabled';
          tier: Database['public']['Enums']['listing_tier'];
          offers_grooming: boolean;
          // 0041 — per-host service-addon opt-ins. NOT NULL with
          // default false on listings; nullable on listing_drafts.
          offers_vet: boolean;
          offers_insurance: boolean;
          offers_transport: boolean;
          host_gender: Database['public']['Enums']['host_gender'];
          // Milestone A (migration 0026) — host requires vaccinated
          // pets only. Mirrored on listing_drafts and copied through
          // promote_listing_draft.
          requires_vaccination: boolean;
          additional_pet_discount: number;
          lat: number | null;
          lng: number | null;
          // Step 5.7 / Round 12 (migration 0034). text[] of supported
          // species — today: 'cat' | 'dog'. Defaults to ['cat'] for
          // backfill compatibility on every pre-12 listing.
          accepts_species: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          host_id: string;
          title_ar: string;
          title_en?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          city: 'riyadh' | 'dammam';
          neighborhood: string;
          nightly_price_sar: number;
          max_concurrent_pets?: number;
          has_resident_pets?: boolean;
          resident_pets_note?: string | null;
          status?: 'pending' | 'approved' | 'paused' | 'admin_disabled';
          tier?: Database['public']['Enums']['listing_tier'];
          offers_grooming?: boolean;
          offers_vet?: boolean;
          offers_insurance?: boolean;
          offers_transport?: boolean;
          host_gender: Database['public']['Enums']['host_gender'];
          requires_vaccination?: boolean;
          additional_pet_discount?: number;
          lat?: number | null;
          lng?: number | null;
          accepts_species?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          host_id?: string;
          title_ar?: string;
          title_en?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          city?: 'riyadh' | 'dammam';
          neighborhood?: string;
          nightly_price_sar?: number;
          max_concurrent_pets?: number;
          has_resident_pets?: boolean;
          resident_pets_note?: string | null;
          status?: 'pending' | 'approved' | 'paused' | 'admin_disabled';
          tier?: Database['public']['Enums']['listing_tier'];
          offers_grooming?: boolean;
          offers_vet?: boolean;
          offers_insurance?: boolean;
          offers_transport?: boolean;
          host_gender?: Database['public']['Enums']['host_gender'];
          requires_vaccination?: boolean;
          additional_pet_discount?: number;
          lat?: number | null;
          lng?: number | null;
          accepts_species?: string[];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'listings_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      listing_photos: {
        Row: {
          id: string;
          listing_id: string;
          photo_url: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          photo_url: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          photo_url?: string;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_photos_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      // listing_photo_drafts — the pending photo-set copy. Added in 8c
      // (migration 0022). Same shape as listing_photos. RLS restricts
      // visibility to admin + host of the parent listing.
      listing_photo_drafts: {
        Row: {
          id: string;
          listing_id: string;
          photo_url: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          photo_url: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          photo_url?: string;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_photo_drafts_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      // listing_blocked_dates — host-managed unavailable ranges
      // (Milestone B / migration 0027). Half-open [start, end).
      listing_blocked_dates: {
        Row: {
          id: string;
          listing_id: string;
          start_date: string;
          end_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          start_date: string;
          end_date: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          start_date?: string;
          end_date?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_blocked_dates_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      // listing_drafts — the pending field-edit copy. Added in 8c
      // (migration 0022). Two-copies-max via UNIQUE(listing_id).
      // RLS restricts visibility to admin + host of the parent listing.
      listing_drafts: {
        Row: {
          id: string;
          listing_id: string;
          city: 'riyadh' | 'dammam';
          neighborhood: string;
          title_ar: string;
          title_en: string | null;
          description_ar: string | null;
          description_en: string | null;
          nightly_price_sar: number;
          max_concurrent_pets: number;
          has_resident_pets: boolean;
          resident_pets_note: string | null;
          offers_grooming: boolean;
          // 0041 — per-host service-addon opt-ins on the draft.
          // Nullable: null = "draft does not touch this flag",
          // fall back to the live row's value during prefill.
          offers_vet: boolean | null;
          offers_insurance: boolean | null;
          offers_transport: boolean | null;
          host_gender: 'female' | 'male';
          requires_vaccination: boolean;
          accepts_species: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          city: 'riyadh' | 'dammam';
          neighborhood: string;
          title_ar: string;
          title_en?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          nightly_price_sar: number;
          max_concurrent_pets: number;
          has_resident_pets: boolean;
          resident_pets_note?: string | null;
          offers_grooming: boolean;
          offers_vet?: boolean | null;
          offers_insurance?: boolean | null;
          offers_transport?: boolean | null;
          host_gender: 'female' | 'male';
          requires_vaccination?: boolean;
          accepts_species?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          city?: 'riyadh' | 'dammam';
          neighborhood?: string;
          title_ar?: string;
          title_en?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          nightly_price_sar?: number;
          max_concurrent_pets?: number;
          has_resident_pets?: boolean;
          resident_pets_note?: string | null;
          offers_grooming?: boolean;
          offers_vet?: boolean | null;
          offers_insurance?: boolean | null;
          offers_transport?: boolean | null;
          host_gender?: 'female' | 'male';
          requires_vaccination?: boolean;
          accepts_species?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_drafts_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: true;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      bookings: {
        Row: {
          id: string;
          listing_id: string;
          owner_id: string;
          pet_id: string;
          start_date: string; // ISO date (yyyy-mm-dd)
          end_date: string;
          nights: number; // GENERATED — never written
          base_price_sar: number;
          base_subtotal_sar: number | null;
          additional_pet_discount: number | null;
          addons_total_sar: number;
          total_sar: number;
          status: Database['public']['Enums']['booking_status'];
          created_at: string;
          // S1 payments foundations (migration 0028) — all nullable;
          // filled in at host-accept (paid_at + payout_status='held'
          // + fees) and at completion (payout_status='released'),
          // or on owner cancel (cancelled_at + refund_sar).
          owner_fee_sar: number | null;
          total_charged_sar: number | null;
          host_fee_sar: number | null;
          payout_sar: number | null;
          paid_at: string | null;
          payout_status: 'held' | 'released' | null;
          cancelled_at: string | null;
          refund_sar: number | null;
          // 0044 — read tracking. NULL until the participant first
          // opens the thread; updated via mark_thread_read RPC.
          owner_last_opened_at: string | null;
          host_last_opened_at: string | null;
          // 0046 — β thread continuity. Link a booking back to the
          // inquiry it originated from (nullable; ON DELETE SET NULL).
          inquiry_id: string | null;
          // 0046 — status-transition timestamps stamped by the
          // guard_booking_status_stamp BEFORE UPDATE trigger.
          // cancelled_at is NOT here (already declared above, owned
          // by the 0028 cancel-path).
          accepted_at: string | null;
          declined_at: string | null;
          active_at: string | null;
          completed_at: string | null;
          disputed_at: string | null;
        };
        Insert: {
          id?: string;
          listing_id: string;
          owner_id: string;
          pet_id: string;
          start_date: string;
          end_date: string;
          // nights is GENERATED ALWAYS — must NOT appear in Insert
          base_price_sar: number;
          base_subtotal_sar?: number | null;
          additional_pet_discount?: number | null;
          addons_total_sar?: number;
          total_sar: number;
          status?: Database['public']['Enums']['booking_status'];
          created_at?: string;
          owner_fee_sar?: number | null;
          total_charged_sar?: number | null;
          host_fee_sar?: number | null;
          payout_sar?: number | null;
          paid_at?: string | null;
          payout_status?: 'held' | 'released' | null;
          cancelled_at?: string | null;
          refund_sar?: number | null;
          owner_last_opened_at?: string | null;
          host_last_opened_at?: string | null;
          // 0046 — set at insert when the booking originates from an
          // inquiry; left null when booked directly from a listing.
          inquiry_id?: string | null;
          // 0046 — stamped by the BEFORE UPDATE trigger, not by app
          // code (the helpers below don't set these); declared
          // optional so the insert shape is liberal for any future
          // caller that wants to backfill.
          accepted_at?: string | null;
          declined_at?: string | null;
          active_at?: string | null;
          completed_at?: string | null;
          disputed_at?: string | null;
        };
        Update: {
          id?: string;
          listing_id?: string;
          owner_id?: string;
          pet_id?: string;
          start_date?: string;
          end_date?: string;
          // nights is GENERATED ALWAYS — must NOT appear in Update
          base_price_sar?: number;
          base_subtotal_sar?: number | null;
          additional_pet_discount?: number | null;
          addons_total_sar?: number;
          total_sar?: number;
          status?: Database['public']['Enums']['booking_status'];
          created_at?: string;
          owner_fee_sar?: number | null;
          total_charged_sar?: number | null;
          host_fee_sar?: number | null;
          payout_sar?: number | null;
          paid_at?: string | null;
          payout_status?: 'held' | 'released' | null;
          cancelled_at?: string | null;
          refund_sar?: number | null;
          owner_last_opened_at?: string | null;
          host_last_opened_at?: string | null;
          // 0046 — typically not touched by UPDATE callers; the
          // BEFORE UPDATE trigger stamps the _at columns on status
          // transitions. Declared optional for permissiveness.
          inquiry_id?: string | null;
          accepted_at?: string | null;
          declined_at?: string | null;
          active_at?: string | null;
          completed_at?: string | null;
          disputed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bookings_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_pet_id_fkey';
            columns: ['pet_id'];
            isOneToOne: false;
            referencedRelation: 'pets';
            referencedColumns: ['id'];
          },
          // 0046 — link back to the originating inquiry. ON DELETE
          // SET NULL at the DB layer (verified migration apply log).
          {
            foreignKeyName: 'bookings_inquiry_id_fkey';
            columns: ['inquiry_id'];
            isOneToOne: false;
            referencedRelation: 'inquiries';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      // Junction table for multi-pet bookings (added in Step 5.6). The
      // singular bookings.pet_id stays in place for now; will be dropped
      // in a follow-up migration once no callers remain on it.
      booking_pets: {
        Row: {
          booking_id: string;
          pet_id: string;
          created_at: string;
        };
        Insert: {
          booking_id: string;
          pet_id: string;
          created_at?: string;
        };
        Update: {
          booking_id?: string;
          pet_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'booking_pets_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booking_pets_pet_id_fkey';
            columns: ['pet_id'];
            isOneToOne: false;
            referencedRelation: 'pets';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      booking_addons: {
        Row: {
          id: string;
          booking_id: string;
          type: Database['public']['Enums']['booking_addon_type'];
          provider_label: string | null;
          price_sar: number;
          pet_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          type: Database['public']['Enums']['booking_addon_type'];
          provider_label?: string | null;
          price_sar: number;
          pet_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          type?: Database['public']['Enums']['booking_addon_type'];
          provider_label?: string | null;
          price_sar?: number;
          pet_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'booking_addons_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      condition_reports: {
        Row: {
          id: string;
          booking_id: string;
          phase: Database['public']['Enums']['condition_report_phase'];
          reporter_id: string;
          weight_note: string | null;
          health_notes: string | null;
          behavior_notes: string | null;
          photos: Json; // jsonb — array of storage URLs by convention
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          phase: Database['public']['Enums']['condition_report_phase'];
          reporter_id: string;
          weight_note?: string | null;
          health_notes?: string | null;
          behavior_notes?: string | null;
          photos?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          phase?: Database['public']['Enums']['condition_report_phase'];
          reporter_id?: string;
          weight_note?: string | null;
          health_notes?: string | null;
          behavior_notes?: string | null;
          photos?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'condition_reports_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'condition_reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      daily_updates: {
        Row: {
          id: string;
          booking_id: string;
          host_id: string;
          photos: Json;
          video_url: string | null;
          note_ar: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          host_id: string;
          photos?: Json;
          video_url?: string | null;
          note_ar?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          host_id?: string;
          photos?: Json;
          video_url?: string | null;
          note_ar?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_updates_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_updates_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      // 0040: booking_id is now nullable; inquiry_id added (nullable).
      // The messages_one_thread_check CHECK constraint enforces that
      // exactly one of booking_id / inquiry_id is set per row, so any
      // given row in practice has one populated and the other null.
      messages: {
        Row: {
          id: string;
          booking_id: string | null;
          inquiry_id: string | null;
          sender_id: string;
          // 0044 — body is nullable to support soft-delete (body
          // gets nulled when deleted_at is set; the
          // messages_body_present_unless_deleted CHECK enforces
          // body is non-null + non-empty on live messages).
          body: string | null;
          created_at: string;
          // 0044 — soft-delete marker. NULL = live; non-null =
          // deleted at that timestamp. Once set, the message is
          // immutable (guard_message_update rejects all further
          // updates).
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          booking_id?: string | null;
          inquiry_id?: string | null;
          sender_id: string;
          body: string; // 0044 — insert MUST provide non-empty body
          created_at?: string;
          deleted_at?: string | null; // 0044 — should always be null on insert
        };
        Update: {
          // 0044 — only soft-delete is permitted. guard_message_update
          // rejects updates that touch any column other than
          // deleted_at + body, and requires deleted_at to move null →
          // non-null while body moves non-null → null on the same call.
          // Other columns kept in the Update type for shape parity with
          // Row, but writes will raise at the trigger.
          id?: string;
          booking_id?: string | null;
          inquiry_id?: string | null;
          sender_id?: string;
          body?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_inquiry_id_fkey';
            columns: ['inquiry_id'];
            isOneToOne: false;
            referencedRelation: 'inquiries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      // 0047: notifications (Phase 2 — in_app channel). Rows are inserted
      // ONLY by SECURITY DEFINER source-event triggers (no client INSERT
      // policy). Clients read their own rows and may set read_at (once,
      // forward-only) via the update policy + guard trigger. emailed_at is
      // written by the 2b email channel, never the client.
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type:
            | 'booking_requested'
            | 'booking_accepted'
            | 'booking_declined'
            | 'booking_cancelled'
            | 'message_received'
            | 'host_application_approved'
            | 'host_application_rejected';
          title_key: string;
          body_params: Json;
          link_path: string;
          created_at: string;
          read_at: string | null;
          emailed_at: string | null;
        };
        // Insert/Update kept minimal — clients never INSERT (trigger-only)
        // and only ever UPDATE read_at. Shapes stay for parity with Row.
        Insert: {
          id?: string;
          user_id: string;
          type: Database['public']['Tables']['notifications']['Row']['type'];
          title_key: string;
          body_params?: Json;
          link_path: string;
          created_at?: string;
          read_at?: string | null;
          emailed_at?: string | null;
        };
        Update: {
          read_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      // 0040: pre-booking inquiry threads. A first-class parent of
      // inquiry-scoped messages (see messages.inquiry_id above). UPSERT
      // against the (listing_id, starter_id) UNIQUE constraint to fetch-
      // or-create a thread when the owner taps "Message host".
      inquiries: {
        Row: {
          id: string;
          listing_id: string;
          starter_id: string;
          host_id: string;
          status: Database['public']['Enums']['inquiry_status'];
          created_at: string;
          updated_at: string;
          last_message_at: string | null;
          // 0044 — read tracking. NULL until the participant first
          // opens the thread; updated via mark_thread_read RPC.
          starter_last_opened_at: string | null;
          host_last_opened_at: string | null;
        };
        Insert: {
          id?: string;
          listing_id: string;
          starter_id: string;
          host_id: string;
          status?: Database['public']['Enums']['inquiry_status'];
          created_at?: string;
          updated_at?: string;
          last_message_at?: string | null;
          starter_last_opened_at?: string | null;
          host_last_opened_at?: string | null;
        };
        Update: {
          // id / listing_id / starter_id / host_id / created_at are
          // immutable per the guard_inquiry_update trigger; status
          // transitions limited to open → converted (closing
          // blocked since 0043). last_opened_at columns are
          // forward-only per the 0044 trigger extension.
          status?: Database['public']['Enums']['inquiry_status'];
          updated_at?: string;
          last_message_at?: string | null;
          starter_last_opened_at?: string | null;
          host_last_opened_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inquiries_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inquiries_starter_id_fkey';
            columns: ['starter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inquiries_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      reviews: {
        Row: {
          id: string;
          booking_id: string;
          rater_id: string;
          ratee_id: string;
          stars: number; // 1–5 enforced by CHECK
          text_ar: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          rater_id: string;
          ratee_id: string;
          stars: number;
          text_ar?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          rater_id?: string;
          ratee_id?: string;
          stars?: number;
          text_ar?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reviews_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_rater_id_fkey';
            columns: ['rater_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_ratee_id_fkey';
            columns: ['ratee_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      // ---------------------------------------------------------------------
      products: {
        Row: {
          id: string;
          name_ar: string;
          seller_name: string;
          brand: string | null;
          price_sar: number;
          category: string | null;
          image_url: string | null;
          is_halal_certified: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name_ar: string;
          seller_name: string;
          brand?: string | null;
          price_sar: number;
          category?: string | null;
          image_url?: string | null;
          is_halal_certified?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name_ar?: string;
          seller_name?: string;
          brand?: string | null;
          price_sar?: number;
          category?: string | null;
          image_url?: string | null;
          is_halal_certified?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };

      // ---------------------------------------------------------------------
      // Round 11 / 0033 — saved listings. Composite PK (user_id,
      // listing_id) doubles as the uniqueness constraint and the
      // hot-path lookup index for "is this listing favorited".
      favorites: {
        Row: {
          user_id: string;
          listing_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          listing_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          listing_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };

    Views: Record<string, never>;
    Functions: {
      admin_list_users: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          full_name: string;
          phone: string | null;
          role: Database['public']['Enums']['user_role'];
          avatar_url: string | null;
          nafath_verified: boolean;
          is_verified: boolean;
          is_suspended: boolean;
          profile_created_at: string;
          email: string;
          auth_created_at: string;
          last_sign_in_at: string | null;
        }[];
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_active_user: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      // Step 7.3a (migration 0020) — atomic reorder of listing photos
      // under the unique(listing_id, sort_order) constraint.
      reorder_listing_photos: {
        Args: { p_listing_id: string; p_order: string[] };
        Returns: void;
      };
      // 0044 — message read-tracking. Caller (authenticated) marks a
      // thread as read at the current server now(); RPC validates
      // participation (booking owner/host OR inquiry starter/host)
      // and updates the caller's last_opened_at column on the parent
      // row with GREATEST(existing, now()) to guarantee monotonicity.
      // Raises 42501 if the caller isn't a participant, 22023 if
      // p_thread_kind isn't 'booking' or 'inquiry'.
      mark_thread_read: {
        Args: { p_thread_kind: 'booking' | 'inquiry'; p_thread_id: string };
        Returns: void;
      };
      // 0047 (Phase 2) — mark every unread notification for the caller as
      // read in one statement. Backs the /notifications "mark all read"
      // button. SECURITY DEFINER; authenticated-only.
      mark_all_notifications_read: {
        Args: Record<string, never>;
        Returns: void;
      };
      // Step 8f (migration 0023) — admin promotes drafts to live.
      // Returns the array of orphan photo URLs that USED to live but
      // aren't in the new (promoted) photo set. Admin client cleans
      // up the corresponding storage objects best-effort.
      promote_listing_draft: {
        Args: { p_listing_id: string };
        Returns: string[];
      };
      // Step 8f — admin or host wipes drafts. Returns draft photo URLs
      // that are NOT referenced by live (safe-to-remove from storage).
      discard_listing_draft: {
        Args: { p_listing_id: string };
        Returns: string[];
      };
      // Step 8f — atomic draft reorder, mirror of reorder_listing_photos.
      reorder_listing_photo_drafts: {
        Args: { p_listing_id: string; p_order: string[] };
        Returns: void;
      };
      // Round 3 / 0032 — server-side host rating aggregation.
      // Returns one row per host id passed in; missing hosts (no
      // reviews) are simply absent from the result. SECURITY DEFINER
      // so anon (R2C3 guest mode) and authenticated callers both
      // get the same numbers.
      get_host_ratings: {
        Args: { host_ids: string[] };
        Returns: {
          host_id: string;
          avg_rating: number;
          review_count: number;
        }[];
      };
      // Feature 1 / 0035 — search-time availability filtering.
      // Returns plain listings rows that pass the standard feed
      // predicates AND have both capacity and no blocked-range
      // overlap for the searched window. Mirrors the 0027 booking
      // capacity trigger so submit-time guard and search agree.
      available_listings: {
        Args: {
          p_search_start: string;
          p_search_end: string;
          p_pet_count?: number;
          p_city?: string | null;
          p_neighborhood?: string | null;
          p_female_only?: boolean;
          p_grooming_only?: boolean;
          p_no_resident_pets_only?: boolean;
          p_min_price_sar?: number | null;
          p_max_price_sar?: number | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: Database['public']['Tables']['listings']['Row'][];
      };
    };

    // These mirror the CHECK constraints in 0001_initial_schema.sql. They
    // aren't real Postgres ENUM types (we chose TEXT+CHECK for ease of
    // schema evolution), but exposing them here as named unions gives the
    // app the same type-safety as if they were. If we ever migrate to real
    // Postgres ENUMs, `supabase gen types` will produce identical names.
    Enums: {
      user_role: 'owner' | 'host' | 'admin';
      listing_tier: 'bronze' | 'silver' | 'gold';
      host_gender: 'female' | 'male';
      host_application_status: 'pending' | 'approved' | 'rejected';
      host_pet_type_accepted: 'cats' | 'dogs' | 'cats_and_dogs';
      // 0040 — pre-booking inquiry threads.
      // open      → active, accepting new messages
      // converted → terminal; a booking was accepted out of this thread
      // closed    → terminal; archived by a participant
      inquiry_status: 'open' | 'converted' | 'closed';
      booking_status:
        | 'requested'
        | 'accepted'
        | 'declined'
        | 'active'
        | 'completed'
        | 'cancelled'
        | 'disputed';
      booking_addon_type: 'grooming' | 'vet' | 'transport' | 'insurance';
      condition_report_phase: 'check_in' | 'check_out';
    };
    CompositeTypes: Record<string, never>;
  };
};

// =============================================================================
// Convenience helpers — same names the Supabase CLI emits, so app code that
// uses them keeps compiling after a future swap to auto-generated types.
// =============================================================================

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];
