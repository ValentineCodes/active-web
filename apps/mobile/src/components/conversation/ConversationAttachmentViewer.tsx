import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RequestMessageAttachment } from '@/features/requests/conversation-message-model';
import { useConversationAttachmentUrl } from '@/features/requests/conversation-attachment-url';
import { useColors } from '@/theme';

function ConversationVideoPlayer({ uri }: { uri: string }) {
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

function GalleryImagePage({
  attachment,
  pageWidth,
  pageHeight,
}: {
  attachment: RequestMessageAttachment;
  pageWidth: number;
  pageHeight: number;
}) {
  const colors = useColors();
  const hasStorage = attachment.storagePath.length > 0;
  const localPreviewUri = attachment.localPreviewUri;
  const signedUrl = useConversationAttachmentUrl(hasStorage ? attachment.storagePath : null);
  const displayUri =
    signedUrl.data ??
    (localPreviewUri && (signedUrl.isPending || signedUrl.isError) ? localPreviewUri : null);
  const label = attachment.fileName ?? 'Image attachment';

  if (!displayUri && signedUrl.isPending) {
    return (
      <View
        className="items-center justify-center"
        style={{ width: pageWidth, height: pageHeight }}
      >
        <ActivityIndicator color={colors.canvas} />
      </View>
    );
  }

  if (!displayUri) {
    return (
      <View
        className="items-center justify-center px-6"
        style={{ width: pageWidth, height: pageHeight }}
      >
        <Text className="text-center text-sm text-canvas">Could not load this image.</Text>
      </View>
    );
  }

  return (
    <View className="items-center justify-center" style={{ width: pageWidth, height: pageHeight }}>
      <Image
        source={{ uri: displayUri }}
        accessibilityLabel={label}
        style={{ width: pageWidth, height: pageHeight }}
        contentFit="contain"
      />
    </View>
  );
}

export function ConversationImageGalleryViewer({
  attachments,
  initialIndex,
  onClose,
}: {
  attachments: RequestMessageAttachment[];
  initialIndex: number;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const listRef = useRef<FlatList<RequestMessageAttachment>>(null);
  const [pageIndex, setPageIndex] = useState(initialIndex);
  const headerHeight = 52;
  const pageHeight = windowHeight - insets.top - insets.bottom - headerHeight;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View
        className="flex-1 bg-ink"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View
          className="flex-row items-center justify-between px-4"
          style={{ height: headerHeight }}
        >
          <Text className="min-w-12 text-sm font-medium text-canvas">
            {attachments.length > 1 ? `${pageIndex + 1} / ${attachments.length}` : ''}
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
          <FlatList
            ref={listRef}
            data={attachments}
            horizontal
            pagingEnabled
            bounces={false}
            overScrollMode="never"
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            keyExtractor={(item) => item.id}
            initialScrollIndex={initialIndex > 0 ? initialIndex : undefined}
            getItemLayout={(_, index) => ({
              length: windowWidth,
              offset: windowWidth * index,
              index,
            })}
            onScrollToIndexFailed={() => {
              listRef.current?.scrollToOffset({
                offset: windowWidth * initialIndex,
                animated: false,
              });
            }}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / windowWidth);
              setPageIndex(nextIndex);
            }}
            renderItem={({ item }) => (
              <GalleryImagePage attachment={item} pageWidth={windowWidth} pageHeight={pageHeight} />
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

export function ConversationAttachmentViewer({
  visible,
  kind,
  signedUrl,
  accessibilityLabel,
  onClose,
}: {
  visible: boolean;
  kind: 'image' | 'video';
  signedUrl: string | null;
  accessibilityLabel: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View
        className="flex-1 bg-ink"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className="flex-row items-center justify-end px-4 py-3">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <Ionicons name="close" size={28} color={colors.canvas} />
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center">
          {!signedUrl ? (
            <ActivityIndicator color={colors.canvas} />
          ) : kind === 'image' ? (
            <Image
              source={{ uri: signedUrl }}
              accessibilityLabel={accessibilityLabel}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
            />
          ) : (
            <View className="h-full w-full">
              <ConversationVideoPlayer uri={signedUrl} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
