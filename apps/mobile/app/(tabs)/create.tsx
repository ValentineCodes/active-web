import { useCallback } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import {
  armCreateComposerReturn,
  consumeCreateComposerReturn,
} from '@/features/navigation/create-tab-return';

/** Opens the request composer once per tab visit; closing it returns to the prior tab. */
export default function CreateTabScreen() {
  useFocusEffect(
    useCallback(() => {
      const returnTo = consumeCreateComposerReturn();
      if (returnTo) {
        router.replace(returnTo);
        return;
      }

      armCreateComposerReturn();
      router.push('/request/new');
    }, []),
  );

  return <View className="flex-1 bg-canvas" />;
}
