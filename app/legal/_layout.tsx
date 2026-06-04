// app/legal/_layout.tsx
// 法務関連画面 (利用規約 / プライバシーポリシー) の Stack layout

import { Stack } from 'expo-router'
import React from 'react'

export default function LegalLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
