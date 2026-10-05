import { type ComponentRef, type ReactNode, type Ref } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';

import { MARKET } from '@/config';
import { cn } from '@/lib/cn';
import { MONEY_AMOUNT_ROW_HEIGHT, moneyAmountInputTypography, POPPINS } from '@/theme/fonts';
import { useColors } from '@/theme';

const amountDisplayTypography = moneyAmountInputTypography();

/** iOS UITextField misaligns when lineHeight is set — match placeholder with padding instead. */
const amountInputTypography =
  Platform.OS === 'ios' ? { fontFamily: POPPINS.bold, fontSize: 30 } : amountDisplayTypography;

/** Space between the currency symbol and the amount digits. */
const AMOUNT_PAD_LEFT = 8;

const placeholderContentInset = Platform.select({
  ios: { paddingLeft: AMOUNT_PAD_LEFT, paddingTop: 3, paddingRight: 0, paddingBottom: 0 },
  default: { paddingLeft: AMOUNT_PAD_LEFT, paddingTop: 0, paddingRight: 0, paddingBottom: 0 },
});

const inputContentInset = Platform.select({
  ios: { paddingLeft: AMOUNT_PAD_LEFT, paddingTop: 0, paddingRight: 0, paddingBottom: 0 },
  default: { paddingLeft: AMOUNT_PAD_LEFT, paddingTop: 0, paddingRight: 0, paddingBottom: 0 },
});

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
  const showPlaceholder = value.length === 0;

  const fieldBoxStyle = {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    height: MONEY_AMOUNT_ROW_HEIGHT,
    width: '100%',
    margin: 0,
  };

  const inputStyle = [
    amountInputTypography,
    fieldBoxStyle,
    inputContentInset,
    { color: colors.ink },
  ];

  const placeholderStyle = [
    amountDisplayTypography,
    fieldBoxStyle,
    placeholderContentInset,
    {
      lineHeight: MONEY_AMOUNT_ROW_HEIGHT,
      color: colors.subtle,
    },
  ];

  const symbolStyle = [amountDisplayTypography, { color: colors.active }];

  return (
    <View className={cn('flex-row items-center', className)}>
      <Text style={symbolStyle}>{MARKET.currencySymbol}</Text>

      <View className="min-w-0 flex-1 flex-row items-center">
        <View className="relative min-w-0 flex-1" style={{ height: MONEY_AMOUNT_ROW_HEIGHT }}>
          <TextInput
            ref={inputRef}
            accessibilityLabel={accessibilityLabel}
            value={value}
            onChangeText={onChangeText}
            keyboardType="number-pad"
            placeholder=""
            style={inputStyle}
            maxLength={maxLength}
          />
          {showPlaceholder ? (
            <Text pointerEvents="none" style={placeholderStyle}>
              0
            </Text>
          ) : null}
        </View>
        {trailing}
      </View>
    </View>
  );
}
