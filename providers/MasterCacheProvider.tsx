// providers/MasterCacheProvider.tsx
// 起動時に master 系 (works/characters/item_types) を eager fetch してメモリ + AsyncStorage
// キャッシュ (lib/master.ts)。失敗時は指数バックオフでリトライし、AppState 復帰でも再取得する。

import { ensureMasterCacheFresh, initMasterCache } from '@/lib/master'
import React, { ReactNode, useEffect } from 'react'
import { AppState } from 'react-native'

export function MasterCacheProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void initMasterCache()

    // 修正4: バックグラウンド→復帰 (active) で未確認テーブルがあれば再取得する。
    //   ★BadgeProvider に相乗りせず独立リスナーにする理由:
    //     (1) RN の AppState は複数リスナーを独立登録できる (lib/supabase.ts:83 でも併存実績あり)、
    //     (2) master のライフサイクルを本 Provider に閉じ込め、Badge ドメインと結合させない。
    //   ※前面での機内モード OFF は 'active' 遷移を伴わないため、その回復は
    //     lib/master.ts のリトライ窓 (指数バックオフ) が担う。
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') ensureMasterCacheFresh()
    })
    return () => sub.remove()
  }, [])

  return <>{children}</>
}
