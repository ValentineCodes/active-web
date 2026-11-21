import { Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { AppShell } from '@/components/AppShell';
import {
  GuestOnlyLayout,
  RequireAuthLayout,
  RequireOnboardingLayout,
  RequireSignedInLayout,
} from '@/features/auth/route-guards';
import { withSearchParamsPage } from '@/lib/client-page';
import { ConversationPage } from '@/views/ConversationPage';
import { EngagementPage } from '@/views/EngagementPage';
import { HomePage } from '@/views/HomePage';
import { InstallAppPage } from '@/views/InstallAppPage';
import { MessagesPage } from '@/views/MessagesPage';
import { NotificationsPage } from '@/views/NotificationsPage';
import { NotificationSettingsPage } from '@/views/NotificationSettingsPage';
import { OnboardingPage } from '@/views/OnboardingPage';
import { ProfilePage } from '@/views/ProfilePage';
import { ProfileEditPage } from '@/views/ProfileEditPage';
import { RatePage } from '@/views/RatePage';
import { RequestNewPage } from '@/views/RequestNewPage';
import { RequestRoutePage } from '@/views/RequestRoutePage';
import { RespondRedirectPage } from '@/views/RespondRedirectPage';
import { PublicProfilePage } from '@/views/PublicProfilePage';
import { SearchPage } from '@/views/SearchPage';
import { ProjectAssignmentDetailPage } from '@/views/ProjectAssignmentDetailPage';
import { ProjectDetailPage } from '@/views/ProjectDetailPage';
import { ProjectNewPage } from '@/views/ProjectNewPage';
import { SettingsPage } from '@/views/SettingsPage';
import { PrivacySettingsPage } from '@/views/settings/PrivacySettingsPage';
import { PremiumSettingsPage } from '@/views/settings/PremiumSettingsPage';
import { SignInPage } from '@/views/SignInPage';
import { WelcomePage } from '@/views/WelcomePage';
import { BankAccountAddPage } from '@/views/profile/BankAccountAddPage';
import { BankAccountsPage } from '@/views/profile/BankAccountsPage';
import { SavedLocationsPage } from '@/views/profile/SavedLocationsPage';
import { ReviewsPage } from '@/views/profile/ReviewsPage';
import { WalletAddPage } from '@/views/wallet/WalletAddPage';
import { WalletDepositCallbackPage } from '@/views/wallet/WalletDepositCallbackPage';
import { WalletDepositCheckoutPage } from '@/views/wallet/WalletDepositCheckoutPage';
import { WalletDepositReviewPage } from '@/views/wallet/WalletDepositReviewPage';
import { WalletHistoryPage } from '@/views/wallet/WalletHistoryPage';
import { WalletPage } from '@/views/wallet/WalletPage';
import { WalletWithdrawPage } from '@/views/wallet/WalletWithdrawPage';
import { WalletWithdrawResultPage } from '@/views/wallet/WalletWithdrawResultPage';
import { WalletWithdrawReviewPage } from '@/views/wallet/WalletWithdrawReviewPage';
import { WalletWithdrawalDetailPage } from '@/views/wallet/WalletWithdrawalDetailPage';
import { WalletTransactionPage } from '@/views/wallet/WalletTransactionPage';

function GuestShell() {
  return (
    <GuestOnlyLayout>
      <Outlet />
    </GuestOnlyLayout>
  );
}

function AuthShell() {
  return (
    <RequireAuthLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </RequireAuthLayout>
  );
}

function OnboardingShell() {
  return (
    <RequireOnboardingLayout>
      <Outlet />
    </RequireOnboardingLayout>
  );
}

function SignedInShell() {
  return (
    <RequireSignedInLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </RequireSignedInLayout>
  );
}

function TabsShell() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function NotFoundRedirect() {
  return <Navigate to="/home" replace />;
}

const HomePageRoute = withSearchParamsPage(HomePage);
const SearchPageRoute = withSearchParamsPage(SearchPage);
const PublicProfilePageRoute = withSearchParamsPage(PublicProfilePage);
const RequestNewPageRoute = withSearchParamsPage(RequestNewPage);
const RespondRedirectPageRoute = withSearchParamsPage(RespondRedirectPage);
const BankAccountAddPageRoute = withSearchParamsPage(BankAccountAddPage);
const WalletAddPageRoute = withSearchParamsPage(WalletAddPage);
const WalletWithdrawPageRoute = withSearchParamsPage(WalletWithdrawPage);
const WalletWithdrawReviewPageRoute = withSearchParamsPage(WalletWithdrawReviewPage);
const WalletWithdrawResultPageRoute = withSearchParamsPage(WalletWithdrawResultPage);
const WalletDepositReviewPageRoute = withSearchParamsPage(WalletDepositReviewPage);
const WalletDepositCallbackPageRoute = withSearchParamsPage(WalletDepositCallbackPage);

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/install" element={<InstallAppPage />} />

      <Route element={<GuestShell />}>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/sign-in" element={<SignInPage />} />
      </Route>

      <Route element={<AuthShell />}>
        <Route element={<OnboardingShell />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Route>

        <Route element={<SignedInShell />}>
          <Route element={<TabsShell />}>
            <Route path="/home" element={<HomePageRoute />} />
            <Route path="/search" element={<SearchPageRoute />} />
            <Route path="/activity" element={<Navigate to="/profile?tab=requests" replace />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>
          <Route path="/project/:id" element={<ProjectDetailPage />} />
          <Route
            path="/project/:id/assignment/:assignmentId"
            element={<ProjectAssignmentDetailPage />}
          />
          <Route path="/u/:username" element={<PublicProfilePageRoute />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/edit" element={<ProfileEditPage />} />
          <Route path="/profile/reviews" element={<ReviewsPage />} />
          <Route path="/profile/locations" element={<SavedLocationsPage />} />
          <Route path="/profile/bank-accounts" element={<BankAccountsPage />} />
          <Route path="/profile/bank-accounts/add" element={<BankAccountAddPageRoute />} />
          <Route path="/notification-settings" element={<NotificationSettingsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/privacy" element={<PrivacySettingsPage />} />
          <Route path="/settings/premium" element={<PremiumSettingsPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/messages/:id" element={<ConversationPage />} />
          <Route path="/request/new" element={<RequestNewPageRoute />} />
          <Route path="/project/new" element={<ProjectNewPage />} />
          <Route path="/request/:id" element={<RequestRoutePage />} />
          <Route path="/respond/:id" element={<RespondRedirectPageRoute />} />
          <Route path="/engagement/:id" element={<EngagementPage />} />
          <Route path="/rate/:id" element={<RatePage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/wallet/history" element={<WalletHistoryPage />} />
          <Route path="/wallet/transaction/:id" element={<WalletTransactionPage />} />
          <Route path="/wallet/add" element={<WalletAddPageRoute />} />
          <Route path="/wallet/withdraw" element={<WalletWithdrawPageRoute />} />
          <Route path="/wallet/withdraw/review" element={<WalletWithdrawReviewPageRoute />} />
          <Route path="/wallet/withdraw/result" element={<WalletWithdrawResultPageRoute />} />
          <Route path="/wallet/withdrawal/:id" element={<WalletWithdrawalDetailPage />} />
          <Route path="/wallet/deposit/checkout" element={<WalletDepositCheckoutPage />} />
          <Route path="/wallet/deposit/review" element={<WalletDepositReviewPageRoute />} />
          <Route path="/wallet/deposit/callback" element={<WalletDepositCallbackPageRoute />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundRedirect />} />
    </Routes>
  );
}