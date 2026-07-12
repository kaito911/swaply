# 会場モード 配色バックアップ（紫版）

**目的**: 「暗地×光源」への配色転換（VENUE IGNITION 案）が実機でNGだった場合に、
この紫版へ**即座に戻す**ための完全記録。以下の値をそのまま復元すれば紫版に戻る。

記録時点: 2026-07-12（build 13 まで実機で使われていた紫版。item1 会場タブ
ヘッダー紫化=未commit状態も反映済）。対象ファイル: `app/venue/index.tsx` /
`app/venue/[id].tsx` / `components/venue/LiveElements.tsx`。

---

## app/venue/index.tsx（会場一覧）

```ts
// 背景グラデ（全画面 absoluteFill・上=濃紫 → 下=ピンク）
const VENUE_BG_GRADIENT = ['#2A1A5E', '#5B2A8C', '#8E3B9E', '#C0487E'] as const
const VENUE_BG_LOCATIONS = [0, 0.3, 0.6, 1] as const

// styles
root:                { backgroundColor: '#2A1A5E' }         // グラデ描画前の下地
safeTransparent:     { backgroundColor: 'transparent' }
sectionLabel.color:  'rgba(255,255,255,0.7)'
banner:              { gap: 2 }                             // item1: 白箱→直置き
bannerTitle.color:   '#FFD6E8'
bannerBody.color:    'rgba(255,255,255,0.9)'
emptyText.color:     'rgba(255,255,255,0.8)'
// 会場カード（白島）
venueCard bg:        '#FFFFFF'
venueCardOpen shadow: shadowColor '#B42878', opacity 0.4, radius 30, offset {0,8}
// 開催カードの緑ステータス系
checkinPill bg:      '#ECFDF5'  border '#A7F3D0'  text '#059669'
// CTA / スピナー
checkin/enter CTA text: '#FFFFFF'（背景は colors.primary=coral）
ActivityIndicator:   '#FFFFFF'
// ヘッダー（item1・未commit）: ScreenHeader transparent + tint="light" + HeaderActions color="#FFFFFF"
```

## app/venue/[id].tsx（会場の中）

```ts
// ローカル palette（世界観=紫を維持する用途）
const VENUE_COLORS = {
  brand: '#4B3BD6', brandTint: '#ECEAFB', brandBorder: '#DBD6F7',
  accent: '#FF3E6C', accentTint: '#FFE6EC', trustGreen: '#15A05A',
  background: '#F7F8FA', card: '#FFFFFF', border: '#E7E9EF',
  headline: '#15161E', body: '#5A5D6B', hint: '#9CA0AD',
} as const

// 背景グラデ（上=濃紫ヘッダー帯 → 55%以降=ほぼ白床）
const VENUE_ROOM_GRADIENT = ['#3B1E6E', '#6B2E96', '#F6F0FA', '#F6F0FA'] as const
const VENUE_ROOM_LOCATIONS = [0, 0.22, 0.55, 1] as const

// styles
root:                    { backgroundColor: '#3B1E6E' }
venueContextTitle.color: '#FFFFFF'
venueContextSubtitle:    'rgba(255,255,255,0.82)'
venueContextCheckin:     'rgba(255,255,255,0.9)'
venueContextHint:        'rgba(255,255,255,0.75)'
holdBanner bg:           '#D97706'（テキスト '#FFFFFF'）
FAB / accent:            '#FF3E6C'（VENUE_COLORS.accent）
// 空状態「🎤 トップバッターに！」
emptyStage gradient:     ['rgba(168,85,247,0.08)', 'rgba(244,114,182,0.08)']（135deg 相当 start/end）
emptyStage border:       'rgba(168,85,247,0.3)'（1px dashed, radius 16）
emptyStageTitle.color:   '#7C2D92'
emptyStageBody.color:    '#9B6BB3'
// FAB 背景は colors.primary=coral（段階D で coral 化済）
```

## components/venue/LiveElements.tsx（LIVEバッジ / アバター）

```ts
// LIVE バッジ（90deg グラデ + 白脈打ちドット）
LiveBadge gradient:  ['#E11D48', '#BE185D']  (start {0,0} → end {1,0})
LiveBadge dot/text:  '#FFFFFF'
// 参加者アバター（グラデ円、-9px 重ね、border 2px 白）
AVATAR_GRADIENTS = [
  ['#F472B6', '#A855F7'],
  ['#60A5FA', '#818CF8'],
  ['#F472B6', '#A855F7'],
  ['#60A5FA', '#818CF8'],
]
```

---

## 復帰手順（暗地版NG時）
1. 上記 3 ファイルの gradient 定数・VENUE_COLORS・styles を本記録の値に戻す。
2. 入場アニメを「暗地×光源版」から紫版（item7: entrance opacity+translateY 18・scale 0.98→1・780ms）に戻す。
3. `tsc`/`eslint` → build。
※ 世界観レイヤー（背景/ヘッダー）=紫、操作CTA=coral の分離（段階D）は紫版の前提。
