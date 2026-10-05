import { Text, View } from 'react-native';

export function RequestTitleSection({
  title,
  description,
}: {
  title: string;
  description?: string | null;
}) {
  return (
    <View className="gap-2">
      <Text className="text-2xl font-bold leading-8 text-ink">{title}</Text>
      {description ? <Text className="text-base leading-6 text-muted">{description}</Text> : null}
    </View>
  );
}
