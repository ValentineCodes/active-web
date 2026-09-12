/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: '#0B0F14',
        canvas: '#FFFFFF',
        surface: '#F6F7F9',
        hairline: '#E4E7EB',
        muted: '#6B7280',
        brand: '#2563EB',
        'brand-soft': '#EFF4FF',
        active: '#10B981',
        'active-soft': '#ECFDF5',
        danger: '#DC2626',
        'danger-soft': '#FEF2F2',
        warning: '#B45309',
        'warning-soft': '#FFFBEB',
      },
    },
  },
  plugins: [],
};
