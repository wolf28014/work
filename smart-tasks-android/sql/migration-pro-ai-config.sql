-- ============================================================
-- Smart-Tasks v6.8 — Pro 内置 AI Key 配置表
-- ============================================================
-- 用途：存储开发者内置的 AI API 配置，Pro 用户免配置即可用 AI
-- 只有 Pro 用户能通过 RLS 拉取到这个配置
--
-- 用法：登录 Supabase 后台 → SQL Editor → 粘贴本文件 → Run
-- 然后插入 Pro AI 配置（替换为你的 AI API Key）
-- ============================================================

-- 1. 创建 app_config 表
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- 2. 启用 RLS
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- 3. RLS 策略：只有登录用户且是 Pro 会员才能读
-- （写操作只能通过 service_role 在后台执行，前端不允许写）
DROP POLICY IF EXISTS "pro_users_read_config" ON public.app_config;
CREATE POLICY "pro_users_read_config" ON public.app_config
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_settings
      WHERE user_id = auth.uid()
        AND is_pro = TRUE
        AND (pro_expires_at IS NULL OR pro_expires_at > (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT)
    )
  );

-- 4. 插入 Pro AI 配置（开发者后台执行，或用 service_role key）
-- ⚠️ 把下面的 JSON 替换成你自己的 AI API 配置
-- INSERT INTO public.app_config (key, value) VALUES
-- ('pro_ai_config', '{"baseURL":"https://open.bigmodel.cn/api/paas/v4","apiKey":"你的API_KEY","model":"glm-4-flash"}')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

-- 5. 刷新 schema cache
NOTIFY pgrst, 'reload schema';
