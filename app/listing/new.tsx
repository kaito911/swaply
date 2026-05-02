// app/listing/new.tsx
// 出品フロー エントリポイント → /listing/new/image へリダイレクト
import { router } from 'expo-router'
import { useEffect } from 'react'
import { View } from 'react-native'

export default function ListingNewScreen() {
  useEffect(() => {
    router.replace('/listing/new/image' as never)
  }, [])
  return <View />
}
