import { format, formatDistanceToNowStrict, isThisYear, isToday, isYesterday } from 'date-fns';

import { formatMoney } from '@/lib/format';

import type { WalletActivityRow } from './activity';
import {
  walletActivityAmount,
  walletActivityTitle,
  walletTransactionStatusLabel,
} from './activity';
import type { WalletTransactionStatus } from './types';
import { walletWithdrawalStatusLabel } from './withdraw-status';
import type { WalletWithdrawalStatus } from './withdrawals-api';

export type WalletActivityStatusTag = 'locked' | 'returned' | 'completed';

export type WalletTransactionDetailBadge = {
  label: string;
  variant: 'completed' | 'locked' | 'returned' | 'pending' | 'failed';
};

export type WalletActivityVisual = {
  incoming: boolean;
  statusTag: WalletActivityStatusTag | null;
};

const INCOMING_KINDS = new Set([
  'external_deposit',
  'deposit',
  'manual_top_up',
  'pay_provider',
  'payout',
  'refund',
  'escrow_partial_refund',
]);

export function walletActivityVisual(
  kind: string,
  amount: number | null,
  withdrawalStatus?: WalletWithdrawalStatus,
): WalletActivityVisual {
  const incoming = amount !== null ? amount > 0 : INCOMING_KINDS.has(kind);

  let statusTag: WalletActivityStatusTag | null = null;
  if (kind === 'escrow_lock') statusTag = 'locked';
  else if (kind === 'refund' || kind === 'escrow_partial_refund') statusTag = 'returned';
  else if (kind === 'manual_withdraw') {
    if (withdrawalStatus === 'completed') statusTag = 'completed';
  } else if (
    ['deposit', 'external_deposit', 'manual_top_up', 'pay_provider', 'escrow_release'].includes(kind)
  ) {
    statusTag = 'completed';
  }

  return { incoming, statusTag };
}

export function formatWalletActivitySignedAmount(amount: number, currency: string): string {
  const label = formatMoney(Math.abs(amount), currency);
  return amount > 0 ? `+ ${label}` : `− ${label}`;
}

export function formatWalletActivityWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  if (isToday(date)) {
    const relative = formatDistanceToNowStrict(date, { addSuffix: false });
    if (relative === 'less than a minute') return 'Just now';
    return 'Today';
  }
  if (isYesterday(date)) return 'Yesterday';
  if (isThisYear(date)) return format(date, 'MMM d');
  return format(date, 'MMM d, yyyy');
}

export function formatWalletTransactionWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const datePart = format(date, 'MMM d, yyyy');
  const relative = formatDistanceToNowStrict(date, { addSuffix: false });
  if (isToday(date) && relative === 'less than a minute') {
    return `${datePart} · Just now`;
  }
  return `${datePart} · ${format(date, 'h:mm a')}`;
}

export function walletActivityReference(id: string): string {
  const compact = id.replace(/-/g, '').toUpperCase();
  if (compact.length <= 4) return `ACT-${compact}`;
  return `ACT-${compact.slice(0, 4)}-${compact.slice(4, 6)}`;
}

export function walletActivityDetailBadge(kind: string): WalletActivityStatusTag | null {
  return walletActivityVisual(kind, null).statusTag;
}

export function walletTransactionDetailBadge(
  kind: string,
  status: WalletTransactionStatus,
  withdrawalStatus?: WalletWithdrawalStatus,
): WalletTransactionDetailBadge {
  if (kind === 'manual_withdraw' && withdrawalStatus) {
    const label = walletWithdrawalStatusLabel(withdrawalStatus);
    if (withdrawalStatus === 'completed') return { label, variant: 'completed' };
    if (withdrawalStatus === 'rejected' || withdrawalStatus === 'failed') {
      return { label, variant: 'failed' };
    }
    return { label, variant: 'pending' };
  }

  const tag = walletActivityVisual(kind, null).statusTag;
  if (tag === 'locked') return { label: 'Locked', variant: 'locked' };
  if (tag === 'returned') return { label: 'Returned', variant: 'returned' };
  if (status === 'pending') return { label: 'Pending', variant: 'pending' };
  if (status === 'failed') return { label: 'Failed', variant: 'failed' };
  if (status === 'reversed') return { label: 'Reversed', variant: 'failed' };
  return { label: 'Completed', variant: 'completed' };
}

export function walletActivityWhatHappened(kind: string): string {
  switch (kind) {
    case 'deposit':
    case 'external_deposit':
    case 'manual_top_up':
      return 'Money was added to your Active wallet and is ready to use.';
    case 'escrow_lock':
      return 'This money is committed to your active request. It will be released when the request is completed or returned if it is cancelled.';
    case 'pay_provider':
      return 'You received this payment after completing a request.';
    case 'refund':
    case 'escrow_partial_refund':
      return 'The request did not go ahead, so the committed money was returned to your available balance.';
    case 'escrow_release':
      return 'Payment was released after you confirmed the request was complete.';
    case 'manual_withdraw':
      return 'You requested a withdrawal to your bank account. We process payouts manually; reserved funds return if the request is declined or the transfer fails.';
    case 'escrow_pending':
    case 'escrow_relock':
      return 'This money is held while your request is in progress.';
    case 'escrow_top_up':
      return 'Your offer increased, so more money was set aside for this request.';
    default:
      return 'This transaction updated your wallet balance.';
  }
}

export function groupWalletActivityByMonth(rows: WalletActivityRow[]) {
  const map = new Map<string, WalletActivityRow[]>();

  for (const row of rows) {
    if (!row.created_at) continue;
    const key = format(new Date(row.created_at), 'yyyy-MM');
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }

  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({
      key,
      title: format(new Date(`${key}-01T12:00:00`), 'MMMM yyyy').toUpperCase(),
      items,
    }));
}

export type WalletHistoryDirection = 'in' | 'out' | 'neutral';

export function walletHistoryDirection(availableDelta: number): WalletHistoryDirection {
  if (availableDelta > 0) return 'in';
  if (availableDelta < 0) return 'out';
  return 'neutral';
}

export function walletHistoryDescription(row: WalletActivityRow): string {
  const trimmed = row.description?.trim();
  if (trimmed) return trimmed;
  return walletActivityWhatHappened(row.kind ?? 'activity');
}

export function formatWalletHistoryListWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  if (isToday(date)) {
    const relative = formatDistanceToNowStrict(date, { addSuffix: false });
    if (relative === 'less than a minute') return 'Just now';
    return `Today, ${format(date, 'h:mm a')}`;
  }
  if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`;
  if (isThisYear(date)) return format(date, 'MMM d, h:mm a');
  return format(date, 'MMM d, yyyy, h:mm a');
}

export function walletHistoryListMeta(
  row: WalletActivityRow,
  currency: string,
): {
  title: string;
  description: string;
  statusLabel: string;
  direction: WalletHistoryDirection;
  amount: number | null;
  signedAmount: string | null;
  when: string;
  visual: WalletActivityVisual;
} {
  const kind = row.kind ?? 'activity';
  const amount = walletActivityAmount(row);
  const visual = walletActivityVisual(kind, amount, row.withdrawal?.queueStatus);
  const direction = walletHistoryDirection(row.available_delta);
  const statusLabel =
    row.withdrawal?.queueStatus != null
      ? walletWithdrawalStatusLabel(row.withdrawal.queueStatus)
      : walletTransactionStatusLabel(row.status);

  return {
    title: walletActivityTitle(kind),
    description: walletHistoryDescription(row),
    statusLabel,
    direction,
    amount,
    signedAmount: amount !== null ? formatWalletActivitySignedAmount(amount, currency) : null,
    when: row.created_at ? formatWalletHistoryListWhen(row.created_at) : '',
    visual,
  };
}

export function walletTransactionStatusDisplay(status: WalletTransactionStatus): string {
  return walletTransactionStatusLabel(status);
}

export function walletActivityListMeta(
  row: WalletActivityRow,
  currency: string,
): {
  title: string;
  subtitle: string | null;
  amount: number | null;
  signedAmount: string | null;
  when: string;
  visual: WalletActivityVisual;
  statusLabel: string;
} {
  const meta = walletHistoryListMeta(row, currency);
  const subtitle =
    row.withdrawal != null
      ? `${row.withdrawal.destinationBankName} · ${row.withdrawal.destinationAccountNumberMasked}`
      : null;
  return {
    title: meta.title,
    subtitle,
    amount: meta.amount,
    signedAmount: meta.signedAmount,
    when: row.created_at ? formatWalletActivityWhen(row.created_at) : '',
    visual: meta.visual,
    statusLabel: meta.statusLabel,
  };
}
