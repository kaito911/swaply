-- docs/schema/content_reports.sql
--
-- content_reports（通報の実稼働テーブル・審査要件）の本番実体からの記録。
-- 適用日は不明（適用済み）。2026-07-19 に K が本番 SQL Editor で
--   pg_get_constraintdef / pg_get_functiondef により実体確認。これが正。
--
-- 目的: 本番に適用済みだが repo に migration/SQL が無い drift を解消し、再現性を確保する。
--   本ファイルは「記録」であり、本番 DB へ流す用途ではない（本番は一切触らない）。
--
-- 注記:
--   - RPC 本体は pg_get_functiondef の出力どおり $function$ ドル引用符で囲む（本番実体そのまま）。
--   - content_reports_resolved_by_fkey の ON DELETE = NO ACTION（本番実体・2026-07-19 確認:
--     pg_constraint.confdeltype = 'a'）。他 3 FK は ON DELETE CASCADE。
--   - 依存: cards, profiles, operator_accounts（別途定義済み）。

-- ─────────────────────────────────────────
-- テーブル
-- ─────────────────────────────────────────
CREATE TABLE public.content_reports (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  reporter_id      uuid        NOT NULL,
  reported_card_id uuid        NULL,
  reported_user_id uuid        NULL,
  category         text        NOT NULL,
  note             text        NULL,
  status           text        NOT NULL DEFAULT 'open',
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz NULL,
  resolved_by      uuid        NULL,
  CONSTRAINT content_reports_pkey PRIMARY KEY (id)
);

-- ─────────────────────────────────────────
-- 制約（12 本・実体そのまま）
-- ─────────────────────────────────────────
-- card / user のどちらか一方のみ（XOR）
ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_target_xor
  CHECK ((reported_card_id IS NULL) <> (reported_user_id IS NULL));

-- 自分自身の user 通報は不可
ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_no_self_user
  CHECK ((reported_user_id IS NULL) OR (reported_user_id <> reporter_id));

-- note 長さ上限 2000
ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_note_len_check
  CHECK ((note IS NULL) OR (char_length(note) <= 2000));

-- category enum
ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_category_check
  CHECK (category = ANY (ARRAY[
    'prohibited_item','counterfeit','inappropriate_image','spam',
    'miscategorized','harassment','monetary_demand','impersonation',
    'inappropriate_profile','other'
  ]::text[]));

-- status enum
ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_status_check
  CHECK (status = ANY (ARRAY['open','actioned','dismissed']::text[]));

-- FK: reported_card_id -> cards(id) ON DELETE CASCADE
ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_reported_card_id_fkey
  FOREIGN KEY (reported_card_id) REFERENCES public.cards(id) ON DELETE CASCADE;

-- FK: reported_user_id -> profiles(id) ON DELETE CASCADE
ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_reported_user_id_fkey
  FOREIGN KEY (reported_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- FK: reporter_id -> profiles(id) ON DELETE CASCADE
ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- FK: resolved_by -> profiles(id) ON DELETE NO ACTION
--   （本番実体・2026-07-19 確認: pg_constraint.confdeltype = 'a' = NO ACTION）。
ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_resolved_by_fkey
  FOREIGN KEY (resolved_by) REFERENCES public.profiles(id) ON DELETE NO ACTION;

-- 同一 reporter が同一 card / user を重複通報できない
ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_unique_card
  UNIQUE (reporter_id, reported_card_id);

ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_unique_user
  UNIQUE (reporter_id, reported_user_id);

-- ─────────────────────────────────────────
-- RLS（ENABLE + 3 ポリシー）
-- ─────────────────────────────────────────
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own content reports"
  ON public.content_reports
  FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Reporter or operator can read content reports"
  ON public.content_reports
  FOR SELECT
  USING (
    (auth.uid() = reporter_id)
    OR EXISTS (
      SELECT 1 FROM public.operator_accounts oa WHERE oa.user_id = auth.uid()
    )
  );

CREATE POLICY "Operator can update content reports"
  ON public.content_reports
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.operator_accounts oa WHERE oa.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.operator_accounts oa WHERE oa.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────
-- RPC（本番実体そのまま・pg_get_functiondef 出力）
-- ─────────────────────────────────────────

-- --- create_content_report ---
CREATE OR REPLACE FUNCTION public.create_content_report(p_card_id uuid, p_user_id uuid, p_category text, p_note text DEFAULT NULL::text)
 RETURNS content_reports LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_actor  uuid := auth.uid();
  v_report public.content_reports;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if (p_card_id is null) = (p_user_id is null) then raise exception 'TARGET_REF_INVALID'; end if;
  if p_category not in ('prohibited_item','counterfeit','inappropriate_image','spam','miscategorized',
    'harassment','monetary_demand','impersonation','inappropriate_profile','other') then
    raise exception 'INVALID_CATEGORY'; end if;
  if p_card_id is not null then
    if not exists (select 1 from public.cards where id = p_card_id) then raise exception 'TARGET_NOT_FOUND'; end if;
  else
    if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'TARGET_NOT_FOUND'; end if;
    if p_user_id = v_actor then raise exception 'SELF_REPORT_NOT_ALLOWED'; end if;
  end if;
  begin
    insert into public.content_reports (reporter_id, reported_card_id, reported_user_id, category, note)
    values (v_actor, p_card_id, p_user_id, p_category, p_note) returning * into v_report;
  exception when unique_violation then raise exception 'ALREADY_REPORTED';
  end;
  return v_report;
end;
$function$

-- --- operator_resolve_content_report ---
CREATE OR REPLACE FUNCTION public.operator_resolve_content_report(p_report_id uuid, p_action text)
 RETURNS content_reports LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_actor  uuid := auth.uid();
  v_report public.content_reports;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.operator_accounts oa where oa.user_id = v_actor) then raise exception 'NOT_OPERATOR'; end if;
  if p_action not in ('unpublish','dismiss') then raise exception 'INVALID_ACTION'; end if;
  select * into v_report from public.content_reports where id = p_report_id;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if p_action = 'unpublish' then
    if v_report.reported_card_id is null then raise exception 'NOT_A_CARD_REPORT'; end if;
    update public.cards set is_public = false where id = v_report.reported_card_id;
    update public.content_reports set status = 'actioned', resolved_at = now(), resolved_by = v_actor
      where id = p_report_id returning * into v_report;
  else
    update public.content_reports set status = 'dismissed', resolved_at = now(), resolved_by = v_actor
      where id = p_report_id returning * into v_report;
  end if;
  return v_report;
end;
$function$

-- --- get_content_reports ---
CREATE OR REPLACE FUNCTION public.get_content_reports(p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, reporter_id uuid, reporter_handle text, reporter_display_name text,
   reported_card_id uuid, card_name text, card_image_url text, card_is_public boolean, card_owner_id uuid,
   reported_user_id uuid, reported_user_handle text, reported_user_display_name text,
   category text, note text, status text, created_at timestamptz, resolved_at timestamptz)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.operator_accounts oa where oa.user_id = auth.uid()) then raise exception 'NOT_OPERATOR'; end if;
  return query
    select cr.id, cr.reporter_id, rp.handle, rp.display_name,
           cr.reported_card_id, c.name, c.image_url, c.is_public, c.owner_user_id,
           cr.reported_user_id, up.handle, up.display_name,
           cr.category, cr.note, cr.status, cr.created_at, cr.resolved_at
    from public.content_reports cr
    left join public.profiles rp on rp.id = cr.reporter_id
    left join public.cards    c  on c.id  = cr.reported_card_id
    left join public.profiles up on up.id = cr.reported_user_id
    where (p_status is null or cr.status = p_status)
    order by cr.created_at desc;
end;
$function$
