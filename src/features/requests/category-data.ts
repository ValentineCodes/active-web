import type { Json } from '@/lib/supabase/database.types';

/** Slugs seeded in public.service_categories (plus migrations). */
export type RequestCategorySlug =
  'ride' | 'delivery' | 'errand' | 'repair' | 'cleaning' | 'moving' | 'other';

export type CategoryDetailsForm = {
  pickup: string;
  destination: string;
  dropOff: string;
  passengerCount: string;
  packageType: string;
  packageSize: string;
  propertyType: string;
  roomCount: string;
  preferredTime: string;
  repairCategory: string;
  problemDescription: string;
  notes: string;
  /** Local URIs chosen in the form; uploaded on submit. */
  photoUris: string[];
  /** Storage paths kept from a reused request; not re-uploaded. */
  storedPhotoPaths: string[];
};

export function emptyCategoryDetails(): CategoryDetailsForm {
  return {
    pickup: '',
    destination: '',
    dropOff: '',
    passengerCount: '',
    packageType: '',
    packageSize: '',
    propertyType: '',
    roomCount: '',
    preferredTime: '',
    repairCategory: '',
    problemDescription: '',
    notes: '',
    photoUris: [],
    storedPhotoPaths: [],
  };
}

const PACKAGE_SIZES = ['small', 'medium', 'large'] as const;
const PROPERTY_TYPES = ['apartment', 'house', 'office', 'other'] as const;

export { PACKAGE_SIZES, PROPERTY_TYPES };

export const CATEGORY_FIELD_DEFS: Record<
  RequestCategorySlug,
  { title: string; subtitle?: string; showPreferredTime: boolean }
> = {
  ride: { title: 'Ride details', showPreferredTime: false },
  delivery: { title: 'Delivery details', showPreferredTime: false },
  errand: {
    title: 'Errand details',
    subtitle: 'Add anything specific about what needs doing.',
    showPreferredTime: true,
  },
  repair: { title: 'Repair details', showPreferredTime: true },
  cleaning: { title: 'Cleaning details', showPreferredTime: true },
  moving: { title: 'Moving details', showPreferredTime: true },
  other: {
    title: 'Anything else?',
    subtitle: 'Optional details beyond your description.',
    showPreferredTime: true,
  },
};

export function categoryDetailsError(
  slug: RequestCategorySlug | null,
  details: CategoryDetailsForm,
): string | null {
  if (!slug) return 'Choose a category.';

  const trimmed = (value: string) => value.trim();

  switch (slug) {
    case 'ride':
      if (!trimmed(details.pickup)) return 'Enter a pickup location.';
      if (!trimmed(details.destination)) return 'Enter a destination.';
      if (details.passengerCount.trim()) {
        const count = Number(details.passengerCount.replace(/[^\d]/g, ''));
        if (Number.isNaN(count) || count < 1 || count > 8) {
          return 'Passenger count must be between 1 and 8.';
        }
      }
      return null;
    case 'delivery':
      if (!trimmed(details.pickup)) return 'Enter a pickup location.';
      if (!trimmed(details.dropOff)) return 'Enter a drop-off location.';
      if (!trimmed(details.packageType)) return 'Describe what you are sending.';
      if (!details.packageSize) return 'Choose a package size.';
      return null;
    case 'cleaning':
      if (!details.propertyType) return 'Choose a property type.';
      if (!details.roomCount.trim()) return 'Enter the number of rooms.';
      {
        const rooms = Number(details.roomCount.replace(/[^\d]/g, ''));
        if (Number.isNaN(rooms) || rooms < 1 || rooms > 50) {
          return 'Room count must be between 1 and 50.';
        }
      }
      return null;
    case 'repair':
      if (!trimmed(details.repairCategory)) return 'What needs repairing?';
      if (!trimmed(details.problemDescription)) return 'Describe the problem.';
      return null;
    case 'moving':
      if (!trimmed(details.pickup)) return 'Enter a pickup location.';
      if (!trimmed(details.dropOff)) return 'Enter a drop-off location.';
      return null;
    case 'errand':
    case 'other':
      return null;
    default:
      return null;
  }
}

export function buildCategoryData(
  slug: RequestCategorySlug,
  details: CategoryDetailsForm,
  photoPaths: string[],
): Json {
  const t = (value: string) => value.trim();
  const note = t(details.notes);
  const preferredTime = t(details.preferredTime);

  const base: Record<string, Json> = {};
  if (note) base.notes = note;
  if (preferredTime) base.preferred_time = preferredTime;
  const allPhotoPaths = [...details.storedPhotoPaths, ...photoPaths];
  if (allPhotoPaths.length > 0) base.photo_paths = allPhotoPaths;

  switch (slug) {
    case 'ride':
      return {
        ...base,
        pickup: t(details.pickup),
        destination: t(details.destination),
        ...(details.passengerCount.trim()
          ? { passenger_count: Number(details.passengerCount.replace(/[^\d]/g, '')) }
          : {}),
      };
    case 'delivery':
      return {
        ...base,
        pickup: t(details.pickup),
        drop_off: t(details.dropOff),
        package_type: t(details.packageType),
        package_size: details.packageSize,
      };
    case 'cleaning':
      return {
        ...base,
        property_type: details.propertyType,
        room_count: Number(details.roomCount.replace(/[^\d]/g, '')),
      };
    case 'repair':
      return {
        ...base,
        repair_category: t(details.repairCategory),
        problem_description: t(details.problemDescription),
      };
    case 'moving':
      return {
        ...base,
        ...(t(details.pickup) ? { pickup: t(details.pickup) } : {}),
        ...(t(details.dropOff) ? { drop_off: t(details.dropOff) } : {}),
      };
    case 'errand':
    case 'other':
      return base;
    default:
      return base;
  }
}

export type CategoryDataSummaryLine = { label: string; value: string };

function labelPackageSize(size: string) {
  if (size === 'small') return 'Small';
  if (size === 'medium') return 'Medium';
  return 'Large';
}

function labelPropertyType(type: string) {
  if (type === 'apartment') return 'Apartment';
  if (type === 'house') return 'House';
  if (type === 'office') return 'Office';
  if (type === 'other') return 'Other';
  return type;
}

function asRecord(categoryData: Json): Record<string, unknown> | null {
  if (!categoryData || typeof categoryData !== 'object' || Array.isArray(categoryData)) {
    return null;
  }
  return categoryData as Record<string, unknown>;
}

export function categoryDetailsFromCategoryData(
  _categorySlug: RequestCategorySlug,
  categoryData: Json,
): CategoryDetailsForm {
  const record = asRecord(categoryData) ?? {};
  const textField = (key: string) => {
    const value = record[key];
    return typeof value === 'string' ? value : '';
  };
  const numberField = (key: string) => {
    const value = record[key];
    return typeof value === 'number' && !Number.isNaN(value) ? String(value) : '';
  };

  return {
    pickup: textField('pickup'),
    destination: textField('destination'),
    dropOff: textField('drop_off'),
    passengerCount: numberField('passenger_count'),
    packageType: textField('package_type'),
    packageSize: textField('package_size'),
    propertyType: textField('property_type'),
    roomCount: numberField('room_count'),
    preferredTime: textField('preferred_time'),
    repairCategory: textField('repair_category'),
    problemDescription: textField('problem_description'),
    notes: textField('notes'),
    photoUris: [],
    storedPhotoPaths: photoPathsFromCategoryData(categoryData),
  };
}

export function photoPathsFromCategoryData(categoryData: Json): string[] {
  const record = asRecord(categoryData);
  const paths = record?.photo_paths;
  if (!Array.isArray(paths)) return [];
  return paths.filter((path): path is string => typeof path === 'string' && path.length > 0);
}

/** Human-readable lines from persisted `category_data` on a request row. */
export function formatStoredCategoryData(
  categorySlug: string,
  categoryData: Json,
): CategoryDataSummaryLine[] {
  const record = asRecord(categoryData);
  if (!record) return [];

  const lines: CategoryDataSummaryLine[] = [];
  const pushText = (label: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      lines.push({ label, value: value.trim() });
    }
  };
  const pushNumber = (label: string, value: unknown) => {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      lines.push({ label, value: String(value) });
    }
  };

  switch (categorySlug) {
    case 'ride':
      pushText('Pickup', record.pickup);
      pushText('Destination', record.destination);
      pushNumber('Passengers', record.passenger_count);
      break;
    case 'delivery':
      pushText('Pickup', record.pickup);
      pushText('Drop-off', record.drop_off);
      pushText('Package', record.package_type);
      if (typeof record.package_size === 'string') {
        pushText('Size', labelPackageSize(record.package_size));
      }
      break;
    case 'cleaning':
      if (typeof record.property_type === 'string') {
        pushText('Property', labelPropertyType(record.property_type));
      }
      pushNumber('Rooms', record.room_count);
      break;
    case 'repair':
      pushText('Category', record.repair_category);
      pushText('Problem', record.problem_description);
      break;
    case 'moving':
      pushText('Pickup', record.pickup);
      pushText('Drop-off', record.drop_off);
      break;
    default:
      break;
  }

  pushText('Preferred time', record.preferred_time);
  pushText('Notes', record.notes);

  return lines;
}

type SummaryLine = CategoryDataSummaryLine;

export function categoryDetailsSummary(
  slug: RequestCategorySlug,
  details: CategoryDetailsForm,
): SummaryLine[] {
  const t = (value: string) => value.trim();
  const lines: SummaryLine[] = [];

  const push = (label: string, value: string) => {
    if (value) lines.push({ label, value });
  };

  switch (slug) {
    case 'ride':
      push('Pickup', t(details.pickup));
      push('Destination', t(details.destination));
      if (details.passengerCount.trim()) push('Passengers', t(details.passengerCount));
      break;
    case 'delivery':
      push('Pickup', t(details.pickup));
      push('Drop-off', t(details.dropOff));
      push('Package', t(details.packageType));
      if (details.packageSize) push('Size', details.packageSize);
      break;
    case 'cleaning':
      if (details.propertyType) push('Property', details.propertyType);
      if (details.roomCount.trim()) push('Rooms', t(details.roomCount));
      break;
    case 'repair':
      push('Category', t(details.repairCategory));
      push('Problem', t(details.problemDescription));
      if (details.photoUris.length > 0 || details.storedPhotoPaths.length > 0) {
        push('Photos', `${details.photoUris.length + details.storedPhotoPaths.length} attached`);
      }
      break;
    case 'moving':
      push('Pickup', t(details.pickup));
      push('Drop-off', t(details.dropOff));
      break;
    default:
      break;
  }

  if (t(details.preferredTime)) push('Preferred time', t(details.preferredTime));
  if (t(details.notes)) push('Notes', t(details.notes));

  return lines;
}
