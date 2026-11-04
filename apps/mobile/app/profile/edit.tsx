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
import { useCaptureProfilePhoto, useProfile, useSaveProfile } from '@/features/profile/api';
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
  avatarPath,
  displayName,
  initialBio,
  initialTagInterests,
}: {
  avatarPath: string | null;
  displayName: string;
  initialBio: string | null;
  initialTagInterests: RequestTag[];
}) {
  const colors = useColors();
  const save = useSaveProfile();
  const updateTagInterests = useUpdateNotificationTagInterests();
  const capturePhoto = useCaptureProfilePhoto();

  const [name, setName] = useState(displayName);
  const [bio, setBio] = useState(initialBio ?? '');
  const [selectedTags, setSelectedTags] = useState(initialTagInterests);
  const [saveError, setSaveError] = useState<unknown>(null);

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
  const saving = save.isPending || updateTagInterests.isPending;
  const canSave = trimmedName.length >= 2 && !saving;

  const handleSave = () => {
    if (!canSave) return;
    setSaveError(null);
    void (async () => {
      try {
        await save.mutateAsync({ display_name: trimmedName, bio: bio.trim() || null });
        await updateTagInterests.mutateAsync(selectedTags);
        showAppToast('Profile updated');
        router.back();
      } catch (error) {
        setSaveError(error);
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
              {avatarPath ? (
                <AvatarWithViewer path={avatarPath} name={trimmedName || displayName} size="lg" />
              ) : (
                <Pressable
                  onPress={() =>
                    capturePhoto.mutate({}, { onSuccess: () => showAppToast('Profile updated') })
                  }
                  disabled={capturePhoto.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Add a profile photo"
                  className="active:opacity-90"
                >
                  <Avatar path={avatarPath} name={trimmedName || displayName} size="lg" />
                </Pressable>
              )}
              <Pressable
                onPress={() =>
                  capturePhoto.mutate({}, { onSuccess: () => showAppToast('Profile updated') })
                }
                disabled={capturePhoto.isPending}
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
              onPress={() =>
                capturePhoto.mutate({}, { onSuccess: () => showAppToast('Profile updated') })
              }
              disabled={capturePhoto.isPending}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              hitSlop={8}
              className="active:opacity-80"
            >
              <Text className="text-base font-medium text-active">
                {capturePhoto.isPending ? 'Uploading…' : 'Change profile photo'}
              </Text>
            </Pressable>
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

          {capturePhoto.isError ? <InlineError error={capturePhoto.error} /> : null}
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
        avatarPath={data.avatar_path}
        displayName={data.display_name ?? ''}
        initialBio={data.bio}
        initialTagInterests={initialTags}
      />
    </Screen>
  );
}
