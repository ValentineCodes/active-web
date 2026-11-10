import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { InlineError } from '@/components/ui/StateView';
import { LoadingScreen } from '@/components/LoadingScreen';
import { LiveProfilePhotoCapture } from '@/components/profile/LiveProfilePhotoCapture';
import { useUserId } from '@/features/auth/use-user-id';
import { useMyProfile, useSaveProfile } from '@/features/profile/api';

export function ProfileEditPage() {
  const userId = useUserId();
  const profile = useMyProfile();
  const save = useSaveProfile();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);

  useEffect(() => {
    if (!profile.data) return;
    setName(profile.data.display_name ?? '');
    setBio(profile.data.bio ?? '');
  }, [profile.data]);

  const trimmedName = name.trim();
  const isNameValid = trimmedName.length >= 2 && trimmedName.length <= 60;

  if (profile.isLoading) return <LoadingScreen label="Loading profile…" />;

  return (
    <>
      <div className="flex flex-1 flex-col gap-6 py-2">
        <Link to="/profile" className="text-sm font-semibold text-brand">
          Back to profile
        </Link>

        <div className="flex flex-col items-center gap-3">
          <Avatar path={profile.data?.avatar_path} name={trimmedName || null} size="lg" />
          <button
            type="button"
            className="text-base font-medium text-brand"
            onClick={() => setCaptureOpen(true)}
          >
            Take profile photo
          </button>
          <p className="max-w-xs text-center text-xs text-muted">Live camera only — not identity verification.</p>
        </div>

        <TextField
          label="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          maxLength={60}
        />

        <TextAreaField
          label="Bio"
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          maxLength={280}
        />

        {save.isError ? (
          <InlineError
            message={save.error instanceof Error ? save.error.message : 'Could not save changes.'}
          />
        ) : null}

        <Button
          label="Save changes"
          disabled={!isNameValid}
          loading={save.isPending}
          onClick={() => save.mutate({ display_name: trimmedName, bio: bio.trim() || null })}
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
