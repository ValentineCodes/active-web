import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/ui/Badge';
import {
  formatMaskedAccountNumber,
  type BankAccount,
} from '@/features/profile/bank-accounts-api';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme';

type Props = {
  account: BankAccount;
  selected: boolean;
  onSelect: () => void;
  showDivider?: boolean;
};

export function WithdrawBankAccountOption({
  account,
  selected,
  onSelect,
  showDivider,
}: Props) {
  const colors = useColors();

  return (
    <>
      {showDivider ? <View className="mx-4 h-px bg-hairline" /> : null}
      <Pressable
        onPress={onSelect}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        className="flex-row items-start gap-3 px-4 py-4 active:opacity-90"
      >
        <View
          className={cn(
            'mt-1 h-5 w-5 items-center justify-center rounded-full border-2',
            selected ? 'border-active bg-active' : 'border-hairline bg-canvas',
          )}
        >
          {selected ? <Ionicons name="checkmark" size={12} color={colors.onBrand} /> : null}
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-base font-semibold text-ink">{account.bank_name}</Text>
            {account.is_default ? <Badge label="Default" tone="active" /> : null}
          </View>
          <Text className="text-sm text-muted">
            {formatMaskedAccountNumber(account.account_number)}
          </Text>
          <Text className="text-sm text-ink">{account.account_name}</Text>
        </View>
      </Pressable>
    </>
  );
}
