import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useColors } from '@/theme';

export type InboxFilter = 'all' | 'unread';

const OPTIONS: { value: InboxFilter; accessibilityLabel: string }[] = [
  { value: 'all', accessibilityLabel: 'Show all notifications' },
  { value: 'unread', accessibilityLabel: 'Show unread only' },
];

function FilterSegmentLabel({
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
    const emphasis = index === 0 ? 1 - progress.value : progress.value;
    return {
      color: interpolateColor(emphasis, [0, 1], [colors.muted, colors.ink]),
    };
  });

  return (
    <Animated.Text className="text-sm font-semibold capitalize" style={textStyle}>
      {label}
    </Animated.Text>
  );
}

export function NotificationInboxFilter({
  value,
  onChange,
}: {
  value: InboxFilter;
  onChange: (next: InboxFilter) => void;
}) {
  const [segmentWidths, setSegmentWidths] = useState([0, 0]);
  const progress = useSharedValue(value === 'all' ? 0 : 1);
  const firstWidth = useSharedValue(0);
  const secondWidth = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(value === 'all' ? 0 : 1, { duration: 220 });
  }, [progress, value]);

  useEffect(() => {
    firstWidth.value = segmentWidths[0] ?? 0;
    secondWidth.value = segmentWidths[1] ?? 0;
  }, [firstWidth, secondWidth, segmentWidths]);

  const pillStyle = useAnimatedStyle(() => {
    const w0 = firstWidth.value;
    const w1 = secondWidth.value;
    if (w0 === 0 || w1 === 0) {
      return { opacity: 0, width: 0, transform: [{ translateX: 0 }] };
    }

    const t = progress.value;
    return {
      opacity: 1,
      width: w0 + (w1 - w0) * t,
      transform: [{ translateX: w0 * t }],
    };
  });

  return (
    <View className="relative flex-row rounded-full bg-surface p-1">
      <Animated.View
        pointerEvents="none"
        className="absolute bottom-1 left-1 top-1 rounded-full bg-elevated"
        style={pillStyle}
      />
      {OPTIONS.map((option, index) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityState={{ selected: value === option.value }}
          accessibilityLabel={option.accessibilityLabel}
          onPress={() => {
            if (option.value === value) return;
            Haptics.selectionAsync();
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
          className="rounded-full px-4 py-2 active:opacity-90"
        >
          <FilterSegmentLabel label={option.value} index={index} progress={progress} />
        </Pressable>
      ))}
    </View>
  );
}
