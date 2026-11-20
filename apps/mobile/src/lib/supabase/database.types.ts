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
      admin_audit_events: {
        Row: {
          action: string
          actor_admin_id: string
          created_at: string
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["admin_audit_entity_type"]
          id: string
          idempotency_key: string
          metadata: Json
          reason: string | null
        }
        Insert: {
          action: string
          actor_admin_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: Database["public"]["Enums"]["admin_audit_entity_type"]
          id?: string
          idempotency_key: string
          metadata?: Json
          reason?: string | null
        }
        Update: {
          action?: string
          actor_admin_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["admin_audit_entity_type"]
          id?: string
          idempotency_key?: string
          metadata?: Json
          reason?: string | null
        }
        Relationships: []
      }
      admin_members: {
        Row: {
          created_at: string
          created_by: string | null
          role: Database["public"]["Enums"]["admin_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          role: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_service_problem_notes: {
        Row: {
          author_admin_id: string
          body: string
          created_at: string
          id: string
          service_problem_id: string
        }
        Insert: {
          author_admin_id: string
          body: string
          created_at?: string
          id?: string
          service_problem_id: string
        }
        Update: {
          author_admin_id?: string
          body?: string
          created_at?: string
          id?: string
          service_problem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_service_problem_notes_service_problem_id_fkey"
            columns: ["service_problem_id"]
            isOneToOne: false
            referencedRelation: "service_problems"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_user_notes: {
        Row: {
          author_admin_id: string
          body: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          author_admin_id: string
          body: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          author_admin_id?: string
          body?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_transactions: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string
          currency: string
          id: string
          paystack_reference: string | null
          reference: string
          status: Database["public"]["Enums"]["deposit_transaction_status"]
          user_id: string
          wallet_id: string
          wallet_transaction_id: string | null
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          paystack_reference?: string | null
          reference: string
          status?: Database["public"]["Enums"]["deposit_transaction_status"]
          user_id: string
          wallet_id: string
          wallet_transaction_id?: string | null
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          paystack_reference?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["deposit_transaction_status"]
          user_id?: string
          wallet_id?: string
          wallet_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deposit_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_transactions_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: false
            referencedRelation: "my_wallet_activity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_transactions_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_transactions_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
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
      engagement_cancellation_events: {
        Row: {
          actor_id: string
          cancellation_request_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["engagement_cancellation_event_kind"]
          reason: string | null
          request_id: string
        }
        Insert: {
          actor_id: string
          cancellation_request_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["engagement_cancellation_event_kind"]
          reason?: string | null
          request_id: string
        }
        Update: {
          actor_id?: string
          cancellation_request_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          kind?: Database["public"]["Enums"]["engagement_cancellation_event_kind"]
          reason?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_cancellation_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_cancellation_events_cancellation_request_id_fkey"
            columns: ["cancellation_request_id"]
            isOneToOne: false
            referencedRelation: "engagement_cancellation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_cancellation_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "engagement_cancellation_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_cancellation_requests: {
        Row: {
          created_at: string
          id: string
          initiated_by: string
          initiator_role: string
          provider_response_reason: string | null
          reason: string | null
          request_id: string
          resolved_at: string | null
          resolved_by: string | null
          respond_by: string | null
          settlement_idempotency_key: string | null
          status: Database["public"]["Enums"]["engagement_cancellation_request_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          initiated_by: string
          initiator_role: string
          provider_response_reason?: string | null
          reason?: string | null
          request_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          respond_by?: string | null
          settlement_idempotency_key?: string | null
          status?: Database["public"]["Enums"]["engagement_cancellation_request_status"]
        }
        Update: {
          created_at?: string
          id?: string
          initiated_by?: string
          initiator_role?: string
          provider_response_reason?: string | null
          reason?: string | null
          request_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          respond_by?: string | null
          settlement_idempotency_key?: string | null
          status?: Database["public"]["Enums"]["engagement_cancellation_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "engagement_cancellation_requests_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_cancellation_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "engagement_cancellation_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_cancellation_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_milestones: {
        Row: {
          amount_major: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          description: string
          fee_kobo: number
          id: string
          payout_reference: string | null
          position: number
          proposal_id: string
          provider_kobo: number
          request_id: string
          revision_requested_at: string | null
          revision_requested_by: string | null
          status: Database["public"]["Enums"]["milestone_status"]
          submitted_at: string | null
          submitted_by: string | null
          title: string
          total_kobo: number
          updated_at: string
        }
        Insert: {
          amount_major: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          description?: string
          fee_kobo: number
          id?: string
          payout_reference?: string | null
          position: number
          proposal_id: string
          provider_kobo: number
          request_id: string
          revision_requested_at?: string | null
          revision_requested_by?: string | null
          status?: Database["public"]["Enums"]["milestone_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          title: string
          total_kobo: number
          updated_at?: string
        }
        Update: {
          amount_major?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          description?: string
          fee_kobo?: number
          id?: string
          payout_reference?: string | null
          position?: number
          proposal_id?: string
          provider_kobo?: number
          request_id?: string
          revision_requested_at?: string | null
          revision_requested_by?: string | null
          status?: Database["public"]["Enums"]["milestone_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          title?: string
          total_kobo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_milestones_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_milestones_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "request_milestone_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_milestones_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "engagement_milestones_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_milestones_revision_requested_by_fkey"
            columns: ["revision_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_milestones_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "handshakes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
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
          {
            foreignKeyName: "notification_inbox_wallet_ledger_id_fkey"
            columns: ["wallet_ledger_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_locks: {
        Row: {
          bucket: Database["public"]["Enums"]["payment_lock_bucket"]
          created_at: string
          currency: string
          id: string
          provider_amount: number
          released_fee_kobo: number
          released_provider_kobo: number
          released_total_kobo: number
          request_id: string
          service_fee: number
          status: Database["public"]["Enums"]["payment_lock_status"]
          total: number
          updated_at: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          bucket?: Database["public"]["Enums"]["payment_lock_bucket"]
          created_at?: string
          currency?: string
          id?: string
          provider_amount: number
          released_fee_kobo?: number
          released_provider_kobo?: number
          released_total_kobo?: number
          request_id: string
          service_fee: number
          status?: Database["public"]["Enums"]["payment_lock_status"]
          total: number
          updated_at?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          bucket?: Database["public"]["Enums"]["payment_lock_bucket"]
          created_at?: string
          currency?: string
          id?: string
          provider_amount?: number
          released_fee_kobo?: number
          released_provider_kobo?: number
          released_total_kobo?: number
          request_id?: string
          service_fee?: number
          status?: Database["public"]["Enums"]["payment_lock_status"]
          total?: number
          updated_at?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_locks_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "payment_locks_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_locks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_locks_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
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
      platform_runtime_config: {
        Row: {
          deployment_environment: string
          id: number
          updated_at: string
        }
        Insert: {
          deployment_environment?: string
          id: number
          updated_at?: string
        }
        Update: {
          deployment_environment?: string
          id?: number
          updated_at?: string
        }
        Relationships: []
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
          discovery_location: unknown
          discovery_location_updated_at: string | null
          display_name: string | null
          id: string
          jobs_completed: number
          message_push_enabled: boolean
          phone: string | null
          premium_trial_ends_at: string | null
          premium_trial_started_at: string | null
          push_calls_enabled: boolean
          push_notifications_enabled: boolean
          push_payments_wallet_enabled: boolean
          push_tips_reminders_enabled: boolean
          rating_average: number | null
          rating_count: number
          requests_completed: number
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_captured_in_app?: boolean
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          discovery_location?: unknown
          discovery_location_updated_at?: string | null
          display_name?: string | null
          id: string
          jobs_completed?: number
          message_push_enabled?: boolean
          phone?: string | null
          premium_trial_ends_at?: string | null
          premium_trial_started_at?: string | null
          push_calls_enabled?: boolean
          push_notifications_enabled?: boolean
          push_payments_wallet_enabled?: boolean
          push_tips_reminders_enabled?: boolean
          rating_average?: number | null
          rating_count?: number
          requests_completed?: number
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_captured_in_app?: boolean
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          discovery_location?: unknown
          discovery_location_updated_at?: string | null
          display_name?: string | null
          id?: string
          jobs_completed?: number
          message_push_enabled?: boolean
          phone?: string | null
          premium_trial_ends_at?: string | null
          premium_trial_started_at?: string | null
          push_calls_enabled?: boolean
          push_notifications_enabled?: boolean
          push_payments_wallet_enabled?: boolean
          push_tips_reminders_enabled?: boolean
          rating_average?: number | null
          rating_count?: number
          requests_completed?: number
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      project_assignment_approvals: {
        Row: {
          approved_by: string
          created_at: string
          id: string
          milestone_id: string | null
          payment_id: string | null
          submission_id: string
        }
        Insert: {
          approved_by: string
          created_at?: string
          id?: string
          milestone_id?: string | null
          payment_id?: string | null
          submission_id: string
        }
        Update: {
          approved_by?: string
          created_at?: string
          id?: string
          milestone_id?: string | null
          payment_id?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignment_approvals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignment_approvals_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "project_assignment_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignment_approvals_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "project_assignment_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignment_approvals_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "project_assignment_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignment_disputes: {
        Row: {
          assignment_id: string
          created_at: string
          description: string
          evidence_paths: string[]
          id: string
          kind: Database["public"]["Enums"]["service_problem_kind"]
          reported_by: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          description?: string
          evidence_paths?: string[]
          id?: string
          kind?: Database["public"]["Enums"]["service_problem_kind"]
          reported_by: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          description?: string
          evidence_paths?: string[]
          id?: string
          kind?: Database["public"]["Enums"]["service_problem_kind"]
          reported_by?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignment_disputes_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "project_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignment_disputes_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignment_milestones: {
        Row: {
          amount_major: number
          approved_at: string | null
          approved_by: string | null
          assignment_id: string
          created_at: string
          description: string
          fee_kobo: number
          id: string
          payout_reference: string | null
          position: number
          provider_kobo: number
          revision_requested_at: string | null
          revision_requested_by: string | null
          status: Database["public"]["Enums"]["milestone_status"]
          submitted_at: string | null
          submitted_by: string | null
          terms_id: string
          title: string
          total_kobo: number
          updated_at: string
        }
        Insert: {
          amount_major: number
          approved_at?: string | null
          approved_by?: string | null
          assignment_id: string
          created_at?: string
          description?: string
          fee_kobo: number
          id?: string
          payout_reference?: string | null
          position: number
          provider_kobo: number
          revision_requested_at?: string | null
          revision_requested_by?: string | null
          status?: Database["public"]["Enums"]["milestone_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          terms_id: string
          title: string
          total_kobo: number
          updated_at?: string
        }
        Update: {
          amount_major?: number
          approved_at?: string | null
          approved_by?: string | null
          assignment_id?: string
          created_at?: string
          description?: string
          fee_kobo?: number
          id?: string
          payout_reference?: string | null
          position?: number
          provider_kobo?: number
          revision_requested_at?: string | null
          revision_requested_by?: string | null
          status?: Database["public"]["Enums"]["milestone_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          terms_id?: string
          title?: string
          total_kobo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignment_milestones_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignment_milestones_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "project_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignment_milestones_revision_requested_by_fkey"
            columns: ["revision_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignment_milestones_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignment_milestones_terms_id_fkey"
            columns: ["terms_id"]
            isOneToOne: false
            referencedRelation: "project_assignment_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignment_payments: {
        Row: {
          assignment_id: string
          created_at: string
          fee_kobo: number
          id: string
          milestone_id: string | null
          provider_kobo: number
          total_kobo: number
          wallet_reference: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          fee_kobo: number
          id?: string
          milestone_id?: string | null
          provider_kobo: number
          total_kobo: number
          wallet_reference: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          fee_kobo?: number
          id?: string
          milestone_id?: string | null
          provider_kobo?: number
          total_kobo?: number
          wallet_reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignment_payments_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "project_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignment_payments_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "project_assignment_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignment_reservations: {
        Row: {
          amount_kobo: number
          assignment_id: string
          pool_reservation_id: string
          released_kobo: number
          secured_at: string
        }
        Insert: {
          amount_kobo: number
          assignment_id: string
          pool_reservation_id: string
          released_kobo?: number
          secured_at?: string
        }
        Update: {
          amount_kobo?: number
          assignment_id?: string
          pool_reservation_id?: string
          released_kobo?: number
          secured_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignment_reservations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "project_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignment_reservations_pool_reservation_id_fkey"
            columns: ["pool_reservation_id"]
            isOneToOne: true
            referencedRelation: "project_pool_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignment_revisions: {
        Row: {
          created_at: string
          id: string
          note: string
          requested_by: string
          submission_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string
          requested_by: string
          submission_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          requested_by?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignment_revisions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignment_revisions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "project_assignment_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignment_submissions: {
        Row: {
          assignment_id: string
          created_at: string
          evidence_paths: string[]
          id: string
          milestone_id: string | null
          note: string | null
          submitted_by: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          evidence_paths?: string[]
          id?: string
          milestone_id?: string | null
          note?: string | null
          submitted_by: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          evidence_paths?: string[]
          id?: string
          milestone_id?: string | null
          note?: string | null
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "project_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignment_submissions_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "project_assignment_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignment_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignment_terms: {
        Row: {
          assignment_id: string
          compensation_total_kobo: number
          created_at: string
          creator_agreed_at: string | null
          deliverables: string
          description: string
          due_at: string
          id: string
          milestones_json: Json | null
          payment_structure: Database["public"]["Enums"]["payment_structure"]
          proposed_by: string
          status: Database["public"]["Enums"]["project_assignment_terms_status"]
          title: string
          version: number
          worker_agreed_at: string | null
        }
        Insert: {
          assignment_id: string
          compensation_total_kobo: number
          created_at?: string
          creator_agreed_at?: string | null
          deliverables?: string
          description?: string
          due_at: string
          id?: string
          milestones_json?: Json | null
          payment_structure: Database["public"]["Enums"]["payment_structure"]
          proposed_by: string
          status?: Database["public"]["Enums"]["project_assignment_terms_status"]
          title: string
          version: number
          worker_agreed_at?: string | null
        }
        Update: {
          assignment_id?: string
          compensation_total_kobo?: number
          created_at?: string
          creator_agreed_at?: string | null
          deliverables?: string
          description?: string
          due_at?: string
          id?: string
          milestones_json?: Json | null
          payment_structure?: Database["public"]["Enums"]["payment_structure"]
          proposed_by?: string
          status?: Database["public"]["Enums"]["project_assignment_terms_status"]
          title?: string
          version?: number
          worker_agreed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_assignment_terms_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "project_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignment_terms_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignments: {
        Row: {
          accepted_at: string | null
          active_terms_id: string | null
          cancelled_at: string | null
          commenced_at: string | null
          compensation_total_kobo: number
          completed_at: string | null
          created_at: string
          creator_id: string
          due_at: string
          id: string
          payment_structure: Database["public"]["Enums"]["payment_structure"]
          project_id: string
          status: Database["public"]["Enums"]["project_assignment_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          accepted_at?: string | null
          active_terms_id?: string | null
          cancelled_at?: string | null
          commenced_at?: string | null
          compensation_total_kobo: number
          completed_at?: string | null
          created_at?: string
          creator_id: string
          due_at: string
          id?: string
          payment_structure?: Database["public"]["Enums"]["payment_structure"]
          project_id: string
          status?: Database["public"]["Enums"]["project_assignment_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          accepted_at?: string | null
          active_terms_id?: string | null
          cancelled_at?: string | null
          commenced_at?: string | null
          compensation_total_kobo?: number
          completed_at?: string | null
          created_at?: string
          creator_id?: string
          due_at?: string
          id?: string
          payment_structure?: Database["public"]["Enums"]["payment_structure"]
          project_id?: string
          status?: Database["public"]["Enums"]["project_assignment_status"]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_active_terms_id_fkey"
            columns: ["active_terms_id"]
            isOneToOne: false
            referencedRelation: "project_assignment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contribution_reservation_allocations: {
        Row: {
          amount_kobo: number
          contribution_id: string
          created_at: string
          id: string
          reservation_id: string
        }
        Insert: {
          amount_kobo: number
          contribution_id: string
          created_at?: string
          id?: string
          reservation_id: string
        }
        Update: {
          amount_kobo?: number
          contribution_id?: string
          created_at?: string
          id?: string
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contribution_reservation_allocatio_contribution_id_fkey"
            columns: ["contribution_id"]
            isOneToOne: false
            referencedRelation: "project_contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contribution_reservation_allocation_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "project_pool_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contributions: {
        Row: {
          amount_kobo: number
          contributor_id: string
          created_at: string
          id: string
          project_id: string
          refunded_kobo: number
          reserved_kobo: number
          wallet_reference: string
        }
        Insert: {
          amount_kobo: number
          contributor_id: string
          created_at?: string
          id?: string
          project_id: string
          refunded_kobo?: number
          reserved_kobo?: number
          wallet_reference: string
        }
        Update: {
          amount_kobo?: number
          contributor_id?: string
          created_at?: string
          id?: string
          project_id?: string
          refunded_kobo?: number
          reserved_kobo?: number
          wallet_reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contributions_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contributions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contributor_invitations: {
        Row: {
          created_at: string
          id: string
          invited_by: string
          invitee_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by: string
          invitee_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string
          invitee_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contributor_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contributor_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contributor_invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_funding_pools: {
        Row: {
          committed_compensation_kobo: number
          contributed_total_kobo: number
          project_id: string
          reserved_total_kobo: number
        }
        Insert: {
          committed_compensation_kobo?: number
          contributed_total_kobo?: number
          project_id: string
          reserved_total_kobo?: number
        }
        Update: {
          committed_compensation_kobo?: number
          contributed_total_kobo?: number
          project_id?: string
          reserved_total_kobo?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_funding_pools_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_pool_reservations: {
        Row: {
          amount_kobo: number
          assignment_id: string | null
          created_at: string
          id: string
          note: string | null
          project_id: string
          release_reference: string | null
          released_at: string | null
          reserve_reference: string
          status: Database["public"]["Enums"]["project_pool_reservation_status"]
        }
        Insert: {
          amount_kobo: number
          assignment_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          project_id: string
          release_reference?: string | null
          released_at?: string | null
          reserve_reference: string
          status?: Database["public"]["Enums"]["project_pool_reservation_status"]
        }
        Update: {
          amount_kobo?: number
          assignment_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          project_id?: string
          release_reference?: string | null
          released_at?: string | null
          reserve_reference?: string
          status?: Database["public"]["Enums"]["project_pool_reservation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "project_pool_reservations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "project_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_pool_reservations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tags: {
        Row: {
          project_id: string
          tag_id: string
        }
        Insert: {
          project_id: string
          tag_id: string
        }
        Update: {
          project_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          attachment_path: string | null
          budget_total_kobo: number
          created_at: string
          creator_id: string
          description: string | null
          early_commencement_enabled: boolean
          fully_funded_at: string | null
          funding_deadline_at: string | null
          funding_opened_at: string | null
          funding_status: Database["public"]["Enums"]["project_funding_status"]
          funding_timezone: string
          funding_unsuccessful_at: string | null
          funding_visibility: Database["public"]["Enums"]["project_funding_visibility"]
          id: string
          location: unknown
          location_label: string | null
          min_contribution_kobo: number
          min_funding_target_kobo: number
          min_target_reached_at: string | null
          project_visibility: Database["public"]["Enums"]["project_visibility"]
          status: Database["public"]["Enums"]["project_status"]
          title: string
          updated_at: string
        }
        Insert: {
          attachment_path?: string | null
          budget_total_kobo: number
          created_at?: string
          creator_id: string
          description?: string | null
          early_commencement_enabled?: boolean
          fully_funded_at?: string | null
          funding_deadline_at?: string | null
          funding_opened_at?: string | null
          funding_status?: Database["public"]["Enums"]["project_funding_status"]
          funding_timezone?: string
          funding_unsuccessful_at?: string | null
          funding_visibility: Database["public"]["Enums"]["project_funding_visibility"]
          id?: string
          location?: unknown
          location_label?: string | null
          min_contribution_kobo: number
          min_funding_target_kobo: number
          min_target_reached_at?: string | null
          project_visibility?: Database["public"]["Enums"]["project_visibility"]
          status?: Database["public"]["Enums"]["project_status"]
          title: string
          updated_at?: string
        }
        Update: {
          attachment_path?: string | null
          budget_total_kobo?: number
          created_at?: string
          creator_id?: string
          description?: string | null
          early_commencement_enabled?: boolean
          fully_funded_at?: string | null
          funding_deadline_at?: string | null
          funding_opened_at?: string | null
          funding_status?: Database["public"]["Enums"]["project_funding_status"]
          funding_timezone?: string
          funding_unsuccessful_at?: string | null
          funding_visibility?: Database["public"]["Enums"]["project_funding_visibility"]
          id?: string
          location?: unknown
          location_label?: string | null
          min_contribution_kobo?: number
          min_funding_target_kobo?: number
          min_target_reached_at?: string | null
          project_visibility?: Database["public"]["Enums"]["project_visibility"]
          status?: Database["public"]["Enums"]["project_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_creator_id_fkey"
            columns: ["creator_id"]
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
      reputation_config: {
        Row: {
          key: string
          value_json: Json
        }
        Insert: {
          key: string
          value_json: Json
        }
        Update: {
          key?: string
          value_json?: Json
        }
        Relationships: []
      }
      reputation_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          delta_main: number
          delta_shield: number
          id: string
          metadata: Json
          reason: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta_main?: number
          delta_shield?: number
          id?: string
          metadata?: Json
          reason: string
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta_main?: number
          delta_shield?: number
          id?: string
          metadata?: Json
          reason?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reputation_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reputation_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_conversations: {
        Row: {
          created_at: string
          id: string
          request_id: string
          requester_id: string
          response_id: string
          selected_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          request_id: string
          requester_id: string
          response_id: string
          selected_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          request_id?: string
          requester_id?: string
          response_id?: string
          selected_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_conversations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "request_conversations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_conversations_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_conversations_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: true
            referencedRelation: "request_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_conversations_selected_user_id_fkey"
            columns: ["selected_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_delivery_deadline_extensions: {
        Row: {
          created_at: string
          creator_consented_at: string | null
          final_deadline_at: string | null
          id: string
          original_deadline_at: string
          proposed_by_user_id: string
          proposed_deadline_at: string
          request_id: string
          status: Database["public"]["Enums"]["delivery_deadline_extension_status"]
          worker_consented_at: string | null
        }
        Insert: {
          created_at?: string
          creator_consented_at?: string | null
          final_deadline_at?: string | null
          id?: string
          original_deadline_at: string
          proposed_by_user_id: string
          proposed_deadline_at: string
          request_id: string
          status?: Database["public"]["Enums"]["delivery_deadline_extension_status"]
          worker_consented_at?: string | null
        }
        Update: {
          created_at?: string
          creator_consented_at?: string | null
          final_deadline_at?: string | null
          id?: string
          original_deadline_at?: string
          proposed_by_user_id?: string
          proposed_deadline_at?: string
          request_id?: string
          status?: Database["public"]["Enums"]["delivery_deadline_extension_status"]
          worker_consented_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_delivery_deadline_extensions_proposed_by_user_id_fkey"
            columns: ["proposed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_delivery_deadline_extensions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "request_delivery_deadline_extensions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_message_attachments: {
        Row: {
          attachment_type: Database["public"]["Enums"]["conversation_attachment_type"]
          conversation_id: string
          created_at: string
          file_name: string | null
          file_size: number | null
          id: string
          message_id: string
          mime_type: string
          sender_id: string
          storage_path: string
          uploaded_at: string | null
        }
        Insert: {
          attachment_type: Database["public"]["Enums"]["conversation_attachment_type"]
          conversation_id: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          message_id: string
          mime_type: string
          sender_id: string
          storage_path: string
          uploaded_at?: string | null
        }
        Update: {
          attachment_type?: Database["public"]["Enums"]["conversation_attachment_type"]
          conversation_id?: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          message_id?: string
          mime_type?: string
          sender_id?: string
          storage_path?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_message_attachments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "request_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "request_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_message_attachments_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          message_type: Database["public"]["Enums"]["conversation_message_type"]
          metadata: Json | null
          read_at: string | null
          sender_id: string
          updated_at: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          message_type?: Database["public"]["Enums"]["conversation_message_type"]
          metadata?: Json | null
          read_at?: string | null
          sender_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          message_type?: Database["public"]["Enums"]["conversation_message_type"]
          metadata?: Json | null
          read_at?: string | null
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "request_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_milestone_proposal_items: {
        Row: {
          amount_major: number
          created_at: string
          description: string
          id: string
          position: number
          proposal_id: string
          title: string
          updated_at: string
        }
        Insert: {
          amount_major: number
          created_at?: string
          description?: string
          id?: string
          position: number
          proposal_id: string
          title: string
          updated_at?: string
        }
        Update: {
          amount_major?: number
          created_at?: string
          description?: string
          id?: string
          position?: number
          proposal_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_milestone_proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "request_milestone_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      request_milestone_proposals: {
        Row: {
          created_at: string
          id: string
          request_id: string
          response_id: string | null
          status: Database["public"]["Enums"]["milestone_proposal_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          request_id: string
          response_id?: string | null
          status?: Database["public"]["Enums"]["milestone_proposal_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          request_id?: string
          response_id?: string | null
          status?: Database["public"]["Enums"]["milestone_proposal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_milestone_proposals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "request_milestone_proposals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_milestone_proposals_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "request_responses"
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
          proposed_delivery_at: string | null
          proposed_delivery_timezone: string | null
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
          proposed_delivery_at?: string | null
          proposed_delivery_timezone?: string | null
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
          proposed_delivery_at?: string | null
          proposed_delivery_timezone?: string | null
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
      request_search_queries: {
        Row: {
          last_searched_at: string
          normalized_query: string
          search_count: number
        }
        Insert: {
          last_searched_at?: string
          normalized_query: string
          search_count?: number
        }
        Update: {
          last_searched_at?: string
          normalized_query?: string
          search_count?: number
        }
        Relationships: []
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
      request_tags: {
        Row: {
          created_at: string
          request_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          request_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          request_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_tags_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "request_tags_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          accepted_at: string | null
          accepted_response_id: string | null
          adjusted_delivery_at: string | null
          agreed_provider_amount: number | null
          attachment_path: string | null
          cancelled_at: string | null
          completed_at: string | null
          completion_confirm_by: string | null
          completion_reminder_sent_at: string | null
          created_at: string
          currency: string
          delivery_deadline_at: string | null
          description: string | null
          expires_at: string | null
          expiry_reminder_sent_at: string | null
          first_response_at: string | null
          id: string
          location: unknown
          location_label: string
          offered_amount: number | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          payment_structure: Database["public"]["Enums"]["payment_structure"]
          proposed_delivery_at: string | null
          proposed_delivery_timezone: string | null
          requester_id: string
          scheduled_for: string | null
          selected_user_id: string | null
          source_request_id: string | null
          start_by_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["request_status"]
          submitted_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_response_id?: string | null
          adjusted_delivery_at?: string | null
          agreed_provider_amount?: number | null
          attachment_path?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          completion_confirm_by?: string | null
          completion_reminder_sent_at?: string | null
          created_at?: string
          currency?: string
          delivery_deadline_at?: string | null
          description?: string | null
          expires_at?: string | null
          expiry_reminder_sent_at?: string | null
          first_response_at?: string | null
          id?: string
          location: unknown
          location_label: string
          offered_amount?: number | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_structure?: Database["public"]["Enums"]["payment_structure"]
          proposed_delivery_at?: string | null
          proposed_delivery_timezone?: string | null
          requester_id: string
          scheduled_for?: string | null
          selected_user_id?: string | null
          source_request_id?: string | null
          start_by_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          submitted_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_response_id?: string | null
          adjusted_delivery_at?: string | null
          agreed_provider_amount?: number | null
          attachment_path?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          completion_confirm_by?: string | null
          completion_reminder_sent_at?: string | null
          created_at?: string
          currency?: string
          delivery_deadline_at?: string | null
          description?: string | null
          expires_at?: string | null
          expiry_reminder_sent_at?: string | null
          first_response_at?: string | null
          id?: string
          location?: unknown
          location_label?: string
          offered_amount?: number | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_structure?: Database["public"]["Enums"]["payment_structure"]
          proposed_delivery_at?: string | null
          proposed_delivery_timezone?: string | null
          requester_id?: string
          scheduled_for?: string | null
          selected_user_id?: string | null
          source_request_id?: string | null
          start_by_at?: string | null
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
      saved_locations: {
        Row: {
          alias: string | null
          created_at: string
          id: string
          is_default: boolean
          last_used_at: string
          location: unknown
          location_label: string
          user_id: string
        }
        Insert: {
          alias?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          last_used_at?: string
          location: unknown
          location_label: string
          user_id: string
        }
        Update: {
          alias?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          last_used_at?: string
          location?: unknown
          location_label?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_problem_investigations: {
        Row: {
          assigned_admin_id: string | null
          queue_status: Database["public"]["Enums"]["service_problem_investigation_status"]
          service_problem_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_admin_id?: string | null
          queue_status?: Database["public"]["Enums"]["service_problem_investigation_status"]
          service_problem_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_admin_id?: string | null
          queue_status?: Database["public"]["Enums"]["service_problem_investigation_status"]
          service_problem_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_problem_investigations_service_problem_id_fkey"
            columns: ["service_problem_id"]
            isOneToOne: true
            referencedRelation: "service_problems"
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
      tags: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      user_account_restrictions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string
          lift_reason: string | null
          lifted_at: string | null
          lifted_by: string | null
          reason: string
          scope: Database["public"]["Enums"]["user_restriction_scope"]
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key: string
          lift_reason?: string | null
          lifted_at?: string | null
          lifted_by?: string | null
          reason: string
          scope?: Database["public"]["Enums"]["user_restriction_scope"]
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string
          lift_reason?: string | null
          lifted_at?: string | null
          lifted_by?: string | null
          reason?: string
          scope?: Database["public"]["Enums"]["user_restriction_scope"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_account_restrictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_attendance: {
        Row: {
          request_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          request_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          request_id?: string
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
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at: string
          id: string
          is_default: boolean
          paystack_recipient_code: string
          resolved_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at?: string
          id?: string
          is_default?: boolean
          paystack_recipient_code: string
          resolved_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string
          bank_name?: string
          created_at?: string
          id?: string
          is_default?: boolean
          paystack_recipient_code?: string
          resolved_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_bank_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_conversation_focus: {
        Row: {
          conversation_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_conversation_focus_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "request_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_conversation_focus_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_identity_verifications: {
        Row: {
          created_at: string
          provider: string | null
          provider_reference: string | null
          status: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          provider?: string | null
          provider_reference?: string | null
          status?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          provider?: string | null
          provider_reference?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      user_nin_secrets: {
        Row: {
          ciphertext: string
          key_version: string
          nin_fingerprint: string
          nin_last_four: string | null
          nonce: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          ciphertext: string
          key_version?: string
          nin_fingerprint: string
          nin_last_four?: string | null
          nonce: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          ciphertext?: string
          key_version?: string
          nin_fingerprint?: string
          nin_last_four?: string | null
          nonce?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notification_tag_interests: {
        Row: {
          created_at: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_tag_interests_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notification_tag_interests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reputation: {
        Row: {
          created_at: string
          crown_public: boolean
          points_main: number
          shield_remaining: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          crown_public?: boolean
          points_main?: number
          shield_remaining?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          crown_public?: boolean
          points_main?: number
          shield_remaining?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reputation_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          metadata: Json
          paystack_reference: string | null
          project_id: string | null
          reference: string
          request_id: string | null
          status: Database["public"]["Enums"]["wallet_transaction_status"]
          type: Database["public"]["Enums"]["wallet_transaction_type"]
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          paystack_reference?: string | null
          project_id?: string | null
          reference: string
          request_id?: string | null
          status?: Database["public"]["Enums"]["wallet_transaction_status"]
          type: Database["public"]["Enums"]["wallet_transaction_type"]
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          paystack_reference?: string | null
          project_id?: string | null
          reference?: string
          request_id?: string | null
          status?: Database["public"]["Enums"]["wallet_transaction_status"]
          type?: Database["public"]["Enums"]["wallet_transaction_type"]
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "wallet_transactions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_withdrawals: {
        Row: {
          admin_notes: string | null
          amount_kobo: number
          approved_at: string | null
          approved_by: string | null
          bank_account_id: string | null
          bank_transfer_reference: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          currency: string
          destination_account_name: string
          destination_account_number: string
          destination_bank_code: string
          destination_bank_name: string
          failed_at: string | null
          failed_by: string | null
          id: string
          idempotency_key: string
          paystack_recipient_code: string
          processing_at: string | null
          processing_by: string | null
          rejected_at: string | null
          rejected_by: string | null
          release_transaction_id: string | null
          status: Database["public"]["Enums"]["wallet_withdrawal_status"]
          updated_at: string
          user_facing_reason: string | null
          user_id: string
          wallet_transaction_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount_kobo: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string | null
          bank_transfer_reference?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          currency?: string
          destination_account_name: string
          destination_account_number: string
          destination_bank_code: string
          destination_bank_name: string
          failed_at?: string | null
          failed_by?: string | null
          id?: string
          idempotency_key: string
          paystack_recipient_code: string
          processing_at?: string | null
          processing_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          release_transaction_id?: string | null
          status?: Database["public"]["Enums"]["wallet_withdrawal_status"]
          updated_at?: string
          user_facing_reason?: string | null
          user_id: string
          wallet_transaction_id: string
        }
        Update: {
          admin_notes?: string | null
          amount_kobo?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string | null
          bank_transfer_reference?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          currency?: string
          destination_account_name?: string
          destination_account_number?: string
          destination_bank_code?: string
          destination_bank_name?: string
          failed_at?: string | null
          failed_by?: string | null
          id?: string
          idempotency_key?: string
          paystack_recipient_code?: string
          processing_at?: string | null
          processing_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          release_transaction_id?: string | null
          status?: Database["public"]["Enums"]["wallet_withdrawal_status"]
          updated_at?: string
          user_facing_reason?: string | null
          user_id?: string
          wallet_transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_withdrawals_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "user_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_withdrawals_release_transaction_id_fkey"
            columns: ["release_transaction_id"]
            isOneToOne: true
            referencedRelation: "my_wallet_activity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_withdrawals_release_transaction_id_fkey"
            columns: ["release_transaction_id"]
            isOneToOne: true
            referencedRelation: "wallet_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_withdrawals_release_transaction_id_fkey"
            columns: ["release_transaction_id"]
            isOneToOne: true
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_withdrawals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_withdrawals_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: true
            referencedRelation: "my_wallet_activity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_withdrawals_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: true
            referencedRelation: "wallet_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_withdrawals_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: true
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          available_balance: number
          created_at: string
          currency: string
          id: string
          locked_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          available_balance?: number
          created_at?: string
          currency?: string
          id?: string
          locked_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          available_balance?: number
          created_at?: string
          currency?: string
          id?: string
          locked_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawal_policy: {
        Row: {
          allow_withdraw_without_identity_in_development: boolean
          id: number
          max_amount_kobo: number
          max_daily_amount_kobo: number
          min_amount_kobo: number
          require_admin_review: boolean
          require_identity_verification_for_withdrawal: boolean
          updated_at: string
          updated_by: string | null
          withdrawals_enabled: boolean
        }
        Insert: {
          allow_withdraw_without_identity_in_development?: boolean
          id: number
          max_amount_kobo: number
          max_daily_amount_kobo: number
          min_amount_kobo: number
          require_admin_review?: boolean
          require_identity_verification_for_withdrawal?: boolean
          updated_at?: string
          updated_by?: string | null
          withdrawals_enabled?: boolean
        }
        Update: {
          allow_withdraw_without_identity_in_development?: boolean
          id?: number
          max_amount_kobo?: number
          max_daily_amount_kobo?: number
          min_amount_kobo?: number
          require_admin_review?: boolean
          require_identity_verification_for_withdrawal?: boolean
          updated_at?: string
          updated_by?: string | null
          withdrawals_enabled?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      my_attendance: {
        Row: {
          attending_request_id: string | null
          commitment_count: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      my_requests: {
        Row: {
          accepted_at: string | null
          agreed_provider_amount: number | null
          attachment_path: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          expires_at: string | null
          first_response_at: string | null
          is_editable: boolean | null
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
          tag_slugs: string[] | null
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
          available?: never
          currency?: string | null
          locked?: never
          pending?: never
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          available?: never
          currency?: string | null
          locked?: never
          pending?: never
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
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
          available_delta?: never
          created_at?: string | null
          id?: string | null
          kind?: never
          locked_delta?: never
          pending_delta?: never
          request_id?: string | null
        }
        Update: {
          available_delta?: never
          created_at?: string | null
          id?: string | null
          kind?: never
          locked_delta?: never
          pending_delta?: never
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "wallet_transactions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_escrow: {
        Row: {
          created_at: string | null
          currency: string | null
          escrow_bucket: string | null
          provider_amount: number | null
          request_id: string | null
          requester_id: string | null
          service_fee: number | null
          total: number | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          escrow_bucket?: never
          provider_amount?: never
          request_id?: string | null
          requester_id?: string | null
          service_fee?: never
          total?: never
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          escrow_bucket?: never
          provider_amount?: never
          request_id?: string | null
          requester_id?: string | null
          service_fee?: never
          total?: never
        }
        Relationships: [
          {
            foreignKeyName: "payment_locks_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "payment_locks_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_locks_user_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_ledger: {
        Row: {
          available_delta: number | null
          created_at: string | null
          external_reference: string | null
          id: string | null
          idempotency_key: string | null
          kind: string | null
          locked_delta: number | null
          pending_delta: number | null
          platform_available_delta: number | null
          request_id: string | null
          user_id: string | null
        }
        Insert: {
          available_delta?: never
          created_at?: string | null
          external_reference?: string | null
          id?: string | null
          idempotency_key?: string | null
          kind?: never
          locked_delta?: never
          pending_delta?: never
          platform_available_delta?: never
          request_id?: string | null
          user_id?: string | null
        }
        Update: {
          available_delta?: never
          created_at?: string | null
          external_reference?: string | null
          id?: string | null
          idempotency_key?: string | null
          kind?: never
          locked_delta?: never
          pending_delta?: never
          platform_available_delta?: never
          request_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "wallet_transactions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      abort_request_message_with_attachments: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      accept_project_assignment: {
        Args: { p_assignment_id: string }
        Returns: undefined
      }
      accept_response: { Args: { p_response_id: string }; Returns: string }
      admin_actor_may_reveal_user_nin: {
        Args: { p_actor_admin_id: string }
        Returns: boolean
      }
      admin_add_report_note: {
        Args: { p_body: string; p_report_id: string }
        Returns: undefined
      }
      admin_add_user_note: {
        Args: { p_body: string; p_user_id: string }
        Returns: string
      }
      admin_apply_reputation_delta: {
        Args: {
          p_delta_main: number
          p_delta_shield: number
          p_reason: string
          p_user_id: string
        }
        Returns: undefined
      }
      admin_assign_report: {
        Args: { p_admin_id: string; p_report_id: string }
        Returns: undefined
      }
      admin_begin_wallet_withdrawal_processing: {
        Args: {
          p_admin_notes?: string
          p_idempotency_key: string
          p_withdrawal_id: string
        }
        Returns: string
      }
      admin_clear_username: {
        Args: { p_idempotency_key: string; p_reason: string; p_user_id: string }
        Returns: undefined
      }
      admin_complete_wallet_withdrawal: {
        Args: {
          p_admin_notes?: string
          p_bank_transfer_reference?: string
          p_idempotency_key: string
          p_withdrawal_id: string
        }
        Returns: string
      }
      admin_execute_operational_recovery: {
        Args: {
          p_action: string
          p_idempotency_key: string
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      admin_fail_wallet_withdrawal: {
        Args: {
          p_admin_notes?: string
          p_idempotency_key: string
          p_user_facing_reason: string
          p_withdrawal_id: string
        }
        Returns: string
      }
      admin_financial_exceptions: { Args: never; Returns: Json }
      admin_get_audit_event: { Args: { p_event_id: string }; Returns: Json }
      admin_get_deposit: { Args: { p_deposit_id: string }; Returns: Json }
      admin_get_finance_summary: {
        Args: { p_period_end?: string; p_period_start?: string }
        Returns: Json
      }
      admin_get_overview: {
        Args: { p_period_end: string; p_period_start: string }
        Returns: Json
      }
      admin_get_project: { Args: { p_project_id: string }; Returns: Json }
      admin_get_report: { Args: { p_report_id: string }; Returns: Json }
      admin_get_request: { Args: { p_request_id: string }; Returns: Json }
      admin_get_transaction: {
        Args: { p_transaction_id: string }
        Returns: Json
      }
      admin_get_user: { Args: { p_user_id: string }; Returns: Json }
      admin_get_wallet: { Args: { p_user_id: string }; Returns: Json }
      admin_get_wallet_withdrawal: {
        Args: { p_withdrawal_id: string }
        Returns: Json
      }
      admin_get_wallet_withdrawal_detail: {
        Args: { p_withdrawal_id: string }
        Returns: Json
      }
      admin_get_withdrawal_policy: { Args: never; Returns: Json }
      admin_get_withdrawals_overview: { Args: never; Returns: Json }
      admin_grant_member: {
        Args: {
          p_role: Database["public"]["Enums"]["admin_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      admin_list_audit_events: {
        Args: {
          p_action?: string
          p_entity_type?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
        }
        Returns: Json
      }
      admin_list_deposits: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_status?: string
        }
        Returns: Json
      }
      admin_list_members: { Args: never; Returns: Json }
      admin_list_project_disputes: {
        Args: { p_filter?: string; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      admin_list_projects: {
        Args: {
          p_filter?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
        }
        Returns: Json
      }
      admin_list_reports: {
        Args: {
          p_filter?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
        }
        Returns: Json
      }
      admin_list_requests: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_status_group?: string
        }
        Returns: Json
      }
      admin_list_transactions: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_status?: string
          p_type_group?: string
        }
        Returns: Json
      }
      admin_list_users: {
        Args: {
          p_filter?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
        }
        Returns: Json
      }
      admin_list_wallets: {
        Args: { p_limit?: number; p_offset?: number; p_query?: string }
        Returns: Json
      }
      admin_list_withdrawals: {
        Args: {
          p_amount_max_kobo?: number
          p_amount_min_kobo?: number
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_status?: string
          p_submitted_from?: string
          p_submitted_to?: string
          p_user_id?: string
        }
        Returns: Json
      }
      admin_operational_issues: { Args: never; Returns: Json }
      admin_override_premium_trial: {
        Args: {
          p_idempotency_key: string
          p_reason: string
          p_trial_ends_at: string
          p_user_id: string
        }
        Returns: undefined
      }
      admin_provision_member: {
        Args: {
          p_role: Database["public"]["Enums"]["admin_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      admin_record_audit_event: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: Database["public"]["Enums"]["admin_audit_entity_type"]
          p_idempotency_key: string
          p_metadata?: Json
          p_reason: string
        }
        Returns: string
      }
      admin_redact_json: { Args: { p_value: Json }; Returns: Json }
      admin_reinstate_user: {
        Args: { p_idempotency_key: string; p_reason: string; p_user_id: string }
        Returns: undefined
      }
      admin_reject_wallet_withdrawal: {
        Args: {
          p_admin_notes?: string
          p_idempotency_key: string
          p_user_facing_reason: string
          p_withdrawal_id: string
        }
        Returns: string
      }
      admin_report_filter_matches: {
        Args: {
          p_actor: string
          p_filter: string
          p_inv_assigned: string
          p_inv_queue: string
          p_respond_by: string
          p_sp_status: string
        }
        Returns: boolean
      }
      admin_report_queue_label: {
        Args: {
          p_inv_assigned: string
          p_inv_queue: string
          p_respond_by: string
          p_sp_status: string
        }
        Returns: string
      }
      admin_require_permission: { Args: { p_key: string }; Returns: Json }
      admin_resolve_report: {
        Args: {
          p_admin_note: string
          p_idempotency_key: string
          p_outcome: string
          p_report_id: string
        }
        Returns: undefined
      }
      admin_resolve_service_problem: {
        Args: {
          p_admin_note: string
          p_idempotency_key: string
          p_outcome: string
          p_problem_id: string
        }
        Returns: undefined
      }
      admin_reveal_wallet_withdrawal_account: {
        Args: { p_idempotency_key: string; p_withdrawal_id: string }
        Returns: Json
      }
      admin_revoke_member: { Args: { p_user_id: string }; Returns: undefined }
      admin_service_user_nin_decrypt_bundle: {
        Args: {
          p_actor_admin_id: string
          p_idempotency_key: string
          p_reason: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_suspend_user: {
        Args: { p_idempotency_key: string; p_reason: string; p_user_id: string }
        Returns: undefined
      }
      admin_transaction_filter_matches: {
        Args: {
          p_status: string
          p_type_group: string
          wt: Database["public"]["Tables"]["wallet_transactions"]["Row"]
        }
        Returns: boolean
      }
      admin_update_report_investigation: {
        Args: {
          p_queue_status: Database["public"]["Enums"]["service_problem_investigation_status"]
          p_reason?: string
          p_report_id: string
        }
        Returns: undefined
      }
      admin_update_withdrawal_policy: {
        Args: {
          p_allow_withdraw_without_identity_in_development: boolean
          p_idempotency_key: string
          p_max_amount_kobo: number
          p_max_daily_amount_kobo: number
          p_min_amount_kobo: number
          p_require_admin_review: boolean
          p_require_identity_verification_for_withdrawal: boolean
          p_withdrawals_enabled: boolean
        }
        Returns: Json
      }
      admin_upsert_service_problem_investigation: {
        Args: {
          p_assigned_admin_id: string
          p_queue_status: Database["public"]["Enums"]["service_problem_investigation_status"]
          p_service_problem_id: string
        }
        Returns: undefined
      }
      admin_wallet_locked_engagement_kobo: {
        Args: { p_user_id: string }
        Returns: number
      }
      admin_wallet_pending_kobo: {
        Args: { p_user_id: string }
        Returns: number
      }
      admin_wallet_type_group: {
        Args: { p_type: Database["public"]["Enums"]["wallet_transaction_type"] }
        Returns: string
      }
      agree_delivery_extension: {
        Args: { p_proposed_deadline_at: string; p_request_id: string }
        Returns: string
      }
      agree_to_response_milestone_proposal: {
        Args: { p_response_id: string }
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
      append_request_conversation_system_message: {
        Args: {
          p_body: string
          p_lifecycle_key: string
          p_request_id: string
          p_sender_id: string
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
      approve_and_payout_project_assignment: {
        Args: {
          p_assignment_id: string
          p_idempotency_key?: string
          p_milestone_id?: string
        }
        Returns: string
      }
      approve_engagement_milestone: {
        Args: { p_milestone_id: string }
        Returns: undefined
      }
      approve_project_assignment_milestone: {
        Args: { p_idempotency_key: string; p_milestone_id: string }
        Returns: string
      }
      approve_project_assignment_single: {
        Args: { p_assignment_id: string; p_idempotency_key: string }
        Returns: string
      }
      assert_admin_caller: { Args: never; Returns: undefined }
      assert_authenticated: { Args: never; Returns: string }
      assert_coordinates: {
        Args: { p_latitude: number; p_longitude: number }
        Returns: unknown
      }
      assert_delivery_deadline_within_max_from_start: {
        Args: { p_deadline_at: string; p_started_at: string }
        Returns: undefined
      }
      assert_dispute_evidence_paths: {
        Args: { p_paths: string[]; p_reporter_id: string }
        Returns: undefined
      }
      assert_in_app_profile_photo: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      assert_may_contribute_to_project: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: undefined
      }
      assert_may_view_project: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: undefined
      }
      assert_onboarded: { Args: never; Returns: string }
      assert_premium_project_creation_entitlement: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      assert_project_assignment_payout_allowed: {
        Args: { p_assignment_id: string }
        Returns: undefined
      }
      assert_project_assignments_allowed: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      assert_responder_available_for_selection: {
        Args: { p_provider_id: string; p_target_request_id: string }
        Returns: undefined
      }
      assert_user_marketplace_listing_allowed: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      assert_valid_iana_timezone: {
        Args: { p_timezone: string }
        Returns: undefined
      }
      assert_withdrawal_identity_allowed: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      attach_tags_to_request: {
        Args: { p_request_id: string; p_tag_ids: string[] }
        Returns: undefined
      }
      attending_request_statuses: {
        Args: never
        Returns: Database["public"]["Enums"]["request_status"][]
      }
      attribute_project_reservation_to_contributions: {
        Args: { p_reservation_id: string }
        Returns: undefined
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
      begin_request_message_with_attachments: {
        Args: {
          p_body?: string
          p_client_send_id?: string
          p_conversation_id: string
          p_planned_attachments?: Json
        }
        Returns: {
          attachment_id: string
          message_id: string
          storage_path: string
        }[]
      }
      browse_nearby_requests: {
        Args: {
          p_latitude: number
          p_limit?: number
          p_longitude: number
          p_offset?: number
        }
        Returns: {
          attachment_path: string
          currency: string
          description: string
          distance_m: number
          location_label: string
          offered_amount: number
          posted_at: string
          request_id: string
          requester_avatar_path: string
          requester_bio: string
          requester_completion_percent: number
          requester_display_name: string
          requester_id: string
          requester_identity_verified: boolean
          requester_rating_average: number
          requester_rating_count: number
          scheduled_for: string
          title: string
        }[]
      }
      browse_open_projects: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          attachment_path: string
          budget_total_kobo: number
          contributed_total_kobo: number
          creator_avatar_path: string
          creator_display_name: string
          creator_id: string
          description: string
          funding_status: Database["public"]["Enums"]["project_funding_status"]
          location_label: string
          min_funding_target_kobo: number
          posted_at: string
          project_id: string
          title: string
          viewer_is_creator: boolean
        }[]
      }
      browse_open_requests: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          attachment_path: string
          currency: string
          description: string
          distance_m: number
          location_label: string
          offered_amount: number
          posted_at: string
          request_id: string
          requester_avatar_path: string
          requester_bio: string
          requester_completion_percent: number
          requester_display_name: string
          requester_id: string
          requester_identity_verified: boolean
          requester_rating_average: number
          requester_rating_count: number
          scheduled_for: string
          title: string
        }[]
      }
      browse_request: {
        Args: { p_latitude: number; p_longitude: number; p_request_id: string }
        Returns: {
          attachment_path: string
          currency: string
          description: string
          distance_m: number
          location_label: string
          offered_amount: number
          posted_at: string
          request_id: string
          requester_avatar_path: string
          requester_bio: string
          requester_completion_percent: number
          requester_display_name: string
          requester_id: string
          requester_identity_verified: boolean
          requester_rating_average: number
          requester_rating_count: number
          respond_allowed: boolean
          scheduled_for: string
          tag_slugs: string[]
          title: string
        }[]
      }
      bucket_distance_m: { Args: { p_distance_m: number }; Returns: number }
      can_read_conversation_media: {
        Args: { p_name: string }
        Returns: boolean
      }
      can_read_request_media: { Args: { p_name: string }; Returns: boolean }
      can_write_conversation_media: {
        Args: { p_name: string }
        Returns: boolean
      }
      cancel_request:
        | { Args: { p_request_id: string }; Returns: undefined }
        | {
            Args: { p_reason?: string; p_request_id: string }
            Returns: undefined
          }
      cancel_service:
        | { Args: { p_request_id: string }; Returns: undefined }
        | {
            Args: { p_reason?: string; p_request_id: string }
            Returns: undefined
          }
      catalogue_media_is_published: {
        Args: { p_name: string }
        Returns: boolean
      }
      claim_project_contribution_refund: {
        Args: { p_contribution_id: string }
        Returns: undefined
      }
      clear_user_attendance:
        | { Args: { p_user_id: string }; Returns: undefined }
        | {
            Args: { p_request_id?: string; p_user_id: string }
            Returns: undefined
          }
      clone_request_from_prior: {
        Args: { p_idempotency_key: string; p_source_request_id: string }
        Returns: string
      }
      complete_request: { Args: { p_request_id: string }; Returns: undefined }
      complete_request_message_with_attachments: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      completion_confirmation_interval: { Args: never; Returns: string }
      compute_request_charge: {
        Args: { p_provider_amount: number }
        Returns: {
          provider_amount: number
          service_fee: number
          total: number
        }[]
      }
      compute_shifted_delivery_deadline: {
        Args: {
          p_accepted_at: string
          p_proposed_at: string
          p_started_at: string
        }
        Returns: string
      }
      confirm_avatar_capture: {
        Args: { p_storage_path: string }
        Returns: undefined
      }
      contest_service_problem: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      contribute_to_project: {
        Args: {
          p_amount_major: number
          p_idempotency_key: string
          p_project_id: string
        }
        Returns: string
      }
      conversation_attachment_extension_is_blocked: {
        Args: { p_ext: string }
        Returns: boolean
      }
      conversation_attachment_filename_extension: {
        Args: { p_file_name: string }
        Returns: string
      }
      conversation_attachment_max_bytes: {
        Args: {
          p_kind: Database["public"]["Enums"]["conversation_attachment_type"]
        }
        Returns: number
      }
      conversation_attachment_mime_kind: {
        Args: { p_mime: string }
        Returns: Database["public"]["Enums"]["conversation_attachment_type"]
      }
      conversation_attachment_normalize_mime: {
        Args: { p_mime: string }
        Returns: string
      }
      conversation_attachment_type_for_mime: {
        Args: { p_mime_type: string }
        Returns: Database["public"]["Enums"]["conversation_attachment_type"]
      }
      conversation_attachment_validate_planned: {
        Args: {
          p_attachment_type: Database["public"]["Enums"]["conversation_attachment_type"]
          p_file_name: string
          p_file_size: number
          p_mime_type: string
        }
        Returns: undefined
      }
      conversation_attachment_validate_stored: {
        Args: {
          p_expected_type: Database["public"]["Enums"]["conversation_attachment_type"]
          p_file_size: number
          p_mime_type: string
        }
        Returns: Database["public"]["Enums"]["conversation_attachment_type"]
      }
      conversation_chat_storage_path: {
        Args: {
          p_attachment_id: string
          p_conversation_id: string
          p_file_name: string
          p_message_id: string
          p_user_id: string
        }
        Returns: string
      }
      conversation_focus_ttl: { Args: never; Returns: string }
      conversation_media_path_is_valid: {
        Args: {
          p_conversation_id: string
          p_storage_path: string
          p_user_id: string
        }
        Returns: boolean
      }
      conversation_participant: {
        Args: { p_requester_id: string; p_selected_user_id: string }
        Returns: boolean
      }
      conversation_requester_initiated_chat: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      conversation_sending_allowed: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      conversation_sending_allowed_for_participant: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
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
      create_project: {
        Args: {
          p_attachment_path?: string
          p_budget_total_major?: number
          p_description?: string
          p_funding_deadline_local_date?: string
          p_funding_deadline_local_time?: string
          p_funding_timezone?: string
          p_funding_visibility?: Database["public"]["Enums"]["project_funding_visibility"]
          p_latitude?: number
          p_location_label?: string
          p_longitude?: number
          p_min_contribution_major?: number
          p_min_funding_target_major?: number
          p_tag_ids?: string[]
          p_title: string
        }
        Returns: string
      }
      create_project_assignment: {
        Args: {
          p_compensation_major: number
          p_deliverables: string
          p_description: string
          p_due_at: string
          p_milestones?: Json
          p_payment_structure: Database["public"]["Enums"]["payment_structure"]
          p_project_id: string
          p_title: string
          p_worker_id: string
        }
        Returns: string
      }
      create_request:
        | {
            Args: {
              p_attachment_path?: string
              p_description: string
              p_latitude: number
              p_location_label: string
              p_longitude: number
              p_milestones?: Json
              p_offered_amount?: number
              p_payment_structure?: Database["public"]["Enums"]["payment_structure"]
              p_scheduled_for?: string
              p_source_request_id?: string
              p_tag_ids?: string[]
              p_title: string
            }
            Returns: string
          }
        | {
            Args: {
              p_attachment_path?: string
              p_description: string
              p_expires_at?: string
              p_latitude: number
              p_location_label: string
              p_longitude: number
              p_milestones?: Json
              p_offered_amount?: number
              p_payment_structure?: Database["public"]["Enums"]["payment_structure"]
              p_scheduled_for?: string
              p_source_request_id?: string
              p_tag_ids?: string[]
              p_title: string
            }
            Returns: string
          }
      crown_tier_for_points: { Args: { p_points: number }; Returns: string }
      decline_response: {
        Args: { p_reason?: string; p_response_id: string }
        Returns: undefined
      }
      decrease_project_budget: {
        Args: { p_new_budget_total_major: number; p_project_id: string }
        Returns: undefined
      }
      delete_saved_location: {
        Args: { p_saved_location_id: string }
        Returns: undefined
      }
      delete_user_bank_account: {
        Args: { p_bank_account_id: string }
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
      dismiss_worker_failure_to_start: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      dismiss_worker_missed_delivery: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      display_first_name: { Args: { p_display_name: string }; Returns: string }
      ensure_request_conversation: {
        Args: {
          p_request_id: string
          p_requester_id: string
          p_response_id: string
          p_selected_user_id: string
        }
        Returns: string
      }
      ensure_user_reputation_row: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      ensure_wallet_account: { Args: { p_user_id: string }; Returns: undefined }
      evaluate_due_project_funding: {
        Args: { p_limit?: number }
        Returns: number
      }
      evaluate_project_funding_status: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      expire_due_requests: { Args: { p_limit?: number }; Returns: number }
      expire_request: { Args: { p_request_id: string }; Returns: boolean }
      extend_request: {
        Args: { p_expires_at: string; p_request_id: string }
        Returns: undefined
      }
      finalize_client_no_show_resolution: {
        Args: {
          p_actor_id: string
          p_payment_idempotency_key: string
          p_request_id: string
          p_status_event_key: string
        }
        Returns: boolean
      }
      finalize_milestone_engagement: {
        Args: {
          p_actor_id: string
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
      format_ui_money: {
        Args: { p_amount: number; p_currency: string }
        Returns: string
      }
      get_engagement: {
        Args: { p_request_id: string }
        Returns: {
          accepted_at: string
          adjusted_delivery_at: string
          agreed_provider_amount: number
          completed_at: string
          completion_confirm_by: string
          counterparty_avatar_path: string
          counterparty_bio: string
          counterparty_completion_percent: number
          counterparty_display_name: string
          counterparty_id: string
          counterparty_identity_verified: boolean
          counterparty_phone: string
          counterparty_rating_average: number
          counterparty_rating_count: number
          currency: string
          delivery_deadline_at: string
          description: string
          handshake_at: string
          handshake_id: string
          location_label: string
          offered_amount: number
          payment_status: Database["public"]["Enums"]["payment_status"]
          proposed_delivery_at: string
          proposed_delivery_timezone: string
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
          start_by_at: string
          started_at: string
          tag_slugs: string[]
          title: string
          viewer_has_rated: boolean
          viewer_is_requester: boolean
        }[]
      }
      get_my_admin_permissions: { Args: never; Returns: Json }
      get_my_entitlements: {
        Args: never
        Returns: {
          can_create_projects: boolean
          premium_active: boolean
          premium_trial_ends_at: string
          premium_trial_started_at: string
        }[]
      }
      get_my_identity_status: { Args: never; Returns: Json }
      get_my_reputation: {
        Args: never
        Returns: {
          crown_public: boolean
          crown_tier: string
          next_tier: string
          points_main: number
          points_to_next_tier: number
          shield_remaining: number
        }[]
      }
      get_my_wallet: {
        Args: never
        Returns: {
          available_kobo: number
          currency: string
          locked_kobo: number
          pending_kobo: number
          updated_at: string
          wallet_id: string
        }[]
      }
      get_my_wallet_withdrawal: {
        Args: { p_withdrawal_id: string }
        Returns: Json
      }
      get_project: {
        Args: { p_project_id: string }
        Returns: {
          attachment_path: string
          budget_total_kobo: number
          committed_compensation_kobo: number
          contributed_total_kobo: number
          creator_avatar_path: string
          creator_bio: string
          creator_completion_percent: number
          creator_display_name: string
          creator_id: string
          creator_identity_verified: boolean
          creator_rating_average: number
          creator_rating_count: number
          description: string
          fully_funded_at: string
          funding_deadline_at: string
          funding_opened_at: string
          funding_status: Database["public"]["Enums"]["project_funding_status"]
          funding_timezone: string
          funding_unsuccessful_at: string
          funding_visibility: Database["public"]["Enums"]["project_funding_visibility"]
          location_label: string
          min_contribution_kobo: number
          min_funding_target_kobo: number
          min_target_reached_at: string
          project_id: string
          project_visibility: Database["public"]["Enums"]["project_visibility"]
          reserved_total_kobo: number
          status: Database["public"]["Enums"]["project_status"]
          tag_slugs: string[]
          title: string
          viewer_is_contributor: boolean
          viewer_is_creator: boolean
          viewer_may_contribute: boolean
          viewer_may_view_assignments: boolean
        }[]
      }
      get_project_assignment: {
        Args: { p_assignment_id: string }
        Returns: {
          accepted_at: string
          assignment_id: string
          commenced_at: string
          compensation_total_kobo: number
          creator_id: string
          deliverables: string
          description: string
          due_at: string
          payment_structure: Database["public"]["Enums"]["payment_structure"]
          project_id: string
          reservation_amount_kobo: number
          reservation_released_kobo: number
          reservation_secured: boolean
          status: Database["public"]["Enums"]["project_assignment_status"]
          terms_version: number
          title: string
          viewer_is_creator: boolean
          viewer_is_worker: boolean
          worker_id: string
        }[]
      }
      get_project_contribution_accounting: {
        Args: { p_contribution_id: string }
        Returns: {
          contribution_id: string
          contributor_id: string
          eligible_refund_kobo: number
          gross_amount_kobo: number
          project_id: string
          refunded_kobo: number
          reservations_attributed: boolean
          reserved_kobo: number
        }[]
      }
      get_public_profile: {
        Args: { p_username: string }
        Returns: {
          avatar_path: string
          bio: string
          crown_public: boolean
          crown_tier: string
          display_name: string
          identity_verified: boolean
          jobs_completed: number
          points_main: number
          rating_average: number
          rating_count: number
          requests_completed: number
          shield_remaining: number
          user_id: string
          username: string
        }[]
      }
      get_public_withdrawal_policy: { Args: never; Returns: Json }
      get_request_conversation: {
        Args: { p_request_id: string }
        Returns: {
          conversation_id: string
          created_at: string
          messaging_enabled: boolean
          request_id: string
          request_status: Database["public"]["Enums"]["request_status"]
          requester_id: string
          selected_user_id: string
          updated_at: string
        }[]
      }
      get_request_message_for_viewer: {
        Args: { p_message_id: string }
        Returns: {
          attachments: Json
          body: string
          created_at: string
          message_id: string
          message_type: Database["public"]["Enums"]["conversation_message_type"]
          metadata: Json
          read_at: string
          sender_id: string
        }[]
      }
      get_request_milestone_plan_for_respond: {
        Args: { p_request_id: string }
        Returns: {
          milestones: Json
          my_proposed_milestones: Json
          payment_structure: Database["public"]["Enums"]["payment_structure"]
        }[]
      }
      get_responder_pre_handshake_conversation: {
        Args: { p_request_id: string }
        Returns: string
      }
      get_user_bank_account_id_if_owned: {
        Args: {
          p_account_number: string
          p_bank_code: string
          p_user_id: string
        }
        Returns: string
      }
      get_withdrawal_policy: {
        Args: never
        Returns: {
          allow_withdraw_without_identity_in_development: boolean
          id: number
          max_amount_kobo: number
          max_daily_amount_kobo: number
          min_amount_kobo: number
          require_admin_review: boolean
          require_identity_verification_for_withdrawal: boolean
          updated_at: string
          updated_by: string | null
          withdrawals_enabled: boolean
        }
        SetofOptions: {
          from: "*"
          to: "withdrawal_policy"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      increase_project_budget: {
        Args: { p_new_budget_total_major: number; p_project_id: string }
        Returns: undefined
      }
      insert_user_bank_account: {
        Args: {
          p_account_name: string
          p_account_number: string
          p_bank_code: string
          p_bank_name: string
          p_paystack_recipient_code: string
          p_user_id: string
        }
        Returns: string
      }
      invite_project_contributor: {
        Args: { p_invitee_id: string; p_project_id: string }
        Returns: string
      }
      kobo_to_ngn_major: { Args: { p_kobo: number }; Returns: number }
      list_engagement_milestones: {
        Args: { p_request_id: string }
        Returns: {
          amount_major: number
          approved_at: string
          description: string
          milestone_id: string
          milestone_position: number
          status: Database["public"]["Enums"]["milestone_status"]
          submitted_at: string
          title: string
        }[]
      }
      list_my_bank_accounts: {
        Args: never
        Returns: {
          account_name: string
          account_number: string
          bank_account_id: string
          bank_code: string
          bank_name: string
          can_delete: boolean
          created_at: string
          is_default: boolean
          resolved_at: string
          updated_at: string
        }[]
      }
      list_my_created_projects: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          budget_total_kobo: number
          contributed_total_kobo: number
          funding_deadline_at: string
          funding_status: Database["public"]["Enums"]["project_funding_status"]
          project_id: string
          status: Database["public"]["Enums"]["project_status"]
          title: string
        }[]
      }
      list_my_project_assignments: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          assignment_id: string
          compensation_total_kobo: number
          due_at: string
          project_id: string
          project_title: string
          reservation_secured: boolean
          status: Database["public"]["Enums"]["project_assignment_status"]
        }[]
      }
      list_my_reputation_history: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          created_at: string
          delta_main: number
          delta_shield: number
          ledger_id: string
          reason: string
          source: string
        }[]
      }
      list_my_request_conversations: {
        Args: never
        Returns: {
          conversation_id: string
          counterparty_avatar_captured_in_app: boolean
          counterparty_avatar_path: string
          counterparty_display_name: string
          counterparty_id: string
          counterparty_identity_verified: boolean
          latest_message_at: string
          latest_message_body: string
          latest_message_sender_id: string
          messaging_enabled: boolean
          request_id: string
          request_status: Database["public"]["Enums"]["request_status"]
          request_title: string
          unread_count: number
          updated_at: string
        }[]
      }
      list_my_saved_locations: {
        Args: never
        Returns: {
          alias: string
          is_default: boolean
          last_used_at: string
          latitude: number
          location_label: string
          longitude: number
          saved_location_id: string
        }[]
      }
      list_my_wallet_transactions:
        | {
            Args: { p_limit?: number }
            Returns: {
              amount: number
              available_delta_kobo: number
              created_at: string
              description: string
              id: string
              locked_delta_kobo: number
              metadata: Json
              paystack_reference: string
              reference: string
              request_id: string
              status: Database["public"]["Enums"]["wallet_transaction_status"]
              type: Database["public"]["Enums"]["wallet_transaction_type"]
            }[]
          }
        | {
            Args: { p_limit?: number; p_offset?: number }
            Returns: {
              amount: number
              available_delta_kobo: number
              created_at: string
              description: string
              id: string
              locked_delta_kobo: number
              metadata: Json
              paystack_reference: string
              reference: string
              request_id: string
              status: Database["public"]["Enums"]["wallet_transaction_status"]
              type: Database["public"]["Enums"]["wallet_transaction_type"]
            }[]
          }
      list_my_wallet_withdrawals: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          amount_kobo: number
          completed_at: string
          created_at: string
          currency: string
          destination_account_name: string
          destination_account_number_masked: string
          destination_bank_name: string
          failed_at: string
          processing_at: string
          rejected_at: string
          status: string
          updated_at: string
          user_facing_reason: string
          wallet_transaction_id: string
          withdrawal_id: string
        }[]
      }
      list_notification_tag_interests: {
        Args: never
        Returns: {
          name: string
          slug: string
          tag_id: string
        }[]
      }
      list_project_activity: {
        Args: { p_limit?: number; p_offset?: number; p_project_id: string }
        Returns: {
          event_at: string
          event_type: string
          summary: string
        }[]
      }
      list_project_assignment_milestones: {
        Args: { p_assignment_id: string }
        Returns: {
          amount_kobo: number
          due_at: string
          milestone_id: string
          milestone_position: number
          status: Database["public"]["Enums"]["milestone_status"]
          title: string
        }[]
      }
      list_project_assignment_submissions: {
        Args: { p_assignment_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          milestone_id: string
          note: string
          submission_id: string
          submitted_at: string
        }[]
      }
      list_project_assignments: {
        Args: { p_limit?: number; p_offset?: number; p_project_id: string }
        Returns: {
          assignment_id: string
          compensation_total_kobo: number
          due_at: string
          reservation_secured: boolean
          status: Database["public"]["Enums"]["project_assignment_status"]
          title: string
          viewer_is_creator: boolean
          worker_display_name: string
          worker_id: string
        }[]
      }
      list_project_contributions: {
        Args: { p_limit?: number; p_offset?: number; p_project_id: string }
        Returns: {
          amount_kobo: number
          contributed_at: string
          contribution_id: string
          contributor_display_name: string
          contributor_id: string
          contributor_username: string
          reserved_kobo: number
          viewer_is_creator: boolean
          viewer_is_self: boolean
        }[]
      }
      list_request_messages: {
        Args: { p_before?: string; p_conversation_id: string; p_limit?: number }
        Returns: {
          attachments: Json
          body: string
          created_at: string
          message_id: string
          message_type: Database["public"]["Enums"]["conversation_message_type"]
          metadata: Json
          read_at: string
          sender_id: string
        }[]
      }
      list_request_milestone_proposals: {
        Args: { p_request_id: string }
        Returns: {
          items: Json
          proposal_id: string
          response_id: string
          status: Database["public"]["Enums"]["milestone_proposal_status"]
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
          identity_verified: boolean
          jobs_completed: number
          message: string
          phone_verified: boolean
          proposed_delivery_at: string
          proposed_delivery_timezone: string
          quoted_amount: number
          rating_average: number
          rating_count: number
          responder_available: boolean
          responder_id: string
          response_id: string
          status: Database["public"]["Enums"]["response_status"]
        }[]
      }
      list_tag_catalogue: {
        Args: never
        Returns: {
          category: string
          name: string
          slug: string
          tag_id: string
        }[]
      }
      lock_request_escrow: {
        Args: { p_idempotency_key: string; p_request_id: string }
        Returns: undefined
      }
      lock_request_escrow_for_amount: {
        Args: {
          p_idempotency_key: string
          p_offer_amount: number
          p_request_id: string
        }
        Returns: undefined
      }
      map_wallet_kind_to_type: {
        Args: { p_kind: string }
        Returns: Database["public"]["Enums"]["wallet_transaction_type"]
      }
      mark_notification_inbox_item_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      mark_notification_inbox_read: { Args: never; Returns: undefined }
      mark_request_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      mark_request_response_notifications_read: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      mark_service_complete: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      mask_bank_account_number: {
        Args: { p_account_number: string }
        Returns: string
      }
      mask_nin_last_four: { Args: { p_last_four: string }; Returns: string }
      matching_request_notification_body: {
        Args: { p_recipient_id: string; p_request_id: string }
        Returns: string
      }
      milestone_items_sum_matches_total: {
        Args: { p_items: Json; p_total_major: number }
        Returns: boolean
      }
      my_received_ratings: {
        Args: never
        Returns: {
          comment: string
          created_at: string
          rater_avatar_path: string
          rater_display_name: string
          rater_id: string
          rating_id: string
          request_id: string
          stars: number
        }[]
      }
      my_responses: {
        Args: never
        Returns: {
          attachment_path: string
          created_at: string
          currency: string
          decline_reason: string
          description: string
          distance_m: number
          location_label: string
          message: string
          offered_amount: number
          posted_at: string
          quoted_amount: number
          request_id: string
          request_status: Database["public"]["Enums"]["request_status"]
          requester_avatar_path: string
          requester_bio: string
          requester_completion_percent: number
          requester_display_name: string
          requester_id: string
          requester_identity_verified: boolean
          requester_rating_average: number
          requester_rating_count: number
          response_id: string
          response_status: Database["public"]["Enums"]["response_status"]
          scheduled_for: string
          title: string
        }[]
      }
      new_message_notification_body: {
        Args: { p_body: string; p_message_id: string; p_sender_first: string }
        Returns: string
      }
      ngn_major_to_kobo: { Args: { p_amount: number }; Returns: number }
      normalize_username: { Args: { p_username: string }; Returns: string }
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
      notify_request_message_dispatch: {
        Args: {
          p_message: Database["public"]["Tables"]["request_messages"]["Row"]
        }
        Returns: undefined
      }
      notify_request_message_manual: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      notify_responders_not_chosen: {
        Args: { p_chosen_response_id: string; p_request_id: string }
        Returns: undefined
      }
      notify_tag_interest_subscribers: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      notify_wallet_withdrawal_user: {
        Args: { p_stage: string; p_withdrawal_id: string }
        Returns: undefined
      }
      open_pre_handshake_conversation: {
        Args: { p_response_id: string }
        Returns: string
      }
      open_project_funding: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      open_request_statuses: {
        Args: never
        Returns: Database["public"]["Enums"]["request_status"][]
      }
      owner_expire_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      parse_milestone_items_json: {
        Args: { p_items: Json }
        Returns: {
          amount_major: number
          description: string
          milestone_position: number
          title: string
        }[]
      }
      platform_is_local_deployment: { Args: never; Returns: boolean }
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
      project_assignment_commencement_allowed: {
        Args: { p_assignment_id: string; p_project_id: string }
        Returns: undefined
      }
      project_assignment_has_open_dispute: {
        Args: { p_assignment_id: string }
        Returns: boolean
      }
      project_assignment_release_payment: {
        Args: {
          p_approved_by: string
          p_assignment_id: string
          p_fee_kobo: number
          p_idempotency_key: string
          p_milestone_id: string
          p_provider_kobo: number
          p_submission_id?: string
          p_total_kobo: number
        }
        Returns: string
      }
      project_funding_deadline_at: {
        Args: {
          p_local_date: string
          p_local_time?: string
          p_timezone?: string
        }
        Returns: string
      }
      project_funding_default_period_interval: { Args: never; Returns: string }
      project_funding_min_period_interval: { Args: never; Returns: string }
      project_funding_period_interval: { Args: never; Returns: string }
      project_media_visible_to_party: {
        Args: { p_name: string; p_user_id: string }
        Returns: boolean
      }
      project_pool_unreserved_kobo: {
        Args: { p_project_id: string }
        Returns: number
      }
      project_reservations_fully_attributed: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      propose_project_assignment_terms: {
        Args: {
          p_assignment_id: string
          p_compensation_major: number
          p_deliverables: string
          p_description: string
          p_due_at: string
          p_milestones?: Json
          p_payment_structure: Database["public"]["Enums"]["payment_structure"]
          p_title: string
        }
        Returns: string
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
      provider_schedule_conflict_message: { Args: never; Returns: string }
      provider_selection_conflicts: {
        Args: { p_provider_id: string; p_target_request_id: string }
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
      recipient_is_viewing_conversation: {
        Args: { p_conversation_id: string; p_recipient_user_id: string }
        Returns: boolean
      }
      record_discovery_coordinates: {
        Args: { p_latitude: number; p_longitude: number }
        Returns: undefined
      }
      record_request_search: { Args: { p_query: string }; Returns: undefined }
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
      release_project_assignment_reservation: {
        Args: { p_assignment_id: string }
        Returns: undefined
      }
      release_project_pool_reservation: {
        Args: { p_idempotency_key: string; p_reservation_id: string }
        Returns: undefined
      }
      release_provider: { Args: { p_provider_id: string }; Returns: undefined }
      replace_milestone_proposal_items: {
        Args: { p_items: Json; p_proposal_id: string }
        Returns: undefined
      }
      report_project_assignment_problem: {
        Args: {
          p_assignment_id: string
          p_description?: string
          p_evidence_paths?: string[]
          p_kind?: Database["public"]["Enums"]["service_problem_kind"]
        }
        Returns: string
      }
      report_service_problem: {
        Args: {
          p_description?: string
          p_evidence_paths?: string[]
          p_kind?: Database["public"]["Enums"]["service_problem_kind"]
          p_request_id: string
        }
        Returns: undefined
      }
      reputation_config_int: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
      request_allows_requester_edit: {
        Args: {
          p_accepted_at: string
          p_expires_at: string
          p_request_id: string
          p_status: Database["public"]["Enums"]["request_status"]
        }
        Returns: boolean
      }
      request_conversation_is_accessible: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      request_conversation_messaging_enabled: {
        Args: { p_status: Database["public"]["Enums"]["request_status"] }
        Returns: boolean
      }
      request_discoverable_for_user: {
        Args: { p_request_id: string; p_user_id: string }
        Returns: boolean
      }
      request_effective_status: {
        Args: {
          p_expires_at: string
          p_status: Database["public"]["Enums"]["request_status"]
        }
        Returns: Database["public"]["Enums"]["request_status"]
      }
      request_engagement_max_delivery_interval: { Args: never; Returns: string }
      request_engagement_milestone_revision: {
        Args: { p_milestone_id: string }
        Returns: undefined
      }
      request_engagement_start_window_interval: { Args: never; Returns: string }
      request_expires_at: { Args: { p_scheduled_for: string }; Returns: string }
      request_expiry_at: {
        Args: {
          p_local_date: string
          p_local_time?: string
          p_timezone?: string
        }
        Returns: string
      }
      request_in_awaiting_review: {
        Args: {
          p_expires_at: string
          p_status: Database["public"]["Enums"]["request_status"]
        }
        Returns: boolean
      }
      request_lifetime_interval: { Args: never; Returns: string }
      request_media_visible_to_party: {
        Args: { p_name: string; p_user_id: string }
        Returns: boolean
      }
      request_message_attachments_for_row: {
        Args: { p_message_id: string }
        Returns: Json
      }
      request_message_system_insert_allowed: { Args: never; Returns: boolean }
      request_message_visible_to_viewer: {
        Args: { p_message_id: string; p_viewer_id: string }
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
      request_project_assignment_revision: {
        Args: { p_note?: string; p_submission_id: string }
        Returns: string
      }
      request_qualifying_deliverable_submitted_before_deadline: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      request_response_notifications_dedupe_key: {
        Args: { p_request_id: string; p_requester_id: string }
        Returns: string
      }
      request_schedule_anchor: {
        Args: { p_accepted_at: string; p_scheduled_for: string }
        Returns: string
      }
      request_schedule_conflicts: {
        Args: {
          p_existing_accepted: string
          p_existing_scheduled: string
          p_new_anchor: string
          p_new_scheduled: string
        }
        Returns: boolean
      }
      request_tag_slugs: { Args: { p_request_id: string }; Returns: string[] }
      request_wallet_withdrawal: {
        Args: {
          p_amount_major: number
          p_bank_account_id: string
          p_idempotency_key: string
          p_user_id: string
        }
        Returns: string
      }
      requester_completion_percent: {
        Args: { p_user_id: string }
        Returns: number
      }
      reserve_project_assignment_compensation: {
        Args: { p_assignment_id: string }
        Returns: string
      }
      reserve_project_pool_kobo: {
        Args: {
          p_amount_major: number
          p_idempotency_key: string
          p_note?: string
          p_project_id: string
        }
        Returns: string
      }
      resolve_due_service_problems: {
        Args: { p_limit?: number }
        Returns: number
      }
      resolve_milestone_proposal_for_accept: {
        Args: { p_request_id: string; p_response_id: string }
        Returns: string
      }
      resolve_request_conversation_for_viewer: {
        Args: { p_lookup_id: string }
        Returns: {
          conversation_id: string
          counterparty_avatar_path: string
          counterparty_display_name: string
          counterparty_id: string
          counterparty_identity_verified: boolean
          created_at: string
          is_pre_handshake: boolean
          messaging_enabled: boolean
          request_description: string
          request_id: string
          request_status: Database["public"]["Enums"]["request_status"]
          request_title: string
          requester_id: string
          response_id: string
          selected_user_id: string
          updated_at: string
        }[]
      }
      resolve_service_problem: {
        Args: { p_problem_id: string }
        Returns: boolean
      }
      respond_to_request:
        | {
            Args: {
              p_latitude?: number
              p_longitude?: number
              p_message?: string
              p_quoted_amount?: number
              p_request_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_latitude?: number
              p_longitude?: number
              p_message?: string
              p_proposed_delivery_at?: string
              p_proposed_delivery_timezone?: string
              p_quoted_amount?: number
              p_request_id: string
            }
            Returns: string
          }
      sanitize_chat_attachment_filename: {
        Args: { p_file_name: string }
        Returns: string
      }
      search_discover: {
        Args: {
          p_category: Database["public"]["Enums"]["search_discover_category"]
          p_latitude?: number
          p_limit?: number
          p_longitude?: number
          p_offset?: number
          p_query: string
        }
        Returns: Json
      }
      search_people: {
        Args: { p_limit?: number; p_offset?: number; p_query: string }
        Returns: {
          avatar_path: string
          bio: string
          display_name: string
          identity_verified: boolean
          rating_average: number
          rating_count: number
          user_id: string
          username: string
        }[]
      }
      search_projects: {
        Args: { p_limit?: number; p_offset?: number; p_query: string }
        Returns: {
          budget_total_kobo: number
          description: string
          funding_deadline_at: string
          funding_status: Database["public"]["Enums"]["project_funding_status"]
          funding_visibility: Database["public"]["Enums"]["project_funding_visibility"]
          min_funding_target_kobo: number
          project_id: string
          title: string
        }[]
      }
      search_request_queries: {
        Args: { p_limit?: number; p_prefix?: string }
        Returns: {
          normalized_query: string
        }[]
      }
      search_requests: {
        Args: {
          p_latitude: number
          p_limit?: number
          p_longitude: number
          p_offset?: number
          p_query: string
        }
        Returns: {
          attachment_path: string
          currency: string
          description: string
          distance_m: number
          location_label: string
          offered_amount: number
          posted_at: string
          request_id: string
          requester_avatar_path: string
          requester_bio: string
          requester_completion_percent: number
          requester_display_name: string
          requester_id: string
          requester_identity_verified: boolean
          requester_rating_average: number
          requester_rating_count: number
          scheduled_for: string
          title: string
        }[]
      }
      search_tags: {
        Args: { p_limit?: number; p_query?: string }
        Returns: {
          category: string
          name: string
          slug: string
          tag_id: string
        }[]
      }
      send_request_message: {
        Args: { p_body: string; p_conversation_id: string }
        Returns: string
      }
      send_request_message_attachment: {
        Args: {
          p_caption?: string
          p_conversation_id: string
          p_storage_path: string
        }
        Returns: string
      }
      send_request_message_with_attachments: {
        Args: {
          p_body?: string
          p_conversation_id: string
          p_storage_paths?: string[]
        }
        Returns: string
      }
      service_problem_requires_description: {
        Args: { p_kind: Database["public"]["Enums"]["service_problem_kind"] }
        Returns: boolean
      }
      service_problem_response_interval: { Args: never; Returns: string }
      set_default_user_bank_account: {
        Args: { p_bank_account_id: string }
        Returns: undefined
      }
      set_my_crown_public: { Args: { p_visible: boolean }; Returns: undefined }
      set_notification_preferences: {
        Args: {
          p_message_push_enabled: boolean
          p_push_calls_enabled: boolean
          p_push_notifications_enabled: boolean
          p_push_payments_wallet_enabled: boolean
          p_push_tips_reminders_enabled: boolean
        }
        Returns: undefined
      }
      set_notification_tag_interests: {
        Args: { p_tag_ids: string[] }
        Returns: undefined
      }
      set_request_conversation_focus: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      set_request_milestone_draft: {
        Args: { p_milestones: Json; p_request_id: string }
        Returns: undefined
      }
      set_user_attendance: {
        Args: { p_request_id: string; p_user_id: string }
        Returns: undefined
      }
      set_username: { Args: { p_username: string }; Returns: undefined }
      shorten_project_funding_deadline: {
        Args: { p_new_deadline_at: string; p_project_id: string }
        Returns: undefined
      }
      snapshot_engagement_milestones: {
        Args: { p_proposal_id: string; p_request_id: string }
        Returns: undefined
      }
      snapshot_project_assignment_milestones: {
        Args: { p_assignment_id: string; p_terms_id: string }
        Returns: undefined
      }
      snapshot_project_tags: {
        Args: { p_project_id: string; p_tag_ids: string[] }
        Returns: undefined
      }
      start_premium_trial: { Args: never; Returns: undefined }
      start_project_assignment: {
        Args: { p_assignment_id: string }
        Returns: undefined
      }
      start_request: { Args: { p_request_id: string }; Returns: undefined }
      submit_engagement_milestone: {
        Args: { p_milestone_id: string }
        Returns: undefined
      }
      submit_project_assignment_deliverable: {
        Args: {
          p_assignment_id: string
          p_evidence_paths?: string[]
          p_milestone_id?: string
          p_note?: string
        }
        Returns: string
      }
      submit_project_assignment_work: {
        Args: {
          p_assignment_id: string
          p_milestone_id?: string
          p_note?: string
        }
        Returns: string
      }
      submit_response_milestone_proposal: {
        Args: { p_milestones: Json; p_response_id: string }
        Returns: string
      }
      submit_user_nin_encrypted: {
        Args: {
          p_ciphertext: string
          p_fingerprint: string
          p_key_version: string
          p_nin_last_four: string
          p_nonce: string
          p_user_id: string
        }
        Returns: Json
      }
      sync_project_contribution_reserved_from_allocations: {
        Args: { p_contribution_id: string }
        Returns: undefined
      }
      sync_wallet_payment_transition: {
        Args: {
          p_from: Database["public"]["Enums"]["payment_status"]
          p_idempotency_key: string
          p_request_id: string
          p_to: Database["public"]["Enums"]["payment_status"]
        }
        Returns: undefined
      }
      tag_interest_notification_recipients: {
        Args: { p_request_id: string; p_requester_id: string }
        Returns: string[]
      }
      touch_saved_location: {
        Args: { p_saved_location_id: string }
        Returns: undefined
      }
      transition_request_to_awaiting_review: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      update_request: {
        Args: {
          p_attachment_path?: string
          p_description: string
          p_latitude: number
          p_location_label: string
          p_longitude: number
          p_offered_amount?: number
          p_request_id: string
          p_scheduled_for?: string
          p_tag_ids?: string[]
          p_title: string
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
      upsert_saved_location: {
        Args: {
          p_alias: string
          p_is_default?: boolean
          p_latitude: number
          p_location_label: string
          p_longitude: number
          p_saved_location_id: string
        }
        Returns: string
      }
      user_bank_account_pending_withdrawal_exists: {
        Args: { p_bank_account_id: string; p_user_id: string }
        Returns: boolean
      }
      user_has_provider_identity_verification: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      user_marketplace_identity_verified: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      user_push_delivery_allowed: {
        Args: {
          p_type: Database["public"]["Enums"]["notification_type"]
          p_user_id: string
        }
        Returns: boolean
      }
      user_withdrawal_daily_reserved_kobo: {
        Args: { p_day: string; p_user_id: string }
        Returns: number
      }
      validate_project_budget_kobo: {
        Args: {
          p_budget_total_kobo: number
          p_min_contribution_kobo: number
          p_min_funding_target_kobo: number
        }
        Returns: undefined
      }
      validate_proposal_matches_total: {
        Args: { p_proposal_id: string; p_total_major: number }
        Returns: undefined
      }
      wallet_adjust_active_lock_kobo: {
        Args: {
          p_new_provider_amount_kobo: number
          p_new_service_fee_kobo: number
          p_new_total_kobo: number
          p_reference: string
          p_request_id: string
        }
        Returns: string
      }
      wallet_apply_entry: {
        Args: {
          p_available_delta_kobo: number
          p_description?: string
          p_locked_delta_kobo: number
          p_metadata?: Json
          p_paystack_reference?: string
          p_platform_delta_kobo?: number
          p_reference: string
          p_request_id: string
          p_status?: Database["public"]["Enums"]["wallet_transaction_status"]
          p_type: Database["public"]["Enums"]["wallet_transaction_type"]
          p_user_id: string
        }
        Returns: string
      }
      wallet_credit_kobo: {
        Args: {
          p_amount_kobo: number
          p_description?: string
          p_metadata?: Json
          p_paystack_reference?: string
          p_reference: string
          p_request_id?: string
          p_type: Database["public"]["Enums"]["wallet_transaction_type"]
          p_user_id: string
        }
        Returns: string
      }
      wallet_debit_available_kobo: {
        Args: {
          p_amount_kobo: number
          p_description?: string
          p_metadata?: Json
          p_reference: string
          p_request_id?: string
          p_type: Database["public"]["Enums"]["wallet_transaction_type"]
          p_user_id: string
        }
        Returns: string
      }
      wallet_lock_funds_kobo: {
        Args: {
          p_currency?: string
          p_provider_amount_kobo: number
          p_reference: string
          p_request_id: string
          p_service_fee_kobo: number
          p_total_kobo: number
          p_user_id: string
        }
        Returns: string
      }
      wallet_record_deposit: {
        Args: {
          p_amount_kobo: number
          p_idempotency_key: string
          p_paystack_reference?: string
          p_user_id: string
        }
        Returns: undefined
      }
      wallet_refund_lock_kobo: {
        Args: { p_reference: string; p_request_id: string }
        Returns: undefined
      }
      wallet_refund_remaining_escrow_kobo: {
        Args: { p_reference: string; p_request_id: string }
        Returns: undefined
      }
      wallet_release_lock_kobo: {
        Args: {
          p_recipient_user_id: string
          p_reference: string
          p_request_id: string
        }
        Returns: undefined
      }
      wallet_release_milestone_kobo: {
        Args: {
          p_fee_kobo: number
          p_milestone_id: string
          p_provider_kobo: number
          p_recipient_user_id: string
          p_reference: string
          p_request_id: string
          p_total_kobo: number
        }
        Returns: undefined
      }
      wallet_shift_lock_bucket: {
        Args: {
          p_reference: string
          p_request_id: string
          p_to_bucket: Database["public"]["Enums"]["payment_lock_bucket"]
        }
        Returns: string
      }
      wallet_top_up: {
        Args: { p_amount: number; p_idempotency_key: string }
        Returns: undefined
      }
      wallet_withdraw: {
        Args: { p_amount: number; p_idempotency_key: string }
        Returns: undefined
      }
      wallet_withdrawal_release_reservation: {
        Args: {
          p_description: string
          p_release_reference: string
          p_withdrawal_id: string
        }
        Returns: string
      }
      withdraw_response: { Args: { p_response_id: string }; Returns: undefined }
      withdrawal_identity_development_bypass_active: {
        Args: never
        Returns: boolean
      }
      withdrawal_lagos_calendar_day: {
        Args: { p_at?: string }
        Returns: string
      }
    }
    Enums: {
      admin_audit_entity_type:
        | "user"
        | "request"
        | "admin_member"
        | "service_problem"
        | "wallet_withdrawal"
        | "withdrawal_policy"
        | "project"
      admin_role: "super_admin" | "support_admin" | "finance_admin"
      conversation_attachment_type: "image" | "video" | "file"
      conversation_message_type: "text" | "system" | "attachment"
      delivery_deadline_extension_status: "pending" | "agreed" | "superseded"
      deposit_transaction_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
      engagement_cancellation_event_kind:
        | "provider_immediate"
        | "requester_requested"
        | "provider_agreed"
        | "provider_declined"
        | "auto_expired"
      engagement_cancellation_request_status:
        | "pending"
        | "agreed"
        | "declined"
        | "expired"
        | "superseded"
      milestone_proposal_status:
        | "draft"
        | "proposed"
        | "requester_agreed"
        | "locked"
        | "superseded"
      milestone_status:
        | "pending"
        | "in_progress"
        | "submitted"
        | "revision_requested"
        | "approved_paid"
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
        | "matching_request"
        | "request_awaiting_review"
        | "engagement_cancellation_requested"
        | "engagement_cancellation_declined"
        | "withdrawal_submitted"
      payment_lock_bucket: "locked" | "pending"
      payment_lock_status: "active" | "released" | "refunded"
      payment_status:
        | "not_required"
        | "available"
        | "locked"
        | "pending"
        | "released"
        | "refunded"
        | "disputed"
      payment_structure: "single" | "milestone"
      profile_catalogue_kind: "photo" | "video"
      project_assignment_status:
        | "offered"
        | "terms_negotiation"
        | "accepted"
        | "commenced"
        | "completed"
        | "cancelled"
      project_assignment_terms_status: "proposed" | "agreed"
      project_funding_status:
        | "not_open"
        | "open"
        | "target_met"
        | "fully_funded"
        | "unsuccessful"
      project_funding_visibility: "invite_only" | "public"
      project_pool_reservation_status: "active" | "released"
      project_status: "draft" | "live" | "funding_unsuccessful" | "cancelled"
      project_visibility: "private"
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
        | "awaiting_review"
      response_status:
        | "pending"
        | "accepted"
        | "declined"
        | "withdrawn"
        | "expired"
      search_discover_category: "top" | "requests" | "people" | "projects"
      service_problem_investigation_status:
        | "triage"
        | "under_review"
        | "awaiting_info"
        | "escalated"
      service_problem_kind:
        | "completion_issue"
        | "provider_no_show"
        | "client_no_show"
        | "provider_unreachable"
        | "service_not_completed"
        | "service_differs_from_request"
        | "other"
      user_restriction_scope: "new_marketplace_listings"
      wallet_transaction_status: "pending" | "completed" | "failed" | "reversed"
      wallet_transaction_type:
        | "deposit"
        | "manual_top_up"
        | "withdrawal"
        | "escrow_lock"
        | "escrow_top_up"
        | "escrow_partial_refund"
        | "escrow_pending"
        | "escrow_relock"
        | "escrow_release"
        | "payout"
        | "refund"
        | "service_fee"
        | "adjustment"
        | "project_contribution"
        | "project_assignment_payout"
      wallet_withdrawal_status:
        | "pending"
        | "processing"
        | "completed"
        | "rejected"
        | "failed"
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
      admin_audit_entity_type: [
        "user",
        "request",
        "admin_member",
        "service_problem",
        "wallet_withdrawal",
        "withdrawal_policy",
        "project",
      ],
      admin_role: ["super_admin", "support_admin", "finance_admin"],
      conversation_attachment_type: ["image", "video", "file"],
      conversation_message_type: ["text", "system", "attachment"],
      delivery_deadline_extension_status: ["pending", "agreed", "superseded"],
      deposit_transaction_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
      engagement_cancellation_event_kind: [
        "provider_immediate",
        "requester_requested",
        "provider_agreed",
        "provider_declined",
        "auto_expired",
      ],
      engagement_cancellation_request_status: [
        "pending",
        "agreed",
        "declined",
        "expired",
        "superseded",
      ],
      milestone_proposal_status: [
        "draft",
        "proposed",
        "requester_agreed",
        "locked",
        "superseded",
      ],
      milestone_status: [
        "pending",
        "in_progress",
        "submitted",
        "revision_requested",
        "approved_paid",
      ],
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
        "matching_request",
        "request_awaiting_review",
        "engagement_cancellation_requested",
        "engagement_cancellation_declined",
        "withdrawal_submitted",
      ],
      payment_lock_bucket: ["locked", "pending"],
      payment_lock_status: ["active", "released", "refunded"],
      payment_status: [
        "not_required",
        "available",
        "locked",
        "pending",
        "released",
        "refunded",
        "disputed",
      ],
      payment_structure: ["single", "milestone"],
      profile_catalogue_kind: ["photo", "video"],
      project_assignment_status: [
        "offered",
        "terms_negotiation",
        "accepted",
        "commenced",
        "completed",
        "cancelled",
      ],
      project_assignment_terms_status: ["proposed", "agreed"],
      project_funding_status: [
        "not_open",
        "open",
        "target_met",
        "fully_funded",
        "unsuccessful",
      ],
      project_funding_visibility: ["invite_only", "public"],
      project_pool_reservation_status: ["active", "released"],
      project_status: ["draft", "live", "funding_unsuccessful", "cancelled"],
      project_visibility: ["private"],
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
        "awaiting_review",
      ],
      response_status: [
        "pending",
        "accepted",
        "declined",
        "withdrawn",
        "expired",
      ],
      search_discover_category: ["top", "requests", "people", "projects"],
      service_problem_investigation_status: [
        "triage",
        "under_review",
        "awaiting_info",
        "escalated",
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
      user_restriction_scope: ["new_marketplace_listings"],
      wallet_transaction_status: ["pending", "completed", "failed", "reversed"],
      wallet_transaction_type: [
        "deposit",
        "manual_top_up",
        "withdrawal",
        "escrow_lock",
        "escrow_top_up",
        "escrow_partial_refund",
        "escrow_pending",
        "escrow_relock",
        "escrow_release",
        "payout",
        "refund",
        "service_fee",
        "adjustment",
        "project_contribution",
        "project_assignment_payout",
      ],
      wallet_withdrawal_status: [
        "pending",
        "processing",
        "completed",
        "rejected",
        "failed",
      ],
    },
  },
} as const

