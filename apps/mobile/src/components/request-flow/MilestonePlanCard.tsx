import { Text, View } from 'react-native';

import { type MilestoneProposalItem, type PaymentStructure } from '@/features/requests/milestones';
import { formatMoney } from '@/lib/format';
import { MARKET } from '@/config';
import { cn } from '@/lib/cn';

export function MilestonePlanCard({
  paymentStructure,
  milestones,
  currency = MARKET.currency,
  helperNote,
  variant = 'default',
  heading = 'Milestone plan',
  totalMajor: _totalMajor,
  compact: _compact,
  showBudgetProgress: _showBudgetProgress,
}: {
  paymentStructure: PaymentStructure;
  totalMajor?: number | null;
  milestones: MilestoneProposalItem[];
  currency?: string;
  heading?: string;
  helperNote?: string;
  variant?: 'default' | 'proposed';
  compact?: boolean;
  showBudgetProgress?: boolean;
}) {
  if (paymentStructure !== 'milestone' || milestones.length === 0) {
    return null;
  }

  return (
    <View
      className={cn(
        'w-full max-w-full gap-3 rounded-[14px] border border-hairline bg-elevated px-4 py-3.5',
        variant === 'proposed' ? 'border-dashed' : '',
      )}
    >
      {helperNote ? <Text className="text-sm leading-5 text-muted">{helperNote}</Text> : null}

      <View accessibilityRole="list" accessibilityLabel={heading}>
        {milestones.map((item, index) => {
          const isLast = index === milestones.length - 1;
          return (
            <View
              key={item.position}
              className={cn('w-full max-w-full flex-row gap-3', isLast ? 'pb-0' : 'pb-3.5')}
            >
              <View className="min-h-full w-7 shrink-0 items-center">
                <View className="h-[26px] w-[26px] items-center justify-center rounded-full bg-ink">
                  <Text className="text-[11px] font-extrabold text-canvas">{item.position}</Text>
                </View>
                {!isLast ? <View className="mt-1.5 min-h-4 w-0.5 flex-1 bg-hairline" /> : null}
              </View>
              <View className="min-w-0 flex-1 overflow-hidden">
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="min-w-0 flex-1 text-base font-semibold text-ink" numberOfLines={3}>
                    {item.title}
                  </Text>
                  <Text className="shrink-0 text-base font-bold text-ink">
                    {formatMoney(item.amount, currency)}
                  </Text>
                </View>
                {item.description ? (
                  <Text className="mt-1 text-sm leading-5 text-muted">{item.description}</Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}