import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { ThemePreference } from '@/features/theme/preferences';
import { useColors } from '@/theme';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System\u00A0Default' },
];

function preferenceIndex(value: ThemePreference) {
  return OPTIONS.findIndex((option) => option.value === value);
}

function SegmentLabel({
  label,
  index,
  progress,
}: {
  label: string;
  index: number;
  progress: SharedValue<number>;
}) {
  const colors = useColors();

  const textStyle = useAnimatedStyle(() => {
    const distance = Math.abs(progress.value - index);
    const emphasis = Math.max(0, 1 - distance);
    return {
      color: interpolateColor(emphasis, [0, 1], [colors.muted, colors.onBrand]),
    };
  });

  return (
    <Animated.Text numberOfLines={1} className="text-sm font-semibold" style={textStyle}>
      {label}
    </Animated.Text>
  );
}

export function ThemePreferenceSegment({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (next: ThemePreference) => void;
}) {
  const [segmentWidths, setSegmentWidths] = useState([0, 0, 0]);
  const progress = useSharedValue(preferenceIndex(value));
  const widths = useSharedValue([0, 0, 0]);

  const selectedIndex = preferenceIndex(value);

  useEffect(() => {
    progress.value = withTiming(selectedIndex, { duration: 240 });
  }, [progress, selectedIndex]);

  useEffect(() => {
    widths.value = segmentWidths;
  }, [segmentWidths, widths]);

  const pillStyle = useAnimatedStyle(() => {
    const w0 = widths.value[0] ?? 0;
    const w1 = widths.value[1] ?? 0;
    const w2 = widths.value[2] ?? 0;
    if (w0 === 0 || w1 === 0 || w2 === 0) {
      return { opacity: 0, width: 0, transform: [{ translateX: 0 }] };
    }

    const segmentWidth = (index: number) => {
      'worklet';
      if (index === 0) return w0;
      if (index === 1) return w1;
      return w2;
    };

    const offsetBefore = (index: number) => {
      'worklet';
      if (index <= 0) return 0;
      if (index === 1) return w0;
      return w0 + w1;
    };

    const t = progress.value;
    const last = OPTIONS.length - 1;
    const idx = Math.min(Math.floor(t), last);
    const frac = idx >= last ? 0 : t - idx;
    const next = Math.min(idx + 1, last);

    const left = offsetBefore(idx) + (offsetBefore(next) - offsetBefore(idx)) * frac;
    const width = segmentWidth(idx) + (segmentWidth(next) - segmentWidth(idx)) * frac;

    return {
      opacity: 1,
      width,
      transform: [{ translateX: left }],
    };
  });

  return (
    <View className="relative rounded-2xl bg-surface p-1.5">
      <View className="relative flex-row">
        <Animated.View
          pointerEvents="none"
          className="absolute bottom-0 left-0 top-0 rounded-lg bg-active"
          style={pillStyle}
        />

        {OPTIONS.map((option, index) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: value === option.value }}
            accessibilityLabel={`Appearance: ${option.label.replace('\u00A0', ' ')}`}
            onPress={() => {
              if (option.value === value) return;
              void Haptics.selectionAsync();
              onChange(option.value);
            }}
            onLayout={(event) => {
              const width = event.nativeEvent.layout.width;
              setSegmentWidths((current) => {
                if (current[index] === width) return current;
                const next = [...current];
                next[index] = width;
                return next;
              });
            }}
            style={{ flex: index === 2 ? 1.28 : 1 }}
            className="min-w-0 items-center justify-center rounded-lg px-1 py-2.5 active:opacity-90"
          >
            <SegmentLabel label={option.label} index={index} progress={progress} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
