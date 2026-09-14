import { Linking, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AuthFooterButton } from '@/components/auth/AuthFooterButton';
import { Screen } from '@/components/ui/Screen';
import { colors } from '@/theme';

const PRIVACY_URL = 'https://example.com/privacy';
const TERMS_URL = 'https://example.com/terms';

function openUrl(url: string) {
  Linking.canOpenURL(url).then((supported) => {
    if (supported) Linking.openURL(url);
  });
}

export default function WelcomeScreen() {
  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 justify-between px-8 pb-10 pt-12">
        <View className="mt-20 items-center">
          <View className="mb-10 h-28 w-28 items-center justify-center rounded-full bg-active-soft">
            <Ionicons name="radio-outline" size={52} color={colors.active} />
          </View>
          <Text className="text-center text-3xl font-bold text-ink">Welcome to Active</Text>
          <Text className="mt-4 text-center text-base leading-6 text-muted">
            Tell people nearby what you need. Or be the one who helps.
          </Text>
        </View>

        <View className="gap-8">
          <Text className="text-center text-base leading-6 text-muted">
            Read our{' '}
            <Text
              className="font-semibold text-brand underline"
              onPress={() => openUrl(PRIVACY_URL)}
              accessibilityRole="link"
            >
              Privacy Policy
            </Text>
            . Tap &ldquo;Agree and continue&rdquo; to accept the{' '}
            <Text
              className="font-semibold text-brand underline"
              onPress={() => openUrl(TERMS_URL)}
              accessibilityRole="link"
            >
              Terms of Service
            </Text>
            .
          </Text>

          <AuthFooterButton label="Agree and continue" onPress={() => router.push('/phone')} />
        </View>
      </View>
    </Screen>
  );
}
