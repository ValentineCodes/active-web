import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useColors } from '@/theme';

export type ProjectDetailTab = 'response' | 'assignments' | 'activity';

const INDICATOR_WIDTH = 28;

const MANAGER_TABS: { id: ProjectDetailTab; label: string }[] = [
  { id: 'assignments', label: 'Responses' },
  { id: 'activity', label: 'Activity' },
];

const WORKER_TABS: { id: ProjectDetailTab; label: string }[] = [
  { id: 'response', label: 'Response' },
  { id: 'activity', label: 'Activity' },
];

function TabLabel({
  label,
  index,
  progress,
  selected,
}: {
  label: string;
  index: number;
  progress: SharedValue<number>;
  selected: boolean;
}) {
  const colors = useColors();
  const textStyle = useAnimatedStyle(() => {
    const distance = Math.abs(progress.value - index);
    const emphasis = Math.max(0, 1 - Math.min(distance, 1));
    return {
      color: interpolateColor(emphasis, [0, 1], [colors.subtle, colors.ink]),
      opacity: selected ? 1 : 0.55 + emphasis * 0.45,
    };
  });

  return (
    <Animated.Text
      className={selected ? 'text-sm font-bold' : 'text-sm font-semibold'}
      style={textStyle}
    >
      {label}
    </Animated.Text>
  );
}

export function ProjectDetailTabs({
  active,
  onChange,
  showAssignments,
  showResponse,
}: {
  active: ProjectDetailTab;
  onChange: (tab: ProjectDetailTab) => void;
  showAssignments: boolean;
  showResponse: boolean;
}) {
  const visibleTabs = showResponse
    ? WORKER_TABS
    : showAssignments
      ? MANAGER_TABS
      : MANAGER_TABS.filter((tab) => tab.id !== 'assignments');

  const [tabCenters, setTabCenters] = useState<number[]>([]);
  const indicatorLeft = useSharedValue(0);
  const indicatorReady = useSharedValue(0);
  const progress = useSharedValue(visibleTabs.findIndex((tab) => tab.id === active));

  const activeIndex = Math.max(0, visibleTabs.findIndex((tab) => tab.id === active));

  useEffect(() => {
    progress.value = withTiming(activeIndex, { duration: 220 });
  }, [activeIndex, progress]);

  useEffect(() => {
    setTabCenters([]);
  }, [visibleTabs.length]);

  useEffect(() => {
    const center = tabCenters[activeIndex];
    if (center == null || !Number.isFinite(center)) {
      indicatorReady.value = 0;
      return;
    }
    indicatorLeft.value = withTiming(center - INDICATOR_WIDTH / 2, { duration: 220 });
    indicatorReady.value = 1;
  }, [activeIndex, indicatorLeft, indicatorReady, tabCenters]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: indicatorReady.value,
    width: INDICATOR_WIDTH,
    transform: [{ translateX: indicatorLeft.value }],
  }));

  return (
    <View className="relative w-full">
      <Animated.View
        pointerEvents="none"
        className="absolute bottom-0 left-0 h-0.5 rounded-full bg-ink"
        style={indicatorStyle}
      />
      <View className="w-full flex-row justify-center gap-7">
        {visibleTabs.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(tab.id)}
              onLayout={(event) => {
                const { x, width } = event.nativeEvent.layout;
                const center = x + width / 2;
                setTabCenters((current) => {
                  const next = [...current];
                  next[index] = center;
                  return next;
                });
              }}
              className="relative px-3 pb-3 pt-1 active:opacity-90"
            >
              <TabLabel label={tab.label} index={index} progress={progress} selected={selected} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}