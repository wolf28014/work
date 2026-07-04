-- 创建 app_versions 表（用于应用内检查更新）
-- 在 Supabase SQL Editor 执行

CREATE TABLE IF NOT EXISTS public.app_versions (
  id BIGSERIAL PRIMARY KEY,
  version TEXT NOT NULL,           -- 版本号，如 '2.3.0'
  url TEXT NOT NULL,               -- APK 下载地址
  notes TEXT,                      -- 更新说明
  is_active BOOLEAN DEFAULT TRUE,  -- 是否启用
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

-- 所有人都可以查询（公开读）
DROP POLICY IF EXISTS "public_select_versions" ON public.app_versions;
CREATE POLICY "public_select_versions" ON public.app_versions
  FOR SELECT USING (true);

-- 插入当前最新版本（v2.3.0）
INSERT INTO public.app_versions (version, url, notes, is_active)
VALUES (
  '2.3.0',
  'https://github.com/wolf28014/work/releases/download/v2.3/Smart-Tasks-v2.3.apk',
  'v2.3 - 任务卡片支持展开子任务

新功能：
- 任务列表和看板的子任务统计改为可点击按钮
- 点击展开子任务列表，可直接勾选
- 全部完成时徽章变翡翠绿
- 展开/收起有箭头提示',
  TRUE
);

-- 验证
SELECT * FROM app_versions ORDER BY created_at DESC LIMIT 5;
