// components/KeyboardAwareScroll.tsx
//
// master 入力の候補ドロップダウン(入力欄の下に in-flow 描画)がキーボードに隠れる問題(①)対策。
//   automaticallyAdjustKeyboardInsets は first-responder(入力欄)しか可視化せず、その下に出る
//   候補はキーボード裏に残る。そこで候補出現時に「入力欄を親 ScrollView 可視域の上部へ寄せる」
//   scroll を明示的に撃ち、下に続く候補を可視域へ収める。
//
// 疎結合設計:
//   - 共有部品 (MultiSelectAutocomplete / WorkSection) は Context 経由で ensureVisible を
//     consume するのみ(親 ScrollView を知らない = contract だけ持つ)。
//   - 各画面が自分の ScrollView ref で実装を provide する。
//   - 中間ラッパー (CharactersSection / ItemsSection / WantMasterSection) は無改修で素通り。
//
// keyboard 高さ非依存: 入力欄を上部へ寄せる方式 (keyboard-frame 依存 API は使わない)。
//   measureLayout + scrollTo はコンテンツ座標で完結するため transparent Modal 内でも動作する。

import React, { createContext, useCallback, useContext, useRef } from 'react'
import { findNodeHandle, ScrollView } from 'react-native'

// measureLayout を持つ最小 contract (View / TextInput などの host ref が満たす)。
type Measurable = {
  measureLayout: (
    relativeToNativeNode: number,
    onSuccess: (left: number, top: number, width: number, height: number) => void,
    onFail?: () => void,
  ) => void
}

export type EnsureVisibleFn = (ref: React.RefObject<Measurable | null>) => void

const noop: EnsureVisibleFn = () => {}

const EnsureVisibleContext = createContext<EnsureVisibleFn>(noop)

export const KeyboardAwareScrollProvider = EnsureVisibleContext.Provider

/** 候補ドロップダウン等を親 ScrollView の可視域上部へ寄せる関数。Provider 外では no-op。 */
export function useEnsureVisible(): EnsureVisibleFn {
  return useContext(EnsureVisibleContext)
}

/**
 * 画面側フック。ScrollView に spread する { scrollRef, onScroll } と、
 * Provider に渡す ensureVisible を返す。
 *
 * ensureVisible(ref): ref 要素の top を ScrollView 可視域の上部付近へ scroll する。
 *   ★既に上部付近 (near-top) にあれば scroll しない (絞り込み再 layout 時の誤爆防止)。
 *
 * externalRef: 既存の ScrollView ref を再利用する場合に渡す (シートの sheetScrollRef 等)。
 */
export function useKeyboardAwareScroll(
  externalRef?: React.RefObject<ScrollView | null>,
) {
  const localRef = useRef<ScrollView | null>(null)
  const scrollRef = externalRef ?? localRef
  const scrollY = useRef(0)

  const onScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      scrollY.current = e.nativeEvent.contentOffset.y
    },
    [],
  )

  const ensureVisible = useCallback<EnsureVisibleFn>(
    (targetRef) => {
      const target = targetRef.current
      const scroll = scrollRef.current
      if (target == null || scroll == null) return
      const scrollNode = findNodeHandle(scroll)
      if (scrollNode == null) return
      target.measureLayout(
        scrollNode,
        (_left, top) => {
          const TOP_MARGIN = 12
          const NEAR_TOP = 80
          // top = 入力欄の content 内 y。viewport 上端 = scrollY.current。
          // 既に可視域上部にある (絞り込み再 layout / ユーザーが上へ scroll 済) → 何もしない。
          if (top - scrollY.current <= NEAR_TOP) return
          scroll.scrollTo({ y: Math.max(0, top - TOP_MARGIN), animated: true })
        },
        () => {},
      )
    },
    [scrollRef],
  )

  return { scrollRef, onScroll, ensureVisible }
}
