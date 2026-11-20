import { Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/cn';

export type ProjectDetailTab = 'response' | 'assignments' | 'activity';

const MANAGER_TABS: { id: ProjectDetailTab; label: string }[] = [
  { id: 'assignments', label: 'Responses' },
  { id: 'activity', label: 'Activity' },
];

const WORKER_TABS: { id: ProjectDetailTab; label: string }[] = [
  { id: 'response', label: 'Response' },
  { id: 'activity', label: 'Activity' },
];

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

  return (
    <View className="flex-row justify-center gap-7">
      {visibleTabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.id)}
            className="relative px-3 pb-3 pt-1 active:opacity-90"
          >
            <Text
              className={cn(
                'text-sm',
                selected ? 'font-bold text-ink' : 'font-semibold text-subtle opacity-55',
              )}
            >
              {tab.label}
            </Text>
            {selected ? (
              <View className="absolute bottom-0 left-0 right-0 items-center">
                <View className="h-0.5 w-7 rounded-full bg-ink" />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}