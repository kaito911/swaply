// providers/ToastProvider.tsx
//
// Phase B 微修正 (2026-07-05): 軽量トースト機構。
//
// 用途:
//   下書き保存など、確認を必要としない一時通知を画面下部に fade で表示する。
//   Alert.alert のように OK タップを強要しない、控えめな UX 通知。
//
// API:
//   - <ToastProvider>: アプリのルートに配置。Toast overlay を子ツリーの上に render する。
//   - useToast(): { showToast: (msg: string) => void } を返す。
//
// 挙動:
//   showToast(msg) 呼出 → 200ms fade-in → 2500ms 表示 → 200ms fade-out → 消滅。
//   表示中に再度 showToast された場合、新メッセージで即座に上書き + timer リセット
//   (連続表示は最後のメッセージが優先)。
//
// デザイン方針 (推しが主役・UI は器):
//   - 白基調・控えめ (backgroundCard + border + subtle shadow)
//   - coral は使わない (CTA 専用色)
//   - 画面下部、safe area の 24px 上に浮上
//   - 主張しない中間色の text (textPrimary の ink)

import { colors, fontSize, fontWeight, radius, shadow, spacing } from '@/constants/theme'
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const FADE_MS = 200
const HOLD_MS = 2500

interface ToastContextValue {
  showToast: (message: string) => void
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const opacity = useRef(new Animated.Value(0)).current
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string) => {
    // 連続表示: 最後のメッセージが優先。既存 hold timer をキャンセルして
    // setMessage で state 更新 → useEffect が fade + timer をやり直す。
    if (holdTimerRef.current != null) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    setMessage(msg)
  }, [])

  useEffect(() => {
    if (message == null) return

    // fade-in (既に 1 に近い場合も idempotent)
    Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return
      // 一定時間表示後に fade-out → message を null に落として unmount
      holdTimerRef.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_MS,
          useNativeDriver: true,
        }).start(({ finished: outFinished }) => {
          if (outFinished) setMessage(null)
        })
      }, HOLD_MS)
    })

    return () => {
      if (holdTimerRef.current != null) {
        clearTimeout(holdTimerRef.current)
        holdTimerRef.current = null
      }
    }
  }, [message, opacity])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message != null && <ToastOverlay message={message} opacity={opacity} />}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext)
}

// ─────────────────────────────────────────
// overlay
// ─────────────────────────────────────────

function ToastOverlay({
  message,
  opacity,
}: {
  message: string
  opacity: Animated.Value
}) {
  const insets = useSafeAreaInsets()
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          bottom: insets.bottom + spacing.xl,
          opacity,
        },
      ]}
    >
      <View style={styles.pill}>
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    // zIndex は sibling 順序で担保 (ToastProvider が children の後に render)
  },
  pill: {
    maxWidth: '85%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.md,
  },
  text: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
})
