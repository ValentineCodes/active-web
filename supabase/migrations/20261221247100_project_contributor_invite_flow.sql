-- Contributor invites: notify invitee, add to group chat, no duplicate invites.

CREATE OR REPLACE FUNCTION public.list_project_contributor_invitations(p_project_id uuid)
RETURNS TABLE(invitee_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.creator_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
  END IF;

  RETURN QUERY
  SELECT inv.invitee_id
  FROM public.project_contributor_invitations inv
  WHERE inv.project_id = p_project_id
  ORDER BY inv.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_project_contributor(
  p_project_id uuid,
  p_invitee_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_invite_id uuid;
  v_project_title text;
  v_creator_name text;
  v_creator_first text;
BEGIN
  IF p_invitee_id IS NULL OR p_invitee_id = v_user_id THEN
    RAISE EXCEPTION 'invalid invitee' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND p.creator_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles prof WHERE prof.id = p_invitee_id
  ) THEN
    RAISE EXCEPTION 'invalid invitee' USING errcode = '22023';
  END IF;

  INSERT INTO public.project_contributor_invitations (
    project_id,
    invitee_id,
    invited_by
  )
  VALUES (p_project_id, p_invitee_id, v_user_id)
  ON CONFLICT (project_id, invitee_id) DO NOTHING
  RETURNING id INTO v_invite_id;

  IF v_invite_id IS NULL THEN
    RAISE EXCEPTION 'contributor already invited' USING errcode = '55000';
  END IF;

  PERFORM public.add_project_group_conversation_member(
    p_project_id,
    p_invitee_id,
    'contributor'::public.project_group_member_role
  );

  SELECT left(btrim(p.title), 120)
  INTO v_project_title
  FROM public.projects p
  WHERE p.id = p_project_id;

  SELECT prof.display_name
  INTO v_creator_name
  FROM public.profiles prof
  WHERE prof.id = v_user_id;

  v_creator_first := coalesce(public.display_first_name(v_creator_name), 'Someone');

  PERFORM public.create_notification(
    p_invitee_id,
    'project:' || p_project_id::text || ':contributor_invite:' || p_invitee_id::text,
    'project_contributor_invited'::public.notification_type,
    'Project invitation',
    format(
      '%s invited you to contribute to %s.',
      v_creator_first,
      coalesce(nullif(v_project_title, ''), 'a project')
    ),
    format('/project/%s', p_project_id),
    NULL,
    NULL,
    NULL,
    NULL,
    v_user_id,
    jsonb_build_object('project_id', p_project_id),
    true
  );

  RETURN v_invite_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_type_should_push(
  p_type public.notification_type
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT p_type = ANY (
    ARRAY[
      'response_received'::public.notification_type,
      'new_responses'::public.notification_type,
      'request_expiring'::public.notification_type,
      'request_expired'::public.notification_type,
      'request_awaiting_review'::public.notification_type,
      'response_accepted'::public.notification_type,
      'response_not_selected'::public.notification_type,
      'completion_requested'::public.notification_type,
      'payment_secured'::public.notification_type,
      'funds_returned'::public.notification_type,
      'payment_released'::public.notification_type,
      'payment_received'::public.notification_type,
      'withdrawal_submitted'::public.notification_type,
      'withdrawal_processing'::public.notification_type,
      'withdrawal_successful'::public.notification_type,
      'withdrawal_failed'::public.notification_type,
      'new_message'::public.notification_type,
      'missed_call'::public.notification_type,
      'request_cancelled'::public.notification_type,
      'helper_cancelled'::public.notification_type,
      'cancellation_confirmed'::public.notification_type,
      'problem_reported'::public.notification_type,
      'dispute_opened'::public.notification_type,
      'dispute_resolved'::public.notification_type,
      'funds_released_after_resolution'::public.notification_type,
      'rate_experience'::public.notification_type,
      'project_contributor_invited'::public.notification_type
    ]
  );
$$;

GRANT EXECUTE ON FUNCTION public.list_project_contributor_invitations(uuid) TO authenticated;