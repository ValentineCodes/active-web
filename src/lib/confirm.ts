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
    `${amountLabel} will be removed from your available balance. This stand-in does not send money to a bank yet.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: onConfirm },
    ],
  );
}
