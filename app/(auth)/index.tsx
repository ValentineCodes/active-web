import { Linking, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';

import { AuthFooterButton } from '@/components/auth/AuthFooterButton';
import { Screen } from '@/components/ui/Screen';

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
          <Image
            source={require('../../assets/images/icon.png')}
            accessibilityLabel="Active"
            style={{ width: 144, height: 144, borderRadius: 32, marginBottom: 40 }}
          />
          <Text className="text-center text-3xl font-bold text-ink">Welcome to Active</Text>
          <Text className="mt-4 text-center text-base leading-6 text-muted">
            Need something? Ask.{'\n'}Can help? Respond.
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
