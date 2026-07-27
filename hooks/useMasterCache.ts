// hooks/useMasterCache.ts
//
// 修正3: モジュール変数の master cache (lib/master.ts) を React に購読させるフック。
//   cache は React state ではないため、後から埋まっても既描画のカードが直らない (症状C)。
//   useSyncExternalStore で cache のバージョンを購読し、cache 差し替え時に再描画させる。
//   ★store 本体 (subscribe/version) は lib/master.ts 側 (React 非依存) に置き、
//     React 依存はこのフックに閉じ込める。
//
// 使い方: formatStructuredGive / formatStructuredWantFields を呼ぶ描画コンポーネントで
//   本フックを呼ぶ (返り値は使わなくてよい)。cache 更新で再描画され、slug/空欄→名前に差し替わる。

import { getMasterCacheVersion, subscribeMasterCache } from '@/lib/master'
import { useSyncExternalStore } from 'react'

export function useMasterCache(): number {
  return useSyncExternalStore(
    subscribeMasterCache,
    getMasterCacheVersion,
    getMasterCacheVersion,
  )
}
