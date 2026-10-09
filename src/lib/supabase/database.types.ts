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
          push_calls_enabled: boolean
          push_notifications_enabled: boolean
          push_payments_wallet_enabled: boolean
          push_tips_reminders_enabled: boolean
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
          discovery_location?: unknown
          discovery_location_updated_at?: string | null
          display_name?: string | null
          id: string
          jobs_completed?: number
          message_push_enabled?: boolean
          phone?: string | null
          push_calls_enabled?: boolean
          push_notifications_enabled?: boolean
          push_payments_wallet_enabled?: boolean
          push_tips_reminders_enabled?: boolean
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
          discovery_location?: unknown
          discovery_location_updated_at?: string | null
          display_name?: string | null
          id?: string
          jobs_completed?: number
          message_push_enabled?: boolean
          phone?: string | null
          push_calls_enabled?: boolean
          push_notifications_enabled?: boolean
          push_payments_wallet_enabled?: boolean
          push_tips_reminders_enabled?: boolean
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
      request_conversations: {
        Row: {
          created_at: string
          id: string
          request_id: string
          requester_id: string
          selected_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          request_id: string
          requester_id: string
          selected_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          request_id?: string
          requester_id?: string
          selected_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_conversations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "my_requests"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "request_conversations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
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
            foreignKeyName: "request_conversations_selected_user_id_fkey"
            columns: ["selected_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          agreed_provider_amount: number | null
          attachment_path: string | null
          cancelled_at: string | null
          completed_at: string | null
          completion_confirm_by: string | null
          completion_reminder_sent_at: string | null
          created_at: string
          currency: string
          description: string | null
          expires_at: string | null
          expiry_reminder_sent_at: string | null
          first_response_at: string | null
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
          attachment_path?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          completion_confirm_by?: string | null
          completion_reminder_sent_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          expires_at?: string | null
          expiry_reminder_sent_at?: string | null
          first_response_at?: string | null
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
          attachment_path?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          completion_confirm_by?: string | null
          completion_reminder_sent_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          expires_at?: string | null
          expiry_reminder_sent_at?: string | null
          first_response_at?: string | null
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
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          metadata: Json
          paystack_reference: string | null
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
          reference?: string
          request_id?: string | null
          status?: Database["public"]["Enums"]["wallet_transaction_status"]
          type?: Database["public"]["Enums"]["wallet_transaction_type"]
          user_id?: string
          wallet_id?: string
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
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
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
      assert_responder_available_for_selection: {
        Args: { p_provider_id: string; p_target_request_id: string }
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
      cancel_request: { Args: { p_request_id: string }; Returns: undefined }
      cancel_service: { Args: { p_request_id: string }; Returns: undefined }
      catalogue_media_is_published: {
        Args: { p_name: string }
        Returns: boolean
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
      confirm_avatar_capture: {
        Args: { p_storage_path: string }
        Returns: undefined
      }
      contest_service_problem: {
        Args: { p_request_id: string }
        Returns: undefined
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
          p_attachment_path?: string
          p_description: string
          p_latitude: number
          p_location_label: string
          p_longitude: number
          p_offered_amount?: number
          p_scheduled_for?: string
          p_source_request_id?: string
          p_tag_ids?: string[]
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
      ensure_request_conversation: {
        Args: {
          p_request_id: string
          p_requester_id: string
          p_selected_user_id: string
        }
        Returns: string
      }
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
      format_ui_money: {
        Args: { p_amount: number; p_currency: string }
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
          tag_slugs: string[]
          title: string
          viewer_has_rated: boolean
          viewer_is_requester: boolean
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
      kobo_to_ngn_major: { Args: { p_kobo: number }; Returns: number }
      list_my_request_conversations: {
        Args: never
        Returns: {
          conversation_id: string
          counterparty_avatar_captured_in_app: boolean
          counterparty_avatar_path: string
          counterparty_display_name: string
          counterparty_id: string
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
      list_notification_tag_interests: {
        Args: never
        Returns: {
          name: string
          slug: string
          tag_id: string
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
      matching_request_notification_body: {
        Args: { p_recipient_id: string; p_request_id: string }
        Returns: string
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
      request_expires_at: { Args: { p_scheduled_for: string }; Returns: string }
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
      sanitize_chat_attachment_filename: {
        Args: { p_file_name: string }
        Returns: string
      }
      search_request_queries: {
        Args: { p_limit?: number; p_prefix?: string }
        Returns: {
          normalized_query: string
        }[]
      }
      search_requests: {
        Args: { p_latitude: number; p_longitude: number; p_query: string }
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
      user_push_delivery_allowed: {
        Args: {
          p_type: Database["public"]["Enums"]["notification_type"]
          p_user_id: string
        }
        Returns: boolean
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
      wallet_release_lock_kobo: {
        Args: {
          p_recipient_user_id: string
          p_reference: string
          p_request_id: string
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
      withdraw_response: { Args: { p_response_id: string }; Returns: undefined }
    }
    Enums: {
      conversation_attachment_type: "image" | "video" | "file"
      conversation_message_type: "text" | "system" | "attachment"
      deposit_transaction_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
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
      conversation_attachment_type: ["image", "video", "file"],
      conversation_message_type: ["text", "system", "attachment"],
      deposit_transaction_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
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
      ],
    },
  },
} as const

