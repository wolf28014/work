import { useState, useEffect, useRef, type ReactNode } from 'react';
import { App as CapacitorApp } from '@capacitor/app';

interface Props {
  onClose: () => void;
  children: ReactNode;
  fullScreen?: boolean;
  bodyClassName?: string;
  zIndex?: number;
  showEdgeIndicator?: boolean;
  /** 是否启用边缘滑动手势（默认 true）。系统返回键由组件自动监听 */
  enableEdgeSwipe?: boolean;
}

/**
 * 子页面容器
 *
 * 返回交互：
 * - 系统返回键（含 MIUI 全面屏左右边缘内滑）→ 自动触发 onClose
 * - Web 兼容：屏幕左右边缘内滑 → 触发 onClose
 * - 点击遮罩 → 触发 onClose
 *
 * 通过 @capacitor/app 监听 backButton 事件
 * 系统手势（边缘滑动）会触发 backButton，无需自己模拟
 */
export default function SwipeableSheet({
  onClose, children, fullScreen = false, bodyClassName,
  zIndex = 50, showEdgeIndicator = true, enableEdgeSwipe = true,
}: Props) {
  const [closing, setClosing] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const startEdge = useRef<'left' | 'right' | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 监听系统返回键（含 MIUI 全面屏左右边缘内滑）
  // 每次 mount 时注册，unmount 时移除
  useEffect(() => {
    const handleBackButton = () => {
      if (closing) return;
      setClosing(true);
      setTimeout(() => onCloseRef.current(), 200);
    };
    const listener = CapacitorApp.addListener('backButton', handleBackButton);
    return () => { listener.then(l => l.remove()); };
  }, [closing]);

  // 包装 onClose，触发关闭动画
  function handleClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose(), 200);
  }

  // Web 兼容：边缘滑动（在浏览器或不支持系统手势时使用）
  function handleTouchStart(e: React.TouchEvent) {
    if (!enableEdgeSwipe) return;
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    const screenWidth = window.innerWidth;
    const edgeWidth = 20; // 贴近 MIUI 规范
    if (touch.clientX < edgeWidth) {
      startEdge.current = 'left';
    } else if (touch.clientX > screenWidth - edgeWidth) {
      startEdge.current = 'right';
    } else {
      startEdge.current = null;
    }
    isHorizontalSwipe.current = null;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!enableEdgeSwipe) return;
    if (touchStartX.current === null || touchStartY.current === null) return;
    if (startEdge.current === null) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX.current;
    const dy = touch.clientY - touchStartY.current;

    if (isHorizontalSwipe.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      isHorizontalSwipe.current = Math.abs(dx) > Math.abs(dy);
    }

    if (isHorizontalSwipe.current === true) {
      if (startEdge.current === 'left' && dx > 0) {
        if (e.cancelable) e.preventDefault();
        setTranslateX(dx);
        setIsDragging(true);
      } else if (startEdge.current === 'right' && dx < 0) {
        if (e.cancelable) e.preventDefault();
        setTranslateX(dx);
        setIsDragging(true);
      }
    }
  }

  function handleTouchEnd() {
    if (!enableEdgeSwipe) return;
    if (touchStartX.current === null) return;
    if (Math.abs(translateX) > 50) {
      handleClose();
    } else {
      setTranslateX(0);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    startEdge.current = null;
    isHorizontalSwipe.current = null;
    setIsDragging(false);
  }

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const containerClass = bodyClassName || (fullScreen
    ? 'h-[88vh] flex flex-col overflow-y-auto no-scrollbar'
    : 'max-h-[92vh] overflow-y-auto no-scrollbar');

  // 计算变换：拖动时跟手，关闭时向拖动方向滑出
  let transform: string;
  if (closing) {
    // 关闭动画：向最后拖动方向滑出
    transform = `translateX(${translateX > 0 ? window.innerWidth : translateX < 0 ? -window.innerWidth : 0}px)`;
  } else if (isDragging) {
    transform = `translateX(${translateX}px)`;
  } else {
    transform = 'translateX(0)';
  }

  return (
    <div
      className="fixed inset-0 modal-mask flex items-end"
      style={{
        zIndex,
        touchAction: 'pan-y',
        transition: isDragging ? 'none' : 'background 0.2s ease',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClose}
    >
      <div
        ref={contentRef}
        className={`w-full bg-white dark:bg-black rounded-t-3xl ${containerClass} ${!closing && !isDragging ? 'slide-up' : ''}`}
        onClick={e => e.stopPropagation()}
        style={{
          transform,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
          paddingBottom: 'var(--safe-bottom)',
        }}
      >
        {/* 顶部把手 */}
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0 sticky top-0 bg-white dark:bg-black z-10">
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>

        {/* 边缘指示器（轻量，不抢系统手势） */}
        {showEdgeIndicator && enableEdgeSwipe && (
          <>
            <div className="fixed left-0 top-1/2 -translate-y-1/2 w-0.5 h-12 bg-slate-300/40 rounded-r-full pointer-events-none z-30" />
            <div className="fixed right-0 top-1/2 -translate-y-1/2 w-0.5 h-12 bg-slate-300/40 rounded-l-full pointer-events-none z-30" />
          </>
        )}

        {children}
      </div>
    </div>
  );
}
