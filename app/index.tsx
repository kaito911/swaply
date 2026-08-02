// app/index.tsx
import { Redirect } from 'expo-router'
import { useAuthContext } from '@/providers/AuthProvider'

export default function Index() {
  const { session, loading } = useAuthContext()
  // ★loading 中は判定しない (起動直後 session は初期 null のため、ここで redirect すると
  //   ログイン済みユーザーを login へ誤送する)。_layout も loading 中は spinner を出す。
  if (loading) return null
  // 認証ゲート: 未ログインは (auth)/login、ログイン済みは (tabs) へ。
  //   従来の無条件 <Redirect href="/(tabs)"/> が session 判定なしで (tabs) に通していた
  //   バグ (未ログインでもホームに入る) を塞ぐ。
  return <Redirect href={session ? '/(tabs)' : '/(auth)/login'} />
}
