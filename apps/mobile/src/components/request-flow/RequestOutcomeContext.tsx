import { Text, View } from 'react-native';

import { requestOutcomeDescription } from '@/features/requests/outcome';

/** Compact request outcome for chat and other secondary surfaces. */
export function RequestOutcomeContext({ description }: { description: string | null | undefined }) {
  const outcome = requestOutcomeDescription(description);
  if (!outcome) return null;

  return (
    <View className="border-b border-hairline bg-elevated px-4 py-3">
      <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
        What needs to be done
      </Text>
      <Text className="mt-1 text-sm leading-5 text-muted">{outcome}</Text>
    </View>
  );
}
