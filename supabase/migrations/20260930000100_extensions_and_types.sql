-- Active schema (split from squashed baseline for reviewability).
-- Fresh environments: supabase db reset. After drift: squash again if needed.

-- PostgreSQL extensions and public enum types.

CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."payment_status" AS ENUM (
    'not_required',
    'available',
    'locked',
    'pending',
    'released',
    'refunded',
    'disputed'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."profile_catalogue_kind" AS ENUM (
    'photo',
    'video'
);


ALTER TYPE "public"."profile_catalogue_kind" OWNER TO "postgres";


CREATE TYPE "public"."request_status" AS ENUM (
    'draft',
    'searching',
    'accepted',
    'in_progress',
    'completed',
    'cancelled',
    'expired',
    'completion_pending',
    'disputed',
    'no_show',
    'posted'
);


ALTER TYPE "public"."request_status" OWNER TO "postgres";


COMMENT ON TYPE "public"."request_status" IS 'Stored lifecycle: posted (open/responses), accepted (selected), in_progress, completion_pending, completed, cancelled, expired, disputed, no_show, draft. Legacy searching is migrated to posted.';



CREATE TYPE "public"."response_status" AS ENUM (
    'pending',
    'accepted',
    'declined',
    'withdrawn',
    'expired'
);


ALTER TYPE "public"."response_status" OWNER TO "postgres";


CREATE TYPE "public"."service_problem_kind" AS ENUM (
    'completion_issue',
    'provider_no_show',
    'client_no_show',
    'provider_unreachable',
    'service_not_completed',
    'service_differs_from_request',
    'other'
);


ALTER TYPE "public"."service_problem_kind" OWNER TO "postgres";
