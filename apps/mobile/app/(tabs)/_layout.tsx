import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';

import { useProfile } from '@/features/profile/api';
import { useTrackTabForCreateReturn } from '@/features/navigation/use-track-tab-for-create-return';
import { useNotificationBridge } from '@/lib/notifications';
import { useColors } from '@/theme';

const VectorIcon = NativeTabs.Trigger.VectorIcon;

export default function TabsLayout() {
  const profile = useProfile();

  if (profile.isSuccess && !profile.data.display_name) {
    return <Redirect href="/onboarding" />;
  }

  return <TabsNavigator />;
}

function TabsNavigator() {
  useTrackTabForCreateReturn();
  const colors = useColors();

  useNotificationBridge();

  return (
    <NativeTabs tintColor={colors.active} labelVisibilityMode="unlabeled">
      <NativeTabs.Trigger name="index" accessibilityLabel="Home">
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          src={{
            default: <VectorIcon family={Ionicons} name="home-outline" />,
            selected: <VectorIcon family={Ionicons} name="home" />,
          }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search" accessibilityLabel="Search">
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          sf={{ default: 'magnifyingglass', selected: 'magnifyingglass' }}
          src={{
            default: <VectorIcon family={Ionicons} name="search-outline" />,
            selected: <VectorIcon family={Ionicons} name="search" />,
          }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="create" accessibilityLabel="Create">
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          sf={{ default: 'plus', selected: 'plus' }}
          src={<VectorIcon family={Ionicons} name="add" />}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notifications" accessibilityLabel="Notifications">
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bell', selected: 'bell.fill' }}
          src={{
            default: <VectorIcon family={Ionicons} name="notifications-outline" />,
            selected: <VectorIcon family={Ionicons} name="notifications" />,
          }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}