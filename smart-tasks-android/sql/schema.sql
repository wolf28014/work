-- Smart-Tasks 数据库 Schema
-- 在 Supabase 项目 SQL Editor 中执行此文件

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============== 任务表 ==============
CREATE TABLE IF NOT EXISTS public.tasks (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  due_date TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'todo',
  recurrence TEXT,
  tags TEXT[] DEFAULT '{}',
  subtasks JSONB DEFAULT '[]',
  depends_on TEXT[] DEFAULT '{}',
  pomodoros INTEGER DEFAULT 0,
  note_markdown TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  completed_at BIGINT,
  deleted_at BIGINT,
  version BIGINT DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON public.tasks(updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);

-- ============== 番茄钟会话表 ==============
CREATE TABLE IF NOT EXISTS public.pomodoro_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id TEXT,
  started_at BIGINT NOT NULL,
  ended_at BIGINT NOT NULL,
  duration INTEGER DEFAULT 1500
);

CREATE INDEX IF NOT EXISTS idx_pomodoros_user_id ON public.pomodoro_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_pomodoros_ended_at ON public.pomodoro_sessions(ended_at);

-- ============== 标签表 ==============
CREATE TABLE IF NOT EXISTS public.tags (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT 'emerald',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_user_id ON public.tags(user_id);

-- ============== 笔记表 (v6.0) ==============
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

-- ============== 用户设置表 ==============
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  background_config JSONB,
  custom_background_path TEXT,
  theme TEXT DEFAULT 'light',
  ai_config JSONB,
  is_pro BOOLEAN DEFAULT FALSE,
  pro_expires_at BIGINT,
  license_key TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- ============== 兑换码表 ==============
CREATE TABLE IF NOT EXISTS public.license_codes (
  code TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  used_by UUID REFERENCES auth.users(id),
  used_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  expires_at BIGINT,
  note TEXT
);

-- ============== 启用行级安全 (RLS) ==============
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pomodoro_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_codes ENABLE ROW LEVEL SECURITY;

-- ============== RLS 策略 ==============
CREATE POLICY "users_select_own_tasks" ON public.tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_tasks" ON public.tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_tasks" ON public.tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_tasks" ON public.tasks FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "users_select_own_pomodoros" ON public.pomodoro_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_pomodoros" ON public.pomodoro_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_delete_own_pomodoros" ON public.pomodoro_sessions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "users_select_own_tags" ON public.tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_tags" ON public.tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_tags" ON public.tags FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_tags" ON public.tags FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "users_select_own_notes" ON public.notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_notes" ON public.notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_notes" ON public.notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_notes" ON public.notes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "users_select_own_settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_select_license" ON public.license_codes FOR SELECT USING (true);

-- ============== 兑换码消费函数 ==============
CREATE OR REPLACE FUNCTION public.redeem_license_code(code_input TEXT, user_id_input UUID)
RETURNS TABLE(type TEXT, expires_at BIGINT) AS $$
DECLARE
  code_record RECORD;
  new_expires_at BIGINT;
BEGIN
  SELECT * INTO code_record FROM public.license_codes WHERE code = code_input FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '兑换码不存在'; END IF;
  IF code_record.is_used THEN RAISE EXCEPTION '兑换码已被使用'; END IF;
  IF code_record.expires_at IS NOT NULL AND code_record.expires_at < (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT THEN
    RAISE EXCEPTION '兑换码已过期';
  END IF;

  IF code_record.type = 'pro_lifetime' THEN new_expires_at := 9999999999999;
  ELSIF code_record.type = 'pro_monthly' THEN new_expires_at := (EXTRACT(EPOCH FROM NOW()) * 1000 + 30 * 86400 * 1000)::BIGINT;
  ELSIF code_record.type = 'pro_yearly' THEN new_expires_at := (EXTRACT(EPOCH FROM NOW()) * 1000 + 365 * 86400 * 1000)::BIGINT;
  ELSIF code_record.type = 'ai_monthly' THEN new_expires_at := (EXTRACT(EPOCH FROM NOW()) * 1000 + 30 * 86400 * 1000)::BIGINT;
  END IF;

  UPDATE public.license_codes
  SET is_used = TRUE, used_by = user_id_input, used_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  WHERE code = code_input;

  INSERT INTO public.user_settings (user_id, is_pro, pro_expires_at, license_key, updated_at)
  VALUES (user_id_input, TRUE, new_expires_at, code_input, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT)
  ON CONFLICT (user_id) DO UPDATE
  SET is_pro = TRUE, pro_expires_at = new_expires_at, license_key = code_input,
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

  RETURN QUERY SELECT code_record.type::TEXT, new_expires_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============== Storage Bucket ==============
INSERT INTO storage.buckets (id, name, public) VALUES ('backgrounds', 'backgrounds', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "users_upload_own_background" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "users_read_own_background" ON storage.objects
  FOR SELECT USING (bucket_id = 'backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "users_delete_own_background" ON storage.objects
  FOR DELETE USING (bucket_id = 'backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============== 触发器：新用户注册时自动创建 user_settings ==============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_settings (user_id, is_pro, created_at, updated_at)
  VALUES (NEW.id, FALSE, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
