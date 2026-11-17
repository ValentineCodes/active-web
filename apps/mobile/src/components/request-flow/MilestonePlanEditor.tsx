import { useMemo, type ComponentRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';

import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import {
  createEmptyMilestoneDraft,
  MILESTONE_MAX,
  MILESTONE_MIN,
  milestoneDraftTotals,
  milestoneFillRatio,
  type MilestoneDraftItem,
} from '@/features/requests/milestones';
import { formatMoney } from '@/lib/format';
import { MARKET } from '@/config';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme';
import { poppinsInputTypography } from '@/theme/fonts';

const bodyTypography = poppinsInputTypography('regular', 'base');
const titleTypography = poppinsInputTypography('semibold', 'base');

type MilestonePlanEditorProps = {
  items: MilestoneDraftItem[];
  onChange: (next: MilestoneDraftItem[]) => void;
  totalMajor: number | null;
  validationMessage?: string | null;
  showIntro?: boolean;
};

export function MilestonePlanEditor({
  items,
  onChange,
  totalMajor,
  validationMessage,
  showIntro = true,
}: MilestonePlanEditorProps) {
  const colors = useColors();
  const totals = useMemo(() => milestoneDraftTotals(items, totalMajor), [items, totalMajor]);
  const fillRatio = milestoneFillRatio(totals.allocated, totalMajor);
  const matches = totals.remaining === 0;

  const updateItem = (id: string, patch: Partial<MilestoneDraftItem>) => {
    onChange(items.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeItem = (id: string) => {
    if (items.length <= MILESTONE_MIN) return;
    onChange(items.filter((row) => row.id !== id));
  };

  const addItem = () => {
    if (items.length >= MILESTONE_MAX) return;
    onChange([...items, createEmptyMilestoneDraft()]);
  };

  return (
    <View
      className="mt-3 w-full max-w-full rounded-[14px] border border-hairline bg-elevated p-3.5"
      accessibilityRole="none"
      accessibilityLabel="Edit milestone schedule"
    >
      {showIntro ? (
        <View className="mb-3.5 flex-row items-start gap-2.5 rounded-[10px] bg-surface px-3 py-2.5">
          <Ionicons name="sparkles-outline" size={16} color={colors.active} />
          <Text className="flex-1 text-xs leading-[18px] text-muted">
            Split the task into {MILESTONE_MIN}–{MILESTONE_MAX} steps. Each amount is in{' '}
            <Text className="font-semibold text-ink">{MARKET.currency}</Text> and must sum exactly to the
            offer total.
          </Text>
        </View>
      ) : null}

      {validationMessage ? (
        <Text className="mb-3 text-xs text-danger" accessibilityRole="alert">
          {validationMessage}
        </Text>
      ) : null}

      {items.map((item, index) => (
        <MilestoneDraftRow
          key={item.id}
          index={index}
          count={items.length}
          item={item}
          colors={colors}
          onChange={(patch) => updateItem(item.id, patch)}
          onRemove={() => removeItem(item.id)}
          isLast={index === items.length - 1}
        />
      ))}

      {items.length < MILESTONE_MAX ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add milestone"
          disabled={items.length >= MILESTONE_MAX}
          onPress={addItem}
          className={cn(
            'mt-2 flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline py-3.5 active:opacity-90',
            items.length >= MILESTONE_MAX ? 'opacity-50' : '',
          )}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.active} />
          <Text className="text-base font-semibold text-active">Add milestone</Text>
          <Text className="text-sm font-medium text-muted">
            ({MILESTONE_MAX - items.length} remaining)
          </Text>
        </Pressable>
      ) : null}

      {totalMajor != null ? (
        <View
          className={cn(
            'mt-3 gap-2 rounded-xl border p-3',
            matches ? 'border-active/30 bg-active/5' : 'border-warning/30 bg-warning/5',
          )}
          accessibilityRole="summary"
        >
          <View className="flex-row flex-wrap justify-between gap-2">
            <Text className="text-sm text-muted">
              Milestone total:{' '}
              <Text className="font-semibold text-ink">
                {formatMoney(totals.allocated, MARKET.currency)}
              </Text>
            </Text>
            <Text className="text-sm text-muted">
              Budget:{' '}
              <Text className="font-semibold text-ink">{formatMoney(totalMajor, MARKET.currency)}</Text>
            </Text>
          </View>
          {fillRatio != null ? (
            <View className="h-1.5 overflow-hidden rounded-full bg-hairline/80">
              <View
                className={cn('h-full rounded-full', matches ? 'bg-active' : 'bg-warning')}
                style={{ width: `${fillRatio}%` }}
              />
            </View>
          ) : null}
          <View className="flex-row items-center gap-1.5">
            {matches ? (
              <>
                <Ionicons name="checkmark-circle" size={14} color={colors.active} />
                <Text className="text-xs text-muted">Amounts match the task budget</Text>
              </>
            ) : totals.remaining !== null && totals.remaining > 0 ? (
              <Text className="text-xs text-muted">
                {formatMoney(totals.remaining, MARKET.currency)} left to allocate across milestones
              </Text>
            ) : (
              <Text className="text-xs text-muted">Reduce milestone amounts to match the budget</Text>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MilestoneDraftRow({
  index,
  count,
  item,
  colors,
  onChange,
  onRemove,
  isLast,
}: {
  index: number;
  count: number;
  item: MilestoneDraftItem;
  colors: ReturnType<typeof useColors>;
  onChange: (patch: Partial<MilestoneDraftItem>) => void;
  onRemove: () => void;
  isLast: boolean;
}) {
  const titleRef = useRef<ComponentRef<typeof TextInput>>(null);
  const descriptionRef = useRef<ComponentRef<typeof TextInput>>(null);
  const amountRef = useRef<ComponentRef<typeof TextInput>>(null);

  return (
    <View className={cn('w-full max-w-full flex-row gap-2.5', isLast ? 'pb-1.5' : 'pb-3.5')}>
      <View className="w-7 shrink-0 items-center">
        <View className="h-[26px] w-[26px] items-center justify-center rounded-full border border-ink bg-surface">
          <Text className="text-[11px] font-extrabold text-ink">{index + 1}</Text>
        </View>
        {!isLast ? <View className="mt-1.5 min-h-4 w-0.5 flex-1 bg-hairline" /> : null}
      </View>
      <View className="min-w-0 flex-1 overflow-hidden rounded-xl border border-hairline bg-surface p-3">
        <View className="mb-2.5 flex-row items-center justify-between gap-2">
          <Text
            className="min-w-0 shrink text-[10px] font-extrabold uppercase tracking-widest text-muted"
            numberOfLines={1}
          >
            Milestone {index + 1}
          </Text>
          {count > MILESTONE_MIN ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove milestone ${index + 1}`}
              onPress={onRemove}
              className="shrink-0 flex-row items-center gap-1 rounded-lg px-2 py-1 active:opacity-80"
            >
              <Ionicons name="close" size={14} color={colors.muted} />
              <Text className="text-[11px] font-semibold text-muted">Remove</Text>
            </Pressable>
          ) : null}
        </View>
        <View className="w-full max-w-full gap-2.5">
          <View className="w-full gap-1.5">
            <Text className="text-xs font-semibold text-muted">Title</Text>
            <TextInput
              ref={titleRef}
              accessibilityLabel={`Milestone ${index + 1} title`}
              value={item.title}
              onChangeText={(text) => onChange({ title: text })}
              placeholder="Milestone name"
              placeholderTextColor={colors.subtle}
              maxLength={120}
              className="w-full max-w-full rounded-xl bg-elevated px-4 py-3 text-ink"
              style={titleTypography}
            />
          </View>
          <View className="w-full gap-1.5">
            <Text className="text-xs font-semibold text-muted">Notes (optional)</Text>
            <TextInput
              ref={descriptionRef}
              accessibilityLabel={`Milestone ${index + 1} description`}
              value={item.description}
              onChangeText={(text) => onChange({ description: text })}
              placeholder="What you expect at this step"
              placeholderTextColor={colors.subtle}
              multiline
              maxLength={1000}
              textAlignVertical="top"
              className="min-h-20 w-full max-w-full rounded-xl bg-elevated px-4 py-3 text-ink"
              style={bodyTypography}
            />
          </View>
          <View className="w-full gap-1.5">
            <Text className="text-xs font-semibold text-muted">Amount</Text>
            <View className="w-full max-w-full overflow-hidden rounded-xl bg-elevated px-4 py-3">
              <MoneyAmountInput
                className="w-full min-w-0"
                inputRef={amountRef}
                accessibilityLabel={`Milestone ${index + 1} amount`}
                value={item.amount}
                onChangeText={(text) => onChange({ amount: text.replace(/[^\d]/g, '') })}
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}