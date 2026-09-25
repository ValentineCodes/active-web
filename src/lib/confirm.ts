import { Alert } from 'react-native';

export function confirmGoOffline(onConfirm: () => void) {
  Alert.alert(
    'Go offline?',
    'You will stop seeing new nearby requests until you go Active again. A job you are already committed to is not affected.',
    [
      { text: 'Stay available', style: 'cancel' },
      { text: 'Go offline', onPress: onConfirm },
    ],
  );
}

export function confirmWithdrawResponse(onConfirm: () => void) {
  Alert.alert(
    'Withdraw your response?',
    'The requester will no longer see your offer. You can respond again while the request is still open.',
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
