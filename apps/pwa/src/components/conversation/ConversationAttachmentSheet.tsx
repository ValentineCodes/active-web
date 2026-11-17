'use client';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons, type IonIconName } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

export type ConversationAttachmentSheetOption = 'photo' | 'video' | 'photos' | 'browse';

function AttachmentOptionRow({
  icon,
  label,
  onPress,
}: {
  icon: IonIconName;
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();

  return (
    <button
      type="button"
      onClick={onPress}
      className="flex w-full flex-row items-center gap-4 rounded-2xl py-3 text-left active:opacity-80"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-active-soft">
        <IonIcon icon={ionIcons[icon]} size={22} color={colors.active} />
      </span>
      <span className="text-base font-semibold text-ink">{label}</span>
    </button>
  );
}

export function ConversationAttachmentSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (option: ConversationAttachmentSheetOption) => void;
}) {
  const choose = (option: ConversationAttachmentSheetOption) => {
    onClose();
    onSelect(option);
  };

  return (
    <BottomSheet open={open} onClose={onClose} className="max-h-[44dvh]">
      <div className="flex flex-col gap-1 px-1 pb-1 pt-0">
        <AttachmentOptionRow icon="camera-outline" label="Take photo" onPress={() => choose('photo')} />
        <AttachmentOptionRow icon="videocam-outline" label="Record video" onPress={() => choose('video')} />
        <AttachmentOptionRow icon="images-outline" label="Select photos" onPress={() => choose('photos')} />
        <AttachmentOptionRow icon="folder-open-outline" label="Browse" onPress={() => choose('browse')} />
      </div>
    </BottomSheet>
  );
}