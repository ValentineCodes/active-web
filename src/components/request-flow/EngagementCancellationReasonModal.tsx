import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import {
  ENGAGEMENT_CANCELLATION_REASONS,
  ENGAGEMENT_CANCELLATION_SOMETHING_ELSE_ID,
  resolveEngagementCancellationReasonText,
} from '@/features/support/engagement-cancellation-reasons';
import { useColors } from '@/theme';

export type EngagementCancellationReasonMode = 'provider_immediate' | 'client_request';

type Props = {
  visible: boolean;
  mode: EngagementCancellationReasonMode;
  loading: boolean;
  onClose: () => void;
  onSubmit: (reason: string | null) => void;
};

export function EngagementCancellationReasonModal({
  visible,
  mode,
  loading,
  onClose,
  onSubmit,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');
  const customError = customText.trim().length > 500 ? 'Keep this to 500 characters.' : null;

  const requiresCustom =
    selectedId === ENGAGEMENT_CANCELLATION_SOMETHING_ELSE_ID &&
    customText.trim().length === 0;

  const resolvedReason = resolveEngagementCancellationReasonText({
    selectedId,
    customText,
  });

  const canSubmit = selectedId !== null && !customError && !requiresCustom;

  const reset = () => {
    setSelectedId(null);
    setCustomText('');
  };

  const handleClose = () => {
    if (loading) return;
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (!canSubmit || loading) return;
    onSubmit(resolvedReason);
  };

  const title =
    mode === 'provider_immediate' ? 'Cancel this engagement' : 'Request cancellation';
  const intro =
    mode === 'provider_immediate'
      ? 'This takes effect immediately. The client will be notified and any held payment will be returned. You do not need their approval.'
      : 'Your helper must agree before the engagement ends. If they do not respond within 24 hours, the engagement will be cancelled automatically and held payment will be returned.';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="flex-row items-center justify-between border-b border-hairline px-5 py-3">
            <Pressable accessibilityRole="button" onPress={handleClose} hitSlop={12}>
              <Text className="text-base font-semibold text-active">Close</Text>
            </Pressable>
            <Text className="text-base font-bold text-ink">{title}</Text>
            <View className="w-12" />
          </View>

          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-5 p-5"
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-base text-muted">{intro}</Text>

            <View className="gap-2">
              <Text className="text-sm font-semibold text-ink">Reason</Text>
              {ENGAGEMENT_CANCELLATION_REASONS.map((option) => {
                const selected = selectedId === option.id;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    disabled={loading}
                    onPress={() => setSelectedId(option.id)}
                    className={`flex-row items-center justify-between rounded-xl border px-4 py-3 ${
                      selected ? 'border-active bg-active/5' : 'border-hairline bg-elevated'
                    }`}
                  >
                    <Text className="text-base text-ink">{option.label}</Text>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={22} color={colors.active} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            {selectedId === ENGAGEMENT_CANCELLATION_SOMETHING_ELSE_ID ? (
              <TextField
                label="Tell us more"
                value={customText}
                onChangeText={setCustomText}
                placeholder="What changed?"
                multiline
                numberOfLines={3}
                maxLength={500}
                counterMax={500}
                error={customError}
              />
            ) : null}
          </ScrollView>

          <View
            className="gap-3 border-t border-hairline px-5 pt-4"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            <Button
              label={mode === 'provider_immediate' ? 'Cancel engagement' : 'Send request'}
              variant="danger"
              size="lg"
              loading={loading}
              disabled={!canSubmit}
              onPress={handleSubmit}
            />
            {loading ? (
              <View className="flex-row items-center justify-center gap-2">
                <ActivityIndicator />
                <Text className="text-sm text-muted">Submitting…</Text>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
