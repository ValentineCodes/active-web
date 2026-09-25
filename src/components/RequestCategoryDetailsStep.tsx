import { Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { Choice } from '@/components/ui/Choice';
import { TextField } from '@/components/ui/TextField';
import {
  CATEGORY_FIELD_DEFS,
  type CategoryDetailsForm,
  PACKAGE_SIZES,
  PROPERTY_TYPES,
  type RequestCategorySlug,
} from '@/features/requests/category-data';
import { pickRequestPhotos, requestPhotoLimit } from '@/features/requests/request-media';
import { colors } from '@/theme';

function labelForPackageSize(size: string) {
  if (size === 'small') return 'Small (fits in a bag)';
  if (size === 'medium') return 'Medium (boot of a car)';
  return 'Large (needs extra space)';
}

function labelForPropertyType(type: string) {
  if (type === 'apartment') return 'Apartment';
  if (type === 'house') return 'House';
  if (type === 'office') return 'Office';
  return 'Other';
}

export function RequestCategoryDetailsStep({
  categorySlug,
  details,
  onChange,
  error,
}: {
  categorySlug: RequestCategorySlug;
  details: CategoryDetailsForm;
  onChange: (next: CategoryDetailsForm) => void;
  error: string | null;
}) {
  const set = (patch: Partial<CategoryDetailsForm>) => onChange({ ...details, ...patch });
  const fields = CATEGORY_FIELD_DEFS[categorySlug];

  const addPhotos = async () => {
    const slotsLeft = requestPhotoLimit - details.photoUris.length;
    if (slotsLeft <= 0) return;

    const result = await pickRequestPhotos(slotsLeft);
    if (result.canceled) return;

    const uris = result.assets.map((asset) => asset.uri);
    set({ photoUris: [...details.photoUris, ...uris].slice(0, requestPhotoLimit) });
  };

  const removePhoto = (uri: string) => {
    set({ photoUris: details.photoUris.filter((item) => item !== uri) });
  };

  return (
    <View className="gap-4">
      <Text className="text-2xl font-bold text-ink">{fields.title}</Text>
      {fields.subtitle ? <Text className="text-base text-muted">{fields.subtitle}</Text> : null}

      {categorySlug === 'ride' || categorySlug === 'delivery' || categorySlug === 'moving' ? (
        <TextField
          label="Pickup"
          value={details.pickup}
          onChangeText={(pickup) => set({ pickup })}
          placeholder="e.g. 12 Herbert Macaulay Way, Yaba"
        />
      ) : null}

      {categorySlug === 'ride' ? (
        <>
          <TextField
            label="Destination"
            value={details.destination}
            onChangeText={(destination) => set({ destination })}
            placeholder="e.g. Murtala Muhammed Airport"
          />
          <TextField
            label="Passengers (optional)"
            value={details.passengerCount}
            onChangeText={(passengerCount) => set({ passengerCount })}
            keyboardType="number-pad"
            placeholder="e.g. 2"
          />
        </>
      ) : null}

      {categorySlug === 'delivery' || categorySlug === 'moving' ? (
        <TextField
          label="Drop-off"
          value={details.dropOff}
          onChangeText={(dropOff) => set({ dropOff })}
          placeholder={
            categorySlug === 'moving' ? 'Where are you moving to?' : 'Where should it be delivered?'
          }
        />
      ) : null}

      {categorySlug === 'delivery' ? (
        <>
          <TextField
            label="Package type"
            value={details.packageType}
            onChangeText={(packageType) => set({ packageType })}
            placeholder="e.g. Documents, food, electronics"
          />
          <View className="gap-2">
            <Text className="text-sm font-semibold text-ink">Package size</Text>
            {PACKAGE_SIZES.map((size) => (
              <Choice
                key={size}
                title={labelForPackageSize(size)}
                selected={details.packageSize === size}
                onPress={() => set({ packageSize: size })}
              />
            ))}
          </View>
        </>
      ) : null}

      {categorySlug === 'cleaning' ? (
        <>
          <View className="gap-2">
            <Text className="text-sm font-semibold text-ink">Property type</Text>
            {PROPERTY_TYPES.map((type) => (
              <Choice
                key={type}
                title={labelForPropertyType(type)}
                selected={details.propertyType === type}
                onPress={() => set({ propertyType: type })}
              />
            ))}
          </View>
          <TextField
            label="Number of rooms"
            value={details.roomCount}
            onChangeText={(roomCount) => set({ roomCount })}
            keyboardType="number-pad"
            placeholder="e.g. 3"
          />
        </>
      ) : null}

      {categorySlug === 'repair' ? (
        <>
          <TextField
            label="Repair category"
            value={details.repairCategory}
            onChangeText={(repairCategory) => set({ repairCategory })}
            placeholder="e.g. Generator, plumbing, phone screen"
          />
          <TextField
            label="Problem description"
            value={details.problemDescription}
            onChangeText={(problemDescription) => set({ problemDescription })}
            placeholder="What is wrong, and when did it start?"
            multiline
            numberOfLines={4}
          />
          <View className="gap-3">
            <Text className="text-sm font-semibold text-ink">Photos (optional)</Text>
            {details.photoUris.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {details.photoUris.map((uri) => (
                  <Pressable
                    key={uri}
                    onPress={() => removePhoto(uri)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    className="relative"
                  >
                    <Image source={{ uri }} className="h-20 w-20 rounded-xl" />
                    <View className="absolute -right-1 -top-1 rounded-full bg-ink p-0.5">
                      <Ionicons name="close" size={14} color={colors.canvas} />
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {details.photoUris.length < requestPhotoLimit ? (
              <Button
                label="Add photos"
                icon="image-outline"
                variant="secondary"
                onPress={() => void addPhotos()}
              />
            ) : null}
          </View>
        </>
      ) : null}

      {fields.showPreferredTime ? (
        <TextField
          label="Preferred time (optional)"
          value={details.preferredTime}
          onChangeText={(preferredTime) => set({ preferredTime })}
          placeholder="e.g. Morning only, after 5pm"
        />
      ) : null}

      <TextField
        label="Notes (optional)"
        value={details.notes}
        onChangeText={(notes) => set({ notes })}
        placeholder="Anything else providers should know"
        multiline
        numberOfLines={3}
      />

      {error ? <Text className="text-sm text-danger">{error}</Text> : null}
    </View>
  );
}
