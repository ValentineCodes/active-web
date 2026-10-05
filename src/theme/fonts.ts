import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from '@expo-google-fonts/poppins';
import { Text, TextInput, type TextInputProps, type TextProps } from 'react-native';

export const POPPINS = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export const poppinsFontAssets = {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
};

let defaultsApplied = false;

type ComponentWithDefaultProps<P> = {
  defaultProps?: Partial<P>;
};

/** System Text/TextInput without an explicit family should still use Poppins. */
export function applyPoppinsDefaults() {
  if (defaultsApplied) return;
  defaultsApplied = true;

  const style = { fontFamily: POPPINS.regular };

  const text = Text as typeof Text & ComponentWithDefaultProps<TextProps>;
  text.defaultProps = { ...text.defaultProps, style };

  const input = TextInput as typeof TextInput & ComponentWithDefaultProps<TextInputProps>;
  input.defaultProps = { ...input.defaultProps, style };
}

export function usePoppinsFonts() {
  const [loaded, error] = useFonts(poppinsFontAssets);

  if (loaded) {
    applyPoppinsDefaults();
  }

  return { loaded, error };
}
