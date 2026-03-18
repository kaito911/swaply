// constants/theme.ts

export const colors = {
  primary: '#6C63FF',
  primaryLight: '#9B8AFB',
  primaryDark: '#5A52E0',
  gradientStart: '#6C63FF',
  gradientEnd: '#9B8AFB',

  background: '#F8F7FF',
  backgroundCard: '#FFFFFF',
  backgroundMuted: '#EFEDFF',

  textPrimary: '#1A1040',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  textInverse: '#FFFFFF',

  border: '#E8E5F8',
  borderLight: '#F0EFFE',

  trustGold: '#D97706',
  trustGoldBg: '#FFFBEB',
  trustGoldBorder: '#FDE68A',
  trustSilver: '#475569',
  trustSilverBg: '#F1F5F9',
  trustSilverBorder: '#CBD5E1',
  trustBronze: '#92400E',
  trustBronzeBg: '#FEF3C7',
  trustBronzeBorder: '#FCD34D',

  trustGreen: '#059669',
  trustBlue: '#2563EB',

  success: '#059669',
  successBg: '#ECFDF5',
  warning: '#D97706',
  warningBg: '#FFFBEB',
  error: '#DC2626',
  errorBg: '#FEF2F2',

  tagPurple: '#EDE9FE',
  tagPurpleText: '#5B21B6',
  tagBlue: '#EFF6FF',
  tagBlueText: '#1D4ED8',
  tagGreen: '#F0FDF4',
  tagGreenText: '#166534',
  tagAmber: '#FFFBEB',
  tagAmberText: '#92400E',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const

export const fontSize = {
  xs: 11,
  sm: 12,
  base: 14,
  md: 15,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 28,
  hero: 32,
} as const

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
}

export const shadow = {
  sm: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  lg: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 8,
  },
} as const