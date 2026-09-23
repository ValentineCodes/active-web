/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Text & surfaces
        ink: '#111812',
        subtle: '#8A948C',
        muted: '#5C665E',
        canvas: '#FFFFFF',
        surface: '#F3F5F2',
        elevated: '#FFFFFF',
        hairline: '#E6EAE4',

        // Brand — the one green used for every primary action.
        brand: '#166A3D',
        'brand-strong': '#0E4C2A',
        'brand-soft': '#E7F4EA',

        // Live/availability state.
        active: '#1FA35A',
        'active-soft': '#E8F8EC',

        // Status
        danger: '#DC2626',
        'danger-soft': '#FDEDEC',
        warning: '#B45309',
        'warning-soft': '#FDF3E3',
        info: '#2563EB',
        'info-soft': '#EAF1FE',
      },
    },
  },
  plugins: [],
};
