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
}

/**
 * 可滑动的子页面容器
 * - 支持从左边缘右滑关闭（适配安卓手势）
 * - 支持点击遮罩关闭
 * - 阻止背景滚动
 */
export default function SwipeableSheet({ onClose, children, fullScreen = false, bodyClassName, zIndex = 50, showEdgeIndicator = true }: Props) {
  const [translateX, setTranslateX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isEdgeSwipe = useRef(false);
  const isHorizontalSwipe = useRef(false);

  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    isEdgeSwipe.current = touch.clientX < 30;
    isHorizontalSwipe.current = false;
    setIsAnimating(false);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX.current;
    const dy = touch.clientY - touchStartY.current;

    if (!isHorizontalSwipe.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      isHorizontalSwipe.current = Math.abs(dx) > Math.abs(dy);
    }

    if (isEdgeSwipe.current && isHorizontalSwipe.current && dx > 0) {
      setTranslateX(dx);
    } else if (!isEdgeSwipe.current && isHorizontalSwipe.current && dx > 30) {
      isEdgeSwipe.current = true;
      setTranslateX(dx);
    }
  }

  function handleTouchEnd() {
    if (touchStartX.current === null) return;
    setIsAnimating(true);
    if (translateX > 100) {
      setTranslateX(window.innerWidth);
      setTimeout(() => onClose(), 200);
    } else {
      setTranslateX(0);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    isEdgeSwipe.current = false;
    isHorizontalSwipe.current = false;
  }

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const containerClass = bodyClassName || (fullScreen
    ? 'h-[88vh] flex flex-col'
    : 'max-h-[92vh] overflow-y-auto no-scrollbar');

  return (
    <div
      className="fixed inset-0 modal-mask flex items-end"
      style={{ zIndex }}
      onClick={onClose}
    >
      <div
        className={`w-full bg-white dark:bg-black slide-up rounded-t-3xl ${containerClass}`}
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isAnimating ? 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
          paddingBottom: 'var(--safe-bottom)',
        }}
      >
        {/* 左边缘返回指示器 */}
        {showEdgeIndicator && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-16 bg-slate-300 dark:bg-slate-600 rounded-r-full opacity-60 pointer-events-none z-20" />
        )}

        {/* 顶部把手 */}
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>

        {/* 返回提示（滑动时显示） */}
        {translateX > 5 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 text-emerald-500 text-xs font-medium pointer-events-none fade-in z-20"
            style={{ left: `${Math.min(translateX + 10, 60)}px` }}
          >
            › 返回
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
