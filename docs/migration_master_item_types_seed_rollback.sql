-- migration_master_item_types_seed.sql の rollback
-- Supabase SQL Editor で手動実行してください
--
-- 採用方針: 明示的な ID リストで削除 (item_type は work_id のような範囲指定軸を持たないため)
-- 注意: 本 seed 適用後に運営が追加した item_type は影響を受けません (本 rollback は seed 投入分のみ削除)。

delete from public.master_item_types where id in (
  -- anime 13
  'acrylic_stand', 'can_badge', 'acrylic_keychain', 'keychain', 'gacha_capsule',
  'ichiban_kuji', 'clear_file', 'sticker', 'plush', 'plush_outfit',
  'figure', 'tapestry', 'poster',
  -- idol 5
  'trading_card', 'photo_card', 'penlight', 'photobook', 'uchiwa',
  -- character 5
  'stationery', 'mug_cup', 'towel', 'accessory', 'pouch_bag',
  -- other 1
  'other'
);
