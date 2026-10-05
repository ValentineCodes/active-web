import { DepositSettlementError, settleDepositFromPaystack } from '../_shared/deposit/settle.ts';
import { errorResponse, jsonResponse } from '../_shared/cors.ts';
import { logStructured } from '../_shared/log.ts';
import {
  parseWalletDepositMetadata,
  verifyPaystackWebhookSignature,
  type PaystackWebhookEvent,
} from '../_shared/paystack/webhook.ts';
import { getServiceSupabase } from '../_shared/supabase-service.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-paystack-signature');

  if (!signature?.trim()) {
    logStructured('paystack_webhook_rejected', { reason: 'missing_signature' });
    return errorResponse('Missing signature', 401);
  }

  let signatureValid = false;
  try {
    signatureValid = await verifyPaystackWebhookSignature(rawBody, signature);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Signature verification failed';
    logStructured('paystack_webhook_error', { reason: 'signature_verify_failed', message });
    return errorResponse('Invalid signature', 401);
  }

  if (!signatureValid) {
    logStructured('paystack_webhook_rejected', { reason: 'invalid_signature' });
    return errorResponse('Invalid signature', 401);
  }

  let event: PaystackWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PaystackWebhookEvent;
  } catch {
    logStructured('paystack_webhook_rejected', { reason: 'invalid_json' });
    return errorResponse('Invalid JSON', 400);
  }

  const eventName = event.event?.trim() ?? '';

  if (eventName !== 'charge.success') {
    logStructured('paystack_webhook_ignored', { paystack_event: eventName });
    return jsonResponse({ received: true });
  }

  const reference = event.data?.reference?.trim();
  const amount = event.data?.amount;
  const currency = event.data?.currency?.trim() ?? '';
  const status = event.data?.status?.trim() ?? '';
  const walletMeta = parseWalletDepositMetadata(event.data?.metadata);

  if (!walletMeta) {
    logStructured('paystack_webhook_ignored', {
      paystack_event: eventName,
      reference: reference ?? null,
      reason: 'not_wallet_deposit',
    });
    return jsonResponse({ received: true, ignored: true });
  }

  if (!reference || amount === undefined) {
    logStructured('paystack_webhook_rejected', {
      paystack_event: eventName,
      reason: 'invalid_payload',
      deposit_id: walletMeta.depositId,
    });
    return jsonResponse({ received: true, credited: false, reason: 'invalid_payload' });
  }

  logStructured('paystack_webhook_charge_success', {
    reference,
    deposit_id: walletMeta.depositId,
    user_id: walletMeta.userId,
  });

  try {
    const service = getServiceSupabase();
    const result = await settleDepositFromPaystack(service, reference, {
      paystackAmountKobo: amount,
      paystackReference: reference,
      currency,
      paystackStatus: status,
      metadataUserId: walletMeta.userId,
      metadataDepositId: walletMeta.depositId,
    });

    logStructured('paystack_webhook_settled', {
      reference,
      deposit_id: walletMeta.depositId,
      user_id: walletMeta.userId,
      wallet_credited: result.walletCredited,
      already_fulfilled: result.alreadyFulfilled,
      deposit_status: result.status,
    });

    return jsonResponse({
      received: true,
      credited: result.walletCredited,
      already_fulfilled: result.alreadyFulfilled,
    });
  } catch (error) {
    if (error instanceof DepositSettlementError) {
      logStructured('paystack_webhook_deposit_rejected', {
        reference,
        deposit_id: walletMeta.depositId,
        user_id: walletMeta.userId,
        reason: error.code,
        message: error.message,
      });
      return jsonResponse({ received: true, credited: false, reason: error.code });
    }

    const message = error instanceof Error ? error.message : 'Unexpected error';
    logStructured('paystack_webhook_error', {
      reference,
      deposit_id: walletMeta.depositId,
      message,
    });
    return errorResponse(message, 500);
  }
});
