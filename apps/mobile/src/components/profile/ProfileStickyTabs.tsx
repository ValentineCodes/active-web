import { Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/cn';

export type ProfileHubTab = 'requests' | 'responses' | 'projects';

const TABS: { id: ProfileHubTab; label: string }[] = [
  { id: 'requests', label: 'Requests' },
  { id: 'responses', label: 'Responses' },
  { id: 'projects', label: 'Projects' },
];

export function ProfileStickyTabs({
  active,
  onChange,
}: {
  active: ProfileHubTab;
  onChange: (tab: ProfileHubTab) => void;
}) {
  return (
    <View className="-mx-5 flex-row border-b border-hairline bg-canvas px-2">
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.id)}
            className="min-h-11 flex-1 items-center justify-center py-2 active:opacity-90"
          >
            <Text className={cn('text-sm font-semibold', selected ? 'text-ink' : 'text-muted')}>
              {tab.label}
            </Text>
            {selected ? (
              <View className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}