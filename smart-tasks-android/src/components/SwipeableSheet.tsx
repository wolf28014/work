import { useState, useEffect, useRef, type ReactNode } from 'react';

interface Props {
  onClose: () => void;
  children: ReactNode;
  /** 是否使用全屏 flex 布局（如聊天页面） */
  fullScreen?: boolean;
  /** 自定义内容容器类名 */
  bodyClassName?: string;
  /** z-index 层级，默认 50 */
  zIndex?: number;
  /** 是否显示左边缘返回指示器，默认 true。ActionSheet 可设为 false */
  showEdgeIndicator?: boolean;
  /** 触发返回的横向滑动距离阈值（px），默认 100 */
  threshold?: number;
  /** 边缘宽度（px），从此宽度内开始滑动才触发返回，默认 24 */
  edgeWidth?: number;
}

/**
 * 全面屏边缘滑动返回容器
 * - 从屏幕左边缘向内滑动（右滑）→ 关闭
 * - 从屏幕右边缘向内滑动（左滑）→ 关闭
 * - 适配 iOS/MIUI 全面屏手势
 * - 内容已向下滚动时不拦截手势（保持原生滚动体验）
 */
export default function SwipeableSheet({
  onClose, children, fullScreen = false, bodyClassName,
  zIndex = 50, showEdgeIndicator = true, threshold = 100, edgeWidth = 24,
}: Props) {
  const [translateX, setTranslateX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const startEdge = useRef<'left' | 'right' | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const startedAtTop = useRef(true);
  const contentRef = useRef<HTMLDivElement>(null);

  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    // 判断是否从屏幕左/右边缘开始
    const screenWidth = window.innerWidth;
    if (touch.clientX < edgeWidth) {
      startEdge.current = 'left';
    } else if (touch.clientX > screenWidth - edgeWidth) {
      startEdge.current = 'right';
    } else {
      startEdge.current = null;
    }
    isHorizontalSwipe.current = null;
    // 记录触摸开始时容器是否在顶部
    const el = contentRef.current;
    startedAtTop.current = el ? el.scrollTop <= 0 : true;
    setIsAnimating(false);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    if (startEdge.current === null) return; // 非边缘开始，不处理
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX.current;
    const dy = touch.clientY - touchStartY.current;

    // 第一次明显移动时判断方向
    if (isHorizontalSwipe.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      isHorizontalSwipe.current = Math.abs(dx) > Math.abs(dy);
    }

    // 必须是横向滑动 + 触摸开始时在顶部 + 方向正确
    if (isHorizontalSwipe.current === true && startedAtTop.current) {
      if (startEdge.current === 'left' && dx > 0) {
        // 左边缘右滑：页面跟手向右移动
        if (e.cancelable) e.preventDefault();
        setTranslateX(dx);
      } else if (startEdge.current === 'right' && dx < 0) {
        // 右边缘左滑：页面跟手向左移动
        if (e.cancelable) e.preventDefault();
        setTranslateX(dx);
      }
    }
  }

  function handleTouchEnd() {
    if (touchStartX.current === null) return;
    setIsAnimating(true);
    if (Math.abs(translateX) > threshold) {
      // 关闭：滑出屏幕
      const screenWidth = window.innerWidth;
      setTranslateX(translateX > 0 ? screenWidth : -screenWidth);
      setTimeout(() => onClose(), 200);
    } else {
      // 回弹
      setTranslateX(0);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    startEdge.current = null;
    isHorizontalSwipe.current = null;
  }

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const containerClass = bodyClassName || (fullScreen
    ? 'h-[88vh] flex flex-col overflow-y-auto no-scrollbar'
    : 'max-h-[92vh] overflow-y-auto no-scrollbar');

  return (
    <div
      className="fixed inset-0 modal-mask flex items-end"
      style={{ zIndex }}
      onClick={onClose}
    >
      <div
        ref={contentRef}
        className={`w-full bg-white dark:bg-black slide-up rounded-t-3xl ${containerClass}`}
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isAnimating ? 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
          paddingBottom: 'var(--safe-bottom)',
          touchAction: 'pan-y',
        }}
      >
        {/* 左边缘返回指示器 */}
        {showEdgeIndicator && (
          <>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-16 bg-slate-300 dark:bg-slate-600 rounded-r-full opacity-60 pointer-events-none z-20" />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-16 bg-slate-300 dark:bg-slate-600 rounded-l-full opacity-60 pointer-events-none z-20" />
          </>
        )}

        {/* 顶部把手 */}
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0 sticky top-0 bg-white dark:bg-black z-10">
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>

        {/* 返回提示（滑动时显示） */}
        {Math.abs(translateX) > 5 && (
          <div
            className="fixed top-1/2 -translate-y-1/2 text-emerald-500 text-xs font-medium pointer-events-none fade-in z-30 bg-emerald-50 dark:bg-emerald-900/40 px-2 py-1 rounded-full shadow"
            style={{
              left: translateX > 0 ? `${Math.min(translateX / 2, 30)}px` : 'auto',
              right: translateX < 0 ? `${Math.min(-translateX / 2, 30)}px` : 'auto',
            }}
          >
            {translateX > 0 ? '› 返回' : '返回 ‹'}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
