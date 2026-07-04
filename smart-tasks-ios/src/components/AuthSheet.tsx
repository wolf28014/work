import { useState } from 'react';
import {
  signInWithEmail, signUpWithEmail,
  isSupabaseConfigured, useAuth,
} from '../lib/auth';
import { showToast } from './Toast';

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

type Mode = 'signin' | 'signup';

export default function AuthSheet({ onClose, onSuccess }: Props) {
  const { isConfigured } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password) {
      showToast('请填写邮箱和密码', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('密码至少 6 位', 'error');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        const user = await signUpWithEmail(email.trim(), password);
        // v6.6 — 修复 #25：注册成功后检查 session
        // 如果 Supabase 配置了"邮箱验证"，session 为 null，需要提示用户去邮箱确认
        // 如果没配置邮箱验证，session 已建立，直接登录成功
        if (user) {
          showToast('注册成功！欢迎加入', 'success');
          onSuccess?.();
          onClose();
        } else {
          showToast('注册成功！请去邮箱确认', 'success');
          setMode('signin');
        }
      } else {
        await signInWithEmail(email.trim(), password);
        showToast('登录成功', 'success');
        onSuccess?.();
        onClose();
      }
    } catch (e: any) {
      showToast(e.message || '操作失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  if (!isConfigured) {
    return (
      <div className="fixed inset-0 z-50 modal-mask flex items-end" onClick={onClose}>
        <div className="w-full bg-white dark:bg-black slide-up rounded-t-3xl p-6" onClick={e => e.stopPropagation()} style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}>
          <div className="flex justify-center pt-2 pb-3">
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
          </div>
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🔧</div>
            <div className="text-base font-semibold mb-2">云服务尚未配置</div>
            <div className="text-sm text-[color:var(--text-secondary)] leading-relaxed mb-4">
              此版本未配置 Supabase 后端，无法使用账号功能。<br/>
              请联系开发者或在 src/lib/supabase.ts 中配置。
            </div>
            <button onClick={onClose} className="px-6 py-2 bg-[var(--primary)] text-[color:#ffffff] rounded-full text-sm">
              关闭
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 modal-mask flex items-end" onClick={onClose}>
      <div
        className="w-full bg-white dark:bg-black slide-up rounded-t-3xl overflow-y-auto no-scrollbar"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={onClose} className="text-blue-500 text-[15px]">取消</button>
          <span className="text-[15px] font-semibold">{mode === 'signin' ? '登录' : '注册'}</span>
          <span className="w-10" />
        </div>

        <div className="px-6 pb-6">
          <div className="space-y-3">
            <div>
              <label className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-1.5 block">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="ios-input"
                autoCapitalize="none"
                onKeyDown={e => { if (e.key === 'Enter' && !loading) handleSubmit(); }}
              />
            </div>
            <div>
              <label className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-1.5 block">密码</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="至少 6 位"
                className="ios-input"
                onKeyDown={e => { if (e.key === 'Enter' && !loading) handleSubmit(); }}
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn-primary w-full mt-2"
            >
              {loading ? '处理中…' : (mode === 'signin' ? '登录' : '注册')}
            </button>
          </div>

          {/* 登录/注册切换 */}
          <div className="text-center mt-5 text-[13px] text-[color:var(--text-secondary)]">
            {mode === 'signin' ? '没有账号？' : '已有账号？'}
            <button
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="text-[color:var(--primary)] font-medium ml-1"
            >
              {mode === 'signin' ? '去注册' : '去登录'}
            </button>
          </div>

          {/* 协议 */}
          <div className="text-[10px] text-[color:var(--text-tertiary)] text-center mt-4 leading-relaxed">
            登录即表示同意 <span className="text-[color:var(--primary)]">《用户协议》</span> 和 <span className="text-[color:var(--primary)]">《隐私政策》</span>
          </div>
        </div>
      </div>
    </div>
  );
}
