import { useEventListener } from 'expo';
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import { useAvatarUrl } from '@/features/profile/api';
import { useCatalogueMediaUrl } from '@/features/profile/catalogue-api';
import { useColors } from '@/theme';

export type CatalogueViewerItem = {
  path: string;
  kind: 'photo' | 'video';
  /** Defaults to catalogue media; use `avatar` for profile photos. */
  storage?: 'catalogue' | 'avatar';
};

const VIDEO_VIEWER_BACKGROUND = '#000000';

function CatalogueVideoPlayer({ uri, width }: { uri: string; width: number }) {
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const player = useVideoPlayer(uri);
  const height = Math.round(width / aspectRatio);

  useEventListener(player, 'sourceLoad', (payload) => {
    const track = payload.availableVideoTracks[0];
    const size = track?.size;
    if (size && size.width > 0 && size.height > 0) {
      setAspectRatio(size.width / size.height);
    }
  });

  useEventListener(player, 'videoTrackChange', (payload) => {
    const size = payload.videoTrack?.size;
    if (size && size.width > 0 && size.height > 0) {
      setAspectRatio(size.width / size.height);
    }
  });

  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      style={{ width, height, backgroundColor: VIDEO_VIEWER_BACKGROUND }}
    />
  );
}

function CatalogueStackedItem({
  item,
  width,
  onHeight,
}: {
  item: CatalogueViewerItem;
  width: number;
  onHeight: (height: number) => void;
}) {
  const storage = item.storage ?? 'catalogue';
  const catalogueUrl = useCatalogueMediaUrl(storage === 'catalogue' ? item.path : null);
  const avatarUrl = useAvatarUrl(storage === 'avatar' ? item.path : null);
  const url = storage === 'avatar' ? avatarUrl : catalogueUrl;
  const colors = useColors();
  const [photoAspectRatio, setPhotoAspectRatio] = useState<number | null>(null);

  const photoHeight =
    photoAspectRatio != null ? Math.round(width / photoAspectRatio) : Math.round(width);

  const rowBackground = item.kind === 'video' ? VIDEO_VIEWER_BACKGROUND : colors.canvas;

  return (
    <View
      style={{ width, backgroundColor: rowBackground }}
      onLayout={(e) => {
        onHeight(e.nativeEvent.layout.height);
      }}
    >
      {url.data && item.kind === 'photo' ? (
        <Image
          source={{ uri: url.data }}
          style={{
            width,
            ...(photoAspectRatio != null
              ? { height: photoHeight }
              : { height: Math.round(width) }),
          }}
          contentFit="contain"
          onLoad={(e) => {
            const { width: w, height: h } = e.source;
            if (w > 0 && h > 0) {
              setPhotoAspectRatio(w / h);
            }
          }}
        />
      ) : null}
      {url.data && item.kind === 'video' ? (
        <CatalogueVideoPlayer uri={url.data} width={width} />
      ) : null}
    </View>
  );
}

function CatalogueViewerBody({
  items,
  initialIndex,
  onClose,
}: {
  items: CatalogueViewerItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [itemHeights, setItemHeights] = useState<number[]>(() => items.map(() => 0));
  const headerHeight = 52;

  const setItemHeight = (index: number, height: number) => {
    setItemHeights((prev) => {
      if (prev[index] === height) return prev;
      const next = [...prev];
      next[index] = height;
      return next;
    });
  };

  useEffect(() => {
    if (initialIndex <= 0) return;

    let offset = 0;
    for (let i = 0; i < initialIndex; i++) {
      const h = itemHeights[i];
      if (!h) return;
      offset += h;
    }

    scrollRef.current?.scrollTo({ y: offset, animated: false });
  }, [initialIndex, itemHeights]);

  return (
    <View
      className="flex-1"
      style={{
        backgroundColor: colors.canvas,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <View className="flex-row items-center justify-end px-4" style={{ height: headerHeight }}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
        >
          <Ionicons name="close" size={28} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        showsVerticalScrollIndicator
        style={{ backgroundColor: colors.canvas }}
        contentContainerStyle={{ width: windowWidth, backgroundColor: colors.canvas }}
      >
        {items.map((item, index) => (
          <CatalogueStackedItem
            key={`${item.storage ?? 'catalogue'}:${item.path}`}
            item={item}
            width={windowWidth}
            onHeight={(height) => setItemHeight(index, height)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

export function CatalogueViewer({
  items,
  initialIndex,
  onClose,
}: {
  items: CatalogueViewerItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const colors = useColors();

  if (items.length === 0) return null;

  const body = (
    <CatalogueViewerBody items={items} initialIndex={initialIndex} onClose={onClose} />
  );

  if (Platform.OS === 'ios') {
    return (
      <BottomSheetWindow>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }]}>
          {body}
        </View>
      </BottomSheetWindow>
    );
  }

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }]}>{body}</View>
    </Modal>
  );
}
