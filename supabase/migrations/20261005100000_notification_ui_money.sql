-- Notification copy should show ₦, not the ISO code.

CREATE OR REPLACE FUNCTION public.format_ui_money(p_amount numeric, p_currency text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN upper(p_currency) = 'NGN' THEN
      E'₦' || trim(to_char(round(p_amount), 'FM999,999,999,990'))
    ELSE
      trim(to_char(p_amount, 'FM999,999,999,990.00')) || ' ' || upper(p_currency)
  END;
$$;

CREATE OR REPLACE FUNCTION public.notify_payment_transition() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_requester_id uuid;
  v_total numeric;
  v_currency text;
BEGIN
  SELECT r.requester_id, r.currency
    INTO v_requester_id, v_currency
  FROM public.requests r
  WHERE r.id = new.request_id;

  SELECT re.total INTO v_total
  FROM public.request_escrow re
  WHERE re.request_id = new.request_id;

  IF new.to_status = 'refunded'::public.payment_status THEN
    PERFORM public.create_notification(
      v_requester_id,
      'payment_transition:' || new.id::text,
      'funds_returned'::public.notification_type,
      'Payment returned',
      coalesce(
        format('%s was returned to your wallet.', public.format_ui_money(v_total, v_currency)),
        'Your payment has been returned to your wallet.'
      ),
      '/wallet',
      new.request_id,
      null,
      new.id,
      null,
      null,
      null,
      true
    );
  ELSIF new.to_status = 'released'::public.payment_status
        AND new.idempotency_key NOT LIKE 'admin_dispute_release:%' THEN
    PERFORM public.create_notification(
      v_requester_id,
      'payment_transition:' || new.id::text,
      'payment_released'::public.notification_type,
      'Payment released',
      coalesce(
        format(
          'Your %s payment for this request has been released.',
          public.format_ui_money(v_total, v_currency)
        ),
        'Your payment for this request has been released.'
      ),
      format('/engagement/%s', new.request_id),
      new.request_id,
      null,
      new.id,
      null,
      null,
      null,
      true
    );
  END IF;

  RETURN new;
END;
$$;
