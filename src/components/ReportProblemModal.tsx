import { useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import type { ServiceProblemKind } from '@/features/requests/requester-api';
import { pickRequestPhotos, uploadRequestPhotos } from '@/features/requests/request-media';
import { useUserId } from '@/features/auth/session';

export type ReportProblemPayload = {
  kind: ServiceProblemKind;
  description: string;
  evidencePaths: string[];
};

type Props = {
  visible: boolean;
  kind: ServiceProblemKind | null;
  title: string;
  subtitle: string;
  requiresDescription: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: ReportProblemPayload) => void;
};

export function ReportProblemModal({
  visible,
  kind,
  title,
  subtitle,
  requiresDescription,
  loading,
  onClose,
  onSubmit,
}: Props) {
  const userId = useUserId();
  const [description, setDescription] = useState('');
  const [evidencePaths, setEvidencePaths] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setDescription('');
    setEvidencePaths([]);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAddPhotos = async () => {
    if (!userId) return;
    setError(null);
    try {
      const result = await pickRequestPhotos(4 - evidencePaths.length);
      if (result.canceled || !result.assets?.length) return;
      setUploading(true);
      const paths = await uploadRequestPhotos(
        userId,
        result.assets.map((asset) => ({ uri: asset.uri, mimeType: asset.mimeType })),
      );
      setEvidencePaths((current) => [...current, ...paths].slice(0, 4));
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : 'Could not attach photos.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!kind) return;
    if (requiresDescription && description.trim().length < 10) {
      setError('Please describe what went wrong (at least 10 characters).');
      return;
    }
    onSubmit({ kind, description: description.trim(), evidencePaths });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-5 p-5 pb-12">
        <Text className="text-xl font-bold text-ink">{title}</Text>
        <Text className="text-base text-muted">{subtitle}</Text>

        {requiresDescription ? (
          <TextField
            label="What happened?"
            placeholder="Describe the problem so support can review it."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            className="min-h-28"
          />
        ) : null}

        <View className="gap-2">
          <Button
            label={
              evidencePaths.length > 0
                ? `${evidencePaths.length} photo${evidencePaths.length === 1 ? '' : 's'} attached`
                : 'Add photos (optional)'
            }
            variant="secondary"
            icon="images-outline"
            loading={uploading}
            onPress={handleAddPhotos}
          />
          {evidencePaths.length > 0 ? (
            <Button label="Clear photos" variant="ghost" onPress={() => setEvidencePaths([])} />
          ) : null}
        </View>

        {error ? <Text className="text-sm text-danger">{error}</Text> : null}

        <Button
          label="Submit report"
          variant="danger"
          size="lg"
          loading={loading}
          onPress={handleSubmit}
        />
        <Button label="Cancel" variant="secondary" onPress={handleClose} disabled={loading} />
      </ScrollView>
    </Modal>
  );
}
