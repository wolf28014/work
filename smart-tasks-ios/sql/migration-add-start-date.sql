-- ============================================================
-- Smart-Tasks 迁移脚本：tasks 表加 start_date 列（v6.5）
-- ============================================================
-- 用途：支持任务的「起始日」，让日历可以显示区间任务
--      （startDate 到 dueDate 之间每天都显示）
--
-- 用法：登录 Supabase 后台 → SQL Editor → 粘贴本文件 → Run
-- 幂等：可重复执行，已存在的列会跳过
-- ============================================================

-- 1. 加 start_date 列（如果不存在）
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS start_date TEXT;

-- 2. 为 start_date 建索引（可选，提升日历按区间查询性能）
CREATE INDEX IF NOT EXISTS idx_tasks_start_date ON public.tasks(start_date);

-- 3. 刷新 schema cache
NOTIFY pgrst, 'reload schema';
