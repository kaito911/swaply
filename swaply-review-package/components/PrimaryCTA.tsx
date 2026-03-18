// components/PrimaryCTA.tsx
import { colors, radius, shadow } from '@/constants/theme'
import { LinearGradient } from 'expo-linear-gradient'
import React from 'react'
import {
  ActivityIndicator,
  StyleProp,
  Text,
  TouchableOpacity,
  ViewStyle,
} from 'react-native'

type CTAVariant = 'primary' | 'outline' | 'ghost'
type CTASize = 'sm' | 'md' | 'lg'

interface PrimaryCTAProps {
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  size?: CTASize
  variant?: CTAVariant
  style?: StyleProp<ViewStyle>
}

const HEIGHT: Record<CTASize, number> = { sm: 36, md: 48, lg: 56 }
const FONT_SIZE: Record<CTASize, number> = { sm: 13, md: 15, lg: 16 }
const BORDER_RADIUS: Record<CTASize, number> = {
  sm: radius.lg,
  md: radius.xl,
  lg: radius.xl,
}

export function PrimaryCTA({
  label,
  onPress,
  loading = false,
  disabled = false,
  size = 'md',
  variant = 'primary',
  style,
}: PrimaryCTAProps) {
  const isDisabled = disabled || loading
  const height = HEIGHT[size]
  const fontSize = FONT_SIZE[size]
  const bRadius = BORDER_RADIUS[size]

  if (variant === 'outline') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.8}
        style={[
          {
            height,
            borderRadius: bRadius,
            borderWidth: 1.5,
            borderColor: colors.primary,
            alignItems: 'center' as const,
            justifyContent: 'center' as const,
            opacity: isDisabled ? 0.5 : 1,
          },
          style,
        ]}
      >
        <Text style={{ fontSize, color: colors.primary, fontWeight: '700' }}>
          {label}
        </Text>
      </TouchableOpacity>
    )
  }

  if (variant === 'ghost') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.7}
        style={[
          {
            height,
            alignItems: 'center' as const,
            justifyContent: 'center' as const,
            opacity: isDisabled ? 0.5 : 1,
          },
          style,
        ]}
      >
        <Text style={{ fontSize, color: colors.primary, fontWeight: '600' }}>
          {label}
        </Text>
      </TouchableOpacity>
    )
  }

  // primary (gradient)
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={[
        {
          height,
          borderRadius: bRadius,
          overflow: 'hidden' as const,
          opacity: isDisabled ? 0.5 : 1,
        },
        shadow.md,
        style,
      ]}
    >
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 16,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.textInverse} />
        ) : (
          <Text
            style={{
              fontSize,
              color: colors.textInverse,
              fontWeight: '700',
              letterSpacing: 0.3,
            }}
          >
            {label}
          </Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  )
}