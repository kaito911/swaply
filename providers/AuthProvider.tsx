// providers/AuthProvider.tsx
import { clearPersistedAuth, supabase } from '@/lib/supabase'
import { Session, User } from '@supabase/supabase-js'
import React, {
    createContext,
    ReactNode,
    useContext,
    useEffect,
    useState,
} from 'react'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    // ★起動検証が終わるまで onAuthStateChange を無視するフラグ。
    //   INITIAL_SESSION 等が local セッションで検証結果を打ち消す race を防ぐ。
    //   検証完了 (下の finally) で必ず true に解除する。
    let bootstrapped = false

    // 破棄するのは「AuthApiError かつ status 4xx」= 失効/無効/削除済トークンのみ。
    //   それ以外 (AuthRetryableFetchError / throw / 不明) は維持 = オフラインで落とさない。
    //   クラス import に依存せず error.name / error.status で判定。
    const isAuthDestroyError = (error: unknown): boolean => {
      if (error == null || typeof error !== 'object') return false
      const e = error as { name?: unknown; status?: unknown }
      return (
        e.name === 'AuthApiError' &&
        typeof e.status === 'number' &&
        e.status >= 400 &&
        e.status < 500
      )
    }

    const bootstrap = async () => {
      try {
        const { data: sess } = await supabase.auth.getSession()
        if (!mounted) return
        const local = sess.session
        if (local == null) {
          // ローカルにセッション無し → getUser を呼ばず未ログイン確定 (無駄な通信をしない)。
          setSession(null)
          setUser(null)
          return
        }
        // ローカルにセッションあり → getUser でサーバ実在検証。
        let authInvalid = false
        try {
          const { data: userData, error } = await supabase.auth.getUser()
          if (error) {
            if (isAuthDestroyError(error)) authInvalid = true
            // 通信/不明エラーは維持 (オフラインでログアウトさせない)。
          } else if (userData.user == null) {
            authInvalid = true
          }
        } catch (err) {
          // getUser が throw = 通信不能等 → 維持 (オフラインでログアウトさせない)。
          console.error('[AuthProvider] getUser', err)
        }
        if (!mounted) return
        if (authInvalid) {
          // 幽霊/失効/削除済トークン → 破棄 (ローカル削除 + local signOut の両方)。
          await clearPersistedAuth()
          try {
            await supabase.auth.signOut({ scope: 'local' })
          } catch (err) {
            console.error('[AuthProvider] signOut', err)
          }
          if (!mounted) return
          setSession(null)
          setUser(null)
        } else {
          setSession(local)
          setUser(local.user)
        }
      } catch (err) {
        // getSession 自体が失敗しても未ログイン扱いで継続 (永久スピナー回避)。
        console.error('[AuthProvider] bootstrap', err)
        if (mounted) {
          setSession(null)
          setUser(null)
        }
      } finally {
        // ★どの分岐 (session null / getUser throw / getSession throw / 破棄 / 維持) を
        //   通っても必ずここに到達し、フラグ解除とスピナー解除を行う。
        if (mounted) {
          bootstrapped = true
          setLoading(false)
        }
      }
    }
    void bootstrap()

    // auth状態の変化を監視 (起動検証完了までは無視、完了後のライブイベントのみ反映)。
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!bootstrapped) return
        setSession(newSession)
        setUser(newSession?.user ?? null)
        setLoading(false)
      }
    )

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ session, user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  return useContext(AuthContext)
}