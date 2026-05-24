// providers/MasterCacheProvider.tsx
// 起動時に master 系 (works/characters/item_types) を eager fetch してメモリキャッシュ。
// 失敗時は空キャッシュで継続 (autocomplete 不能だがフリーテキスト fallback で出品可)。

import { initMasterCache } from '@/lib/master'
import React, { ReactNode, useEffect } from 'react'

export function MasterCacheProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void initMasterCache()
  }, [])

  return <>{children}</>
}
