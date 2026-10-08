import { Text, View } from 'react-native';

import { requestOutcomeDescription } from '@/features/requests/outcome';

export function RequestTitleSection({
  title,
  description,
}: {
  title: string;
  description: string | null | undefined;
}) {
  const outcome = requestOutcomeDescription(description);

  return (
    <View className="gap-2">
      <Text className="text-2xl font-bold leading-8 text-ink">{title}</Text>
      {outcome ? <Text className="text-base leading-6 text-muted">{outcome}</Text> : null}
    </View>
  );
}
