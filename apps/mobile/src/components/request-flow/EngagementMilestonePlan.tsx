import { Text, View } from 'react-native';

import { MilestonePlanCard } from '@/components/request-flow/MilestonePlanCard';
import { Badge } from '@/components/ui/Badge';
import { formatMoney } from '@/lib/format';
import type { Database } from '@/lib/supabase/database.types';

type EngagementMilestone = {
  milestone_id: string;
  milestone_position: number;
  title: string;
  description: string | null;
  amount_major: number;
  status: Database['public']['Enums']['milestone_status'];
};

function statusLabel(status: EngagementMilestone['status']) {
  switch (status) {
    case 'approved_paid':
      return 'Paid';
    case 'in_progress':
      return 'In progress';
    case 'submitted':
      return 'Awaiting approval';
    case 'revision_requested':
      return 'Revision requested';
    default:
      return 'Pending';
  }
}

export function EngagementMilestonePlan({
  totalMajor,
  milestones,
  currency,
}: {
  totalMajor: number;
  milestones: EngagementMilestone[];
  currency: string;
}) {
  if (milestones.length === 0) return null;

  const items = milestones.map((row) => ({
    position: row.milestone_position,
    title: row.title,
    description: row.description?.trim() ?? '',
    amount: Number(row.amount_major),
  }));

  return (
    <View className="gap-3">
      <MilestonePlanCard
        paymentStructure="milestone"
        totalMajor={totalMajor}
        milestones={items}
        currency={currency}
        heading="Milestone plan"
        helperNote="Payments release when the requester approves each milestone."
      />
      <View className="gap-2">
        {milestones.map((row) => (
          <View
            key={row.milestone_id}
            className="flex-row items-center justify-between rounded-xl bg-surface px-3 py-2"
          >
            <Text className="text-sm text-muted">
              Milestone {row.milestone_position}: {row.title}
            </Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-sm font-semibold text-ink">
                {formatMoney(row.amount_major, currency)}
              </Text>
              <Badge label={statusLabel(row.status)} tone="neutral" />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}