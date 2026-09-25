import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCatalogueMediaUrl } from '@/features/profile/catalogue-api';
import { colors } from '@/theme';

function CatalogueVideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.play();
  });

  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      style={{ flex: 1, width: '100%' }}
    />
  );
}

function CatalogueViewerBody({
  item,
  index,
  count,
  onClose,
  onPrev,
  onNext,
}: {
  item: { path: string; kind: 'photo' | 'video' };
  index: number;
  count: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const insets = useSafeAreaInsets();
  const url = useCatalogueMediaUrl(item.path);

  return (
    <View
      className="flex-1 bg-ink"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-sm font-medium text-canvas">
          {index + 1} / {count}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
        >
          <Ionicons name="close" size={28} color={colors.canvas} />
        </Pressable>
      </View>

      <View className="flex-1">
        {url.isPending ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.canvas} />
          </View>
        ) : null}
        {url.data && item.kind === 'photo' ? (
          <Image source={{ uri: url.data }} style={{ flex: 1 }} contentFit="contain" />
        ) : null}
        {url.data && item.kind === 'video' ? <CatalogueVideoPlayer uri={url.data} /> : null}
      </View>

      {count > 1 ? (
        <View className="flex-row items-center justify-between px-6 py-4">
          <Pressable
            onPress={onPrev}
            disabled={index === 0}
            accessibilityRole="button"
            accessibilityLabel="Previous"
            className={index === 0 ? 'opacity-30' : 'opacity-100'}
          >
            <Ionicons name="chevron-back" size={32} color={colors.canvas} />
          </Pressable>
          <Pressable
            onPress={onNext}
            disabled={index === count - 1}
            accessibilityRole="button"
            accessibilityLabel="Next"
            className={index === count - 1 ? 'opacity-30' : 'opacity-100'}
          >
            <Ionicons name="chevron-forward" size={32} color={colors.canvas} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function CatalogueViewer({
  items,
  initialIndex,
  onClose,
}: {
  items: { path: string; kind: 'photo' | 'video' }[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const item = items[index];
  if (!item) return null;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <CatalogueViewerBody
        item={item}
        index={index}
        count={items.length}
        onClose={onClose}
        onPrev={() => setIndex((current) => Math.max(0, current - 1))}
        onNext={() => setIndex((current) => Math.min(items.length - 1, current + 1))}
      />
    </Modal>
  );
}
