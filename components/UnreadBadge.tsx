// components/UnreadBadge.tsx
// 取引DM未読の赤丸バッジ (単一実装)。取引一覧 (trades) と取引履歴 (history) で共用する。
// BottomTabBar / HeaderActions の赤丸と視覚を揃える (#EF4444 / 白文字 / 99超は 99+)。
//
// ★alignSelf は敢えて持たせない。配置 (縦位置) は呼び出し側の親の alignItems に委ねる:
//   - trades の cardHeader (align-items 既定=stretch) では上寄せ (従来の見た目を維持)
//   - history の row (alignItems:'center') では縦中央
// count <= 0 のときは何も描画しない (呼び出し側で条件分岐を書かなくてよい)。
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : String(count)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
})
