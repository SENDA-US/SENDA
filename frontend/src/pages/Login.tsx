import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../config';

type LoginProps = {
  onLogin: (
    page: 'participants' | 'assignments' | 'admin',
    role: 'researcher' | 'admin',
    email?: string
  ) => void;
  onBackToFront: () => void;
};

const Login: React.FC<LoginProps> = ({ onLogin, onBackToFront }) => {
  const { t, i18n } = useTranslation();

  const [role, setRole] = useState<'researcher' | 'admin'>('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('senda_dark_mode') === 'true';
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('senda_dark_mode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('senda_dark_mode', 'false');
    }
  }, [darkMode]);

  useEffect(() => {
    setUsername('');
    setPassword('');
    setOtpCode('');
    setStep(1);
    setError(null);
    setInfoMessage(null);
  }, [role]);

  const handleResearcherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      if (step === 1) {
        const res = await fetch(`${API_URL}/api/auth/researcher/request-code/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: username }),
          credentials: 'include',
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Error al solicitar el código de acceso.');
          return;
        }
        setInfoMessage('Hemos enviado un código temporal a tu correo electrónico.');
        setStep(2);
      } else {
        const res = await fetch(`${API_URL}/api/auth/researcher/verify-code/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: username, code: otpCode }),
          credentials: 'include',
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'El código es incorrecto o ha caducado.');
          return;
        }
        onLogin('assignments', 'researcher', username);
      }
    } catch (err) {
      setError('No se ha podido conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/admin/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        setError(t(json.error) || t('Unknown error'));
        return;
      }
      onLogin('participants', 'admin', username);
    } catch (err) {
      setError('No se ha podido conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const accessDescription =
    role === 'admin'
      ? t('Admin Access')
      : step === 1
        ? t('Researcher Step 1')
        : t('Researcher Step 2');

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#F4F8F5] font-sans text-[#18352A] transition-colors duration-500 dark:bg-[#06120A] dark:text-[#E8F1EB] flex flex-col justify-between">

      {/* ANIMATED BACKGROUND */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[15%] -top-[25%] h-[65vh] w-[65vw] rounded-full bg-[#DCEBE1]/80 blur-[110px] dark:bg-[#163A29]/30" />
        <div className="absolute -bottom-[25%] -right-[15%] h-[60vh] w-[60vh] rounded-full bg-[#C8E2D1]/45 blur-[120px] dark:bg-[#1B4A32]/20" />

        <div className="senda-wave senda-wave-1">
          <svg viewBox="0 0 1600 700" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
            <path d="M-150 420 C 80 270, 300 235, 540 330 C 790 430, 980 565, 1220 500 C 1400 450, 1530 340, 1750 230 L1750 750 L-150 750 Z" className="fill-[#C8E2D1]/65 dark:fill-[#163A29]/65" />
          </svg>
        </div>
        <div className="senda-wave senda-wave-2">
          <svg viewBox="0 0 1600 700" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
            <path d="M-150 500 C 100 390, 320 350, 590 455 C 850 555, 1050 650, 1300 550 C 1480 480, 1580 400, 1750 330 L1750 750 L-150 750 Z" className="fill-[#A9CDB7]/45 dark:fill-[#24543C]/45" />
          </svg>
        </div>
        <div className="senda-wave senda-wave-3">
          <svg viewBox="0 0 1600 700" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
            <path d="M-150 590 C 180 480, 440 465, 720 555 C 1010 650, 1260 625, 1750 460 L1750 750 L-150 750 Z" className="fill-[#76AF8D]/20 dark:fill-[#72C99B]/15" />
          </svg>
        </div>
        <div className="absolute bottom-[-18%] left-[-10%] h-[45%] w-[120%] rounded-[50%] bg-[#DCEBE1]/30 blur-[90px] dark:bg-[#1B4A32]/15" />
      </div>

      {/* TOP CONTROLS */}
      <div className="relative z-50 flex items-center justify-between px-6 pt-5 pb-2 sm:px-10">
        <button
          type="button"
          onClick={onBackToFront}
          className="flex h-9 sm:h-10 cursor-pointer items-center gap-1.5 sm:gap-2 rounded-full border border-[#D6E2D9] bg-white/75 px-3 sm:px-5 text-[10px] sm:text-xs font-semibold text-[#527062] shadow-[0_8px_25px_rgba(29,90,61,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#A9C7B3] hover:text-[#1D5A3D] dark:border-[#2B4033] dark:bg-[#132019]/80 dark:text-[#A5B8AC]"
        >
          <span className="text-sm leading-none">←</span>
          <span className="hidden sm:inline">{t('Back to home', { defaultValue: 'Volver al inicio' })}</span>
          <span className="sm:hidden">{t('Back to home')}</span>
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center h-9 sm:h-10 rounded-full border border-[#D6E2D9] bg-white/75 p-1 shadow-sm backdrop-blur-xl dark:border-[#2B4033] dark:bg-[#132019]/80">
            <button
              type="button"
              onClick={() => i18n.changeLanguage('es')}
              className={`flex h-full cursor-pointer items-center gap-1 sm:gap-1.5 rounded-full px-2 sm:px-3 text-[10px] sm:text-[11px] font-semibold transition-all ${i18n.language === 'es' ? 'bg-[#DCEBE1] text-[#1D5A3D] dark:bg-[#284738] dark:text-[#A9E1C0]' : 'text-[#718077] hover:text-[#315D46] dark:text-[#8FA197]'
                }`}
            >
              <img src="https://flagcdn.com/w40/es.png" alt="Español" className="h-3.5 w-3.5 rounded-full object-cover" />
              ES
            </button>
            <button
              type="button"
              onClick={() => i18n.changeLanguage('en')}
              className={`flex h-full cursor-pointer items-center gap-1 sm:gap-1.5 rounded-full px-2 sm:px-3 text-[10px] sm:text-[11px] font-semibold transition-all ${i18n.language === 'en' ? 'bg-[#DCEBE1] text-[#1D5A3D] dark:bg-[#284738] dark:text-[#A9E1C0]' : 'text-[#718077] hover:text-[#315D46] dark:text-[#8FA197]'
                }`}
            >
              <img src="https://flagcdn.com/w40/gb.png" alt="English" className="h-3.5 w-3.5 rounded-full object-cover" />
              EN
            </button>
          </div>

          <button
            type="button"
            onClick={() => setDarkMode((value) => !value)}
            title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="flex h-9 w-9 sm:h-10 sm:w-10 cursor-pointer items-center justify-center rounded-full border border-[#D9E5DB] bg-white/70 text-[#527062] transition-all hover:scale-105 dark:border-[#30453A] dark:bg-[#14221A] dark:text-[#A9D7B9]"
          >
            {darkMode ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M18.66 5.34l-1.41 1.41" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="relative z-10 flex w-full flex-1 flex-col items-center justify-start px-4 pb-6 pt-1.5 sm:px-6">
        {/* LOGO */}
        <div className="mb-2 flex w-full justify-center">
          <img
            src={darkMode ? '/images/senda-dark-sin.png' : '/images/senda-claro-sin.png'}
            alt="SENDA"
            className="h-[85px] w-[85px] object-contain drop-shadow-[0_8px_20px_rgba(29,90,61,0.10)]"
          />
        </div>

        {/* LOGIN CARD */}
        <div className="w-full max-w-[430px]">
          <div className="rounded-[28px] border border-[#98c7a5] bg-white/90 px-6 py-6 shadow-[0_25px_70px_rgba(29,90,61,0.13)] backdrop-blur-2xl transition-all sm:px-7 sm:py-7 dark:border-[#293D31] dark:bg-[#101B15]/90 dark:shadow-[0_25px_70px_rgba(0,0,0,0.28)]">

            {/* HEADER */}
            <div className="mb-4 flex items-center justify-between">
              <div className="mr-auto">
                <h2 className="text-[23px] font-semibold leading-[1.08] tracking-[-0.03em] text-[#18352A] dark:text-[#E8F1EB] sm:text-[27px]" style={{ fontFamily: 'Fraunces, serif' }}>
                  {t('Sign in')}
                </h2>
                <p className="mt-1 max-w-[260px] text-[11px] leading-relaxed text-[#718078] dark:text-[#9EAEA4]">
                  {accessDescription}
                </p>
              </div>
            </div>

            {/* ROLE SELECTOR */}
            <div className="mb-4">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#738078] dark:text-[#8E9E95]">
                {t('Role')}
              </p>
              <div className="grid grid-cols-2 rounded-xl border border-[#DCE7DF] bg-[#F4F8F5] p-1 dark:border-[#2B4033] dark:bg-[#0D1711]">
                <button
                  type="button"
                  onClick={() => setRole('researcher')}
                  className={`group flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all duration-300 ${role === 'researcher' ? 'bg-white text-[#1D5A3D] shadow-sm dark:bg-[#1B2D23] dark:text-[#9BDCB6]' : 'text-[#75837B] hover:text-[#365D47] dark:text-[#7F9086]'
                    }`}
                >
                  {t('Researcher')}
                </button>
                <button
                  type="button"
                  onClick={() => setRole('admin')}
                  className={`group flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all duration-300 ${role === 'admin' ? 'bg-white text-[#1D5A3D] shadow-sm dark:bg-[#1B2D23] dark:text-[#9BDCB6]' : 'text-[#75837B] hover:text-[#365D47] dark:text-[#7F9086]'
                    }`}
                >
                  {t('Administrator')}
                </button>
              </div>
            </div>

            {/* FORM */}
            <form onSubmit={role === 'admin' ? handleAdminSubmit : handleResearcherSubmit} className="space-y-3" autoComplete="off">
              {role === 'researcher' && step === 2 ? (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[#345443] dark:text-[#C2D5C9]">
                    {t('Temporary Code')}
                  </label>
                  <input
                    value={otpCode}
                    onChange={(ev) => setOtpCode(ev.target.value.replace(/\D/g, '').slice(0, 6))}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    autoComplete="one-time-code"
                    placeholder="000000"
                    className="w-full rounded-xl border border-[#D6E3DA] bg-[#F8FBF9] px-4 py-2.5 text-center font-mono text-[17px] font-semibold tracking-[0.3em] text-[#18352A] outline-none transition-all placeholder:text-[#A2AEA7] focus:border-[#63A982] focus:bg-white focus:ring-4 focus:ring-[#DCEBE1]/80 dark:border-[#2D4335] dark:bg-[#0C1610] dark:text-[#E6F0E9]"
                  />
                  <div className="mt-1.5 flex items-center justify-between">
                    <p className="text-[11px] text-[#89958E] dark:text-[#7F9087]">{username}</p>
                    <button
                      type="button"
                      onClick={() => { setStep(1); setOtpCode(''); setError(null); setInfoMessage(null); }}
                      className="cursor-pointer text-[11px] font-semibold text-[#397D59] hover:underline dark:text-[#82CDA0]"
                    >
                      {t('Change Email or Code')}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[#345443] dark:text-[#C2D5C9]">
                    {role === 'admin' ? t('Admin user', { defaultValue: 'Admin user' }) : t('Researcher Email')}
                  </label>
                  <input
                    value={username}
                    onChange={(ev) => setUsername(ev.target.value)}
                    type={role === 'admin' ? 'text' : 'email'}
                    required
                    autoComplete="off"
                    placeholder={role === 'admin' ? t('Enter your username', { defaultValue: 'Enter your username' }) : 'investigador@universidad.es'}
                    className="w-full rounded-xl border border-[#D6E3DA] bg-[#F8FBF9] px-3.5 py-2.5 text-xs text-[#18352A] outline-none transition-all placeholder:text-[#A2AEA7] focus:border-[#63A982] focus:bg-white focus:ring-4 focus:ring-[#DCEBE1]/80 dark:border-[#2D4335] dark:bg-[#0C1610] dark:text-senda-main"
                  />
                </div>
              )}

              {role === 'admin' && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[#345443] dark:text-[#C2D5C9]">
                    {t('Password')}
                  </label>
                  <input
                    value={password}
                    onChange={(ev) => setPassword(ev.target.value)}
                    type="password"
                    required
                    autoComplete="new-password"
                    placeholder="••••••••••"
                    className="w-full rounded-xl border border-[#D6E3DA] bg-[#F8FBF9] px-3.5 py-2.5 text-xs text-[#18352A] outline-none transition-all placeholder:text-[#A2AEA7] focus:border-[#63A982] focus:bg-white focus:ring-4 focus:ring-[#DCEBE1]/80 dark:border-[#2D4335] dark:bg-[#0C1610] dark:text-senda-main"
                  />
                </div>
              )}

              {infoMessage && (
                <div className="flex items-start gap-2 rounded-xl border border-[#CDE3D4] bg-[#F0F8F2] px-3.5 py-2 dark:border-[#315640] dark:bg-[#13291D]">
                  <p className="text-[11px] leading-tight text-[#47725A] dark:text-[#9BCDAE]">{infoMessage}</p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-[#E9CCCC] bg-[#FFF6F6] px-3.5 py-2 dark:border-[#573737] dark:bg-[#291818]">
                  <p className="text-[11px] leading-tight text-[#A05252] dark:text-[#E39B9B]">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group relative mt-2 flex h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#1D5A3D] px-4 text-xs font-bold text-white shadow-md transition-all hover:bg-[#174A32] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#72C99B] dark:text-[#102018] dark:hover:bg-[#8BD7AC]"
              >
                {loading ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white dark:border-[#102018]/30 dark:border-t-[#102018]" />
                    <span>{t('Processing')}</span>
                  </>
                ) : (
                  <>
                    <span>{role === 'researcher' && step === 1 ? t('Request Code') : t('Access system')}</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </form>

            {/* SECURITY NOTE */}
            <div className="mt-4 flex items-center justify-center gap-1.5 border-t border-[#E3EBE5] pt-3 dark:border-[#293B30]">
              <svg className="h-3.5 w-3.5 text-[#87938C] dark:text-[#7E9085]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-[10px] text-[#87938C] dark:text-[#7E9085]">
                {t('Secure access • GDPR compliance', { defaultValue: 'Secure access · GDPR compliance' })}
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="relative z-10 py-3 text-center">
        <p className="text-[11px] text-[#5F6964] dark:text-[#99AD9E] sm:px-10 lg:px-14">
          © {new Date().getFullYear()} {t('FooterText')}
        </p>
      </footer>
    </div>
  );
};

export default Login;