import { useState } from 'react';
import LegalSheet from './LegalSheet';
import { CURRENT_VERSION } from '../lib/updater';

const STORAGE_KEY = 'privacy-agreed-v1';

export function isPrivacyAgreed(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function setPrivacyAgreed() {
  localStorage.setItem(STORAGE_KEY, 'true');
}

export default function PrivacyConsentSheet() {
  const [showDetail, setShowDetail] = useState<null | 'privacy' | 'agreement'>(null);

  function handleAgree() {
    setPrivacyAgreed();
    // 触发 React 重新渲染
    window.dispatchEvent(new CustomEvent('privacy-agreed'));
  }

  function handleDisagree() {
    // 直接退出 App（Capacitor）
    if (confirm('不同意隐私政策将无法使用本应用，确定退出吗？')) {
      try {
        // @capacitor/app 退出
        import('@capacitor/app').then(({ App }) => App.exitApp());
      } catch {
        window.close();
      }
    }
  }

  if (showDetail) {
    return <LegalSheet type={showDetail === 'privacy' ? 'privacy' : 'agreement'} onClose={() => setShowDetail(null)} />;
  }

  return (
    <div className="fixed inset-0 z-[90] bg-white dark:bg-black flex flex-col">
      <div className="flex-shrink-0 pt-12 pb-4 px-6 text-center">
        <div className="text-5xl mb-3">✅</div>
        <h1 className="text-xl font-bold mb-1">智能待办</h1>
        <p className="text-sm text-slate-500">v{CURRENT_VERSION} · 隐私政策与用户协议</p>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-4">
        <div className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-200 space-y-3">
          <p>欢迎使用智能待办！在使用前，请您仔细阅读并同意以下协议：</p>

          <div className="ios-card p-4 space-y-2">
            <button
              onClick={() => setShowDetail('privacy')}
              className="flex items-center justify-between w-full text-left active:opacity-60"
            >
              <span className="text-[14px] font-medium">📖 隐私政策</span>
              <span className="text-slate-400">›</span>
            </button>
            <div className="text-[12px] text-slate-500 leading-relaxed">
              了解我们如何收集、使用和保护您的个人信息。本应用主要数据存储在本地，仅在您登录后同步到云端加密存储。
            </div>
          </div>

          <div className="ios-card p-4 space-y-2">
            <button
              onClick={() => setShowDetail('agreement')}
              className="flex items-center justify-between w-full text-left active:opacity-60"
            >
              <span className="text-[14px] font-medium">📄 用户协议</span>
              <span className="text-slate-400">›</span>
            </button>
            <div className="text-[12px] text-slate-500 leading-relaxed">
              使用规则、账号管理、付费服务、知识产权、免责声明等内容。
            </div>
          </div>

          <div className="ios-card p-4 bg-indigo-50 dark:bg-indigo-900/20">
            <div className="text-[12px] text-indigo-700 dark:text-indigo-300 leading-relaxed">
              <strong>关键提示：</strong>
              <ul className="mt-1 space-y-1 list-disc list-inside">
                <li>无需注册即可使用全部本地功能</li>
                <li>注册登录后可开启云同步（可选）</li>
                <li>AI 功能由您自配 API Key，不经我们服务器</li>
                <li>支持随时导出/清除数据</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-6 py-4 border-t border-slate-100 dark:border-slate-800 space-y-2" style={{ paddingBottom: 'calc(16px + var(--safe-bottom))' }}>
        <button
          onClick={handleAgree}
          className="w-full py-3.5 bg-indigo-500 text-white rounded-xl text-[15px] font-semibold active:scale-[0.98] transition-transform"
        >
          同意并继续
        </button>
        <button
          onClick={handleDisagree}
          className="w-full py-2 text-slate-500 text-[13px]"
        >
          不同意，退出应用
        </button>
      </div>
    </div>
  );
}
