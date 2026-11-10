import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { InlineError } from '@/components/ui/StateView';
import { Avatar } from '@/components/ui/Avatar';
import { LiveProfilePhotoCapture } from '@/components/profile/LiveProfilePhotoCapture';
import { useUserId } from '@/features/auth/use-user-id';
import { useMyProfile, useSaveProfile } from '@/features/profile/api';
import { LoadingScreen } from '@/components/LoadingScreen';

export function OnboardingPage() {
  const navigate = useNavigate();
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
      navigate('/home', { replace: true });
    }
  }, [navigate, profile.data?.display_name]);

  if (profile.isLoading) return <LoadingScreen label="Loading profile…" />;

  return (
    <>
      <div className="flex flex-1 flex-col gap-8 py-4">
        <main className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold text-ink">Who are you?</h1>
          <p className="text-lg text-muted">
            People see this when you ask for help, and when you offer it. One account does both.
          </p>
        </main>

        <div className="flex flex-col items-center gap-3">
          <Avatar path={profile.data?.avatar_path} name={trimmedName || null} size="lg" />
          <button
            type="button"
            className="text-base font-medium text-brand"
            onClick={() => setCaptureOpen(true)}
          >
            {profile.data?.avatar_captured_in_app ? 'Retake profile photo' : 'Take profile photo (optional)'}
          </button>
          <p className="max-w-xs text-center text-xs text-muted">
            Live camera only. This is not identity verification.
          </p>
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
          placeholder="e.g. Usually free on weekday evenings around Yaba."
          hint="Optional — a sentence about you can help people feel comfortable choosing you."
        />

        {save.isError ? (
          <InlineError
            message={save.error instanceof Error ? save.error.message : 'Could not save your profile.'}
          />
        ) : null}

        <Button
          label="Continue"
          disabled={!isNameValid}
          loading={save.isPending}
          onClick={() =>
            save.mutate(
              { display_name: trimmedName, bio: bio.trim() || null },
              { onSuccess: () => navigate('/home', { replace: true }) },
            )
          }
        />
      </div>

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
