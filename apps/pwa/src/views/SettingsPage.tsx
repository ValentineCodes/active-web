'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { SettingsGroup, SettingsRow } from '@/components/profile/SettingsRow';
import { ReportIssueModal } from '@/components/support/ReportIssueModal';
import { ThemePreferenceSegment } from '@/components/settings/ThemePreferenceSegment';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { InlineError } from '@/components/ui/StateView';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { signOut } from '@/features/auth/api';
import { useMyReputation, useSetCrownPublic } from '@/features/profile/reputation-api';
import { APP_REPORT_ISSUES } from '@/features/support/report-issue-options';
import { useMyWallet } from '@/features/wallet/api';
import { formatMoney } from '@/lib/format';
import { showAppToast } from '@/lib/toast';
import { useTheme, useColors } from '@/theme/ThemeProvider';

export function SettingsPage() {
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const leave = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      window.location.href = '/home';
    },
  });
  const colors = useColors();
  const { preference, setPreference } = useTheme();
  const wallet = useMyWallet();
  const reputation = useMyReputation();
  const setCrownPublic = useSetCrownPublic();
  const crownVisible = reputation.data?.crown_public ?? true;
  const crownSwitchDisabled = setCrownPublic.isPending || (reputation.isPending && reputation.data === undefined);

  return (
    <>
      <FlowScreen title="Settings" backTo="/profile" bodyClassName="flex flex-col gap-6 pb-8">
        <SettingsGroup title="Account">
          <SettingsRow label="Edit profile" to="/profile/edit" icon="create-outline" />
          <SettingsRow label="Reviews" to="/profile/reviews" icon="star-outline" showDivider />
          <SettingsRow label="Saved places" to="/profile/locations" icon="location-outline" showDivider />
          <SettingsRow label="Bank accounts" to="/profile/bank-accounts" icon="receipt-outline" showDivider />
        </SettingsGroup>

        <SettingsGroup title="Crown & conduct">
          <div className="flex flex-row items-center gap-3 px-4 py-3.5">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface"
              aria-hidden
            >
              <IonIcon icon={ionIcons['shield-checkmark']} size={20} color={colors.active} />
            </span>

            <p className="text-base font-medium text-ink flex-1">Show Crown</p>
            
            <ToggleSwitch
              aria-label="Show Crown"
              checked={crownVisible}
              disabled={crownSwitchDisabled}
              onChange={(next) => {
                setCrownPublic.mutate(next, {
                  onSuccess: () =>
                    showAppToast(next ? 'Crown visible publicly' : 'Crown hidden on public profile'),
                  onError: (error) =>
                    showAppToast(
                      error instanceof Error ? error.message : 'Could not update Crown visibility',
                      'warning',
                    ),
                });
              }}
            />
          </div>
          {setCrownPublic.isError ? (
            <div className="px-4 pb-4">
              <InlineError error={setCrownPublic.error} />
            </div>
          ) : null}
        </SettingsGroup>

        <SettingsGroup title="Notifications">
          <SettingsRow label="Push and in-app" to="/notification-settings" icon="notifications-outline" />
        </SettingsGroup>

        <SettingsGroup title="Preferences">
          <div className="flex flex-col gap-3 px-4 py-4">
            <div className="flex flex-row items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface"
                aria-hidden
              >
                <IonIcon icon={ionIcons['settings-outline']} size={20} color={colors.active} />
              </span>
              <p className="text-base font-medium text-ink">Appearance</p>
            </div>
            <ThemePreferenceSegment value={preference} onChange={setPreference} />
          </div>
        </SettingsGroup>

        <SettingsGroup title="Wallet">
          <SettingsRow
            label="Wallet"
            to="/wallet"
            icon="wallet-outline"
            detail={
              wallet.data ? formatMoney(wallet.data.available, wallet.data.currency) : undefined
            }
          />
          <SettingsRow label="Add money" to="/wallet/add" icon="add-circle-outline" showDivider />
        </SettingsGroup>

        <SettingsGroup title="Support">
          <SettingsRow label="Report a problem" onClick={() => setReportIssueOpen(true)} icon="alert-circle" />
        </SettingsGroup>

        <div className="flex flex-col gap-3 pt-1">
          {leave.isError ? <InlineError error={leave.error} /> : null}
          <button
            type="button"
            disabled={leave.isPending}
            onClick={() => leave.mutate()}
            className="py-3 text-center text-base font-semibold text-danger active:opacity-80 disabled:opacity-50"
          >
            {leave.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </FlowScreen>

      <ReportIssueModal
        open={reportIssueOpen}
        issues={APP_REPORT_ISSUES}
        onClose={() => setReportIssueOpen(false)}
        onSubmit={() => {
          setReportIssueOpen(false);
          showAppToast('Thanks — we received your report');
        }}
      />
    </>
  );
}