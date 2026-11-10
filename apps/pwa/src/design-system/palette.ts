/**
 * Copied verbatim from `apps/mobile/src/theme/palette.js` (do not import mobile at runtime).
 * `@active/pwa` only — mobile remains the source of truth when values change.
 */
export type ThemePalette = {
  ink: string;
  subtle: string;
  muted: string;
  canvas: string;
  surface: string;
  elevated: string;
  hairline: string;
  brand: string;
  brandStrong: string;
  brandSoft: string;
  active: string;
  activeSoft: string;
  onBrand: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  notificationChipBlueBg: string;
  notificationChipBlueFg: string;
  notificationChipPurpleBg: string;
  notificationChipPurpleFg: string;
  notificationChipGreenBg: string;
  notificationChipGreenFg: string;
  notificationChipAmberBg: string;
  notificationChipAmberFg: string;
  notificationChipRedBg: string;
  notificationChipRedFg: string;
  switchTrackOn: string;
  switchTrackOff: string;
  switchThumb: string;
};

export const lightPalette: ThemePalette = {
  ink: '#111812',
  subtle: '#8A948C',
  muted: '#5C665E',
  canvas: '#FFFFFF',
  surface: '#F3F5F2',
  elevated: '#FFFFFF',
  hairline: '#E6EAE4',
  brand: '#166A3D',
  brandStrong: '#0E4C2A',
  brandSoft: '#E7F4EA',
  active: '#1FA35A',
  activeSoft: '#E8F8EC',
  onBrand: '#FFFFFF',
  danger: '#DC2626',
  dangerSoft: '#FDEDEC',
  warning: '#B45309',
  warningSoft: '#FDF3E3',
  info: '#2563EB',
  infoSoft: '#EAF1FE',
  notificationChipBlueBg: '#DBEAFE',
  notificationChipBlueFg: '#2563EB',
  notificationChipPurpleBg: '#EDE9FE',
  notificationChipPurpleFg: '#5B21B6',
  notificationChipGreenBg: '#BBF7D0',
  notificationChipGreenFg: '#15803D',
  notificationChipAmberBg: '#FEF3C7',
  notificationChipAmberFg: '#B45309',
  notificationChipRedBg: '#FEE2E2',
  notificationChipRedFg: '#DC2626',
  switchTrackOn: '#1FA35A',
  switchTrackOff: '#D1D5DB',
  switchThumb: '#FFFFFF',
};

export const darkPalette: ThemePalette = {
  ink: '#FFFFFF',
  subtle: '#767677',
  muted: '#666666',
  canvas: '#111111',
  surface: '#141414',
  elevated: '#1C1C1E',
  hairline: '#333333',
  brand: '#77DB89',
  brandStrong: '#549B61',
  brandSoft: '#252F29',
  active: '#77DB89',
  activeSoft: '#252F29',
  onBrand: '#111111',
  danger: '#FF453A',
  dangerSoft: '#2C1514',
  warning: '#F5BC1E',
  warningSoft: '#2A2410',
  info: '#0A84FF',
  infoSoft: '#152438',
  notificationChipBlueBg: '#1E293B',
  notificationChipBlueFg: '#60A5FA',
  notificationChipPurpleBg: '#2E1065',
  notificationChipPurpleFg: '#DDD6FE',
  notificationChipGreenBg: '#1B2E1E',
  notificationChipGreenFg: '#4ADE80',
  notificationChipAmberBg: '#422006',
  notificationChipAmberFg: '#F5BC1E',
  notificationChipRedBg: '#3B1212',
  notificationChipRedFg: '#FF453A',
  switchTrackOn: '#4ADE80',
  switchTrackOff: '#424242',
  switchThumb: '#FFFFFF',
};

export function hexToRgbChannels(hex: string): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}
