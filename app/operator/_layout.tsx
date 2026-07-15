// app/operator/_layout.tsx
// 運営 (operator) 専用画面グループ。画面内 ScreenHeader を使うため native ヘッダーは出さない。
// ★アクセス制御は各画面側で isOperator() + RPC の operator ゲートで二重に担保する
//   (この layout はヘッダー制御のみ。非 operator を弾くのは画面側の責務)。
import { Stack } from 'expo-router'
import React from 'react'

export default function OperatorLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  )
}
