-- ============================================================
-- Smart-Tasks 修复脚本：创建 notes 表 + RLS + Realtime
-- ============================================================
-- 问题：之前的 schema.sql 旧版本没有 notes 表，导致 v6.0+ 的笔记功能
-- 无法同步到云端（syncNoteToCloud 静默失败）。
--
-- 用法：登录 Supabase 后台 → SQL Editor → 粘贴本文件 → Run
-- 幂等：可重复执行，已存在的对象会被跳过
-- ============================================================

-- 1. 建 notes 表
CREATE TABLE IF NOT EXISTS public.notes (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT '',
  content TEXT DEFAULT '',
  pinned BOOLEAN DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON public.notes(updated_at);

-- 2. 启用 RLS
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- 3. RLS 策略（DROP IF EXISTS 后重建，保证幂等）
DROP POLICY IF EXISTS "users_select_own_notes" ON public.notes;
DROP POLICY IF EXISTS "users_insert_own_notes" ON public.notes;
DROP POLICY IF EXISTS "users_update_own_notes" ON public.notes;
DROP POLICY IF EXISTS "users_delete_own_notes" ON public.notes;

CREATE POLICY "users_select_own_notes" ON public.notes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_notes" ON public.notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_notes" ON public.notes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_notes" ON public.notes
  FOR DELETE USING (auth.uid() = user_id);

-- 4. 加入 Realtime publication（让客户端能订阅 INSERT/UPDATE/DELETE）
DO $$
BEGIN
  BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notes';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- 5. 刷新 schema cache，让 REST API 立刻能查到这张表
NOTIFY pgrst, 'reload schema';
