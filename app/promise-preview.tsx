// app/promise-preview.tsx
// 「Swaplyの約束」ページのプレビュー（マイページから到達）。
// onboarding.tsx の PromiseStep（約束ページ・薄字→濃字アニメ）をそのまま表示する。
// ★AsyncStorage/onboarding_done/認証ゲートは一切触らない（見た目・アニメの確認専用）。
//   CTA「Swaplyを始める」は router.back() で前画面に戻るだけ（onboarding は完了させない）。
import { router } from 'expo-router'
import { PromiseStep } from './onboarding'
import React from 'react'

export default function PromisePreviewScreen() {
  return <PromiseStep onStart={() => router.back()} />
}
