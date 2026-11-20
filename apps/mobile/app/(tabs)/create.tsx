import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { type Href, router, useFocusEffect } from 'expo-router';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import { CreateChoiceBottomSheet } from '@/components/create/CreateChoiceBottomSheet';
import {
  armCreateComposerReturn,
  consumeCreateComposerReturn,
} from '@/features/navigation/create-tab-return';

/** Opens the create chooser once per tab visit; closing returns to the prior tab. */
export default function CreateTabScreen() {
  const sheetRef = useRef<BottomSheetModal>(null);
  const choseRef = useRef(false);

  const returnToPreviousTab = useCallback(() => {
    const returnTo = consumeCreateComposerReturn();
    if (returnTo) {
      router.replace(returnTo as Href);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const returnTo = consumeCreateComposerReturn();
      if (returnTo) {
        router.replace(returnTo as Href);
        return;
      }

      choseRef.current = false;
      armCreateComposerReturn();
      const timer = setTimeout(() => {
        sheetRef.current?.present();
      }, 0);
      return () => clearTimeout(timer);
    }, []),
  );

  return (
    <View className="flex-1 bg-canvas">
      <CreateChoiceBottomSheet
        sheetRef={sheetRef}
        onChoose={(choice) => {
          choseRef.current = true;
          sheetRef.current?.dismiss();
          if (choice === 'request') {
            router.push('/request/new');
            return;
          }
          router.push('/project/new');
        }}
        onDismiss={() => {
          if (choseRef.current) return;
          returnToPreviousTab();
        }}
      />
    </View>
  );
}