import { useEventListener } from 'expo';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import { Button } from '@/components/ui/Button';
import type { CompletionProofStagedMedia } from '@/features/requests/send-completion-proof-message';
import { mapConversationAttachmentError } from '@/features/requests/conversation-attachment-policy';
import {
  recordConversationVideo,
  takeConversationPhoto,
  type ConversationPickedAttachment,
} from '@/features/requests/conversation-media';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type CompletionProofSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type SheetStep = 'pickKind' | 'preview';

function ProofVideoPreview({ uri, width }: { uri: string; width: number }) {
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

  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      style={{ width, height, backgroundColor: '#000' }}
    />
  );
}

function MediaKindRow({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className="flex-row items-center gap-4 rounded-2xl py-3 active:opacity-80"
      style={disabled ? { opacity: 0.45 } : undefined}
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-active-soft">
        <Ionicons name={icon} size={22} color={colors.active} />
      </View>
      <Text className="text-base font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}

export type CompletionProofFailure = {
  phase: 'upload' | 'send';
  message: string;
};

type Props = {
  busy: boolean;
  failure: CompletionProofFailure | null;
  onSkip: () => void;
  onSendProof: (staged: CompletionProofStagedMedia) => void | Promise<void>;
  onStageMedia: (
    localFile: ConversationPickedAttachment,
    kindHint: 'image' | 'video',
  ) => Promise<CompletionProofStagedMedia>;
  onDiscardPreview: () => void;
  onDismiss?: () => void;
};

export const CompletionProofSheet = forwardRef<CompletionProofSheetHandle, Props>(
  function CompletionProofSheet(
    { busy, failure, onSkip, onSendProof, onStageMedia, onDiscardPreview, onDismiss },
    ref,
  ) {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useWindowDimensions();
    const sheetRef = useRef<BottomSheetModal>(null);
    const previewWidth = Math.min(windowWidth - 40, 360);

    const [step, setStep] = useState<SheetStep>('pickKind');
    const [staged, setStaged] = useState<CompletionProofStagedMedia | null>(null);
    const [capturing, setCapturing] = useState(false);

    const snapPoints = useMemo(() => (step === 'preview' ? ['72%'] : ['52%']), [step]);

    const resetSheet = useCallback(() => {
      setStep('pickKind');
      setStaged(null);
      setCapturing(false);
    }, []);

    useImperativeHandle(ref, () => ({
      present: () => {
        resetSheet();
        sheetRef.current?.present();
      },
      dismiss: () => {
        sheetRef.current?.dismiss();
      },
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.45}
          pressBehavior={busy || capturing ? 'none' : 'close'}
        />
      ),
      [busy, capturing],
    );

    const handleDismiss = useCallback(() => {
      resetSheet();
      onDismiss?.();
    }, [onDismiss, resetSheet]);

    const runCapture = useCallback(
      async (kind: 'image' | 'video') => {
        if (busy || capturing) return;

        setCapturing(true);
        try {
          const picked =
            kind === 'image' ? await takeConversationPhoto() : await recordConversationVideo();
          if (!picked) {
            return;
          }

          const next = await onStageMedia(picked, kind);
          setStaged(next);
          setStep('preview');
        } catch (error) {
          showAppToast(mapConversationAttachmentError(error), 'warning');
        } finally {
          setCapturing(false);
        }
      },
      [busy, capturing, onStageMedia],
    );

    const discardPreview = useCallback(() => {
      if (busy) return;
      setStaged(null);
      setStep('pickKind');
      onDiscardPreview();
    }, [busy, onDiscardPreview]);

    const handleSkip = useCallback(() => {
      if (busy || capturing) return;
      onSkip();
    }, [busy, capturing, onSkip]);

    const handleSendProof = useCallback(() => {
      if (busy || capturing || !staged) return;
      void onSendProof(staged);
    }, [busy, capturing, onSendProof, staged]);

    return (
      <BottomSheetModal
        ref={sheetRef}
        containerComponent={BottomSheetWindow}
        snapPoints={snapPoints}
        enablePanDownToClose={!busy && !capturing}
        onDismiss={handleDismiss}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.elevated }}
        handleIndicatorStyle={{ backgroundColor: colors.hairline, width: 48, height: 4 }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: insets.bottom + 20,
          }}
        >
          {step === 'pickKind' ? (
            <View className="gap-5">
              <View className="gap-2">
                <Text className="text-xl font-bold text-ink">Prove it</Text>
                <Text className="text-base text-muted">
                  Show the requester the work you&apos;ve completed.
                </Text>
              </View>

              {capturing ? (
                <View className="items-center gap-2 py-6">
                  <ActivityIndicator color={colors.active} />
                  <Text className="text-sm text-muted">Opening camera…</Text>
                </View>
              ) : (
                <View className="gap-1">
                  <MediaKindRow
                    icon="camera-outline"
                    label="Take photo"
                    disabled={busy}
                    onPress={() => void runCapture('image')}
                  />
                  <MediaKindRow
                    icon="videocam-outline"
                    label="Record video"
                    disabled={busy}
                    onPress={() => void runCapture('video')}
                  />
                </View>
              )}

              <Button
                label="Skip for now"
                variant="secondary"
                size="lg"
                disabled={busy || capturing}
                onPress={handleSkip}
              />
            </View>
          ) : null}

          {step === 'preview' && staged ? (
            <View className="gap-5">
              <Text className="text-xl font-bold text-ink">Preview</Text>

              {failure ? (
                <View className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3">
                  <Text className="text-sm font-semibold text-danger">
                    {failure.phase === 'upload' ? 'Upload failed' : 'Could not send message'}
                  </Text>
                  <Text className="mt-1 text-sm text-muted">{failure.message}</Text>
                  <Text className="mt-2 text-sm text-muted">
                    {failure.phase === 'upload'
                      ? 'Your photo or video was not sent. Tap Send proof to try uploading again.'
                      : 'Your media is saved. Tap Send proof to try sending the chat message again.'}
                  </Text>
                </View>
              ) : null}

              <View className="overflow-hidden rounded-2xl bg-black">
                {staged.kindHint === 'image' ? (
                  <Image
                    source={{ uri: staged.prepared.localUri }}
                    accessibilityLabel="Completion proof photo preview"
                    style={{ width: previewWidth, height: Math.round(previewWidth * 0.75) }}
                    contentFit="contain"
                  />
                ) : (
                  <ProofVideoPreview uri={staged.prepared.localUri} width={previewWidth} />
                )}
              </View>

              <View className="flex-row gap-3">
                <Button
                  label="Discard"
                  variant="secondary"
                  className="flex-1"
                  disabled={busy}
                  onPress={discardPreview}
                />
                <Button
                  label={failure ? 'Retry' : 'Send proof'}
                  className="flex-1"
                  size="lg"
                  loading={busy}
                  disabled={busy}
                  onPress={handleSendProof}
                />
              </View>
            </View>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);
