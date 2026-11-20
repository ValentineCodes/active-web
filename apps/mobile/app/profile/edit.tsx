import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentRef,
} from 'react';
import { Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { ProfileTagInterestPicker } from '@/components/profile/ProfileTagInterestPicker';
import { AvatarWithViewer } from '@/components/profile/AvatarWithViewer';
import { Avatar } from '@/components/ui/Avatar';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import {
  useNotificationTagInterests,
  useUpdateNotificationTagInterests,
} from '@/features/notifications/tag-interests';
import {
  pickProfilePhotoFromCamera,
  uploadProfilePhotoBytes,
} from '@/features/profile/capture-profile-photo';
import { useProfile, useSaveProfile } from '@/features/profile/api';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { useSetUsername } from '@/features/profile/public-profile-api';
import {
  sanitizeUsernameDraft,
  validateUsernameFormat,
} from '@/features/profile/username';
import type { RequestTag } from '@/features/requests/tags';
import { cn } from '@/lib/cn';
import { showAppToast } from '@/lib/toast';
import { poppinsInputTypography } from '@/theme/fonts';
import { useColors } from '@/theme';

/** Filter chips to keep visible below the tag search field when the keyboard is open. */
const TAG_SEARCH_CHIP_ROOM = 88;
const TAG_SEARCH_KEYBOARD_GAP = 8;

function EditField({
  label,
  className,
  style,
  ...inputProps
}: { label: string } & ComponentProps<typeof TextInput>) {
  const colors = useColors();
  const fieldTypography = poppinsInputTypography('regular', 'base', {
    multiline: Boolean(inputProps.multiline),
  });

  return (
    <View className="gap-2">
      <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.subtle}
        className={cn('rounded-2xl bg-surface px-4 py-4 text-ink', className)}
        style={[fieldTypography, style]}
        {...inputProps}
      />
    </View>
  );
}

function EditProfileForm({
  userId,
  avatarPath,
  displayName,
  initialUsername,
  initialBio,
  initialTagInterests,
}: {
  userId: string;
  avatarPath: string | null;
  displayName: string;
  initialUsername: string | null;
  initialBio: string | null;
  initialTagInterests: RequestTag[];
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const save = useSaveProfile();
  const setUsername = useSetUsername();
  const updateTagInterests = useUpdateNotificationTagInterests();

  const [name, setName] = useState(displayName);
  const [handle, setHandle] = useState(initialUsername ?? '');
  const [bio, setBio] = useState(initialBio ?? '');
  const [selectedTags, setSelectedTags] = useState(initialTagInterests);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<{ uri: string; bytes: Uint8Array } | null>(null);

  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollYRef = useRef(0);
  const tagSearchAnchorRef = useRef<ComponentRef<typeof View>>(null);
  const tagSearchFocusedRef = useRef(false);
  const keyboardScreenYRef = useRef(0);
  const [tagKeyboardInset, setTagKeyboardInset] = useState(0);

  const scrollTagSearchIntoView = useCallback(() => {
    const keyboardTop = keyboardScreenYRef.current;
    if (!keyboardTop) return;

    tagSearchAnchorRef.current?.measureInWindow((_x, y, _w, h) => {
      const visibleBottom = y + h + TAG_SEARCH_CHIP_ROOM;
      const limit = keyboardTop - TAG_SEARCH_KEYBOARD_GAP;
      const overlap = visibleBottom - limit;
      if (overlap > 0) {
        scrollRef.current?.scrollTo({
          y: scrollYRef.current + overlap,
          animated: true,
        });
      }
    });
  }, []);

  useEffect(() => {
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const didShowSub = Keyboard.addListener('keyboardDidShow', (event) => {
      if (!tagSearchFocusedRef.current) return;
      keyboardScreenYRef.current = event.endCoordinates.screenY;
      setTagKeyboardInset(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardScreenYRef.current = 0;
      setTagKeyboardInset(0);
    });

    return () => {
      didShowSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (tagKeyboardInset > 0 && tagSearchFocusedRef.current) {
      requestAnimationFrame(() => scrollTagSearchIntoView());
    }
  }, [tagKeyboardInset, scrollTagSearchIntoView]);

  const handleTagSearchFocus = useCallback(() => {
    tagSearchFocusedRef.current = true;
    const metrics = Keyboard.metrics();
    if (metrics?.height) {
      keyboardScreenYRef.current = metrics.screenY;
      setTagKeyboardInset(metrics.height);
    }
  }, []);

  const handleTagSearchBlur = useCallback(() => {
    tagSearchFocusedRef.current = false;
  }, []);

  const trimmedName = name.trim();
  const saving = save.isPending || updateTagInterests.isPending || setUsername.isPending;
  const trimmedHandle = handle.trim().toLowerCase();
  const handleChanged =
    trimmedHandle.length > 0 && trimmedHandle !== (initialUsername ?? '').toLowerCase();
  const handleFormatError = handleChanged ? validateUsernameFormat(trimmedHandle) : null;
  const canSave = trimmedName.length >= 2 && !saving && !handleFormatError && !pickingPhoto;

  const handlePickPhoto = () => {
    if (pickingPhoto || saving) return;
    setPhotoError(null);
    setPickingPhoto(true);
    void (async () => {
      try {
        const outcome = await pickProfilePhotoFromCamera();
        if (outcome.kind === 'cancelled') return;
        if (outcome.kind === 'permission_denied') {
          if (!outcome.canAskAgain) {
            setPhotoError('Camera access is blocked. Open settings to allow your camera.');
          } else {
            setPhotoError('Camera access is needed for your profile photo.');
          }
          return;
        }
        setPendingPhoto({ uri: outcome.uri, bytes: outcome.bytes });
      } catch (error) {
        setPhotoError(error instanceof Error ? error.message : 'Could not open the camera.');
      } finally {
        setPickingPhoto(false);
      }
    })();
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
        if (pendingPhoto) {
          await uploadProfilePhotoBytes(userId, pendingPhoto.bytes);
          void queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.avatarUrl(`${userId}/avatar.jpg`) });
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

  return (
    <View className="flex-1">
      <Header
        title="Edit profile"
        onBack={() => router.back()}
        right={
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel="Save profile"
            hitSlop={8}
            className="active:opacity-80"
          >
            <Text className={`text-base font-semibold ${canSave ? 'text-active' : 'text-muted'}`}>
              Save
            </Text>
          </Pressable>
        }
      />

      <View className="min-h-0 flex-1">
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="gap-8 px-5 pt-2"
          contentContainerStyle={{ paddingBottom: 48 + tagKeyboardInset }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={(event) => {
            scrollYRef.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          <View className="items-center gap-3">
            <View className="relative">
              {pendingPhoto ? (
                <Image
                  source={{ uri: pendingPhoto.uri }}
                  contentFit="cover"
                  style={{ width: 96, height: 96, borderRadius: 48 }}
                />
              ) : avatarPath ? (
                <AvatarWithViewer path={avatarPath} name={trimmedName || displayName} size="lg" />
              ) : (
                <Pressable
                  onPress={handlePickPhoto}
                  disabled={pickingPhoto}
                  accessibilityRole="button"
                  accessibilityLabel="Add a profile photo"
                  className="active:opacity-90"
                >
                  <Avatar path={avatarPath} name={trimmedName || displayName} size="lg" />
                </Pressable>
              )}
              <Pressable
                onPress={handlePickPhoto}
                disabled={pickingPhoto}
                accessibilityRole="button"
                accessibilityLabel="Change profile photo"
                className="absolute -bottom-0.5 -right-0.5 active:opacity-90"
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-active">
                  <Ionicons name="add" size={20} color={colors.onBrand} />
                </View>
              </Pressable>
            </View>
            <Pressable
              onPress={handlePickPhoto}
              disabled={pickingPhoto}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              hitSlop={8}
              className="active:opacity-80"
            >
              <Text className="text-base font-medium text-active">
                {pickingPhoto
                  ? 'Opening camera…'
                  : pendingPhoto
                    ? 'Retake profile photo'
                    : 'Change profile photo'}
              </Text>
            </Pressable>
            {pendingPhoto ? (
              <Text className="max-w-xs text-center text-xs text-muted">
                Photo uploads when you tap Save.
              </Text>
            ) : null}
          </View>

          <View className="gap-5">
            <EditField
              label="Full name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
              maxLength={60}
            />
            <EditField
              label="Username"
              value={handle}
              onChangeText={(text) => {
                setUsernameError(null);
                setHandle(sanitizeUsernameDraft(text));
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              maxLength={30}
              placeholder="your_handle"
            />
            {usernameError || handleFormatError ? (
              <Text className="-mt-2 px-1 text-sm text-warning">
                {usernameError ?? handleFormatError}
              </Text>
            ) : initialUsername ? (
              <Text className="-mt-2 px-1 text-sm text-muted">Public profile: @{initialUsername}</Text>
            ) : (
              <Text className="-mt-2 px-1 text-sm text-muted">
                Lowercase letters, numbers, and underscores only.
              </Text>
            )}
            <EditField
              label="About you"
              value={bio}
              onChangeText={setBio}
              multiline
              textAlignVertical="top"
              className="min-h-32 py-4"
              maxLength={280}
            />
          </View>

          <View className="gap-3">
            <View className="gap-1 px-1">
              <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
                Interests
              </Text>
            </View>
            <View className="rounded-2xl border border-hairline bg-elevated p-4">
              <ProfileTagInterestPicker
                selected={selectedTags}
                onChange={setSelectedTags}
                disabled={saving}
                searchAnchorRef={tagSearchAnchorRef}
                onSearchFocus={handleTagSearchFocus}
                onSearchBlur={handleTagSearchBlur}
              />
            </View>
          </View>

          {photoError ? <InlineError message={photoError} /> : null}
          {saveError ? <InlineError error={saveError} /> : null}
        </ScrollView>
      </View>
    </View>
  );
}

export default function EditProfileScreen() {
  const profile = useProfile();
  const tagInterests = useNotificationTagInterests();
  useQueryErrorToast(profile, { enabled: profile.isError && !profile.data });
  useQueryErrorToast(tagInterests, { enabled: tagInterests.isError && !tagInterests.data });

  if (profile.isPending || tagInterests.isPending) {
    return (
      <Screen>
        <Header title="Edit profile" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  const { data } = profile;
  if (!data) {
    return (
      <Screen>
        <Header title="Edit profile" onBack={() => router.back()} />
        <EmptyState
          icon="person-outline"
          title="Profile unavailable"
          message="Go back and open this screen again when you are online."
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const initialTags = tagInterests.data ?? [];
  const formKey = `${data.id}:${initialTags.map((tag) => tag.id).join(',')}`;

  return (
    <Screen edges={['top', 'bottom']}>
      <EditProfileForm
        key={formKey}
        userId={data.id}
        avatarPath={data.avatar_path}
        displayName={data.display_name ?? ''}
        initialUsername={data.username ?? null}
        initialBio={data.bio}
        initialTagInterests={initialTags}
      />
    </Screen>
  );
}
