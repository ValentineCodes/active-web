import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import {
  exitWalletWithdrawToDetail,
  exitWalletWithdrawToHome,
} from '@/features/wallet/withdraw-navigation';
import { useColors } from '@/theme';

export default function WalletWithdrawResultScreen() {
  const colors = useColors();
  const { withdrawalId, message } = useLocalSearchParams<{
    withdrawalId?: string;
    message?: string;
  }>();

  const detailId = withdrawalId?.trim() ?? '';

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Withdrawal requested" onBack={() => exitWalletWithdrawToHome()} />

      <View className="flex-1 items-center justify-center gap-4 px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-active-soft">
          <Ionicons name="checkmark" size={32} color={colors.active} />
        </View>
        <Text className="text-center text-2xl font-bold text-ink">Request submitted</Text>
        <Text className="text-center text-base leading-6 text-muted">
          {message?.trim() ||
            'Your withdrawal is pending review. Reserved funds stay set aside until we complete or decline the request.'}
        </Text>
      </View>

      <View className="gap-3 p-5">
        {detailId ? (
          <Button
            label="View withdrawal details"
            variant="active"
            size="lg"
            corner="2xl"
            className="w-full"
            onPress={() => exitWalletWithdrawToDetail(detailId)}
          />
        ) : null}
        <Button
          label="Back to wallet"
          variant="secondary"
          size="lg"
          corner="2xl"
          className="w-full"
          onPress={() => exitWalletWithdrawToHome()}
        />
      </View>
    </Screen>
  );
}
