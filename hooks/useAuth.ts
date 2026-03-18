// hooks/useAuth.ts
import { useAuthContext } from '@/providers/AuthProvider'

/**
 * 現在のセッション・ユーザー・ローディング状態を返す
 * user が null のときはクラッシュしない
 */
export function useAuth() {
  const { session, user, loading } = useAuthContext()
  return {
    session,
    user,
    userId: user?.id ?? null,
    loading,
    isLoggedIn: user != null,
  }
}