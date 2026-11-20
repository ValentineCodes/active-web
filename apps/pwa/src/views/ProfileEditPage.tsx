'use client';

import { useEffect, useState } from 'react';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { AvatarWithViewer } from '@/components/profile/AvatarWithViewer';
import { ProfileEditField } from '@/components/profile/ProfileEditField';
import { ProfileTagInterestPicker } from '@/components/profile/ProfileTagInterestPicker';
import { InlineError } from '@/components/ui/StateView';
import { LoadingScreen } from '@/components/LoadingScreen';
import { LiveProfilePhotoCapture } from '@/components/profile/LiveProfilePhotoCapture';
import { useUserId } from '@/features/auth/use-user-id';
import {
  useNotificationTagInterests,
  useUpdateNotificationTagInterests,
} from '@/features/notifications/tag-interests';
import { consumeProfileEditLivePhotoIntent } from '@/features/profile/profile-edit-intent';
import { uploadLiveProfilePhoto } from '@/features/profile/capture-live-profile-photo';
import { useMyProfile, useSaveProfile } from '@/features/profile/api';
import { useSetUsername } from '@/features/profile/public-profile-api';
import {
  sanitizeUsernameDraft,
  validateUsernameFormat,
} from '@/features/profile/username';
import type { RequestTag } from '@/features/requests/tags';
import { cn } from '@/lib/cn';
import { useRouter } from '@/lib/navigation';
import { showAppToast } from '@/lib/toast';

export function ProfileEditPage() {
  const router = useRouter();
  const userId = useUserId();
  const profile = useMyProfile();
  const tagInterests = useNotificationTagInterests();
  const save = useSaveProfile();
  const setUsername = useSetUsername();
  const updateTagInterests = useUpdateNotificationTagInterests();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<RequestTag[]>([]);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [pendingPhotoBytes, setPendingPhotoBytes] = useState<Uint8Array | null>(null);
  const [pendingPhotoPreviewUrl, setPendingPhotoPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!profile.data) return;
    setName(profile.data.display_name ?? '');
    setHandle(profile.data.username ?? '');
    setBio(profile.data.bio ?? '');
  }, [profile.data]);

  useEffect(() => {
    if (!tagInterests.data) return;
    setSelectedTags(tagInterests.data);
  }, [tagInterests.data]);

  useEffect(() => {
    if (consumeProfileEditLivePhotoIntent()) setCaptureOpen(true);
  }, []);

  useEffect(() => {
    return () => {
      if (pendingPhotoPreviewUrl) {
        URL.revokeObjectURL(pendingPhotoPreviewUrl);
      }
    };
  }, [pendingPhotoPreviewUrl]);

  const trimmedName = name.trim();
  const isNameValid = trimmedName.length >= 2 && trimmedName.length <= 60;
  const trimmedHandle = handle.trim().toLowerCase();
  const initialUsername = profile.data?.username?.toLowerCase() ?? '';
  const handleChanged = trimmedHandle.length > 0 && trimmedHandle !== initialUsername;
  const handleFormatError = handleChanged ? validateUsernameFormat(trimmedHandle) : null;
  const saving = save.isPending || updateTagInterests.isPending || setUsername.isPending;
  const canSave = isNameValid && !saving && !handleFormatError;

  const applyPendingPhoto = (bytes: Uint8Array) => {
    if (pendingPhotoPreviewUrl) {
      URL.revokeObjectURL(pendingPhotoPreviewUrl);
    }
    const blob = new Blob([Uint8Array.from(bytes)], { type: 'image/jpeg' });
    setPendingPhotoBytes(bytes);
    setPendingPhotoPreviewUrl(URL.createObjectURL(blob));
  };

  const handleSave = () => {
    if (!canSave) return;
    if (handleChanged) {
      const formatError = validateUsernameFormat(trimmedHandle);
      if (formatError) {
        setUsernameError(formatError);
        return;
      }
    }
    setSaveError(null);
    setUsernameError(null);
    void (async () => {
      try {
        if (pendingPhotoBytes) {
          await uploadLiveProfilePhoto(userId, pendingPhotoBytes);
          await profile.refetch();
        }
        await save.mutateAsync({ display_name: trimmedName, bio: bio.trim() || null });
        if (handleChanged) {
          await setUsername.mutateAsync(trimmedHandle);
        }
        await updateTagInterests.mutateAsync(selectedTags);
        showAppToast('Profile updated');
        router.back();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not save profile.';
        if (handleChanged && message.toLowerCase().includes('username')) {
          setUsernameError(message);
        } else {
          setSaveError(error);
        }
      }
    })();
  };

  if (profile.isLoading || tagInterests.isPending) {
    return <LoadingScreen label="Loading profile…" />;
  }

  const saveHeader = (
    <button
      type="button"
      onClick={handleSave}
      disabled={!canSave}
      className={cn(
        'text-base font-semibold active:opacity-80',
        canSave ? 'text-active' : 'text-muted',
      )}
    >
      Save
    </button>
  );

  return (
    <>
      <FlowScreen
        title="Edit profile"
        backTo="/profile"
        right={saveHeader}
        bodyClassName="flex flex-col gap-6 pb-10"
      >
        <div className="flex flex-col items-center gap-3">
          {pendingPhotoPreviewUrl ? (
            <img
              src={pendingPhotoPreviewUrl}
              alt=""
              className="h-24 w-24 rounded-full object-cover"
              width={96}
              height={96}
            />
          ) : (
            <AvatarWithViewer path={profile.data?.avatar_path} name={trimmedName || null} size="lg" />
          )}
          <button type="button" className="text-base font-medium text-brand" onClick={() => setCaptureOpen(true)}>
            {pendingPhotoPreviewUrl ? 'Retake profile photo' : 'Take profile photo'}
          </button>
          {pendingPhotoPreviewUrl ? (
            <p className="max-w-xs text-center text-xs text-muted">
              Photo uploads when you tap Save.
            </p>
          ) : (
            <p className="max-w-xs text-center text-xs text-muted">Live camera only — not identity verification.</p>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <ProfileEditField
            label="Full name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            autoCapitalize="words"
            maxLength={60}
          />
          <ProfileEditField
            label="Username"
            value={handle}
            onChange={(event) => {
              setUsernameError(null);
              setHandle(sanitizeUsernameDraft(event.target.value));
            }}
            autoComplete="username"
            autoCapitalize="none"
            maxLength={30}
            placeholder="your_handle"
          />
          {usernameError || handleFormatError ? (
            <p className="-mt-2 px-1 text-sm text-warning">{usernameError ?? handleFormatError}</p>
          ) : (
            <p className="-mt-2 px-1 text-sm text-muted">
              Lowercase letters, numbers, and underscores only.
            </p>
          )}
          <ProfileEditField
            label="About you"
            multiline
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={280}
          />
        </div>

        <div className="flex flex-col gap-3">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">Interests</p>
          <div className="rounded-2xl border border-hairline bg-elevated p-4">
            <ProfileTagInterestPicker
              selected={selectedTags}
              onChange={setSelectedTags}
              disabled={saving}
            />
          </div>
        </div>

        {saveError ? <InlineError error={saveError} /> : null}
        {save.isError && !saveError ? (
          <InlineError message={save.error instanceof Error ? save.error.message : 'Could not save changes.'} />
        ) : null}
        {updateTagInterests.isError && !saveError ? (
          <InlineError
            message={
              updateTagInterests.error instanceof Error
                ? updateTagInterests.error.message
                : 'Could not save interests.'
            }
          />
        ) : null}
      </FlowScreen>

      {captureOpen ? (
        <LiveProfilePhotoCapture
          onClose={() => setCaptureOpen(false)}
          onCaptured={(bytes) => {
            applyPendingPhoto(bytes);
            setCaptureOpen(false);
          }}
        />
      ) : null}
    </>
  );
}