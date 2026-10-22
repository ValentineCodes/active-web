import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import {
  normalizeNinInput,
  submitNinErrorMessage,
  useSubmitNin,
  validateNinInput,
} from '@/features/identity/api';
import { useColors } from '@/theme';

export type NinSubmissionSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  sheetRef: RefObject<BottomSheetModal | null>;
  onSubmitted: () => void;
  onDismissWithoutSubmit?: () => void;
};

export function NinSubmissionSheet({ sheetRef, onSubmitted, onDismissWithoutSubmit }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const submit = useSubmitNin();
  const [nin, setNin] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const snapPoints = useMemo(() => ['72%'], []);

  const validationError = nin.length > 0 ? validateNinInput(nin) : null;
  const canSubmit = consent && validateNinInput(nin) === null && !submit.isPending;

  const submittedRef = useRef(false);

  const resetForm = useCallback(() => {
    setNin('');
    setConsent(false);
    setSubmitError(null);
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.45} />
    ),
    [],
  );

  const onChangeText = (value: string) => {
    setSubmitError(null);
    setNin(normalizeNinInput(value));
  };

  const handleSubmit = async () => {
    const clientError = validateNinInput(nin);
    if (clientError) {
      setSubmitError(clientError);
      return;
    }
    if (!consent) {
      setSubmitError('Please agree to how we use your NIN before continuing.');
      return;
    }

    setSubmitError(null);
    try {
      await submit.mutateAsync({ nin, consent: true });
      submittedRef.current = true;
      resetForm();
      sheetRef.current?.dismiss();
      onSubmitted();
    } catch (error) {
      setSubmitError(submitNinErrorMessage(error));
    }
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      containerComponent={BottomSheetWindow}
      snapPoints={snapPoints}
      enablePanDownToClose
      onDismiss={() => {
        if (!submittedRef.current) {
          onDismissWithoutSubmit?.();
        }
        submittedRef.current = false;
        resetForm();
      }}
      backdropComponent={renderBackdrop}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 pt-2">
          <View className="gap-2">
            <Text className="text-2xl font-bold text-ink">Verify your identity</Text>
            <Text className="text-base leading-6 text-muted">
              Nigerian regulations require us to confirm your identity before your first wallet
              withdrawal. Enter your 11-digit National Identification Number (NIN). We store it
              securely and do not verify it with NIMC in this version.
            </Text>
          </View>

          <TextField
            label="National Identification Number (NIN)"
            value={nin}
            onChangeText={onChangeText}
            placeholder="12345678901"
            keyboardType="number-pad"
            maxLength={11}
            autoComplete="off"
            textContentType="none"
            error={validationError ?? submitError}
          />

          <Pressable
            onPress={() => setConsent((current) => !current)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            className="flex-row items-start gap-3 active:opacity-90"
          >
            <View
              className={`mt-0.5 h-6 w-6 items-center justify-center rounded-md border ${
                consent ? 'border-active bg-active' : 'border-hairline bg-elevated'
              }`}
            >
              {consent ? <Ionicons name="checkmark" size={16} color={colors.canvas} /> : null}
            </View>
            <Text className="flex-1 text-sm leading-5 text-muted">
              I agree that Active may collect and securely store my NIN to process withdrawals and
              show a verified identity badge. I understand this is not a government identity check.
            </Text>
          </Pressable>

          <Button
            label="Save and continue"
            variant="active"
            size="lg"
            corner="2xl"
            loading={submit.isPending}
            disabled={!canSubmit}
            onPress={() => void handleSubmit()}
          />
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

export function useNinSubmissionSheetRef() {
  return useRef<BottomSheetModal>(null);
}
