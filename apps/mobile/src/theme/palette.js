/** @typedef {typeof lightPalette} ThemePalette */

/** Light palette — matches the existing product chrome. */
const lightPalette = {
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

/**
 * Dark palette — sampled from `design/` mocks (#111111 canvas, #1C1C1E cards,
 * #77DB89 accent, #767677 secondary labels).
 */
const darkPalette = {
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
  /** Inbox row icon circles — sampled from `design/notifications/inbox/*.png`. */
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
  /** iOS-style toggles — `design/notifications/settings.png`. */
  switchTrackOn: '#4ADE80',
  switchTrackOff: '#424242',
  switchThumb: '#FFFFFF',
};

function hexToRgbChannels(hex) {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/** RGB channel tuples for Tailwind `rgb(var(--token) / α)` — shared with tailwind.config.js. */
function paletteToCssVarRecord(palette) {
  return {
    '--color-ink': hexToRgbChannels(palette.ink),
    '--color-subtle': hexToRgbChannels(palette.subtle),
    '--color-muted': hexToRgbChannels(palette.muted),
    '--color-canvas': hexToRgbChannels(palette.canvas),
    '--color-surface': hexToRgbChannels(palette.surface),
    '--color-elevated': hexToRgbChannels(palette.elevated),
    '--color-hairline': hexToRgbChannels(palette.hairline),
    '--color-brand': hexToRgbChannels(palette.brand),
    '--color-brand-strong': hexToRgbChannels(palette.brandStrong),
    '--color-brand-soft': hexToRgbChannels(palette.brandSoft),
    '--color-active': hexToRgbChannels(palette.active),
    '--color-active-soft': hexToRgbChannels(palette.activeSoft),
    '--color-on-brand': hexToRgbChannels(palette.onBrand),
    '--color-danger': hexToRgbChannels(palette.danger),
    '--color-danger-soft': hexToRgbChannels(palette.dangerSoft),
    '--color-warning': hexToRgbChannels(palette.warning),
    '--color-warning-soft': hexToRgbChannels(palette.warningSoft),
    '--color-info': hexToRgbChannels(palette.info),
    '--color-info-soft': hexToRgbChannels(palette.infoSoft),
    '--color-notification-chip-blue-bg': hexToRgbChannels(palette.notificationChipBlueBg),
    '--color-notification-chip-blue-fg': hexToRgbChannels(palette.notificationChipBlueFg),
    '--color-notification-chip-purple-bg': hexToRgbChannels(palette.notificationChipPurpleBg),
    '--color-notification-chip-purple-fg': hexToRgbChannels(palette.notificationChipPurpleFg),
    '--color-notification-chip-green-bg': hexToRgbChannels(palette.notificationChipGreenBg),
    '--color-notification-chip-green-fg': hexToRgbChannels(palette.notificationChipGreenFg),
    '--color-notification-chip-amber-bg': hexToRgbChannels(palette.notificationChipAmberBg),
    '--color-notification-chip-amber-fg': hexToRgbChannels(palette.notificationChipAmberFg),
    '--color-notification-chip-red-bg': hexToRgbChannels(palette.notificationChipRedBg),
    '--color-notification-chip-red-fg': hexToRgbChannels(palette.notificationChipRedFg),
    '--color-switch-track-on': hexToRgbChannels(palette.switchTrackOn),
    '--color-switch-track-off': hexToRgbChannels(palette.switchTrackOff),
    '--color-switch-thumb': hexToRgbChannels(palette.switchThumb),
  };
}

module.exports = { lightPalette, darkPalette, hexToRgbChannels, paletteToCssVarRecord };
