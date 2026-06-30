import { useState, useEffect, useRef, type ReactNode } from 'react';

interface Props {
  onClose: () => void;
  children: ReactNode;
  fullScreen?: boolean;
  bodyClassName?: string;
  zIndex?: number;
  showEdgeIndicator?: boolean;
  /** 触发返回的横向滑动距离阈值（px），默认 50 */
  threshold?: number;
  /** 边缘宽度（px），默认 20（贴近 MIUI 全面屏手势） */
  edgeWidth?: number;
}

/**
 * 全面屏边缘滑动返回容器（MIUI 风格）
 *
 * - 从屏幕左边缘向内滑动（右滑）→ 关闭
 * - 从屏幕右边缘向内滑动（左滑）→ 关闭
 * - 整个屏幕左侧/右侧边缘都能触发（从上到下，不限中间）
 * - 页面跟手移动 + 缩放效果
 * - 适配 MIUI 全面屏手势规范
 */
export default function SwipeableSheet({
  onClose, children, fullScreen = false, bodyClassName,
  zIndex = 50, showEdgeIndicator = true, threshold = 50, edgeWidth = 20,
}: Props) {
  const [translateX, setTranslateX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);
  const [dragProgress, setDragProgress] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const startEdge = useRef<'left' | 'right' | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    const screenWidth = window.innerWidth;
    if (touch.clientX < edgeWidth) {
      startEdge.current = 'left';
    } else if (touch.clientX > screenWidth - edgeWidth) {
      startEdge.current = 'right';
    } else {
      startEdge.current = null;
    }
    isHorizontalSwipe.current = null;
    setIsAnimating(false);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    if (startEdge.current === null) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX.current;
    const dy = touch.clientY - touchStartY.current;

    // 第一次明显移动时判断方向
    if (isHorizontalSwipe.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      isHorizontalSwipe.current = Math.abs(dx) > Math.abs(dy);
    }

    if (isHorizontalSwipe.current === true) {
      if (startEdge.current === 'left' && dx > 0) {
        if (e.cancelable) e.preventDefault();
        setTranslateX(dx);
        setDragProgress(Math.min(dx / window.innerWidth, 1));
      } else if (startEdge.current === 'right' && dx < 0) {
        if (e.cancelable) e.preventDefault();
        setTranslateX(dx);
        setDragProgress(Math.min(-dx / window.innerWidth, 1));
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
      setDragProgress(0);
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

  // 跟手缩放效果（拖动越远，缩放越多，模拟 MIUI 风格）
  const scale = 1 - dragProgress * 0.15;

  return (
    <div
      className="fixed inset-0 modal-mask flex items-end"
      style={{
        zIndex,
        touchAction: 'pan-y',
        // 背景遮罩随拖动进度变透明
        background: `rgba(0, 0, 0, ${0.4 * (1 - dragProgress)})`,
        backdropFilter: dragProgress > 0.1 ? 'none' : 'blur(4px)',
        WebkitBackdropFilter: dragProgress > 0.1 ? 'none' : 'blur(4px)',
        transition: isAnimating ? 'background 0.25s ease, backdrop-filter 0.25s ease' : 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={onClose}
    >
      <div
        ref={contentRef}
        className={`w-full bg-white dark:bg-black rounded-t-3xl ${containerClass} ${Math.abs(translateX) < 5 ? 'slide-up' : ''}`}
        onClick={e => e.stopPropagation()}
        style={{
          transform: `translateX(${translateX}px) scale(${scale})`,
          transformOrigin: translateX > 0 ? 'left center' : translateX < 0 ? 'right center' : 'center center',
          transition: isAnimating ? 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
          paddingBottom: 'var(--safe-bottom)',
        }}
      >
        {/* 边缘指示器（拖动时高亮） */}
        {showEdgeIndicator && (
          <>
            <div
              className="fixed left-0 top-0 bottom-0 w-1 pointer-events-none z-30 transition-opacity"
              style={{
                background: startEdge.current === 'left' && dragProgress > 0
                  ? `linear-gradient(to right, rgba(16, 185, 129, ${0.8 * dragProgress}), transparent)`
                  : 'transparent',
              }}
            />
            <div
              className="fixed right-0 top-0 bottom-0 w-1 pointer-events-none z-30 transition-opacity"
              style={{
                background: startEdge.current === 'right' && dragProgress > 0
                  ? `linear-gradient(to left, rgba(16, 185, 129, ${0.8 * dragProgress}), transparent)`
                  : 'transparent',
              }}
            />
          </>
        )}

        {/* 顶部把手 */}
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0 sticky top-0 bg-white dark:bg-black z-10">
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>

        {/* 返回提示（滑动时显示） */}
        {dragProgress > 0.1 && (
          <div
            className="fixed top-1/2 -translate-y-1/2 text-emerald-500 text-[13px] font-medium pointer-events-none fade-in z-30 bg-emerald-50 dark:bg-emerald-900/60 px-3 py-1.5 rounded-full shadow-lg"
            style={{
              left: translateX > 0 ? '50%' : 'auto',
              right: translateX < 0 ? '50%' : 'auto',
              transform: translateX > 0 ? 'translateX(-50%)' : 'translateX(50%)',
              opacity: Math.min(dragProgress * 2, 1),
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
