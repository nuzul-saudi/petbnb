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
          persona: string | null;
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
          id_document_url?: string | null;
          is_verified?: boolean;
          is_suspended?: boolean;
          locale?: string;
          persona?: string | null;
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
          id_document_url?: string | null;
          is_verified?: boolean;
          is_suspended?: boolean;
          locale?: string;
          persona?: string | null;
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
          is_active: boolean;
          tier: Database['public']['Enums']['listing_tier'];
          offers_grooming: boolean;
          host_gender: Database['public']['Enums']['host_gender'];
          additional_pet_discount: number;
          lat: number | null;
          lng: number | null;
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
          is_active?: boolean;
          tier?: Database['public']['Enums']['listing_tier'];
          offers_grooming?: boolean;
          host_gender: Database['public']['Enums']['host_gender'];
          additional_pet_discount?: number;
          lat?: number | null;
          lng?: number | null;
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
          is_active?: boolean;
          tier?: Database['public']['Enums']['listing_tier'];
          offers_grooming?: boolean;
          host_gender?: Database['public']['Enums']['host_gender'];
          additional_pet_discount?: number;
          lat?: number | null;
          lng?: number | null;
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
      messages: {
        Row: {
          id: string;
          booking_id: string;
          sender_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          sender_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          sender_id?: string;
          body?: string;
          created_at?: string;
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
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
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
    };

    // These mirror the CHECK constraints in 0001_initial_schema.sql. They
    // aren't real Postgres ENUM types (we chose TEXT+CHECK for ease of
    // schema evolution), but exposing them here as named unions gives the
    // app the same type-safety as if they were. If we ever migrate to real
    // Postgres ENUMs, `supabase gen types` will produce identical names.
    Enums: {
      user_role: 'owner' | 'host' | 'both' | 'admin';
      listing_tier: 'bronze' | 'silver' | 'gold';
      host_gender: 'female' | 'male';
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
