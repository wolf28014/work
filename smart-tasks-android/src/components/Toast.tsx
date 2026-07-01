import { useEffect, useState } from 'react';

type ToastState = { msg: string; type: 'info' | 'success' | 'error' } | null;
let setter: ((t: ToastState) => void) | null = null;

export function showToast(msg: string, type: 'info' | 'success' | 'error' = 'info') {
  setter?.({ msg, type });
}

export default function Toast() {
  const [state, setState] = useState<ToastState>(null);

  useEffect(() => {
    setter = setState;
    return () => { setter = null; };
  }, []);

  useEffect(() => {
    if (state) {
      const timer = setTimeout(() => setState(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [state]);

  if (!state) return null;

  const colors = {
    info: 'bg-[var(--card)] text-[color:#ffffff]',
    success: 'bg-[var(--primary)] text-[color:#ffffff]',
    error: 'bg-rose-500 text-[color:#ffffff]',
  };

  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[100] fade-in" style={{ top: 'calc(var(--safe-top) + 56px)' }}>
      <div className={`${colors[state.type]} px-4 py-2 rounded-full text-sm font-medium shadow-lg max-w-[80vw] text-center`}>
        {state.msg}
      </div>
    </div>
  );
}
