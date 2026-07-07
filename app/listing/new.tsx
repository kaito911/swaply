// app/listing/new.tsx
// 出品フロー エントリポイント → /listing/new/choose (2択分岐) へリダイレクト
// 出品フロー刷新 Phase 1: 旧 /listing/new/image 直行を廃し、全入口を choose に統一。
import { router } from 'expo-router'
import { useEffect } from 'react'
import { View } from 'react-native'

export default function ListingNewScreen() {
  useEffect(() => {
    router.replace('/listing/new/choose' as never)
  }, [])
  return <View />
}
