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
      dispute_admin_resolutions: {
        Row: {
          admin_note: string
          created_at: string
          id: string
          idempotency_key: string
          outcome: string
          payment_status_after: Database["public"]["Enums"]["payment_status"]
          request_id: string
          request_status_after: Database["public"]["Enums"]["request_status"]
          service_problem_id: string
        }
        Insert: {
          admin_note: string
          created_at?: string
          id?: string
          idempotency_key: string
          outcome: string
          payment_status_after: Database["public"]["Enums"]["payment_status"]
          request_id: string
          request_status_after: Database["public"]["Enums"]["request_status"]
          service_problem_id: string
        }
        Update: {
          admin_note?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          outcome?: string
          payment_status_after?: Database["public"]["Enums"]["payment_status"]
          request_id?: string
          request_status_after?: Database["public"]["Enums"]["request_status"]
          service_problem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_admin_resolutions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "dispute_admin_resolutions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_admin_resolutions_service_problem_id_fkey"
            columns: ["service_problem_id"]
            isOneToOne: false
            referencedRelation: "service_problems"
            referencedColumns: ["id"]
          },
        ]
      }
      handshakes: {
        Row: {
          created_at: string
          id: string
          request_id: string
          requester_id: string
          response_id: string
          selected_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          request_id: string
          requester_id: string
          response_id: string
          selected_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          request_id?: string
          requester_id?: string
          response_id?: string
          selected_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "handshakes_provider_id_fkey"
            columns: ["selected_user_id"]
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
      notification_inbox: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string
          id: string
          metadata: Json | null
          payment_transition_id: string | null
          read_at: string | null
          related_user_id: string | null
          request_id: string | null
          response_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          url: string | null
          user_id: string
          wallet_ledger_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          dedupe_key: string
          id?: string
          metadata?: Json | null
          payment_transition_id?: string | null
          read_at?: string | null
          related_user_id?: string | null
          request_id?: string | null
          response_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          url?: string | null
          user_id: string
          wallet_ledger_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          metadata?: Json | null
          payment_transition_id?: string | null
          read_at?: string | null
          related_user_id?: string | null
          request_id?: string | null
          response_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          url?: string | null
          user_id?: string
          wallet_ledger_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_inbox_payment_transition_id_fkey"
            columns: ["payment_transition_id"]
            isOneToOne: false
            referencedRelation: "payment_transitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_inbox_related_user_id_fkey"
            columns: ["related_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_inbox_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "notification_inbox_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_inbox_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "request_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_inbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_inbox_wallet_ledger_id_fkey"
            columns: ["wallet_ledger_id"]
            isOneToOne: false
            referencedRelation: "my_wallet_activity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_inbox_wallet_ledger_id_fkey"
            columns: ["wallet_ledger_id"]
            isOneToOne: false
            referencedRelation: "wallet_ledger"
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
      platform_wallet: {
        Row: {
          available: number
          currency: string
          id: number
          updated_at: string
        }
        Insert: {
          available?: number
          currency?: string
          id?: number
          updated_at?: string
        }
        Update: {
          available?: number
          currency?: string
          id?: number
          updated_at?: string
        }
        Relationships: []
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
          message_push_enabled: boolean
          phone: string | null
          push_notifications_enabled: boolean
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
          message_push_enabled?: boolean
          phone?: string | null
          push_notifications_enabled?: boolean
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
          message_push_enabled?: boolean
          phone?: string | null
          push_notifications_enabled?: boolean
          rating_average?: number | null
          rating_count?: number
          requests_completed?: number
          updated_at?: string
        }
        Relationships: []
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
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "ratings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_escrow: {
        Row: {
          created_at: string
          currency: string
          escrow_bucket: string
          provider_amount: number
          request_id: string
          requester_id: string
          service_fee: number
          total: number
        }
        Insert: {
          created_at?: string
          currency?: string
          escrow_bucket?: string
          provider_amount: number
          request_id: string
          requester_id: string
          service_fee: number
          total: number
        }
        Update: {
          created_at?: string
          currency?: string
          escrow_bucket?: string
          provider_amount?: number
          request_id?: string
          requester_id?: string
          service_fee?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "request_escrow_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "request_escrow_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_escrow_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_responses: {
        Row: {
          created_at: string
          decline_reason: string | null
          distance_m: number
          expires_at: string | null
          id: string
          message: string | null
          quoted_amount: number | null
          request_id: string
          resolved_at: string | null
          responder_id: string
          status: Database["public"]["Enums"]["response_status"]
        }
        Insert: {
          created_at?: string
          decline_reason?: string | null
          distance_m: number
          expires_at?: string | null
          id?: string
          message?: string | null
          quoted_amount?: number | null
          request_id: string
          resolved_at?: string | null
          responder_id: string
          status?: Database["public"]["Enums"]["response_status"]
        }
        Update: {
          created_at?: string
          decline_reason?: string | null
          distance_m?: number
          expires_at?: string | null
          id?: string
          message?: string | null
          quoted_amount?: number | null
          request_id?: string
          resolved_at?: string | null
          responder_id?: string
          status?: Database["public"]["Enums"]["response_status"]
        }
        Relationships: [
          {
            foreignKeyName: "request_responses_provider_id_fkey"
            columns: ["responder_id"]
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
          agreed_provider_amount: number | null
          cancelled_at: string | null
          completed_at: string | null
          completion_confirm_by: string | null
          completion_reminder_sent_at: string | null
          created_at: string
          currency: string
          description: string | null
          expires_at: string | null
          expiry_reminder_sent_at: string | null
          id: string
          location: unknown
          location_label: string
          offered_amount: number | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          requester_id: string
          scheduled_for: string | null
          selected_user_id: string | null
          source_request_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["request_status"]
          submitted_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_response_id?: string | null
          agreed_provider_amount?: number | null
          cancelled_at?: string | null
          completed_at?: string | null
          completion_confirm_by?: string | null
          completion_reminder_sent_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          expires_at?: string | null
          expiry_reminder_sent_at?: string | null
          id?: string
          location: unknown
          location_label: string
          offered_amount?: number | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          requester_id: string
          scheduled_for?: string | null
          selected_user_id?: string | null
          source_request_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          submitted_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_response_id?: string | null
          agreed_provider_amount?: number | null
          cancelled_at?: string | null
          completed_at?: string | null
          completion_confirm_by?: string | null
          completion_reminder_sent_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          expires_at?: string | null
          expiry_reminder_sent_at?: string | null
          id?: string
          location?: unknown
          location_label?: string
          offered_amount?: number | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          requester_id?: string
          scheduled_for?: string | null
          selected_user_id?: string | null
          source_request_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          submitted_at?: string | null
          title?: string
          updated_at?: string
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
            foreignKeyName: "requests_provider_id_fkey"
            columns: ["selected_user_id"]
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
      service_problems: {
        Row: {
          created_at: string
          description: string
          evidence_paths: string[]
          id: string
          kind: Database["public"]["Enums"]["service_problem_kind"]
          payment_before: Database["public"]["Enums"]["payment_status"]
          reported_by: string
          request_id: string
          resolution: string | null
          resolved_at: string | null
          respond_by: string | null
          status: string
          status_before: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          created_at?: string
          description?: string
          evidence_paths?: string[]
          id?: string
          kind: Database["public"]["Enums"]["service_problem_kind"]
          payment_before: Database["public"]["Enums"]["payment_status"]
          reported_by: string
          request_id: string
          resolution?: string | null
          resolved_at?: string | null
          respond_by?: string | null
          status: string
          status_before: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          created_at?: string
          description?: string
          evidence_paths?: string[]
          id?: string
          kind?: Database["public"]["Enums"]["service_problem_kind"]
          payment_before?: Database["public"]["Enums"]["payment_status"]
          reported_by?: string
          request_id?: string
          resolution?: string | null
          resolved_at?: string | null
          respond_by?: string | null
          status?: string
          status_before?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "service_problems_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_problems_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "service_problems_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_attendance: {
        Row: {
          request_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          request_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          request_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_attendance_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "user_attendance_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_accounts: {
        Row: {
          available: number
          currency: string
          locked: number
          pending: number
          updated_at: string
          user_id: string
        }
        Insert: {
          available?: number
          currency?: string
          locked?: number
          pending?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          available?: number
          currency?: string
          locked?: number
          pending?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_ledger: {
        Row: {
          available_delta: number
          created_at: string
          external_reference: string | null
          id: string
          idempotency_key: string
          kind: string
          locked_delta: number
          pending_delta: number
          platform_available_delta: number
          request_id: string | null
          user_id: string | null
        }
        Insert: {
          available_delta?: number
          created_at?: string
          external_reference?: string | null
          id?: string
          idempotency_key: string
          kind: string
          locked_delta?: number
          pending_delta?: number
          platform_available_delta?: number
          request_id?: string | null
          user_id?: string | null
        }
        Update: {
          available_delta?: number
          created_at?: string
          external_reference?: string | null
          id?: string
          idempotency_key?: string
          kind?: string
          locked_delta?: number
          pending_delta?: number
          platform_available_delta?: number
          request_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "wallet_ledger_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      my_attendance: {
        Row: {
          attending_request_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          attending_request_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          attending_request_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_attendance_request_id_fkey"
            columns: ["attending_request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "user_attendance_request_id_fkey"
            columns: ["attending_request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_attendance_user_id_fkey"
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
          agreed_provider_amount: number | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          expires_at: string | null
          is_rated: boolean | null
          latitude: number | null
          location_label: string | null
          longitude: number | null
          my_rating_comment: string | null
          my_rating_stars: number | null
          offered_amount: number | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          pending_response_count: number | null
          request_id: string | null
          scheduled_for: string | null
          selected_user_id: string | null
          source_request_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["request_status"] | null
          submitted_at: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_provider_id_fkey"
            columns: ["selected_user_id"]
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
      my_wallet: {
        Row: {
          available: number | null
          currency: string | null
          locked: number | null
          pending: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          available?: number | null
          currency?: string | null
          locked?: number | null
          pending?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          available?: number | null
          currency?: string | null
          locked?: number | null
          pending?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      my_wallet_activity: {
        Row: {
          available_delta: number | null
          created_at: string | null
          id: string | null
          kind: string | null
          locked_delta: number | null
          pending_delta: number | null
          request_id: string | null
        }
        Insert: {
          available_delta?: number | null
          created_at?: string | null
          id?: string | null
          kind?: string | null
          locked_delta?: number | null
          pending_delta?: number | null
          request_id?: string | null
        }
        Update: {
          available_delta?: number | null
          created_at?: string | null
          id?: string | null
          kind?: string | null
          locked_delta?: number | null
          pending_delta?: number | null
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "wallet_ledger_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_response: { Args: { p_response_id: string }; Returns: string }
      admin_resolve_service_problem: {
        Args: {
          p_admin_note: string
          p_idempotency_key: string
          p_outcome: string
          p_problem_id: string
        }
        Returns: undefined
      }
      align_request_escrow_to_agreed_amount: {
        Args: {
          p_agreed_provider_amount: number
          p_idempotency_key: string
          p_request_id: string
        }
        Returns: undefined
      }
      apply_payment_transition: {
        Args: {
          p_idempotency_key: string
          p_request_id: string
          p_to_status: Database["public"]["Enums"]["payment_status"]
        }
        Returns: Database["public"]["Enums"]["payment_status"]
      }
      assert_admin_caller: { Args: never; Returns: undefined }
      assert_authenticated: { Args: never; Returns: string }
      assert_coordinates: {
        Args: { p_latitude: number; p_longitude: number }
        Returns: unknown
      }
      assert_dispute_evidence_paths: {
        Args: { p_paths: string[]; p_reporter_id: string }
        Returns: undefined
      }
      assert_onboarded: { Args: never; Returns: string }
      attending_request_statuses: {
        Args: never
        Returns: Database["public"]["Enums"]["request_status"][]
      }
      auto_complete_due_requests: {
        Args: { p_limit?: number }
        Returns: number
      }
      auto_complete_request: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      avatar_is_published: { Args: { p_name: string }; Returns: boolean }
      browse_nearby_requests: {
        Args: { p_latitude: number; p_longitude: number }
        Returns: {
          currency: string
          description: string
          distance_m: number
          location_label: string
          offered_amount: number
          request_id: string
          requester_avatar_path: string
          requester_display_name: string
          requester_rating_average: number
          requester_rating_count: number
          scheduled_for: string
          title: string
        }[]
      }
      browse_request: {
        Args: { p_latitude: number; p_longitude: number; p_request_id: string }
        Returns: {
          currency: string
          description: string
          distance_m: number
          location_label: string
          offered_amount: number
          request_id: string
          requester_avatar_path: string
          requester_display_name: string
          requester_rating_average: number
          requester_rating_count: number
          scheduled_for: string
          title: string
        }[]
      }
      bucket_distance_m: { Args: { p_distance_m: number }; Returns: number }
      can_read_request_media: { Args: { p_name: string }; Returns: boolean }
      cancel_request: { Args: { p_request_id: string }; Returns: undefined }
      cancel_service: { Args: { p_request_id: string }; Returns: undefined }
      catalogue_media_is_published: {
        Args: { p_name: string }
        Returns: boolean
      }
      clear_user_attendance: { Args: { p_user_id: string }; Returns: undefined }
      clone_request_from_prior: {
        Args: { p_idempotency_key: string; p_source_request_id: string }
        Returns: string
      }
      complete_request: { Args: { p_request_id: string }; Returns: undefined }
      completion_confirmation_interval: { Args: never; Returns: string }
      compute_request_charge: {
        Args: { p_provider_amount: number }
        Returns: {
          provider_amount: number
          service_fee: number
          total: number
        }[]
      }
      confirm_avatar_capture: {
        Args: { p_storage_path: string }
        Returns: undefined
      }
      contest_service_problem: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      count_available_responses: {
        Args: { p_request_id: string }
        Returns: number
      }
      create_notification: {
        Args: {
          p_body: string
          p_deliver_push?: boolean
          p_event_key: string
          p_metadata?: Json
          p_payment_transition_id?: string
          p_recipient_user_id: string
          p_related_user_id?: string
          p_request_id?: string
          p_response_id?: string
          p_title: string
          p_type: Database["public"]["Enums"]["notification_type"]
          p_url?: string
          p_wallet_ledger_id?: string
        }
        Returns: string
      }
      create_request: {
        Args: {
          p_description?: string | null
          p_latitude: number
          p_location_label: string
          p_longitude: number
          p_offered_amount?: number
          p_scheduled_for?: string
          p_source_request_id?: string
          p_title: string
        }
        Returns: string
      }
      decline_response: {
        Args: { p_reason?: string; p_response_id: string }
        Returns: undefined
      }
      deliver_expo_push: {
        Args: {
          p_body: string
          p_metadata?: Json
          p_payment_transition_id: string
          p_recipient_user_id: string
          p_related_user_id: string
          p_request_id: string
          p_response_id: string
          p_title: string
          p_type: Database["public"]["Enums"]["notification_type"]
          p_url: string
          p_wallet_ledger_id: string
        }
        Returns: undefined
      }
      discovery_radius_m: { Args: never; Returns: number }
      display_first_name: { Args: { p_display_name: string }; Returns: string }
      ensure_wallet_account: { Args: { p_user_id: string }; Returns: undefined }
      expire_due_requests: { Args: { p_limit?: number }; Returns: number }
      expire_request: { Args: { p_request_id: string }; Returns: boolean }
      finalize_client_no_show_resolution: {
        Args: {
          p_actor_id: string
          p_payment_idempotency_key: string
          p_request_id: string
          p_status_event_key: string
        }
        Returns: boolean
      }
      finalize_provider_no_show_resolution: {
        Args: {
          p_actor_id: string
          p_payment_idempotency_key: string
          p_request_id: string
          p_status_event_key: string
        }
        Returns: boolean
      }
      finalize_request_cancellation: {
        Args: {
          p_actor_id: string
          p_payment_idempotency_key: string
          p_request_id: string
          p_status_event_key: string
        }
        Returns: boolean
      }
      finalize_request_completion: {
        Args: {
          p_actor_id: string
          p_request_id: string
          p_status_event_key: string
        }
        Returns: boolean
      }
      format_bucketed_distance: {
        Args: { p_distance_m: number }
        Returns: string
      }
      get_engagement: {
        Args: { p_request_id: string }
        Returns: {
          accepted_at: string
          agreed_provider_amount: number
          completed_at: string
          completion_confirm_by: string
          counterparty_avatar_path: string
          counterparty_bio: string
          counterparty_completion_percent: number
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
          quoted_amount: number
          rating_comment: string
          rating_stars: number
          request_id: string
          request_latitude: number
          request_longitude: number
          request_status: Database["public"]["Enums"]["request_status"]
          scheduled_for: string
          service_problem_description: string
          service_problem_kind: Database["public"]["Enums"]["service_problem_kind"]
          service_problem_reported_by_me: boolean
          service_problem_respond_by: string
          started_at: string
          title: string
          viewer_has_rated: boolean
          viewer_is_requester: boolean
        }[]
      }
      list_request_responses: {
        Args: { p_request_id: string }
        Returns: {
          avatar_path: string
          bio: string
          completion_percent: number
          created_at: string
          display_name: string
          distance_m: number
          expires_at: string
          jobs_completed: number
          message: string
          phone_verified: boolean
          quoted_amount: number
          rating_average: number
          rating_count: number
          responder_available: boolean
          responder_id: string
          response_id: string
          status: Database["public"]["Enums"]["response_status"]
        }[]
      }
      lock_request_escrow: {
        Args: { p_idempotency_key: string; p_request_id: string }
        Returns: undefined
      }
      mark_notification_inbox_item_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      mark_notification_inbox_read: { Args: never; Returns: undefined }
      mark_request_response_notifications_read: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      mark_service_complete: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      my_responses: {
        Args: never
        Returns: {
          created_at: string
          currency: string
          decline_reason: string
          description: string
          distance_m: number
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
          title: string
        }[]
      }
      notification_dedupe_key: {
        Args: {
          p_event_key: string
          p_recipient_user_id: string
          p_type: Database["public"]["Enums"]["notification_type"]
        }
        Returns: string
      }
      notification_type_should_push: {
        Args: { p_type: Database["public"]["Enums"]["notification_type"] }
        Returns: boolean
      }
      notify_completion_reminders: {
        Args: { p_limit?: number }
        Returns: number
      }
      notify_expiring_requests: { Args: { p_limit?: number }; Returns: number }
      notify_responders_not_chosen: {
        Args: { p_chosen_response_id: string; p_request_id: string }
        Returns: undefined
      }
      open_request_statuses: {
        Args: never
        Returns: Database["public"]["Enums"]["request_status"][]
      }
      post_wallet_ledger: {
        Args: {
          p_available_delta: number
          p_external_reference?: string
          p_idempotency_key: string
          p_kind: string
          p_locked_delta: number
          p_pending_delta: number
          p_platform_available_delta?: number
          p_request_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      provider_completion_percent: {
        Args: { p_user_id: string }
        Returns: number
      }
      provider_location_recently_updated: {
        Args: { p_provider_id: string; p_request_id: string }
        Returns: boolean
      }
      provider_location_updated_since_report: {
        Args: {
          p_provider_id: string
          p_reported_at: string
          p_request_id: string
        }
        Returns: boolean
      }
      prune_invalid_expo_push_tokens: {
        Args: { p_response: Json; p_tokens: string[] }
        Returns: undefined
      }
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
      release_provider: { Args: { p_provider_id: string }; Returns: undefined }
      report_service_problem: {
        Args: {
          p_description?: string
          p_evidence_paths?: string[]
          p_kind?: Database["public"]["Enums"]["service_problem_kind"]
          p_request_id: string
        }
        Returns: undefined
      }
      request_expires_at: { Args: { p_scheduled_for: string }; Returns: string }
      request_lifetime_interval: { Args: never; Returns: string }
      request_media_visible_to_party: {
        Args: { p_name: string; p_user_id: string }
        Returns: boolean
      }
      request_open_to_user: {
        Args: {
          p_latitude?: number
          p_longitude?: number
          p_request_id: string
          p_user_id: string
        }
        Returns: number
      }
      request_response_notifications_dedupe_key: {
        Args: { p_request_id: string; p_requester_id: string }
        Returns: string
      }
      requester_completion_percent: {
        Args: { p_user_id: string }
        Returns: number
      }
      resolve_due_service_problems: {
        Args: { p_limit?: number }
        Returns: number
      }
      resolve_service_problem: {
        Args: { p_problem_id: string }
        Returns: boolean
      }
      respond_to_request: {
        Args: {
          p_latitude?: number
          p_longitude?: number
          p_message?: string
          p_quoted_amount?: number
          p_request_id: string
        }
        Returns: string
      }
      service_problem_requires_description: {
        Args: { p_kind: Database["public"]["Enums"]["service_problem_kind"] }
        Returns: boolean
      }
      service_problem_response_interval: { Args: never; Returns: string }
      set_notification_preferences: {
        Args: {
          p_message_push_enabled: boolean
          p_push_notifications_enabled: boolean
        }
        Returns: undefined
      }
      set_user_attendance: {
        Args: { p_request_id: string; p_user_id: string }
        Returns: undefined
      }
      start_request: { Args: { p_request_id: string }; Returns: undefined }
      sync_wallet_payment_transition: {
        Args: {
          p_from: Database["public"]["Enums"]["payment_status"]
          p_idempotency_key: string
          p_request_id: string
          p_to: Database["public"]["Enums"]["payment_status"]
        }
        Returns: undefined
      }
      upsert_request_response_notification: {
        Args: {
          p_latest_responder_id: string
          p_latest_response_id: string
          p_pending_count: number
          p_request_id: string
          p_requester_id: string
        }
        Returns: undefined
      }
      user_push_delivery_allowed: {
        Args: {
          p_type: Database["public"]["Enums"]["notification_type"]
          p_user_id: string
        }
        Returns: boolean
      }
      wallet_record_deposit: {
        Args: {
          p_amount: number
          p_external_reference?: string
          p_idempotency_key: string
          p_user_id: string
        }
        Returns: undefined
      }
      wallet_top_up: {
        Args: { p_amount: number; p_idempotency_key: string }
        Returns: undefined
      }
      wallet_withdraw: {
        Args: { p_amount: number; p_idempotency_key: string }
        Returns: undefined
      }
      withdraw_response: { Args: { p_response_id: string }; Returns: undefined }
    }
    Enums: {
      notification_type:
        | "response_received"
        | "new_responses"
        | "request_expiring"
        | "request_expired"
        | "response_accepted"
        | "response_not_selected"
        | "completion_requested"
        | "payment_secured"
        | "funds_returned"
        | "payment_released"
        | "payment_received"
        | "withdrawal_processing"
        | "withdrawal_successful"
        | "withdrawal_failed"
        | "new_message"
        | "missed_call"
        | "request_cancelled"
        | "helper_cancelled"
        | "cancellation_confirmed"
        | "problem_reported"
        | "dispute_opened"
        | "dispute_resolved"
        | "funds_released_after_resolution"
        | "rate_experience"
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
        | "posted"
      response_status:
        | "pending"
        | "accepted"
        | "declined"
        | "withdrawn"
        | "expired"
      service_problem_kind:
        | "completion_issue"
        | "provider_no_show"
        | "client_no_show"
        | "provider_unreachable"
        | "service_not_completed"
        | "service_differs_from_request"
        | "other"
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
      notification_type: [
        "response_received",
        "new_responses",
        "request_expiring",
        "request_expired",
        "response_accepted",
        "response_not_selected",
        "completion_requested",
        "payment_secured",
        "funds_returned",
        "payment_released",
        "payment_received",
        "withdrawal_processing",
        "withdrawal_successful",
        "withdrawal_failed",
        "new_message",
        "missed_call",
        "request_cancelled",
        "helper_cancelled",
        "cancellation_confirmed",
        "problem_reported",
        "dispute_opened",
        "dispute_resolved",
        "funds_released_after_resolution",
        "rate_experience",
      ],
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
        "posted",
      ],
      response_status: [
        "pending",
        "accepted",
        "declined",
        "withdrawn",
        "expired",
      ],
      service_problem_kind: [
        "completion_issue",
        "provider_no_show",
        "client_no_show",
        "provider_unreachable",
        "service_not_completed",
        "service_differs_from_request",
        "other",
      ],
    },
  },
} as const

