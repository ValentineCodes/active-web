import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from '@expo-google-fonts/poppins';
import { Platform, Text, TextInput, type TextInputProps, type TextProps } from 'react-native';

export const POPPINS = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export type PoppinsWeight = keyof typeof POPPINS;

export const poppinsFontAssets = {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
};

const INPUT_SIZES = {
  base: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 18, lineHeight: 28 },
  xl: { fontSize: 20, lineHeight: 28 },
  amount: { fontSize: 30, lineHeight: 36 },
} as const;

export type PoppinsInputSize = keyof typeof INPUT_SIZES;

/** Explicit Poppins on TextInput — avoids Regular default fighting `font-bold` utilities. */
export function poppinsInputTypography(
  weight: PoppinsWeight = 'regular',
  size: PoppinsInputSize = 'base',
  options?: { multiline?: boolean },
) {
  const { fontSize, lineHeight } = INPUT_SIZES[size];
  const fontFamily = POPPINS[weight];

  if (Platform.OS === 'ios') {
    return options?.multiline ? { fontFamily, fontSize, lineHeight } : { fontFamily, fontSize };
  }

  return {
    fontFamily,
    fontSize,
    lineHeight,
    includeFontPadding: false,
    textAlignVertical: 'center' as const,
  };
}

export const MONEY_AMOUNT_ROW_HEIGHT = INPUT_SIZES.amount.lineHeight;

let defaultsApplied = false;

type ComponentWithDefaultProps<P> = {
  defaultProps?: Partial<P>;
};

/** System Text without an explicit family should still use Poppins. */
export function applyPoppinsDefaults() {
  if (defaultsApplied) return;
  defaultsApplied = true;

  const textStyle = { fontFamily: POPPINS.regular };

  const text = Text as typeof Text & ComponentWithDefaultProps<TextProps>;
  text.defaultProps = { ...text.defaultProps, style: textStyle };

  if (Platform.OS === 'android') {
    const input = TextInput as typeof TextInput & ComponentWithDefaultProps<TextInputProps>;
    input.defaultProps = {
      ...input.defaultProps,
      style: { includeFontPadding: false },
    };
  }
}

export function usePoppinsFonts() {
  const [loaded, error] = useFonts(poppinsFontAssets);

  if (loaded) {
    applyPoppinsDefaults();
  }

  return { loaded, error };
}
