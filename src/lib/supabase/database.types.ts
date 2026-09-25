export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      handshakes: {
        Row: {
          created_at: string
          id: string
          provider_id: string
          request_id: string
          requester_id: string
          response_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider_id: string
          request_id: string
          requester_id: string
          response_id: string
        }
        Update: {
          created_at?: string
          id?: string
          provider_id?: string
          request_id?: string
          requester_id?: string
          response_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "handshakes_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handshakes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "handshakes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handshakes_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handshakes_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: true
            referencedRelation: "request_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotent_operations: {
        Row: {
          created_at: string
          key: string
          operation: string
          request_id: string | null
        }
        Insert: {
          created_at?: string
          key: string
          operation: string
          request_id?: string | null
        }
        Update: {
          created_at?: string
          key?: string
          operation?: string
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotent_operations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "idempotent_operations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transitions: {
        Row: {
          created_at: string
          from_status: Database["public"]["Enums"]["payment_status"]
          id: string
          idempotency_key: string
          request_id: string
          to_status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          created_at?: string
          from_status: Database["public"]["Enums"]["payment_status"]
          id?: string
          idempotency_key: string
          request_id: string
          to_status: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          created_at?: string
          from_status?: Database["public"]["Enums"]["payment_status"]
          id?: string
          idempotency_key?: string
          request_id?: string
          to_status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_transitions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "payment_transitions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_catalogue_media: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["profile_catalogue_kind"]
          sort_order: number
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["profile_catalogue_kind"]
          sort_order: number
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["profile_catalogue_kind"]
          sort_order?: number
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_catalogue_media_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_captured_in_app: boolean
          avatar_path: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          jobs_completed: number
          phone: string | null
          rating_average: number | null
          rating_count: number
          requests_completed: number
          updated_at: string
        }
        Insert: {
          avatar_captured_in_app?: boolean
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          jobs_completed?: number
          phone?: string | null
          rating_average?: number | null
          rating_count?: number
          requests_completed?: number
          updated_at?: string
        }
        Update: {
          avatar_captured_in_app?: boolean
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          jobs_completed?: number
          phone?: string | null
          rating_average?: number | null
          rating_count?: number
          requests_completed?: number
          updated_at?: string
        }
        Relationships: []
      }
      provider_availability: {
        Row: {
          committed_request_id: string | null
          expires_at: string | null
          location: unknown
          service_radius_m: number | null
          status: Database["public"]["Enums"]["availability_status"]
          updated_at: string
          user_id: string
          went_active_at: string | null
        }
        Insert: {
          committed_request_id?: string | null
          expires_at?: string | null
          location?: unknown
          service_radius_m?: number | null
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
          user_id: string
          went_active_at?: string | null
        }
        Update: {
          committed_request_id?: string | null
          expires_at?: string | null
          location?: unknown
          service_radius_m?: number | null
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
          user_id?: string
          went_active_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_availability_committed_request_id_fkey"
            columns: ["committed_request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "provider_availability_committed_request_id_fkey"
            columns: ["committed_request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_services: {
        Row: {
          category_slug: string
          user_id: string
        }
        Insert: {
          category_slug: string
          user_id: string
        }
        Update: {
          category_slug?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_services_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "provider_services_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          ratee_id: string
          rater_id: string
          request_id: string
          stars: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          ratee_id: string
          rater_id: string
          request_id: string
          stars: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          ratee_id?: string
          rater_id?: string
          request_id?: string
          stars?: number
        }
        Relationships: [
          {
            foreignKeyName: "ratings_ratee_id_fkey"
            columns: ["ratee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "ratings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_responses: {
        Row: {
          created_at: string
          decline_reason: string | null
          distance_m: number
          eta_minutes: number | null
          expires_at: string | null
          id: string
          message: string | null
          provider_id: string
          quoted_amount: number | null
          request_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["response_status"]
        }
        Insert: {
          created_at?: string
          decline_reason?: string | null
          distance_m: number
          eta_minutes?: number | null
          expires_at?: string | null
          id?: string
          message?: string | null
          provider_id: string
          quoted_amount?: number | null
          request_id: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["response_status"]
        }
        Update: {
          created_at?: string
          decline_reason?: string | null
          distance_m?: number
          eta_minutes?: number | null
          expires_at?: string | null
          id?: string
          message?: string | null
          provider_id?: string
          quoted_amount?: number | null
          request_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["response_status"]
        }
        Relationships: [
          {
            foreignKeyName: "request_responses_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "request_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_status_events: {
        Row: {
          actor_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["request_status"]
          id: string
          idempotency_key: string
          request_id: string
          to_status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          actor_id: string
          created_at?: string
          from_status: Database["public"]["Enums"]["request_status"]
          id?: string
          idempotency_key: string
          request_id: string
          to_status: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          actor_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["request_status"]
          id?: string
          idempotency_key?: string
          request_id?: string
          to_status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "request_status_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_status_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "request_status_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          accepted_at: string | null
          accepted_response_id: string | null
          cancelled_at: string | null
          category_data: Json
          category_slug: string
          completed_at: string | null
          created_at: string
          currency: string
          description: string
          expires_at: string | null
          id: string
          location: unknown
          location_label: string
          offered_amount: number | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          provider_id: string | null
          radius_expansions: number
          requester_id: string
          scheduled_for: string | null
          search_radius_m: number
          source_request_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["request_status"]
          submitted_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_response_id?: string | null
          cancelled_at?: string | null
          category_data?: Json
          category_slug: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          description: string
          expires_at?: string | null
          id?: string
          location: unknown
          location_label: string
          offered_amount?: number | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          provider_id?: string | null
          radius_expansions?: number
          requester_id: string
          scheduled_for?: string | null
          search_radius_m: number
          source_request_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          submitted_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_response_id?: string | null
          cancelled_at?: string | null
          category_data?: Json
          category_slug?: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          description?: string
          expires_at?: string | null
          id?: string
          location?: unknown
          location_label?: string
          offered_amount?: number | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          provider_id?: string | null
          radius_expansions?: number
          requester_id?: string
          scheduled_for?: string | null
          search_radius_m?: number
          source_request_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_accepted_response_fkey"
            columns: ["accepted_response_id"]
            isOneToOne: false
            referencedRelation: "request_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "requests_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "requests_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          icon: string
          is_active: boolean
          label: string
          slug: string
          sort_order: number
          tagline: string
        }
        Insert: {
          icon: string
          is_active?: boolean
          label: string
          slug: string
          sort_order: number
          tagline: string
        }
        Update: {
          icon?: string
          is_active?: boolean
          label?: string
          slug?: string
          sort_order?: number
          tagline?: string
        }
        Relationships: []
      }
    }
    Views: {
      my_availability: {
        Row: {
          category_slugs: string[] | null
          committed_request_id: string | null
          expires_at: string | null
          service_radius_m: number | null
          status: Database["public"]["Enums"]["availability_status"] | null
          updated_at: string | null
          user_id: string | null
          went_active_at: string | null
        }
        Insert: {
          category_slugs?: never
          committed_request_id?: string | null
          expires_at?: string | null
          service_radius_m?: number | null
          status?: never
          updated_at?: string | null
          user_id?: string | null
          went_active_at?: string | null
        }
        Update: {
          category_slugs?: never
          committed_request_id?: string | null
          expires_at?: string | null
          service_radius_m?: number | null
          status?: never
          updated_at?: string | null
          user_id?: string | null
          went_active_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_availability_committed_request_id_fkey"
            columns: ["committed_request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "provider_availability_committed_request_id_fkey"
            columns: ["committed_request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      my_requests: {
        Row: {
          accepted_at: string | null
          cancelled_at: string | null
          category_data: Json | null
          category_slug: string | null
          completed_at: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          expires_at: string | null
          is_rated: boolean | null
          latitude: number | null
          location_label: string | null
          longitude: number | null
          offered_amount: number | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          pending_response_count: number | null
          provider_id: string | null
          radius_expansions: number | null
          request_id: string | null
          scheduled_for: string | null
          search_radius_m: number | null
          source_request_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["request_status"] | null
          submitted_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          cancelled_at?: string | null
          category_data?: Json | null
          category_slug?: string | null
          completed_at?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          expires_at?: string | null
          is_rated?: never
          latitude?: never
          location_label?: string | null
          longitude?: never
          offered_amount?: number | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          pending_response_count?: never
          provider_id?: string | null
          radius_expansions?: number | null
          request_id?: string | null
          scheduled_for?: string | null
          search_radius_m?: number | null
          source_request_id?: string | null
          started_at?: string | null
          status?: never
          submitted_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          cancelled_at?: string | null
          category_data?: Json | null
          category_slug?: string | null
          completed_at?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          expires_at?: string | null
          is_rated?: never
          latitude?: never
          location_label?: string | null
          longitude?: never
          offered_amount?: number | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          pending_response_count?: never
          provider_id?: string | null
          radius_expansions?: number | null
          request_id?: string | null
          scheduled_for?: string | null
          search_radius_m?: number | null
          source_request_id?: string | null
          started_at?: string | null
          status?: never
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "requests_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "requests_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_response: { Args: { p_response_id: string }; Returns: string }
      apply_payment_transition: {
        Args: {
          p_idempotency_key: string
          p_request_id: string
          p_to_status: Database["public"]["Enums"]["payment_status"]
        }
        Returns: Database["public"]["Enums"]["payment_status"]
      }
      assert_authenticated: { Args: never; Returns: string }
      assert_coordinates: {
        Args: { p_latitude: number; p_longitude: number }
        Returns: unknown
      }
      assert_onboarded: { Args: never; Returns: string }
      browse_nearby_requests: {
        Args: {
          p_category_slug?: string
          p_latitude: number
          p_longitude: number
        }
        Returns: {
          category_data: Json
          category_slug: string
          currency: string
          description: string
          distance_m: number
          location_label: string
          offered_amount: number
          request_id: string
          scheduled_for: string
        }[]
      }
      browse_request: {
        Args: { p_latitude: number; p_longitude: number; p_request_id: string }
        Returns: {
          category_data: Json
          category_slug: string
          currency: string
          description: string
          distance_m: number
          location_label: string
          offered_amount: number
          request_id: string
          scheduled_for: string
        }[]
      }
      bucket_distance_m: { Args: { p_distance_m: number }; Returns: number }
      cancel_request: { Args: { p_request_id: string }; Returns: undefined }
      clone_request_from_prior: {
        Args: { p_idempotency_key: string; p_source_request_id: string }
        Returns: string
      }
      complete_request: { Args: { p_request_id: string }; Returns: undefined }
      confirm_avatar_capture: {
        Args: { p_storage_path: string }
        Returns: undefined
      }
      count_available_responses: {
        Args: { p_request_id: string }
        Returns: number
      }
      create_request: {
        Args: {
          p_category_data?: Json
          p_category_slug: string
          p_description: string
          p_latitude: number
          p_location_label: string
          p_longitude: number
          p_offered_amount?: number
          p_scheduled_for?: string
          p_search_radius_m: number
          p_source_request_id?: string
        }
        Returns: string
      }
      decline_response: {
        Args: { p_reason?: string; p_response_id: string }
        Returns: undefined
      }
      expand_request_radius: { Args: { p_request_id: string }; Returns: number }
      expire_due_requests: { Args: { p_limit?: number }; Returns: number }
      expire_request: { Args: { p_request_id: string }; Returns: boolean }
      get_engagement: {
        Args: { p_request_id: string }
        Returns: {
          accepted_at: string
          category_data: Json
          category_slug: string
          completed_at: string
          counterparty_avatar_path: string
          counterparty_display_name: string
          counterparty_id: string
          counterparty_phone: string
          counterparty_rating_average: number
          counterparty_rating_count: number
          currency: string
          description: string
          handshake_at: string
          handshake_id: string
          location_label: string
          offered_amount: number
          payment_status: Database["public"]["Enums"]["payment_status"]
          provider_latitude: number
          provider_longitude: number
          quoted_amount: number
          rating_stars: number
          request_id: string
          request_latitude: number
          request_longitude: number
          request_status: Database["public"]["Enums"]["request_status"]
          scheduled_for: string
          started_at: string
          viewer_is_requester: boolean
        }[]
      }
      go_active: {
        Args: {
          p_categories: string[]
          p_duration_minutes?: number
          p_latitude: number
          p_longitude: number
          p_service_radius_m: number
        }
        Returns: {
          category_slugs: string[] | null
          committed_request_id: string | null
          expires_at: string | null
          service_radius_m: number | null
          status: Database["public"]["Enums"]["availability_status"] | null
          updated_at: string | null
          user_id: string | null
          went_active_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "my_availability"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      go_offline: {
        Args: never
        Returns: {
          category_slugs: string[] | null
          committed_request_id: string | null
          expires_at: string | null
          service_radius_m: number | null
          status: Database["public"]["Enums"]["availability_status"] | null
          updated_at: string | null
          user_id: string | null
          went_active_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "my_availability"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      list_request_responses: {
        Args: { p_request_id: string }
        Returns: {
          avatar_path: string
          bio: string
          created_at: string
          display_name: string
          distance_m: number
          eta_minutes: number
          expires_at: string
          jobs_completed: number
          message: string
          phone_verified: boolean
          provider_id: string
          quoted_amount: number
          rating_average: number
          rating_count: number
          response_id: string
          status: Database["public"]["Enums"]["response_status"]
        }[]
      }
      mark_service_complete: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      matches: {
        Args: { p_provider_id?: string; p_request_id?: string }
        Returns: {
          distance_m: number
          provider_id: string
          request_id: string
        }[]
      }
      my_responses: {
        Args: never
        Returns: {
          category_data: Json
          category_slug: string
          created_at: string
          currency: string
          decline_reason: string
          description: string
          distance_m: number
          eta_minutes: number
          location_label: string
          message: string
          offered_amount: number
          quoted_amount: number
          request_id: string
          request_status: Database["public"]["Enums"]["request_status"]
          requester_avatar_path: string
          requester_display_name: string
          response_id: string
          response_status: Database["public"]["Enums"]["response_status"]
          scheduled_for: string
        }[]
      }
      nearby_requests: {
        Args: never
        Returns: {
          category_data: Json
          category_slug: string
          created_at: string
          currency: string
          description: string
          distance_m: number
          expires_at: string
          location_label: string
          offered_amount: number
          request_id: string
          requester_avatar_path: string
          requester_display_name: string
          requester_rating_average: number
          requester_rating_count: number
          scheduled_for: string
        }[]
      }
      radius_ladder_m: { Args: never; Returns: number[] }
      rate_request: {
        Args: { p_comment?: string; p_request_id: string; p_stars: number }
        Returns: undefined
      }
      record_request_status_event: {
        Args: {
          p_actor_id: string
          p_from_status: Database["public"]["Enums"]["request_status"]
          p_idempotency_key: string
          p_request_id: string
          p_to_status: Database["public"]["Enums"]["request_status"]
        }
        Returns: undefined
      }
      refresh_availability_location: {
        Args: { p_latitude: number; p_longitude: number }
        Returns: {
          category_slugs: string[] | null
          committed_request_id: string | null
          expires_at: string | null
          service_radius_m: number | null
          status: Database["public"]["Enums"]["availability_status"] | null
          updated_at: string | null
          user_id: string | null
          went_active_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "my_availability"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_provider: { Args: { p_provider_id: string }; Returns: undefined }
      report_service_problem: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      respond_to_request: {
        Args: {
          p_eta_minutes?: number
          p_latitude?: number
          p_longitude?: number
          p_message?: string
          p_quoted_amount?: number
          p_request_id: string
        }
        Returns: string
      }
      send_push: {
        Args: {
          p_body: string
          p_title: string
          p_url: string
          p_user_ids: string[]
        }
        Returns: undefined
      }
      start_request: { Args: { p_request_id: string }; Returns: undefined }
      withdraw_response: { Args: { p_response_id: string }; Returns: undefined }
    }
    Enums: {
      availability_status: "offline" | "available" | "busy"
      payment_status:
        | "not_required"
        | "available"
        | "locked"
        | "pending"
        | "released"
        | "refunded"
        | "disputed"
      profile_catalogue_kind: "photo" | "video"
      request_status:
        | "draft"
        | "searching"
        | "accepted"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "expired"
        | "completion_pending"
        | "disputed"
        | "no_show"
      response_status:
        | "pending"
        | "accepted"
        | "declined"
        | "withdrawn"
        | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      availability_status: ["offline", "available", "busy"],
      payment_status: [
        "not_required",
        "available",
        "locked",
        "pending",
        "released",
        "refunded",
        "disputed",
      ],
      profile_catalogue_kind: ["photo", "video"],
      request_status: [
        "draft",
        "searching",
        "accepted",
        "in_progress",
        "completed",
        "cancelled",
        "expired",
        "completion_pending",
        "disputed",
        "no_show",
      ],
      response_status: [
        "pending",
        "accepted",
        "declined",
        "withdrawn",
        "expired",
      ],
    },
  },
} as const

