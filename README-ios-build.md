# Swaply iOS ビルド & TestFlight 提出ガイド

## 前提条件

- Apple Developer Program 加入済み
- Node.js v18 以上
- Expo アカウント（https://expo.dev で無料登録）

---

## 1. ローカル動作確認

```bash
npx expo install --fix
npx expo start
```

## 2. EAS セットアップ（初回のみ）

```bash
npm install -g eas-cli
eas login
eas init
```

## 3. iOS Preview Build（実機確認用）

```bash
eas build --platform ios --profile preview
```

## 4. iOS Production Build

```bash
eas build --platform ios --profile production
```

## 5. TestFlight 提出

eas.json の submit セクションを埋めた後:

```bash
eas submit --platform ios --latest
```

| 項目 | 確認場所 |
|------|---------|
| appleId | Apple Developer のメールアドレス |
| ascAppId | App Store Connect のアプリ情報ページ |
| appleTeamId | developer.apple.com → Membership → Team ID |

## バージョン更新時

```bash
# app.json の version を上げてから
eas build --platform ios --profile production
eas submit --platform ios --latest
```
