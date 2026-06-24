// components/PrimaryCTA.tsx
import { colors, radius } from '@/constants/theme'
import { LinearGradient } from 'expo-linear-gradient'
import React from 'react'
import {
  ActivityIndicator,
  StyleProp,
  Text,
  TouchableOpacity,
  ViewStyle,
} from 'react-native'

// わくわく化 STEP 2: primary variant のみグラデーション + 色付き影で立体感を出す。
//   ベタ塗り単色の「安っぽさ」を物理的な奥行きで上質化する狙い。
//   多色グラデは禁止 (派手 / トレポータル風)、coral 系同系色 2-stop で配光を表現。
//   outline / ghost variant は無変更 (フラット・控えめ維持で階層差別化)。
//
//   経緯 (実機検証ベース、確定値に至るまで):
//     #E55385 → ピンクのきらめき・チカチカ感 → NG
//     #D44A78 (深め) → 落ち着きすぎ・地味 → NG
//     #DB678D (dusty pink) → muted すぎ → NG
//     ★ #EB6189 → #C04075 (少し薄め coral) → 「Swaply の色」として確定
//
//   グラデ色 (上 → 下) — Swaply 正式 coral:
//     top:    #EB6189 (HSL 343°, 76%, 65%、明度高めの明るい coral)
//     bottom: #C04075 (HSL 333°, 50%, 50%、影感、bottom 側でグラデの奥行き)
//
//   コントラスト (白文字):
//     top    3.16:1 (AA Large ✅、AA Normal 4.5:1 未達)
//     bottom 4.96:1 (AA Normal ✅)
//     PrimaryCTA は fontWeight:'700' + 13-16px = bold large 扱いで実用 OK 範囲。
const PRIMARY_GRADIENT = ['#EB6189', '#C04075'] as const

//   影 (color 付き、Apple HIG 推奨):
//     黒影より color 付き影で「色が滲んで光る」表現 → 柔らかさと立体感の両立。
//     offset.y=4 / opacity=0.25 / radius=12 = Material elevated button 相当 (M3)。
const PRIMARY_SHADOW = {
  shadowColor: '#D94370',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 12,
  elevation: 6,
}

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

  // primary (coral グラデーション + 色付き影)
  // 構造: TouchableOpacity (height + borderRadius + 影) → LinearGradient (塗り + 内側 align)。
  //   overflow:'hidden' は外す (iOS で shadow が消える挙動を防ぐため)。
  //   borderRadius は外側 TouchableOpacity と内側 LinearGradient 両方に持たせ、
  //   gradient が角の外にはみ出ないようにする (iOS / Android ともに安定動作)。
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={[
        {
          height,
          borderRadius: bRadius,
          opacity: isDisabled ? 0.5 : 1,
        },
        PRIMARY_SHADOW,
        style,
      ]}
    >
      <LinearGradient
        colors={PRIMARY_GRADIENT as unknown as readonly [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{
          flex: 1,
          borderRadius: bRadius,
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