// lib/auth.ts
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

// ─────────────────────────────────────────
// サインアップ
// ─────────────────────────────────────────
export async function signUp(
  email: string,
  password: string
): Promise<{ user: User | null; error: string | null }> {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { user: null, error: error.message }
  return { user: data.user, error: null }
}

// ─────────────────────────────────────────
// ログイン
// ─────────────────────────────────────────
export async function signIn(
  email: string,
  password: string
): Promise<{ session: Session | null; error: string | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) return { session: null, error: error.message }
  return { session: data.session, error: null }
}

// ─────────────────────────────────────────
// ログアウト
// ─────────────────────────────────────────
export async function signOut(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signOut()
  if (error) return { error: error.message }
  return { error: null }
}

// ─────────────────────────────────────────
// 現在のセッション取得
// ─────────────────────────────────────────
export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

// ─────────────────────────────────────────
// 現在のユーザー取得
// ─────────────────────────────────────────
export async function getCurrentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}