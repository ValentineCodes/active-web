import { Navigate, createBrowserRouter } from 'react-router-dom';

import { AppShell } from '@/components/AppShell';
import { PhoneFrame } from '@/components/layout/PhoneFrame';
import { RootErrorBoundary } from '@/components/RootErrorBoundary';
import {
  GuestOnlyRoute,
  RequireAuthRoute,
  RequireOnboardingRoute,
  RequireSignedInRoute,
} from '@/features/auth/route-guards';
import { ActivityPage } from '@/pages/ActivityPage';
import { ConversationPage } from '@/pages/ConversationPage';
import { EngagementPage } from '@/pages/EngagementPage';
import { HomePage } from '@/pages/HomePage';
import { MessagesPage } from '@/pages/MessagesPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { ProfileEditPage } from '@/pages/ProfileEditPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { RatePage } from '@/pages/RatePage';
import { RequestDetailPage } from '@/pages/RequestDetailPage';
import { RequestNewPage } from '@/pages/RequestNewPage';
import { RespondPage } from '@/pages/RespondPage';
import { SearchPage } from '@/pages/SearchPage';
import { InstallAppPage } from '@/pages/InstallAppPage';
import { SignInPage } from '@/pages/SignInPage';
import { WelcomePage } from '@/pages/WelcomePage';
import { BankAccountAddPage } from '@/pages/profile/BankAccountAddPage';
import { BankAccountsPage } from '@/pages/profile/BankAccountsPage';
import { WalletAddPage } from '@/pages/wallet/WalletAddPage';
import { WalletDepositCallbackPage } from '@/pages/wallet/WalletDepositCallbackPage';
import { WalletDepositCheckoutPage } from '@/pages/wallet/WalletDepositCheckoutPage';
import { WalletDepositReviewPage } from '@/pages/wallet/WalletDepositReviewPage';
import { WalletHistoryPage } from '@/pages/wallet/WalletHistoryPage';
import { WalletPage } from '@/pages/wallet/WalletPage';
import { WalletWithdrawPage } from '@/pages/wallet/WalletWithdrawPage';
import { WalletWithdrawResultPage } from '@/pages/wallet/WalletWithdrawResultPage';
import { WalletWithdrawReviewPage } from '@/pages/wallet/WalletWithdrawReviewPage';
import { WalletWithdrawalDetailPage } from '@/pages/wallet/WalletWithdrawalDetailPage';

export const router = createBrowserRouter([
  {
    path: '/',
    errorElement: <RootErrorBoundary />,
    element: <PhoneFrame />,
    children: [
      { index: true, element: <Navigate to="/home" replace /> },
      { path: 'install', element: <InstallAppPage /> },
      {
        element: <GuestOnlyRoute />,
        children: [
          { path: 'welcome', element: <WelcomePage /> },
          { path: 'sign-in', element: <SignInPage /> },
        ],
      },
      {
        element: <RequireAuthRoute />,
        children: [
          {
            element: <RequireOnboardingRoute />,
            children: [{ path: 'onboarding', element: <OnboardingPage /> }],
          },
          {
            element: <RequireSignedInRoute />,
            children: [
              {
                element: <AppShell />,
                children: [
                  { path: 'home', element: <HomePage /> },
                  { path: 'activity', element: <ActivityPage /> },
                  { path: 'notifications', element: <NotificationsPage /> },
                ],
              },
              { path: 'search', element: <SearchPage /> },
              { path: 'messages', element: <MessagesPage /> },
              { path: 'profile', element: <ProfilePage /> },
              { path: 'profile/edit', element: <ProfileEditPage /> },
              { path: 'profile/bank-accounts', element: <BankAccountsPage /> },
              { path: 'profile/bank-accounts/add', element: <BankAccountAddPage /> },
              { path: 'wallet', element: <WalletPage /> },
              { path: 'wallet/history', element: <WalletHistoryPage /> },
              { path: 'wallet/add', element: <WalletAddPage /> },
              { path: 'wallet/deposit/review', element: <WalletDepositReviewPage /> },
              { path: 'wallet/deposit/callback', element: <WalletDepositCallbackPage /> },
              { path: 'wallet/deposit/checkout', element: <WalletDepositCheckoutPage /> },
              { path: 'wallet/withdraw', element: <WalletWithdrawPage /> },
              { path: 'wallet/withdraw/review', element: <WalletWithdrawReviewPage /> },
              { path: 'wallet/withdraw/result', element: <WalletWithdrawResultPage /> },
              { path: 'wallet/withdrawal/:id', element: <WalletWithdrawalDetailPage /> },
              { path: 'request/new', element: <RequestNewPage /> },
              { path: 'request/:id', element: <RequestDetailPage /> },
              { path: 'respond/:id', element: <RespondPage /> },
              { path: 'engagement/:id', element: <EngagementPage /> },
              { path: 'conversation/:id', element: <ConversationPage /> },
              { path: 'rate/:id', element: <RatePage /> },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/home" replace /> },
    ],
  },
]);
