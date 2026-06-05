# Swaply 通報対応 SOP (Standard Operating Procedure)

最終更新: 2026-06-05
適用範囲: 初期 β リリース期間
位置付け: 通報受信後の運営対応の標準手順書 (Phase 0 外部レビュー P1-3 対応)

> 初期 β では運営者 (kaito 単独想定) が Supabase Dashboard で reports テーブルを直接確認・対応する。将来的に運営チーム拡大・管理画面実装時は本 SOP を更新する。

---

## 1. 前提

### 1.1 通報受信導線
- 出品詳細 (`app/listing/[id].tsx`) → 「気になる内容を通報する」リンク
- → `app/report.tsx` (modal) で理由選択 (5 種) + 自由記述 → 送信
- → `reports` テーブル INSERT (RLS: 通報者本人のみ insert/select 可)

### 1.2 通報理由 5 種
- 不適切な内容
- 権利侵害の可能性
- 交換条件が不明確
- 迷惑行為の可能性
- その他

### 1.3 reports テーブル schema (参考)
| 列 | 型 | 備考 |
|---|---|---|
| `id` | uuid PK | |
| `reporter_id` | uuid (nullable) | 通報者 (削除後 NULL になる) |
| `target_type` | text | 'card' / 'user' |
| `target_id` | uuid | 対象 ID |
| `reason` | text | 上記 5 種のいずれか |
| `detail` | text NULL | 自由記述 |
| `status` | text | 'open' / 'reviewing' / 'resolved' / 'dismissed' |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

## 2. 確認頻度

### 2.1 通常運用
- **平日**: 毎日 1 回確認 (朝 or 夕方)
- **休日**: 1 日 1 回確認 (柔軟)

### 2.2 重大通報 (権利侵害の可能性 / 不適切な内容)
- **24 時間以内に確認** + 一次対応 (status を 'reviewing' に遷移、対象を一時非表示等)
- 24 時間を超えるリスクがある場合、出張中等であっても優先対応する

### 2.3 緊急度の高い通報の例
- 公的に問題のある投稿 (法令違反、児童保護、明確な著作権侵害等)
- 多数のユーザーから同一対象への通報
- 関係者 (権利者本人等) からの正式申立

→ これらは即時対応 (status='reviewing' + 対象一時非表示 + 必要に応じ警察 / 弁護士相談)

---

## 3. 確認手順 (Supabase Dashboard)

### 3.1 未対応一覧取得

Supabase Dashboard → SQL Editor:

```sql
-- 未対応通報を新着順に
select id, reporter_id, target_type, target_id, reason, detail, status, created_at
from public.reports
where status in ('open', 'reviewing')
order by created_at desc
limit 50;
```

### 3.2 対象別集計 (重複通報の発見)

```sql
-- 同一対象 (card / user) に複数通報が来ているか
select target_type, target_id, count(*) as report_count,
       min(created_at) as first_at, max(created_at) as last_at
from public.reports
where status in ('open', 'reviewing')
group by target_type, target_id
having count(*) >= 2
order by report_count desc;
```

`report_count >= 2` の対象は **要優先対応**。

### 3.3 対象の中身確認

#### (a) target_type = 'card' の場合

```sql
-- 通報対象の出品内容を確認
select c.id, c.name, c.image_url, c.description, c.want_description,
       c.owner_user_id, p.handle, p.display_name, c.status, c.created_at
from public.cards c
left join public.profiles p on p.id = c.owner_user_id
where c.id = '$target_id';
```

#### (b) target_type = 'user' の場合

```sql
-- 通報対象ユーザーのプロフィール + 出品履歴
select p.id, p.handle, p.display_name, p.trade_count, p.ship_rate, p.trouble_count,
       p.created_at, p.last_active_at
from public.profiles p
where p.id = '$target_id';

select count(*) as active_cards from public.cards
where owner_user_id = '$target_id' and status = 'active';
```

#### (c) 通報者の信頼性確認

```sql
-- 通報者の通報履歴 (大量通報による迷惑行為の検出)
select count(*) as total_reports,
       sum(case when status = 'dismissed' then 1 else 0 end) as dismissed_count
from public.reports
where reporter_id = '$reporter_id';
```

`dismissed_count` が多ければ通報者の信頼性も加味。

---

## 4. 対応候補

通報内容を確認した上で、以下のいずれかの対応を取る:

### 4.1 投稿 / カード非表示

軽微〜中程度の規約違反、要 reviewed:

```sql
-- 該当 card を inactive 化 (UI で非表示)
update public.cards set status = 'inactive', updated_at = now()
where id = '$target_card_id';

-- 通報 status を resolved に
update public.reports set status = 'resolved', updated_at = now()
where target_type = 'card' and target_id = '$target_card_id'
  and status in ('open', 'reviewing');
```

### 4.2 ユーザー警告

軽微な違反 + 初回:
- メール送信 (`support@swaply-app.jp` から手動で対象ユーザー宛て)
- 件名: 「Swaply ご利用に関するお知らせ」
- 内容: 違反内容 + 改善依頼 + 再発時のアカウント停止予告

通報 status を 'resolved' or 'reviewing' に更新。

### 4.3 アカウント停止 (Supabase Auth)

繰り返し違反 or 重大違反:

```sql
-- auth.users.banned_until を未来日時に設定 (Supabase Auth の標準機能)
-- ※ Dashboard → Authentication → Users → 該当ユーザー → "Ban user" UI で設定推奨
-- SQL 直接実行する場合:
update auth.users
set banned_until = (now() + interval '30 days')::timestamptz
where id = '$target_user_id';
```

または永久 BAN (`banned_until = 'infinity'`)。

該当ユーザーの active cards も一括 inactive 化:

```sql
update public.cards set status = 'inactive', updated_at = now()
where owner_user_id = '$target_user_id' and status = 'active';
```

### 4.4 取引停止

該当ユーザーが進行中の取引を持っている場合、相手保護のため:
- 取引相手にメール連絡 (運営から)
- 取引の `cancel_trade_atomic` を service_role 経由で実行 (必要なら手動)
- 取引相手の card status='reserved' を 'active' に戻す

### 4.5 対応不要 (dismissed)

通報内容が規約違反に該当しない場合:

```sql
update public.reports set status = 'dismissed', updated_at = now()
where id = '$report_id';
```

---

## 5. 対応ログ

### 5.1 対応の記録

reports テーブルの `status` 変更が最低限の対応ログ。詳細ログが必要な場合は別 file (運営内部 Notion / Google Sheet 等) に記録:

| 項目 | 内容 |
|---|---|
| 対応日時 | 2026-MM-DD HH:MM |
| 通報 ID | reports.id |
| 対象 | target_type + target_id |
| 通報理由 | reason + detail |
| 確認内容 | 該当 card / user の内容、規約違反該当性 |
| 対応内容 | 非表示 / 警告 / 停止 / dismissed |
| 担当者 | kaito (β1 期間中は単独運用) |
| 補足 | 通報者へのメール送信有無等 |

### 5.2 status 遷移ガイド

| 状態 | 意味 |
|---|---|
| `open` | 未対応 (新規通報) |
| `reviewing` | 確認中 (24h 以内に次対応必要) |
| `resolved` | 規約違反として対応済 (非表示 / 警告 / 停止) |
| `dismissed` | 規約違反に該当せず却下 |

---

## 6. 緊急度の高い通報

### 6.1 即時対応が必要なケース
- 児童保護関連
- 公序良俗に著しく反する内容
- 法令違反 (詐欺幇助、薬物、武器等)
- 明確な著作権侵害 (権利者本人からの申立)
- 殺害予告 / 自殺念慮等の人身被害につながり得る投稿

### 6.2 即時対応手順
1. 該当 card を `inactive` に即時遷移 (UI 非表示)
2. 該当 user に対する追加調査 (他の通報 / 出品履歴)
3. 必要に応じてアカウント停止
4. 警察 / 弁護士 / 権利者への連絡が必要なら速やかに
5. 通報者にも対応完了の連絡 (24h 以内)

### 6.3 権利侵害申立の特別フロー

権利者 (アーティスト本人、レコード会社、版元等) からの申立は `support@swaply-app.jp` に直接到達するため、reports テーブルとは別経路。詳細は `docs/source/terms_of_service_draft_v1.md` 第 14 条参照。

---

## 7. 初期 β 期間の運用前提

- **運営者**: kaito (単独運用)
- **確認媒体**: Supabase Dashboard SQL Editor + Authentication UI
- **管理画面**: なし (Phase 2+ で検討)
- **通報数想定**: 初期 β は数件 / 日以下、手動運用可能
- **エスカレーション**: 法的判断が必要な事案は弁護士相談 (β 着手前準備済予算 5-10 万円範囲)

将来運用拡張時:
- 運営チーム 2-3 名に拡大
- 簡易管理画面実装 (reports 一覧 + status 変更 + 警告メール送信機能)
- 自動検知 (NSFW 画像 AI 検出等)
- 大量通報の通知 (Slack / メール)

---

## 8. 関連 docs

- `docs/migration_reports.sql` — reports テーブル + RLS 定義
- `docs/source/terms_of_service_draft_v1.md` 第 12 条 (禁止事項) / 第 14 条 (権利侵害申立) / 第 15 条 (段階的サンクション)
- `docs/source/privacy_policy_v1.md` §8 (通報情報の取り扱い)
- `docs/account_delete_qa.md` (RLS 確認結果 + アカウント停止との関連)

---

## 9. 改訂履歴

- **v1 (2026-06-05)**: 初版。Phase 0 外部レビュー P1-3 対応。初期 β 単独運用前提。
