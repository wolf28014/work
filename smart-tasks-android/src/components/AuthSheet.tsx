import { useState } from 'react';
import {
  signInWithEmail, signUpWithEmail, sendOtp, verifyOtp,
  isSupabaseConfigured, useAuth,
} from '../lib/auth';
import { showToast } from './Toast';

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

type Mode = 'signin' | 'signup';
type Method = 'email' | 'phone';

export default function AuthSheet({ onClose, onSuccess }: Props) {
  const { isConfigured } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [method, setMethod] = useState<Method>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  function startCountdown() {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(timer); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  async function handleEmailSubmit() {
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
        await signUpWithEmail(email.trim(), password);
        showToast('注册成功！请去邮箱确认', 'success');
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

  async function handleSendOtp() {
    if (!phone.trim()) {
      showToast('请填写手机号', 'error');
      return;
    }
    if (!phone.startsWith('+')) {
      showToast('手机号需包含国家代码，如 +86138...', 'error');
      return;
    }
    setLoading(true);
    try {
      await sendOtp(phone.trim());
      setOtpSent(true);
      startCountdown();
      showToast('验证码已发送', 'success');
    } catch (e: any) {
      showToast(e.message || '发送失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otp.trim()) {
      showToast('请填写验证码', 'error');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(phone.trim(), otp.trim());
      showToast('登录成功', 'success');
      onSuccess?.();
      onClose();
    } catch (e: any) {
      showToast(e.message || '验证失败', 'error');
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
            <div className="text-sm text-slate-500 leading-relaxed mb-4">
              此版本未配置 Supabase 后端，无法使用账号功能。<br/>
              请联系开发者或在 src/lib/supabase.ts 中配置。
            </div>
            <button onClick={onClose} className="px-6 py-2 bg-indigo-500 text-white rounded-full text-sm">
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
          {/* 方式切换 */}
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-5">
            <button
              onClick={() => setMethod('email')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                method === 'email' ? 'bg-white dark:bg-slate-700 text-indigo-500 shadow-sm' : 'text-slate-500'
              }`}
            >📧 邮箱</button>
            <button
              onClick={() => setMethod('phone')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                method === 'phone' ? 'bg-white dark:bg-slate-700 text-indigo-500 shadow-sm' : 'text-slate-500'
              }`}
            >📱 手机号</button>
          </div>

          {/* 邮箱方式 */}
          {method === 'email' && (
            <div className="space-y-3">
              <div>
                <label className="text-[13px] font-medium text-slate-500 mb-1.5 block">邮箱</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="ios-input"
                  autoCapitalize="none"
                />
              </div>
              <div>
                <label className="text-[13px] font-medium text-slate-500 mb-1.5 block">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                  className="ios-input"
                />
              </div>
              <button
                onClick={handleEmailSubmit}
                disabled={loading}
                className="btn-primary w-full mt-2"
              >
                {loading ? '处理中…' : (mode === 'signin' ? '登录' : '注册')}
              </button>
            </div>
          )}

          {/* 手机号方式 */}
          {method === 'phone' && (
            <div className="space-y-3">
              <div>
                <label className="text-[13px] font-medium text-slate-500 mb-1.5 block">手机号（含国家代码）</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+8613800138000"
                  className="ios-input"
                  autoCapitalize="none"
                />
              </div>
              {!otpSent ? (
                <button onClick={handleSendOtp} disabled={loading} className="btn-primary w-full mt-2">
                  {loading ? '发送中…' : '发送验证码'}
                </button>
              ) : (
                <>
                  <div>
                    <label className="text-[13px] font-medium text-slate-500 mb-1.5 block">验证码</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={otp}
                        onChange={e => setOtp(e.target.value)}
                        placeholder="6 位数字"
                        className="ios-input flex-1"
                        maxLength={6}
                        inputMode="numeric"
                      />
                      <button
                        onClick={handleSendOtp}
                        disabled={countdown > 0}
                        className="px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-medium disabled:opacity-50"
                      >
                        {countdown > 0 ? `${countdown}s` : '重发'}
                      </button>
                    </div>
                  </div>
                  <button onClick={handleVerifyOtp} disabled={loading} className="btn-primary w-full mt-2">
                    {loading ? '验证中…' : '登录'}
                  </button>
                </>
              )}
              <div className="text-[11px] text-slate-400 leading-relaxed mt-2">
                💡 手机号需包含国家代码，如中国 +86、美国 +1。短信费用由 Supabase 服务商收取。
              </div>
            </div>
          )}

          {/* 登录/注册切换 */}
          <div className="text-center mt-5 text-[13px] text-slate-500">
            {mode === 'signin' ? '没有账号？' : '已有账号？'}
            <button
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="text-indigo-500 font-medium ml-1"
            >
              {mode === 'signin' ? '去注册' : '去登录'}
            </button>
          </div>

          {/* 协议 */}
          <div className="text-[10px] text-slate-400 text-center mt-4 leading-relaxed">
            登录即表示同意 <span className="text-indigo-500">《用户协议》</span> 和 <span className="text-indigo-500">《隐私政策》</span>
          </div>
        </div>
      </div>
    </div>
  );
}
