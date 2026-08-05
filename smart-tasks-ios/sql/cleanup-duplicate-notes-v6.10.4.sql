-- ============================================================
-- v6.10.4 — 清理 notes 表中的重复笔记
-- ============================================================
-- 问题：用户反馈"记录一个笔记出现大量重复"（截图显示 14 条相同笔记）
-- 根因：NoteEditor 的 persist 函数有 React state 竞态 + realtime handler
--       无条件覆盖 + saveNote 修改输入对象，多个 bug 叠加导致重复
-- 修复：代码层面已修复（v6.10.4），此脚本用于清理云端已存在的重复数据
--
-- 用法：在 Supabase Dashboard → SQL Editor 中执行
-- 安全：软删除（设 deleted_at），不物理删除，可恢复
-- ============================================================

-- 1. 先查看有多少重复（只统计，不修改）
SELECT
  title,
  LEFT(content, 100) AS content_preview,
  COUNT(*) AS dup_count,
  MAX(updated_at) AS latest_updated
FROM public.notes
WHERE deleted_at IS NULL
GROUP BY title, LEFT(content, 100)
HAVING COUNT(*) > 1
ORDER BY dup_count DESC;

-- 2. 清理：对每组重复，保留 updated_at 最大的，其余软删除
-- 用 CTE 找出每组要保留的 ID，然后软删除其余的
WITH ranked AS (
  SELECT
    id,
    title,
    content,
    updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(title, ''), LEFT(content, 200)
      ORDER BY updated_at DESC
    ) AS rn
  FROM public.notes
  WHERE deleted_at IS NULL
)
UPDATE public.notes
SET deleted_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- 3. 验证：再次查看重复数（应该都是 1）
SELECT
  title,
  LEFT(content, 100) AS content_preview,
  COUNT(*) AS dup_count
FROM public.notes
WHERE deleted_at IS NULL
GROUP BY title, LEFT(content, 100)
HAVING COUNT(*) > 1;

-- 4. 可选：物理删除已软删除的笔记（不可恢复，谨慎执行）
-- DELETE FROM public.notes WHERE deleted_at IS NOT NULL;
