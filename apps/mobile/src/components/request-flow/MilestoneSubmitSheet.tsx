import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import { Button } from '@/components/ui/Button';
import { mapConversationAttachmentError } from '@/features/requests/conversation-attachment-policy';
import {
  recordConversationVideo,
  takeConversationPhoto,
} from '@/features/requests/conversation-media';
import {
  stageCompletionProofMedia,
  type CompletionProofStagedMedia,
} from '@/features/requests/send-completion-proof-message';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme';

export type MilestoneSubmitSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  milestoneTitle: string;
  milestonePosition: number;
  busy: boolean;
  onSubmit: (input: { message: string; staged: CompletionProofStagedMedia | null }) => void;
};

export const MilestoneSubmitSheet = forwardRef<MilestoneSubmitSheetHandle, Props>(
  function MilestoneSubmitSheet({ milestoneTitle, milestonePosition, busy, onSubmit }, ref) {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['75%'], []);
    const [message, setMessage] = useState('');
    const [staged, setStaged] = useState<CompletionProofStagedMedia | null>(null);
    const [capturing, setCapturing] = useState(false);

    const reset = useCallback(() => {
      setMessage('');
      setStaged(null);
      setCapturing(false);
    }, []);

    useImperativeHandle(ref, () => ({
      present: () => {
        reset();
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const addMedia = async (kind: 'image' | 'video') => {
      if (busy || capturing) return;
      setCapturing(true);
      try {
        const picked = kind === 'image' ? await takeConversationPhoto() : await recordConversationVideo();
        if (!picked) return;
        const next = await stageCompletionProofMedia(picked, kind);
        setStaged(next);
      } catch (error) {
        showAppToast(mapConversationAttachmentError(error), 'warning');
      } finally {
        setCapturing(false);
      }
    };

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose={!busy && !capturing}
        onDismiss={reset}
        backdropComponent={(props) => <BottomSheetWindow.Backdrop {...props} />}
        handleIndicatorStyle={{ backgroundColor: colors.hairline }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 16, gap: 16 }}
        >
          <View className="gap-1">
            <Text className="text-xl font-bold text-ink">Milestone {milestonePosition}</Text>
            <Text className="text-base font-semibold text-ink">{milestoneTitle}</Text>
          </View>
          <Text className="text-sm leading-5 text-muted">
            Optional message and photos post to chat with a [Milestone {milestonePosition}] label. You
            can also submit without them — use chat anytime to discuss changes.
          </Text>

          <View className="gap-2">
            <Text className="text-sm font-medium text-subtle">Message</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={4000}
              editable={!busy}
              placeholder="What you completed for this step…"
              placeholderTextColor={colors.muted}
              className="min-h-[100px] rounded-2xl border border-hairline bg-surface px-4 py-3 text-base text-ink"
              textAlignVertical="top"
            />
          </View>

          <View className="gap-2">
            <Text className="text-sm font-medium text-subtle">Photo or video (optional)</Text>
            {staged ? (
              <View className="gap-3">
                <View className="overflow-hidden rounded-2xl bg-black">
                  {staged.kindHint === 'image' ? (
                    <Image
                      source={{ uri: staged.localFile.uri }}
                      style={{ width: '100%', height: 192 }}
                      contentFit="contain"
                    />
                  ) : (
                    <Text className="p-4 text-sm text-on-brand">Video attached</Text>
                  )}
                </View>
                <Button
                  label="Remove attachment"
                  variant="secondary"
                  size="md"
                  disabled={busy}
                  onPress={() => setStaged(null)}
                />
              </View>
            ) : (
              <View className="flex-row gap-3">
                <Button
                  label="Photo"
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  disabled={busy || capturing}
                  onPress={() => void addMedia('image')}
                />
                <Button
                  label="Video"
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  disabled={busy || capturing}
                  onPress={() => void addMedia('video')}
                />
              </View>
            )}
          </View>

          <Button
            label="Submit for approval"
            variant="active"
            size="lg"
            loading={busy}
            onPress={() => onSubmit({ message, staged })}
          />
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);