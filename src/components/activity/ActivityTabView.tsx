import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { ActivityMyRequestsTab } from '@/components/activity/ActivityMyRequestsTab';
import { ActivityMyResponsesTab } from '@/components/activity/ActivityMyResponsesTab';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme';

type ActivityTab = 'requests' | 'responses';

const tabs: { key: ActivityTab; label: string }[] = [
  { key: 'requests', label: 'My Requests' },
  { key: 'responses', label: 'My Responses' },
];

/** Material top tabs with horizontal swipe — no native ViewPager required. */
export function ActivityTabView() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const goToTab = (nextIndex: number) => {
    setIndex(nextIndex);
    scrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    if (nextIndex !== index) {
      setIndex(nextIndex);
    }
  };

  return (
    <View className="flex-1">
      <View className="flex-row">
        {tabs.map((tab, tabIndex) => {
          const selected = tabIndex === index;

          return (
            <Pressable
              key={tab.key}
              onPress={() => goToTab(tabIndex)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              className="flex-1 items-center gap-2 px-2 pb-3 pt-2"
            >
              <Text
                className={cn(
                  'text-center text-base font-semibold',
                  selected ? 'text-active' : 'text-subtle',
                )}
              >
                {tab.label}
              </Text>
              <View
                className="w-1/4 rounded-full"
                style={{
                  height: 1,
                  backgroundColor: selected ? colors.active : 'transparent',
                }}
              />
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
      >
        <View style={{ width, flex: 1 }}>
          <ActivityMyRequestsTab />
        </View>
        <View style={{ width, flex: 1 }}>
          <ActivityMyResponsesTab />
        </View>
      </ScrollView>
    </View>
  );
}
