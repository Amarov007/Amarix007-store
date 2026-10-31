/**
 * Read-only type snapshot generated from Amarix Store production Supabase.
 * Generated: 2026-10-31 UTC
 * Project ref: pvuobngrybygohendwaz
 *
 * This is NOT a SQL migration or schema baseline. Do not use it to push changes.
 * Regenerate after approved schema changes and review diffs before adoption.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          email: string
          user_id: string | null
        }
        Insert: {
          email: string
          user_id?: string | null
        }
        Update: {
          email?: string
          user_id?: string | null
        }
        Relationships: []
      }
      affiliate_commissions: {
        Row: {
          affiliate_user_id: string
          amount: number
          created_at: string
          order_id: string
          payment_id: string | null
          reversed_amount: number
          status: string
          updated_at: string
        }
        Insert: {
          affiliate_user_id: string
          amount: number
          created_at?: string
          order_id: string
          payment_id?: string | null
          reversed_amount?: number
          status?: string
          updated_at?: string
        }
        Update: {
          affiliate_user_id?: string
          amount?: number
          created_at?: string
          order_id?: string
          payment_id?: string | null
          reversed_amount?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_affiliate_user_id_fkey"
            columns: ["affiliate_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payouts: {
        Row: {
          amount: number
          id: string
          month: string
          paid_at: string
          paid_by: string | null
          txid: string | null
          user_id: string
        }
        Insert: {
          amount: number
          id?: string
          month: string
          paid_at?: string
          paid_by?: string | null
          txid?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          id?: string
          month?: string
          paid_at?: string
          paid_by?: string | null
          txid?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_tiers: {
        Row: {
          id: string
          label: string
          min_sales: number
          rate: number
        }
        Insert: {
          id?: string
          label?: string
          min_sales: number
          rate: number
        }
        Update: {
          id?: string
          label?: string
          min_sales?: number
          rate?: number
        }
        Relationships: []
      }
      affiliates: {
        Row: {
          applied_at: string | null
          approved_at: string | null
          audience: string | null
          channel_type: string | null
          channel_url: string | null
          clicks: number | null
          coupon: string | null
          id: string
          payout_id: string | null
          pitch: string | null
          rate: number | null
          sales: number | null
          signups: number | null
          status: string
          total_commission: number | null
          user_id: string | null
        }
        Insert: {
          applied_at?: string | null
          approved_at?: string | null
          audience?: string | null
          channel_type?: string | null
          channel_url?: string | null
          clicks?: number | null
          coupon?: string | null
          id?: string
          payout_id?: string | null
          pitch?: string | null
          rate?: number | null
          sales?: number | null
          signups?: number | null
          status?: string
          total_commission?: number | null
          user_id?: string | null
        }
        Update: {
          applied_at?: string | null
          approved_at?: string | null
          audience?: string | null
          channel_type?: string | null
          channel_url?: string | null
          clicks?: number | null
          coupon?: string | null
          id?: string
          payout_id?: string | null
          pitch?: string | null
          rate?: number | null
          sales?: number | null
          signups?: number | null
          status?: string
          total_commission?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      api_settings: {
        Row: {
          ai_api_key: string | null
          ai_system_prompt: string | null
          id: number
          payment_gateway: string | null
          payment_public_key: string | null
          payment_secret_key: string | null
          smm_api_key: string | null
          smm_api_path: string | null
          smm_api_secret_name: string | null
          smm_api_url: string | null
        }
        Insert: {
          ai_api_key?: string | null
          ai_system_prompt?: string | null
          id?: number
          payment_gateway?: string | null
          payment_public_key?: string | null
          payment_secret_key?: string | null
          smm_api_key?: string | null
          smm_api_path?: string | null
          smm_api_secret_name?: string | null
          smm_api_url?: string | null
        }
        Update: {
          ai_api_key?: string | null
          ai_system_prompt?: string | null
          id?: number
          payment_gateway?: string | null
          payment_public_key?: string | null
          payment_secret_key?: string | null
          smm_api_key?: string | null
          smm_api_path?: string | null
          smm_api_secret_name?: string | null
          smm_api_url?: string | null
        }
        Relationships: []
      }
      cart_snapshots: {
        Row: {
          items: Json
          lang: string | null
          reminded_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          items?: Json
          lang?: string | null
          reminded_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          items?: Json
          lang?: string | null
          reminded_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fulfillment_jobs: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          id: number
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          order_id: string
          payment_id: string
          result: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          id?: never
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          order_id: string
          payment_id: string
          result?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          id?: never
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          order_id?: string
          payment_id?: string
          result?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_jobs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          id: number
          pair: string
          rate: number
          set_by: string | null
          source: string
          valid_from: string
        }
        Insert: {
          id?: never
          pair?: string
          rate: number
          set_by?: string | null
          source?: string
          valid_from?: string
        }
        Update: {
          id?: never
          pair?: string
          rate?: number
          set_by?: string | null
          source?: string
          valid_from?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          coupon: string | null
          currency: string | null
          customer_email: string | null
          customer_name: string | null
          discount: number
          id: number
          invoice_no: string
          issued_at: string
          items: Json
          notes: string | null
          order_id: string
          paid_at: string | null
          payment_method: string | null
          status: string
          subtotal: number
          total: number
          user_id: string | null
        }
        Insert: {
          coupon?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          discount?: number
          id?: never
          invoice_no: string
          issued_at?: string
          items?: Json
          notes?: string | null
          order_id: string
          paid_at?: string | null
          payment_method?: string | null
          status?: string
          subtotal?: number
          total?: number
          user_id?: string | null
        }
        Update: {
          coupon?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          discount?: number
          id?: never
          invoice_no?: string
          issued_at?: string
          items?: Json
          notes?: string | null
          order_id?: string
          paid_at?: string | null
          payment_method?: string | null
          status?: string
          subtotal?: number
          total?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      keepalive: {
        Row: {
          id: number
          last_ping: string
          pings: number
        }
        Insert: {
          id?: number
          last_ping?: string
          pings?: number
        }
        Update: {
          id?: number
          last_ping?: string
          pings?: number
        }
        Relationships: []
      }
      notify_settings: {
        Row: {
          enabled: boolean
          id: number
          telegram_bot_token: string | null
          telegram_chat_id: string | null
          telegram_webhook_secret: string | null
        }
        Insert: {
          enabled?: boolean
          id?: number
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          telegram_webhook_secret?: string | null
        }
        Update: {
          enabled?: boolean
          id?: number
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          telegram_webhook_secret?: string | null
        }
        Relationships: []
      }
      order_payment_audit: {
        Row: {
          actor: string | null
          created_at: string
          from_status: string | null
          id: number
          note: string | null
          order_id: string
          to_status: string | null
          tx_ref: string | null
          via: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          order_id: string
          to_status?: string | null
          tx_ref?: string | null
          via?: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          order_id?: string
          to_status?: string | null
          tx_ref?: string | null
          via?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          affiliate_commission: number | null
          affiliate_ref: string | null
          coupon: string | null
          created_at: string
          currency: string | null
          customer_email: string | null
          customer_name: string | null
          id: string
          items: Json
          lang: string | null
          pay_currency: string | null
          payment_method: string | null
          payment_proof: string | null
          payment_reviewed_at: string | null
          payment_reviewed_by: string | null
          payment_status: string | null
          payment_tx_ref: string | null
          smm: Json | null
          smm_status: string | null
          status: string
          total: number | null
          user_id: string | null
        }
        Insert: {
          affiliate_commission?: number | null
          affiliate_ref?: string | null
          coupon?: string | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          id: string
          items?: Json
          lang?: string | null
          pay_currency?: string | null
          payment_method?: string | null
          payment_proof?: string | null
          payment_reviewed_at?: string | null
          payment_reviewed_by?: string | null
          payment_status?: string | null
          payment_tx_ref?: string | null
          smm?: Json | null
          smm_status?: string | null
          status?: string
          total?: number | null
          user_id?: string | null
        }
        Update: {
          affiliate_commission?: number | null
          affiliate_ref?: string | null
          coupon?: string | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          items?: Json
          lang?: string | null
          pay_currency?: string | null
          payment_method?: string | null
          payment_proof?: string | null
          payment_reviewed_at?: string | null
          payment_reviewed_by?: string | null
          payment_status?: string | null
          payment_tx_ref?: string | null
          smm?: Json | null
          smm_status?: string | null
          status?: string
          total?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          actor: string | null
          created_at: string
          from_status: string | null
          id: number
          note: string | null
          payment_id: string
          to_status: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          payment_id: string
          to_status: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          payment_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          config: Json
          confirm_mode: string
          currency: string
          enabled: boolean
          expiry_minutes: number
          fee_fixed: number
          fee_pct: number
          id: string
          kind: string
          max_amount: number | null
          max_base: number | null
          min_amount: number | null
          min_base: number | null
          requires_proof: boolean
          requires_tx_ref: boolean
          sort: number
          updated_at: string
        }
        Insert: {
          config?: Json
          confirm_mode?: string
          currency?: string
          enabled?: boolean
          expiry_minutes?: number
          fee_fixed?: number
          fee_pct?: number
          id: string
          kind?: string
          max_amount?: number | null
          max_base?: number | null
          min_amount?: number | null
          min_base?: number | null
          requires_proof?: boolean
          requires_tx_ref?: boolean
          sort?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          confirm_mode?: string
          currency?: string
          enabled?: boolean
          expiry_minutes?: number
          fee_fixed?: number
          fee_pct?: number
          id?: string
          kind?: string
          max_amount?: number | null
          max_base?: number | null
          min_amount?: number | null
          min_base?: number | null
          requires_proof?: boolean
          requires_tx_ref?: boolean
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_review_events: {
        Row: {
          actor_id: string
          created_at: string
          id: number
          new_payment_status: string
          note: string | null
          old_payment_status: string | null
          order_id: string
          tx_ref: string | null
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: never
          new_payment_status: string
          note?: string | null
          old_payment_status?: string | null
          order_id: string
          tx_ref?: string | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: never
          new_payment_status?: string
          note?: string | null
          old_payment_status?: string | null
          order_id?: string
          tx_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_review_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_base: number
          captured_at: string | null
          confirmation_token_expires_at: string | null
          confirmation_token_hash: string | null
          created_at: string
          expires_at: string | null
          fee_amount: number
          first_reviewed_at: string | null
          first_reviewed_by: string | null
          fx_rate: number
          id: string
          idempotency_key: string
          meta: Json
          method_id: string
          order_id: string | null
          pay_amount: number
          pay_currency: string
          proof_hash: string | null
          proof_path: string | null
          provider_ref: string | null
          purpose: string
          received_amount: number | null
          received_currency: string | null
          refunded_total: number
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tx_ref: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_base: number
          captured_at?: string | null
          confirmation_token_expires_at?: string | null
          confirmation_token_hash?: string | null
          created_at?: string
          expires_at?: string | null
          fee_amount?: number
          first_reviewed_at?: string | null
          first_reviewed_by?: string | null
          fx_rate?: number
          id?: string
          idempotency_key: string
          meta?: Json
          method_id: string
          order_id?: string | null
          pay_amount: number
          pay_currency: string
          proof_hash?: string | null
          proof_path?: string | null
          provider_ref?: string | null
          purpose: string
          received_amount?: number | null
          received_currency?: string | null
          refunded_total?: number
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tx_ref?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_base?: number
          captured_at?: string | null
          confirmation_token_expires_at?: string | null
          confirmation_token_hash?: string | null
          created_at?: string
          expires_at?: string | null
          fee_amount?: number
          first_reviewed_at?: string | null
          first_reviewed_by?: string | null
          fx_rate?: number
          id?: string
          idempotency_key?: string
          meta?: Json
          method_id?: string
          order_id?: string | null
          pay_amount?: number
          pay_currency?: string
          proof_hash?: string | null
          proof_path?: string | null
          provider_ref?: string | null
          purpose?: string
          received_amount?: number | null
          received_currency?: string | null
          refunded_total?: number
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tx_ref?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          account: string
          amount: number
          created_at: string
          handled_at: string | null
          id: number
          method: string
          note: string | null
          status: string
          user_id: string
        }
        Insert: {
          account: string
          amount: number
          created_at?: string
          handled_at?: string | null
          id?: never
          method: string
          note?: string | null
          status?: string
          user_id: string
        }
        Update: {
          account?: string
          amount?: number
          created_at?: string
          handled_at?: string | null
          id?: never
          method?: string
          note?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_views: {
        Row: {
          day: string
          product_id: string
          views: number
        }
        Insert: {
          day?: string
          product_id: string
          views?: number
        }
        Update: {
          day?: string
          product_id?: string
          views?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          ref_code: string | null
          referred_by: string | null
          uid: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          ref_code?: string | null
          referred_by?: string | null
          uid: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          ref_code?: string | null
          referred_by?: string | null
          uid?: string
        }
        Relationships: []
      }
      provider_alert_state: {
        Row: {
          last_alert_at: string | null
          last_balance: number | null
          last_price_alert_at: string | null
          last_price_signature: string | null
          provider_id: string
          threshold: number
          updated_at: string
        }
        Insert: {
          last_alert_at?: string | null
          last_balance?: number | null
          last_price_alert_at?: string | null
          last_price_signature?: string | null
          provider_id: string
          threshold?: number
          updated_at?: string
        }
        Update: {
          last_alert_at?: string | null
          last_balance?: number | null
          last_price_alert_at?: string | null
          last_price_signature?: string | null
          provider_id?: string
          threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      push_broadcasts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          failed: number | null
          id: number
          recipients: number | null
          sent: number | null
          test: boolean
          title: string
          url: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          failed?: number | null
          id?: never
          recipients?: number | null
          sent?: number | null
          test?: boolean
          title: string
          url?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          failed?: number | null
          id?: never
          recipients?: number | null
          sent?: number | null
          test?: boolean
          title?: string
          url?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: number
          lang: string | null
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: never
          lang?: string | null
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: never
          lang?: string | null
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: number
          k: string
          n: number
          ts: string
        }
        Insert: {
          bucket: number
          k: string
          n?: number
          ts?: string
        }
        Update: {
          bucket?: number
          k?: string
          n?: number
          ts?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          approved_by: string | null
          created_at: string
          decided_at: string | null
          first_approved_at: string | null
          first_approved_by: string | null
          id: number
          idempotency_key: string | null
          payment_id: string
          reason: string | null
          requested_by: string | null
          status: string
          target: string
        }
        Insert: {
          amount: number
          approved_by?: string | null
          created_at?: string
          decided_at?: string | null
          first_approved_at?: string | null
          first_approved_by?: string | null
          id?: never
          idempotency_key?: string | null
          payment_id: string
          reason?: string | null
          requested_by?: string | null
          status?: string
          target?: string
        }
        Update: {
          amount?: number
          approved_by?: string | null
          created_at?: string
          decided_at?: string | null
          first_approved_at?: string | null
          first_approved_by?: string | null
          id?: never
          idempotency_key?: string | null
          payment_id?: string
          reason?: string | null
          requested_by?: string | null
          status?: string
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          approved: boolean
          author: string | null
          comment: string | null
          created_at: string
          id: number
          order_id: string
          product_id: string
          rating: number
          user_id: string
        }
        Insert: {
          approved?: boolean
          author?: string | null
          comment?: string | null
          created_at?: string
          id?: never
          order_id: string
          product_id: string
          rating: number
          user_id: string
        }
        Update: {
          approved?: boolean
          author?: string | null
          comment?: string | null
          created_at?: string
          id?: never
          order_id?: string
          product_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: []
      }
      smm_providers: {
        Row: {
          api_key: string
          api_key_secret_name: string | null
          api_url: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          kind: string
          name: string
        }
        Insert: {
          api_key?: string
          api_key_secret_name?: string | null
          api_url?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id: string
          kind?: string
          name?: string
        }
        Update: {
          api_key?: string
          api_key_secret_name?: string | null
          api_url?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          name?: string
        }
        Relationships: []
      }
      smm_service_map: {
        Row: {
          created_at: string
          item_id: string
          note: string | null
          qty_per_unit: number
          service_id: number
        }
        Insert: {
          created_at?: string
          item_id: string
          note?: string | null
          qty_per_unit?: number
          service_id: number
        }
        Update: {
          created_at?: string
          item_id?: string
          note?: string | null
          qty_per_unit?: number
          service_id?: number
        }
        Relationships: []
      }
      staff_activity: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_kind: string
          at: string
          details: Json
          id: number
          target: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_kind?: string
          at?: string
          details?: Json
          id?: never
          target?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_kind?: string
          at?: string
          details?: Json
          id?: never
          target?: string | null
        }
        Relationships: []
      }
      staff_members: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string | null
          perms: string[]
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          perms?: string[]
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          perms?: string[]
          user_id?: string
        }
        Relationships: []
      }
      store_config: {
        Row: {
          data: Json
          id: number
          updated_at: string
        }
        Insert: {
          data?: Json
          id?: number
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      store_config_backups: {
        Row: {
          created_at: string
          data: Json
          id: number
        }
        Insert: {
          created_at?: string
          data: Json
          id?: never
        }
        Update: {
          created_at?: string
          data?: Json
          id?: never
        }
        Relationships: []
      }
      store_config_publish_batches: {
        Row: {
          base_ts: number
          batch_id: string
          created_at: string
          delete_ids: string[]
          patch: Json
          product_order: string[] | null
          user_id: string
        }
        Insert: {
          base_ts: number
          batch_id: string
          created_at?: string
          delete_ids?: string[]
          patch?: Json
          product_order?: string[] | null
          user_id: string
        }
        Update: {
          base_ts?: number
          batch_id?: string
          created_at?: string
          delete_ids?: string[]
          patch?: Json
          product_order?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      store_config_publish_items: {
        Row: {
          batch_id: string
          product: Json
          product_id: string
          seq: number
        }
        Insert: {
          batch_id: string
          product: Json
          product_id: string
          seq: number
        }
        Update: {
          batch_id?: string
          product?: Json
          product_id?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_config_publish_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "store_config_publish_batches"
            referencedColumns: ["batch_id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_reply: string | null
          attachment: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          id: number
          lang: string | null
          message: string
          order_id: string | null
          replied_at: string | null
          status: string
          subject: string
          user_id: string | null
        }
        Insert: {
          admin_reply?: string | null
          attachment?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: never
          lang?: string | null
          message: string
          order_id?: string | null
          replied_at?: string | null
          status?: string
          subject: string
          user_id?: string | null
        }
        Update: {
          admin_reply?: string | null
          attachment?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: never
          lang?: string | null
          message?: string
          order_id?: string | null
          replied_at?: string | null
          status?: string
          subject?: string
          user_id?: string | null
        }
        Relationships: []
      }
      telegram_links: {
        Row: {
          created_at: string
          kind: string
          tg_id: number
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          kind?: string
          tg_id: number
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          kind?: string
          tg_id?: number
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      telegram_logins: {
        Row: {
          auth_date: number
          created_at: string
          tg_id: number
        }
        Insert: {
          auth_date: number
          created_at?: string
          tg_id: number
        }
        Update: {
          auth_date?: number
          created_at?: string
          tg_id?: number
        }
        Relationships: []
      }
      tg_auth_seen: {
        Row: {
          hash: string
          seen_at: string
        }
        Insert: {
          hash: string
          seen_at?: string
        }
        Update: {
          hash?: string
          seen_at?: string
        }
        Relationships: []
      }
      wallet_topups: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          first_approved_at: string | null
          first_approved_by: string | null
          id: number
          pay_currency: string | null
          payment_method: string | null
          payment_proof: string | null
          proof_hash: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          section: string
          status: string
          tx_ref: string | null
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          created_at?: string
          first_approved_at?: string | null
          first_approved_by?: string | null
          id?: never
          pay_currency?: string | null
          payment_method?: string | null
          payment_proof?: string | null
          proof_hash?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          section?: string
          status?: string
          tx_ref?: string | null
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          first_approved_at?: string | null
          first_approved_by?: string | null
          id?: never
          pay_currency?: string | null
          payment_method?: string | null
          payment_proof?: string | null
          proof_hash?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          section?: string
          status?: string
          tx_ref?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_topups_user_id_fkey"
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
          balance_after: number
          created_at: string
          id: number
          kind: string
          note: string | null
          ref: string | null
          section: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: never
          kind: string
          note?: string | null
          ref?: string | null
          section: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: never
          kind?: string
          note?: string | null
          ref?: string | null
          section?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          section: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          section?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          section?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_affiliate_monthly: {
        Args: { p_months?: number }
        Returns: {
          commission: number
          email: string
          month: string
          paid: number
          sales: number
          user_id: string
          volume: number
        }[]
      }
      admin_find_user: { Args: { p_uid: string }; Returns: Json }
      admin_home_stats: {
        Args: { p_day_start: string; p_week_start: string }
        Returns: Json
      }
      admin_invoices: {
        Args: { p_limit?: number; p_q?: string }
        Returns: Json
      }
      admin_payout_resolve: {
        Args: { p_id: number; p_note?: string; p_status: string }
        Returns: boolean
      }
      admin_product_stats: { Args: { p_days?: number }; Returns: Json }
      admin_push_stats: { Args: never; Returns: Json }
      admin_send_broadcast: {
        Args: {
          p_body: string
          p_test?: boolean
          p_title: string
          p_url?: string
        }
        Returns: number
      }
      admin_stats: { Args: { p_days?: number }; Returns: Json }
      affiliate_balance: { Args: never; Returns: Json }
      affiliate_to_wallet: { Args: { p_amount: number }; Returns: Json }
      apply_affiliate: {
        Args: {
          p_audience: string
          p_channel_type: string
          p_channel_url: string
          p_payout: string
          p_pitch: string
        }
        Returns: string
      }
      approve_manual_payment: {
        Args: {
          p_confirmation: string
          p_note?: string
          p_order_id: string
          p_tx_ref?: string
        }
        Returns: Json
      }
      cancel_store_config_publish: {
        Args: { p_batch_id: string }
        Returns: boolean
      }
      cancel_unpaid_order: { Args: { p_order_id: string }; Returns: boolean }
      check_coupon: { Args: { p_code: string }; Returns: Json }
      claim_payment: { Args: { p_order_id: string }; Returns: undefined }
      client_ip: { Args: never; Returns: string }
      commit_store_config_publish: {
        Args: { p_batch_id: string }
        Returns: number
      }
      coupon_usable: { Args: { cp: Json; p_code: string }; Returns: boolean }
      fulfillment_claim_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          available_at: string
          created_at: string
          id: number
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          order_id: string
          payment_id: string
          result: Json
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "fulfillment_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fx_current: { Args: never; Returns: number }
      fx_rate_set: { Args: { p_pair: string; p_rate: number }; Returns: number }
      gen_ref_code: { Args: never; Returns: string }
      gen_user_uid: { Args: never; Returns: string }
      get_invoice: { Args: { p_order_id: string }; Returns: Json }
      has_perm: { Args: { p: string }; Returns: boolean }
      invoice_status_of: {
        Args: { p_pay: string; p_status: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      keepalive_ping: { Args: never; Returns: undefined }
      my_affiliate_balance: {
        Args: never
        Returns: {
          due: number
          earned: number
          paid: number
        }[]
      }
      my_affiliate_monthly: {
        Args: never
        Returns: {
          commission: number
          month: string
          paid: number
          sales: number
          volume: number
        }[]
      }
      my_affiliate_payouts: {
        Args: never
        Returns: {
          amount: number
          month: string
          paid_at: string
          txid: string
        }[]
      }
      my_proof_count: { Args: never; Returns: number }
      my_reviews: { Args: never; Returns: Json }
      my_staff_perms: { Args: never; Returns: string[] }
      my_ticket_file_count: { Args: never; Returns: number }
      notify_provider_balance_if_low: {
        Args: { p_balance: number; p_currency?: string; p_provider: string }
        Returns: boolean
      }
      notify_provider_price_drift: {
        Args: { p_count: number; p_provider: string; p_summary?: string }
        Returns: boolean
      }
      notify_telegram: { Args: { p_text: string }; Returns: undefined }
      pay_order_with_wallet: { Args: { p_order_id: string }; Returns: Json }
      payment_approve_received: {
        Args: {
          p_confirmation: string
          p_id: string
          p_note?: string
          p_received_amount: number
          p_received_currency: string
        }
        Returns: string
      }
      payment_attach_proof_verified: {
        Args: { p_hash: string; p_id: string; p_owner: string; p_path: string }
        Returns: undefined
      }
      payment_cancel: { Args: { p_id: string }; Returns: undefined }
      payment_confirmation_issue: { Args: { p_id: string }; Returns: string }
      payment_create: {
        Args: { p_key: string; p_method: string; p_order_id: string }
        Returns: Json
      }
      payment_create_topup: {
        Args: { p_amount: number; p_key: string; p_method: string }
        Returns: Json
      }
      payment_create_wallet_pay: {
        Args: { p_key: string; p_order_id: string }
        Returns: Json
      }
      payment_instructions: { Args: { p_id: string }; Returns: Json }
      payment_methods_admin_delete: { Args: { p_id: string }; Returns: boolean }
      payment_methods_admin_save: { Args: { p_methods: Json }; Returns: number }
      payment_methods_public: { Args: never; Returns: Json }
      payment_reject: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      payment_review_queue: {
        Args: {
          p_limit?: number
          p_method?: string
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      payment_round: { Args: { p_cur: string; p_val: number }; Returns: number }
      payment_settings_save: { Args: { p_methods: Json }; Returns: number }
      payment_submit: {
        Args: { p_id: string; p_tx_ref?: string }
        Returns: undefined
      }
      payment_sync_order: { Args: { p_order: string }; Returns: undefined }
      payment_transition_allowed: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      payments_cfg_num: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
      payments_expire: { Args: never; Returns: number }
      payments_reconcile: {
        Args: never
        Returns: {
          actual: number
          expected: number
          kind: string
          ref: string
        }[]
      }
      payments_status: { Args: { p_id: string }; Returns: Json }
      payments_status_for_order: { Args: { p_order_id: string }; Returns: Json }
      payments_v2_flag_set: { Args: { p_on: boolean }; Returns: boolean }
      payments_v2_on: { Args: never; Returns: boolean }
      product_stats: { Args: never; Returns: Json }
      public_config: { Args: never; Returns: Json }
      publish_store_config: {
        Args: {
          p_base_ts: number
          p_patch?: Json
          p_product_delete_ids?: string[]
          p_product_order?: string[]
          p_product_upserts?: Json
        }
        Returns: number
      }
      push_register: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_lang?: string
          p_p256dh: string
        }
        Returns: undefined
      }
      rate_ticket: {
        Args: { p_id: number; p_resolved: boolean }
        Returns: undefined
      }
      refund_approve: { Args: { p_id: number }; Returns: number }
      refund_auto_order: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_order_id: string
          p_reason: string
        }
        Returns: number
      }
      refund_reject: {
        Args: { p_id: number; p_note?: string }
        Returns: undefined
      }
      refund_request: {
        Args: { p_amount?: number; p_payment_id: string; p_reason?: string }
        Returns: number
      }
      refund_request_customer: {
        Args: { p_payment_id: string; p_reason?: string }
        Returns: number
      }
      rl_hit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      save_cart: {
        Args: { p_items: Json; p_lang?: string }
        Returns: undefined
      }
      smm_main_status: { Args: never; Returns: Json }
      smm_providers_admin_list: {
        Args: never
        Returns: {
          api_key_secret_name: string
          api_url: string
          config: Json
          created_at: string
          enabled: boolean
          has_key: boolean
          id: string
          kind: string
          name: string
        }[]
      }
      staff_save_products: {
        Args: { p_base_ts?: number; p_products: Json }
        Returns: number
      }
      stage_store_config_publish: {
        Args: {
          p_base_ts: number
          p_batch_id: string
          p_chunk_no: number
          p_patch: Json
          p_product_delete_ids: string[]
          p_product_order: string[]
          p_product_upserts: Json
        }
        Returns: number
      }
      submit_review: {
        Args: {
          p_comment: string
          p_order: string
          p_product: string
          p_rating: number
        }
        Returns: boolean
      }
      telegram_admin_action: {
        Args: {
          p_action: string
          p_amount?: number
          p_chat_id: string
          p_currency?: string
          p_note?: string
          p_secret: string
          p_target_id: string
          p_value?: string
        }
        Returns: Json
      }
      track_ref_click: { Args: { p_code: string }; Returns: undefined }
      track_view: { Args: { p_product: string }; Returns: undefined }
      transition_payment: {
        Args: { p_id: string; p_note?: string; p_to: string }
        Returns: {
          amount_base: number
          captured_at: string | null
          confirmation_token_expires_at: string | null
          confirmation_token_hash: string | null
          created_at: string
          expires_at: string | null
          fee_amount: number
          first_reviewed_at: string | null
          first_reviewed_by: string | null
          fx_rate: number
          id: string
          idempotency_key: string
          meta: Json
          method_id: string
          order_id: string | null
          pay_amount: number
          pay_currency: string
          proof_hash: string | null
          proof_path: string | null
          provider_ref: string | null
          purpose: string
          received_amount: number | null
          received_currency: string | null
          refunded_total: number
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tx_ref: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      wallet_admin_adjust: {
        Args: {
          p_amount: number
          p_note?: string
          p_section: string
          p_user: string
        }
        Returns: number
      }
      wallet_apply: {
        Args: {
          p_amount: number
          p_kind: string
          p_note: string
          p_ref: string
          p_section: string
          p_user: string
        }
        Returns: number
      }
      wallet_eligible: { Args: { p_items: Json }; Returns: boolean }
      wallet_item_section: { Args: { cfg: Json; p: Json }; Returns: string }
      wallet_order_section: {
        Args: { cfg: Json; items: Json }
        Returns: string
      }
      wallet_reconcile: {
        Args: never
        Returns: {
          balance: number
          diff: number
          ledger_sum: number
          section: string
          user_id: string
        }[]
      }
      wallet_sections: { Args: { cfg: Json }; Returns: string[] }
      wallet_topup_approve: {
        Args: { p_amount?: number; p_id: number }
        Returns: number
      }
      wallet_topup_claim: {
        Args: { p_id: number; p_tx_ref?: string }
        Returns: undefined
      }
      wallet_topup_create: {
        Args: {
          p_amount: number
          p_currency?: string
          p_method: string
          p_section?: string
        }
        Returns: number
      }
      wallet_topup_reject: {
        Args: { p_id: number; p_note?: string }
        Returns: undefined
      }
      wallet_topup_set_proof: {
        Args: { p_hash?: string; p_id: number; p_path: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
