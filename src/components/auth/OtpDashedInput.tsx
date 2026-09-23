import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { OTPInput, type SlotProps } from 'input-otp-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '@/lib/cn';
import { colors } from '@/theme';

const CODE_LENGTH = 6;

type Props = {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
};

export function OtpDashedInput({ value, onChange, autoFocus }: Props) {
  return (
    <OTPInput
      value={value}
      onChange={onChange}
      autoFocus={autoFocus}
      maxLength={CODE_LENGTH}
      render={({ slots }) => (
        <View className="my-4 flex-row items-center justify-center">
          {slots.map((slot, idx) => (
            <DashedSlot key={idx} {...slot} />
          ))}
        </View>
      )}
    />
  );
}

function DashedSlot(props: SlotProps) {
  const { char, isActive, hasFakeCaret, ...pressableProps } = props;

  return (
    <Pressable {...pressableProps} className="mx-2 h-12 w-12 items-center justify-center">
      {char !== null ? <Text className="text-3xl font-medium text-ink">{char}</Text> : null}
      {hasFakeCaret ? <FakeCaret /> : null}
      <View
        className={cn('absolute bottom-0 w-full', isActive ? 'h-0.5 bg-brand' : 'h-px bg-hairline')}
      />
    </Pressable>
  );
}

function FakeCaret() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0, { duration: 500 }), withTiming(1, { duration: 500 })),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View className="absolute h-full w-full items-center justify-center" pointerEvents="none">
      <Animated.View
        style={[
          {
            width: 3,
            height: 28,
            borderRadius: 2,
            backgroundColor: colors.brand,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}
