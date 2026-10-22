import { Alert } from 'react-native';

export function confirmWithdrawResponse(onConfirm: () => void) {
  Alert.alert(
    'Withdraw your response?',
    'They will no longer see your offer. You can respond again while the request is still open.',
    [
      { text: 'Keep response', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: onConfirm },
    ],
  );
}

export function confirmWalletWithdraw(amountLabel: string, onConfirm: () => void) {
  Alert.alert(
    'Withdraw from wallet?',
    `${amountLabel} will be reserved from your available balance while we process your bank transfer manually.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: onConfirm },
    ],
  );
}
