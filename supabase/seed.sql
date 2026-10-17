-- Local development seed (runs on `supabase db reset` and `pnpm db:seed-admin`).
--
-- Operations dashboard sign-in:
--   Email:    admin@active.local
--   Password: active-admin

DO $$
DECLARE
  v_user_id uuid := 'f0000000-0000-4000-8000-000000000001';
  v_email text := 'admin@active.local';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user_id) THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt('active-admin', extensions.gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Local Super Admin"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.identities i
    WHERE i.user_id = v_user_id
      AND i.provider = 'email'
  ) THEN
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', true
      ),
      'email',
      v_email,
      now(),
      now(),
      now()
    );
  END IF;

  PERFORM public.admin_provision_member(v_user_id, 'super_admin'::public.admin_role);
END $$;
