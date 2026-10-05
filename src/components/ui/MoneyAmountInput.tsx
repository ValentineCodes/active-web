import { type ComponentRef, type ReactNode, type Ref } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';

import { MARKET } from '@/config';
import { cn } from '@/lib/cn';
import { MONEY_AMOUNT_ROW_HEIGHT, poppinsInputTypography, POPPINS } from '@/theme/fonts';
import { useColors } from '@/theme';

const amountTypography = poppinsInputTypography('bold', 'amount');

function AmountRowSlot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View className={cn('justify-center', className)} style={{ height: MONEY_AMOUNT_ROW_HEIGHT }}>
      {children}
    </View>
  );
}

export function MoneyAmountInput({
  value,
  onChangeText,
  accessibilityLabel,
  inputRef,
  maxLength = 9,
  trailing,
  className,
}: {
  value: string;
  onChangeText: (text: string) => void;
  accessibilityLabel: string;
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
  maxLength?: number;
  trailing?: ReactNode;
  className?: string;
}) {
  const colors = useColors();

  const symbolStyle = [
    amountTypography,
    { color: colors.active, lineHeight: MONEY_AMOUNT_ROW_HEIGHT },
  ];

  const inputStyle = [
    amountTypography,
    {
      color: colors.ink,
      flex: 1,
      width: '100%',
      padding: 0,
      margin: 0,
    },
    Platform.OS === 'android'
      ? { fontFamily: POPPINS.bold, lineHeight: MONEY_AMOUNT_ROW_HEIGHT }
      : null,
  ];

  return (
    <View className={cn('flex-row items-center', className)}>
      <AmountRowSlot>
        <Text style={symbolStyle}>{MARKET.currencySymbol}</Text>
      </AmountRowSlot>

      <View className="min-w-0 flex-1 flex-row items-center">
        <AmountRowSlot className="min-w-0 flex-1 px-2">
          <TextInput
            ref={inputRef}
            accessibilityLabel={accessibilityLabel}
            value={value}
            onChangeText={onChangeText}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.subtle}
            style={inputStyle}
            maxLength={maxLength}
          />
        </AmountRowSlot>
        {trailing}
      </View>
    </View>
  );
}
