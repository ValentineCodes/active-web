import { Redirect } from 'expo-router';

/** Wallet is a stack screen; keep this route for legacy tab/deep links. */
export default function WalletTabRedirect() {
  return <Redirect href="/wallet" />;
}