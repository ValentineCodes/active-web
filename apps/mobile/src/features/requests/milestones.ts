import type { Database } from '@/lib/supabase/database.types';

export type PaymentStructure = Database['public']['Enums']['payment_structure'];

export type MilestoneDraftItem = {
  id: string;
  title: string;
  description: string;
  amount: string;
};

export type MilestoneRpcItem = {
  title: string;
  description: string;
  amount: number;
};

export type MilestoneProposalItem = {
  position: number;
  title: string;
  description: string;
  amount: number;
};

export type MilestonePlanValidation =
  | { ok: true; items: MilestoneRpcItem[] }
  | { ok: false; message: string };

export const MILESTONE_MIN = 2;
export const MILESTONE_MAX = 5;
export const MILESTONE_TITLE_MAX = 120;
export const MILESTONE_DESCRIPTION_MAX = 1000;

function newMilestoneId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyMilestoneDraft(): MilestoneDraftItem {
  return { id: newMilestoneId(), title: '', description: '', amount: '' };
}

export function defaultMilestoneDraftItems(): MilestoneDraftItem[] {
  return [createEmptyMilestoneDraft(), createEmptyMilestoneDraft()];
}

function parseMajorAmount(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number.parseInt(digits, 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** Integer major → kobo (matches server ngn_major_to_kobo for whole naira). */
export function majorToKobo(amountMajor: number) {
  return Math.trunc(amountMajor) * 100;
}

export function milestoneItemsSumKobo(items: { amount: number }[], totalMajor: number) {
  const totalKobo = majorToKobo(totalMajor);
  const sumKobo = items.reduce((sum, item) => sum + majorToKobo(item.amount), 0);
  return sumKobo === totalKobo;
}

export function validateMilestoneDraftItems(
  drafts: MilestoneDraftItem[],
  totalMajor: number,
): MilestonePlanValidation {
  if (drafts.length < MILESTONE_MIN) {
    return { ok: false, message: `Add at least ${MILESTONE_MIN} milestones.` };
  }
  if (drafts.length > MILESTONE_MAX) {
    return { ok: false, message: `Use at most ${MILESTONE_MAX} milestones.` };
  }
  if (!Number.isFinite(totalMajor) || totalMajor <= 0) {
    return { ok: false, message: 'Enter a valid offer total first.' };
  }

  const items: MilestoneRpcItem[] = [];

  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index]!;
    const title = draft.title.trim();
    if (!title) {
      return { ok: false, message: `Milestone ${index + 1} needs a title.` };
    }
    if (title.length > MILESTONE_TITLE_MAX) {
      return { ok: false, message: `Milestone ${index + 1} title is too long.` };
    }

    const description = draft.description.trim();
    if (description.length > MILESTONE_DESCRIPTION_MAX) {
      return { ok: false, message: `Milestone ${index + 1} description is too long.` };
    }

    const amount = parseMajorAmount(draft.amount);
    if (amount === null) {
      return { ok: false, message: `Milestone ${index + 1} needs a valid amount.` };
    }

    items.push({ title, description, amount });
  }

  const sumMajor = items.reduce((sum, item) => sum + item.amount, 0);
  if (sumMajor !== Math.trunc(totalMajor)) {
    return {
      ok: false,
      message: 'Milestone amounts must add up to your full offer.',
    };
  }

  if (!milestoneItemsSumKobo(items, totalMajor)) {
    return {
      ok: false,
      message: 'Milestone amounts must add up to your full offer.',
    };
  }

  return { ok: true, items };
}

export function milestoneFillRatio(allocatedMajor: number, totalMajor: number | null): number | null {
  if (totalMajor == null || totalMajor <= 0) return null;
  return Math.min(100, (allocatedMajor / totalMajor) * 100);
}

export function milestoneDraftsAllocatedMajor(drafts: MilestoneDraftItem[]) {
  return milestoneDraftTotals(drafts, null).allocated;
}

export function milestoneDraftTotals(drafts: MilestoneDraftItem[], totalMajor: number | null) {
  const allocated = drafts.reduce((sum, draft) => {
    const amount = parseMajorAmount(draft.amount);
    return amount !== null ? sum + amount : sum;
  }, 0);

  const total = totalMajor !== null && Number.isFinite(totalMajor) ? Math.trunc(totalMajor) : null;
  const remaining = total !== null ? total - allocated : null;

  return { allocated, remaining, total };
}

export function serializeMilestonesForRpc(items: MilestoneRpcItem[]): MilestoneRpcItem[] {
  return items.map((item) => ({
    title: item.title,
    description: item.description,
    amount: item.amount,
  }));
}

export function milestoneItemsFromProposalJson(
  items: Array<{ position?: number; title: string; description?: string | null; amount: number }>,
): MilestoneProposalItem[] {
  return [...items]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((item, index) => ({
      position: item.position ?? index + 1,
      title: item.title,
      description: item.description?.trim() ?? '',
      amount: Number(item.amount),
    }));
}

export function paymentStructureLabel(structure: PaymentStructure | null | undefined) {
  if (structure === 'milestone') return 'Milestone payments';
  return 'Single payment';
}