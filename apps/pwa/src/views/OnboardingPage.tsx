'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LoadingScreen } from '@/components/LoadingScreen';
import { LiveProfilePhotoCapture } from '@/components/profile/LiveProfilePhotoCapture';
import { Avatar } from '@/components/ui/Avatar';
import { AuthFooterButton } from '@/components/auth/AuthFooterButton';
import { Screen } from '@/components/ui/Screen';
import { InlineError } from '@/components/ui/StateView';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { useUserId } from '@/features/auth/use-user-id';
import { useMyProfile, useSaveProfile } from '@/features/profile/api';

export function OnboardingPage() {
  const router = useRouter();
  const userId = useUserId();
  const profile = useMyProfile();
  const save = useSaveProfile();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);

  const trimmedName = name.trim();
  const isNameValid = trimmedName.length >= 2 && trimmedName.length <= 60;

  useEffect(() => {
    if (profile.data?.display_name) {
      router.replace('/home');
    }
  }, [router, profile.data?.display_name]);

  if (profile.isLoading) return <LoadingScreen label="Loading profile…" />;

  return (
    <>
      <Screen className="min-h-[100dvh]">
        <div className="flex min-h-[100dvh] flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="flex flex-col gap-8">
            <div className="mt-8 flex flex-col gap-3">
              <h1 className="text-3xl font-bold text-ink">Who are you?</h1>
              <p className="text-lg text-muted">
                People see this when you ask for help, and when you offer it.
              </p>
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-3">
                <Avatar path={profile.data?.avatar_path} name={trimmedName || null} size="lg" />
                <button
                  type="button"
                  className="text-base font-medium text-brand active:opacity-80 disabled:opacity-40"
                  disabled={captureOpen}
                  onClick={() => setCaptureOpen(true)}
                >
                  Add a photo (optional)
                </button>
              </div>

              <TextField
                label="Your name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                placeholder="e.g. Chidi Okafor"
                hint="Use the name people would recognise you by."
              />

              <TextAreaField
                label="A line about you (optional)"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={280}
                counterMax={280}
                placeholder="e.g. Usually free on weekday evenings around Yaba."
                hint="Optional — a sentence about you can help people feel comfortable choosing you."
              />

              {save.isError ? (
                <InlineError message={save.error instanceof Error ? save.error.message : 'Could not save your profile.'} />
              ) : null}
            </div>
            </div>
          </div>

          <footer className="shrink-0 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
            <AuthFooterButton
              label="Continue"
              showChevron={false}
              disabled={!isNameValid}
              loading={save.isPending}
              onClick={() =>
                save.mutate(
                  { display_name: trimmedName, bio: bio.trim() || null },
                  { onSuccess: () => router.replace('/home') },
                )
              }
            />
          </footer>
        </div>
      </Screen>

      {captureOpen ? (
        <LiveProfilePhotoCapture
          userId={userId}
          onClose={() => setCaptureOpen(false)}
          onSaved={() => {
            setCaptureOpen(false);
            void profile.refetch();
          }}
        />
      ) : null}
    </>
  );
}
