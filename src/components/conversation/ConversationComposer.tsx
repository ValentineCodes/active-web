import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';
import { poppinsInputTypography } from '@/theme/fonts';
import { useColors } from '@/theme';

const MAX_LENGTH = 2000;

export function ConversationComposer({
  onSend,
  sending,
  disabled = false,
  disabledHint,
}: {
  onSend: (body: string) => void;
  sending: boolean;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const colors = useColors();
  const [text, setText] = useState('');
  const fieldTypography = poppinsInputTypography('regular', 'base', { multiline: true });

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !sending && !disabled;

  const submit = () => {
    if (!canSend) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <View className="flex-row items-end gap-2 border-t border-hairline bg-canvas px-4 py-3">
      <TextInput
        accessibilityLabel="Message"
        placeholder={disabled ? (disabledHint ?? 'Read-only') : 'Message'}
        placeholderTextColor={colors.subtle}
        multiline
        maxLength={MAX_LENGTH}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        blurOnSubmit={false}
        editable={!disabled}
        className="max-h-32 min-h-11 flex-1 rounded-2xl border border-hairline bg-elevated px-4 py-2.5 text-ink"
        style={[fieldTypography, disabled ? { opacity: 0.6 } : undefined]}
      />
      <View style={{ opacity: canSend ? 1 : 0.35 }}>
        <IconButton
          icon="send"
          accessibilityLabel="Send message"
          onPress={() => {
            if (canSend) submit();
          }}
          variant="brand"
        />
      </View>
    </View>
  );
}
