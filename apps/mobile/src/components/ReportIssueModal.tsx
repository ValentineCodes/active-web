import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  type ReportIssueOption,
  SOMETHING_ELSE_ISSUE_ID,
} from '@/features/support/report-issue-options';
import { pickRequestPhotos } from '@/features/requests/request-media';
import { poppinsInputTypography } from '@/theme/fonts';
import { useColors } from '@/theme';

const MAX_PHOTOS = 3;
const THUMB_SIZE = 96;

export type ReportIssueSubmitPayload = {
  issueId: string;
  issueLabel: string;
  comment: string;
  photoUris: string[];
};

type Props = {
  visible: boolean;
  issues: ReportIssueOption[];
  onClose: () => void;
  onSubmit: (payload: ReportIssueSubmitPayload) => void;
};

export function ReportIssueModal({ visible, issues, onClose, onSubmit }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [pickingPhotos, setPickingPhotos] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const reset = () => {
    setSelectedId(null);
    setComment('');
    setPhotoUris([]);
    setPickError(null);
  };

  const selectedIssue = issues.find((issue) => issue.id === selectedId) ?? null;
  const requiresComment = selectedId === SOMETHING_ELSE_ISSUE_ID;
  const canSend = selectedIssue !== null && (!requiresComment || comment.trim().length > 0);
  const showDetails = selectedId !== null;

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSend = () => {
    if (!selectedIssue || !canSend) return;
    onSubmit({
      issueId: selectedIssue.id,
      issueLabel: selectedIssue.label,
      comment: comment.trim(),
      photoUris,
    });
    reset();
  };

  const handleAddPhotos = async () => {
    if (photoUris.length >= MAX_PHOTOS) return;
    setPickError(null);
    try {
      setPickingPhotos(true);
      const result = await pickRequestPhotos(MAX_PHOTOS - photoUris.length);
      if (result.canceled || !result.assets?.length) return;
      const nextUris = result.assets.map((asset) => asset.uri).filter(Boolean) as string[];
      setPhotoUris((current) => [...current, ...nextUris].slice(0, MAX_PHOTOS));
    } catch (error) {
      setPickError(error instanceof Error ? error.message : 'Could not add photos.');
    } finally {
      setPickingPhotos(false);
    }
  };

  const commentTypography = poppinsInputTypography('regular', 'base', { multiline: true });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      statusBarTranslucent={Platform.OS === 'android'}
      onRequestClose={handleClose}
    >
      <SafeAreaView edges={['top']} className="flex-1 bg-surface">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="border-b border-hairline bg-surface">
            <View className="flex-row items-center justify-between px-4 pb-3 pt-2">
              <Pressable
                onPress={handleClose}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                hitSlop={8}
                className="min-w-[72px] py-1 active:opacity-70"
              >
                <Text className="text-lg text-info">Cancel</Text>
              </Pressable>
              <Text className="text-base font-semibold text-ink">Report an Issue</Text>
              <Pressable
                onPress={handleSend}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel="Send report"
                accessibilityState={{ disabled: !canSend }}
                hitSlop={8}
                className="min-w-[72px] items-end py-1 active:opacity-70"
              >
                <Text className={`text-lg font-semibold ${canSend ? 'text-ink' : 'text-subtle'}`}>
                  Send
                </Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-5 px-5 pb-8 pt-5"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 16 }}
          >
            <Text className="text-2xl font-bold leading-8 text-ink">
              What issue do you want to report?
            </Text>

            <View className="overflow-hidden rounded-2xl bg-elevated">
              {issues.map((issue, index) => {
                const selected = issue.id === selectedId;
                return (
                  <View key={issue.id}>
                    {index > 0 ? <View className="ml-4 h-px bg-hairline" /> : null}
                    <Pressable
                      onPress={() => setSelectedId(issue.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className="flex-row items-center justify-between px-4 py-4 active:opacity-90"
                    >
                      <Text className="flex-1 pr-3 text-lg text-ink">{issue.label}</Text>
                      {selected ? (
                        <Ionicons name="checkmark" size={22} color={colors.info} />
                      ) : null}
                    </Pressable>
                  </View>
                );
              })}
            </View>

            {showDetails ? (
              <View className="rounded-2xl bg-elevated">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="flex-row items-center gap-3 p-4"
                  keyboardShouldPersistTaps="handled"
                >
                  {photoUris.length < MAX_PHOTOS ? (
                    <Pressable
                      onPress={() => void handleAddPhotos()}
                      disabled={pickingPhotos}
                      accessibilityRole="button"
                      accessibilityLabel="Add photo"
                      className="shrink-0 items-center justify-center gap-1 rounded-xl bg-surface active:opacity-90"
                      style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
                    >
                      {pickingPhotos ? (
                        <ActivityIndicator color={colors.subtle} />
                      ) : (
                        <>
                          <Ionicons name="camera-outline" size={28} color={colors.subtle} />
                          <Text className="text-xs text-subtle">Add Photo</Text>
                        </>
                      )}
                    </Pressable>
                  ) : null}
                  {photoUris.map((uri, index) => (
                    <View
                      key={`${uri}-${index}`}
                      className="shrink-0 overflow-hidden rounded-xl bg-surface"
                      style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
                    >
                      <Image
                        source={{ uri }}
                        style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
                        contentFit="cover"
                      />
                      <Pressable
                        onPress={() =>
                          setPhotoUris((current) =>
                            current.filter((_, rowIndex) => rowIndex !== index),
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel="Remove photo"
                        className="absolute right-1 top-1 z-10 h-7 w-7 items-center justify-center rounded-full bg-ink/80"
                      >
                        <Ionicons name="close" size={16} color={colors.canvas} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
                <View className="mx-4 h-px bg-hairline" />
                <TextInput
                  accessibilityLabel="Add a comment"
                  placeholder="Add a comment"
                  placeholderTextColor={colors.subtle}
                  value={comment}
                  onChangeText={setComment}
                  multiline
                  textAlignVertical="top"
                  className="min-h-28 px-4 py-4 text-ink"
                  style={commentTypography}
                />
              </View>
            ) : null}

            {pickError ? <Text className="text-sm text-danger">{pickError}</Text> : null}

            {showDetails ? (
              <View className="gap-3">
                <Text className="text-sm leading-5 text-muted">
                  Add any information that can help us when we review your report. Do not include
                  personal information in your comments or photos.
                </Text>
                <Text className="text-sm leading-5 text-muted">
                  Your report will be associated with your Active account. We use reports to improve
                  the service and to follow up when needed.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {}}
                  className="self-start active:opacity-80"
                >
                  <Text className="text-sm text-info">See how your data is managed…</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
