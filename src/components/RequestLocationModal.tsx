import { Linking, Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme';

type RequestLocationModalProps = {
  visible: boolean;
  loading: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onShareLocation: () => void;
};

export function RequestLocationModal({
  visible,
  loading,
  errorMessage,
  onClose,
  onShareLocation,
}: RequestLocationModalProps) {
  const { colors, shadow } = useTheme();
  const permissionBlocked = errorMessage?.includes('Settings');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onClose}
        className="flex-1 justify-end bg-ink/40 px-5 pb-10 pt-16"
      >
        <Pressable
          accessibilityRole="none"
          onPress={(event) => event.stopPropagation()}
          style={shadow.raised}
          className="gap-5 rounded-3xl bg-canvas p-6"
        >
          <View className="h-14 w-14 items-center justify-center rounded-full bg-active-soft">
            <Ionicons name="location-outline" size={28} color={colors.active} />
          </View>

          <View className="gap-2">
            <Text className="font-serif text-2xl font-bold leading-8 text-ink">
              Location needed to post
            </Text>
            <Text className="text-base leading-6 text-muted">
              We use your location to match your request with people nearby. Nobody sees your exact
              address — only a rough area — until you pick someone to help.
            </Text>
          </View>

          {errorMessage ? (
            <Text className="text-sm leading-5 text-warning">{errorMessage}</Text>
          ) : null}

          <View className="gap-3">
            <Button
              label={loading ? 'Getting location…' : 'Share location'}
              variant="active"
              size="lg"
              loading={loading}
              icon="locate"
              onPress={onShareLocation}
            />
            {permissionBlocked ? (
              <Button
                label="Open settings"
                variant="secondary"
                onPress={() => Linking.openSettings()}
              />
            ) : null}
            <Button label="Not now" variant="ghost" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
