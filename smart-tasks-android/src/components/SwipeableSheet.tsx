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
  /** 触发返回的横向滑动距离阈值（px），默认 80 */
  threshold?: number;
  /** 边缘宽度（px），从此宽度内开始滑动才触发返回，默认 35 */
  edgeWidth?: number;
}

/**
 * 全面屏边缘滑动返回容器
 * - 从屏幕左边缘向内滑动（右滑）→ 关闭
 * - 从屏幕右边缘向内滑动（左滑）→ 关闭
 * - 适配 iOS/MIUI 全面屏手势
 * - touch 事件绑在外层遮罩（全屏），确保边缘能捕获
 */
export default function SwipeableSheet({
  onClose, children, fullScreen = false, bodyClassName,
  zIndex = 50, showEdgeIndicator = true, threshold = 60, edgeWidth = 50,
}: Props) {
  const [translateX, setTranslateX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const startEdge = useRef<'left' | 'right' | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // touch 事件绑在外层遮罩，覆盖整个屏幕，确保边缘能捕获
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

    if (isHorizontalSwipe.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      isHorizontalSwipe.current = Math.abs(dx) > Math.abs(dy);
    }

    // 从上到下任意位置都可以触发，不限制 scrollTop
    if (isHorizontalSwipe.current === true) {
      if (startEdge.current === 'left' && dx > 0) {
        if (e.cancelable) e.preventDefault();
        setTranslateX(dx);
      } else if (startEdge.current === 'right' && dx < 0) {
        if (e.cancelable) e.preventDefault();
        setTranslateX(dx);
      }
    }
  }

  function handleTouchEnd() {
    if (touchStartX.current === null) return;
    setIsAnimating(true);
    if (Math.abs(translateX) > threshold) {
      const screenWidth = window.innerWidth;
      setTranslateX(translateX > 0 ? screenWidth : -screenWidth);
      setTimeout(() => onClose(), 200);
    } else {
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
      style={{ zIndex, touchAction: 'pan-y' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={onClose}
    >
      <div
        ref={contentRef}
        className={`w-full bg-white dark:bg-black slide-up rounded-t-3xl ${containerClass}`}
        onClick={e => e.stopPropagation()}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isAnimating ? 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
          paddingBottom: 'var(--safe-bottom)',
        }}
      >
        {showEdgeIndicator && (
          <>
            <div className="fixed left-0 top-1/2 -translate-y-1/2 w-1 h-16 bg-slate-400/40 rounded-r-full pointer-events-none z-30" />
            <div className="fixed right-0 top-1/2 -translate-y-1/2 w-1 h-16 bg-slate-400/40 rounded-l-full pointer-events-none z-30" />
          </>
        )}

        <div className="flex justify-center pt-2 pb-1 flex-shrink-0 sticky top-0 bg-white dark:bg-black z-10">
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>

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
