import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import FrontPage from './pages/FrontPage';
import Login from './pages/Login';
import Participants from './pages/Participants';
import Fitbits from './pages/Fitbits';
import Assignments from './pages/Assignments';
import Syncs from './pages/Syncs';
import PhysiologicalData from './pages/PhysiologicalData';
import Alerts from './pages/Alerts';
import Exports from './pages/Exports';
import Admin from './pages/Admin';
import { API_URL } from './config';


const App: React.FC = () => {
  const { t, i18n: currentI18n } = useTranslation();

  const [loggedIn, setLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('senda_logged_in') === 'true';
  });

  const [role, setRole] = useState<'researcher' | 'admin' | null>(() => {
    return (localStorage.getItem('senda_role') as 'researcher' | 'admin') || null;
  });

  const [currentUser, setCurrentUser] = useState<string>(() => {
    return localStorage.getItem('senda_user_email') || '';
  });

  const [page, setPage] = useState<string>(() => {
    const savedPage = localStorage.getItem('senda_current_page');
    if (savedPage) return savedPage;
    return 'front';
  });

  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [activeAlertsCount, setActiveAlertsCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('senda_dark_mode') === 'true';
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
    if (loggedIn) {
      fetch(`${API_URL}/api/alerts/`, { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
          const items = data.items || [];
          const activeCount = items.filter((item: any) => !item.resolved).length;
          setActiveAlertsCount(activeCount);
        })
        .catch(() => console.error('Error fetching initial alerts count'));
    }
  }, [loggedIn]);

  const handleSetPage = (newPage: string) => {
    setPage(newPage);
    localStorage.setItem('senda_current_page', newPage);
  };

  const handleLogin = (nextPage: string, userRole: 'researcher' | 'admin', email?: string) => {
    const userEmail = email && email.trim() !== ''
      ? email
      : (userRole === 'admin' ? 'admin@senda.es' : 'investigador@senda.es');

    const defaultPage = userRole === 'researcher' ? 'fitbits' : 'participants';

    setRole(userRole);
    setPage(defaultPage);
    setLoggedIn(true);
    setCurrentUser(userEmail);

    localStorage.setItem('senda_logged_in', 'true');
    localStorage.setItem('senda_role', userRole);
    localStorage.setItem('senda_user_email', userEmail);
    localStorage.setItem('senda_current_page', defaultPage);
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setPage('front');
    setRole(null);
    setCurrentUser('');
    setActiveAlertsCount(0);

    localStorage.removeItem('senda_logged_in');
    localStorage.removeItem('senda_role');
    localStorage.removeItem('senda_user_email');
    localStorage.setItem('senda_current_page', 'front');
  };

  const localeLang = currentI18n.language === 'en' ? 'en-US' : 'es-ES';
  const currentDate = new Date().toLocaleDateString(localeLang, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const getInitials = (email: string) => {
    return email ? email.substring(0, 2).toUpperCase() : 'SE';
  };

  const getMenuItems = (userRole: 'researcher' | 'admin' | null) => {
    const icons = {
      participants: (
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      fitbit: (
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      assignments: (
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
      physiological: (
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
      alerts: (
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
      exports: (
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      ),
      syncs: (
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
      admin: (
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    };

    if (userRole === 'researcher') {
      return [
        { key: 'participants', label: t('Participants'), icon: icons.participants },
        { key: 'fitbits', label: t('Fitbit'), icon: icons.fitbit },
        { key: 'assignments', label: t('Assignments'), icon: icons.assignments },
        { key: 'physiological', label: t('Physiological Data'), icon: icons.physiological },
        { key: 'alerts', label: t('Alerts'), icon: icons.alerts },
        { key: 'exports', label: t('Exports'), icon: icons.exports },
        { key: 'syncs', label: t('Syncs'), icon: icons.syncs },
      ];
    } else {
      return [
        { key: 'participants', label: t('Participants'), icon: icons.participants },
        { key: 'fitbits', label: t('Fitbit'), icon: icons.fitbit },
        { key: 'assignments', label: t('Assignments'), icon: icons.assignments },
        { key: 'physiological', label: t('Physiological Data'), icon: icons.physiological },
        { key: 'alerts', label: t('Alerts'), icon: icons.alerts },
        { key: 'exports', label: t('Exports'), icon: icons.exports },
        { key: 'syncs', label: t('Syncs'), icon: icons.syncs },
        { key: 'admin', label: t('Roles & Permissions'), icon: icons.admin },
      ];
    }
  };

  const menuItems = getMenuItems(role);

  return (
    <div className="min-h-screen bg-senda-light dark:bg-senda-dark text-senda-main dark:text-senda-darktext transition-colors duration-500">
      {!loggedIn ? (
        page === 'login' ? (
          <Login
            onLogin={handleLogin}
            onBackToFront={() => {
              setPage('front');
              localStorage.setItem('senda_current_page', 'front');
            }}
          />
        ) : (
          <FrontPage
            onGoToLogin={() => {
              setPage('login');
              localStorage.setItem('senda_current_page', 'login');
            }}
          />
        )
      ) : (
        <div className="flex min-h-screen w-full flex-col lg:flex-row">

          {/* OVERLAY OSCURO CUANDO EL MENÚ MÓVIL ESTÁ ABIERTO */}
          {mobileMenuOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}

          {/* BARRA LATERAL (drawer en móvil, fija en escritorio) */}
          <aside
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`shrink-0 border-r border-emerald-900/10 dark:border-emerald-900/30 bg-gradient-to-b from-[#F2F6F3] via-[#EBF2EE] to-[#E1EAE3] dark:from-[#111F17] dark:via-[#14231A] dark:to-[#0B1410] py-6 flex flex-col justify-between transition-all duration-300 ease-in-out z-50 shadow-[inset_1px_0_0_rgba(255,255,255,0.8),2px_0_8px_rgba(0,0,0,0.02)] lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:z-20
              fixed top-0 left-0 h-screen w-72 px-6 transform transition-transform duration-300 lg:transform-none
              ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
              ${isHovered ? 'lg:w-72 lg:px-6' : 'lg:w-20 lg:px-4'}
              dark:shadow-[inset_1px_0_0_rgba(255,255,255,0.03),2px_0_8px_rgba(0,0,0,0.2)]`}
          >
            {/* Botón cerrar - Solo en móvil */}
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-senda-input border border-senda-border dark:border-senda-darkborder text-senda-main dark:text-senda-darktext shadow-sm cursor-pointer"
              aria-label="Cerrar menú"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div>
              {/* Logo SENDA */}
              <div className="flex items-center gap-3 mb-6 overflow-hidden whitespace-nowrap">
                <img
                  src={darkMode ? '/images/senda-dark-sin.png' : '/images/senda-claro-sin.png'}
                  alt="SENDA Logo"
                  className="h-[50px] w-auto shrink-0 object-contain object-left"
                />
              </div>

              <div className={`overflow-hidden transition-all duration-300 mb-3 ${isHovered || mobileMenuOpen ? 'opacity-100' : 'lg:opacity-0 lg:h-0'}`}>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#315441] dark:text-[#C6CCC4]">
                  {role === 'admin' ? 'ADMINISTRACIÓN' : 'INVESTIGACIÓN'}
                </p>
              </div>

              {/* Menú de navegación dinámico */}
              <nav className="space-y-1.5">
                {menuItems.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => {
                      handleSetPage(item.key);
                      setMobileMenuOpen(false);
                    }}
                    title={!isHovered ? item.label : undefined}
                    className={`relative flex w-full items-center rounded-2xl py-3 text-left text-xs font-bold transition cursor-pointer ${isHovered || mobileMenuOpen ? 'px-4 justify-between' : 'lg:px-3 lg:justify-center px-4 justify-between'
                      } ${page === item.key
                        ? 'bg-[#DCEBE1] dark:bg-senda-darkborder text-senda-primary dark:text-senda-accent shadow-sm border border-[#8DC29A]/40 dark:border-[#3E8563]'
                        : 'text-[#6B6F66] dark:text-[#9AA093] hover:bg-senda-light dark:hover:bg-senda-input hover:text-senda-main dark:hover:text-senda-darktext'
                      }`}
                  >
                    <div className="flex items-center gap-3 relative">
                      <span className={`${page === item.key ? 'text-senda-primary dark:text-senda-accent' : 'text-[#6B6F66] dark:text-[#9AA093]'}`}>
                        {item.icon}
                      </span>
                      <span className={`whitespace-nowrap transition-opacity duration-200 ${isHovered || mobileMenuOpen ? 'opacity-100' : 'lg:opacity-0 lg:w-0 lg:overflow-hidden'}`}>
                        {item.label}
                      </span>

                      {/* BADGE FLOTANTE CUANDO EL MENÚ ESTÁ CONTRAÍDO */}
                      {item.key === 'alerts' && activeAlertsCount > 0 && !isHovered && !mobileMenuOpen && (
                        <span className="absolute -top-1.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-extrabold text-white shadow-sm">
                          {activeAlertsCount}
                        </span>
                      )}
                    </div>

                    {/* BADGE EN LÍNEA CUANDO EL MENÚ ESTÁ EXTENDIDO POR HOVER */}
                    {item.key === 'alerts' && activeAlertsCount > 0 && (isHovered || mobileMenuOpen) && (
                      <span className="inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-rose-500 text-white shrink-0 shadow-sm">
                        {activeAlertsCount}
                      </span>
                    )}

                    {page === item.key && activeAlertsCount === 0 && (
                      <span className={`h-1.5 w-1.5 rounded-full bg-senda-primary dark:bg-senda-accent shrink-0 ${isHovered || mobileMenuOpen ? 'block' : 'lg:hidden'}`}></span>
                    )}
                  </button>
                ))}
              </nav>
            </div>

            {/* ZONA INFERIOR: IDIOMA + MODO CLARO/OSCURO */}
            <div>
              <div className={`flex items-center transition-all duration-300 ${isHovered || mobileMenuOpen ? 'justify-between px-2' : 'lg:justify-center justify-between px-2'}`}>

                {/* SI ESTÁ EXTENDIDO: SELECTOR COMPLETO CON FONDO SÓLIDO Y CONTRASTE */}
                <div className={`flex items-center justify-between gap-3 overflow-hidden whitespace-nowrap rounded-full border border-senda-border dark:border-senda-darkborder bg-senda-light dark:bg-senda-input p-1.5 shadow-md transition-all duration-300 ${isHovered || mobileMenuOpen ? 'opacity-100 w-full px-3 py-2' : 'lg:opacity-0 lg:w-0 lg:overflow-hidden'}`}>

                  {/* SELECTOR DE IDIOMA */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => currentI18n.changeLanguage('es')}
                      className={`flex h-7 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs transition-all cursor-pointer ${currentI18n.language === 'es'
                        ? 'bg-white dark:bg-senda-darkborder text-senda-main dark:text-white shadow-sm font-bold border border-[#8DC29A] dark:border-[#3E8563]'
                        : 'text-[#6B6F66] dark:text-[#9AA093] font-medium hover:text-senda-main'
                        }`}
                    >
                      <img src="https://flagcdn.com/w40/es.png" alt="ES" className="h-4 w-4 rounded-full object-cover shadow-sm" />
                      <span>ES</span>
                    </button>
                    <button
                      onClick={() => currentI18n.changeLanguage('en')}
                      className={`flex h-7 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs transition-all cursor-pointer ${currentI18n.language === 'en'
                        ? 'bg-white dark:bg-senda-darkborder text-senda-main dark:text-white shadow-sm font-bold border border-[#8DC29A] dark:border-[#3E8563]'
                        : 'text-[#6B6F66] dark:text-[#9AA093] font-medium hover:text-senda-main'
                        }`}
                    >
                      <img src="https://flagcdn.com/w40/gb.png" alt="EN" className="h-4 w-4 rounded-full object-cover shadow-sm" />
                      <span>EN</span>
                    </button>
                  </div>

                  <span className="h-5 w-[1px] bg-senda-border dark:border-senda-darkborder" />

                  {/* SWITCH MODO CON ICONO DE LUNA / SOL */}
                  <div className="flex items-center gap-2">
                    <span className="text-[#6B6F66] dark:text-[#9AA093]">
                      {darkMode ? (
                        <svg className="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                      ) : (
                        <svg className="h-4 w-4 text-[#6B6F66]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                      )}
                    </span>

                    <button
                      onClick={() => setDarkMode(!darkMode)}
                      title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-senda-border dark:bg-senda-accent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner"
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${darkMode ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>

                {/* SI ESTÁ CONTRAÍDO (solo escritorio): BOTÓN RÁPIDO DE TEMA */}
                <div className={`hidden lg:flex items-center justify-center w-full ${isHovered ? 'lg:hidden' : 'lg:opacity-100'}`}>
                  <button
                    onClick={() => setDarkMode(!darkMode)}
                    title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                    className="p-2.5 rounded-2xl bg-senda-light dark:bg-senda-input border border-senda-border dark:border-senda-darkborder text-[#6B6F66] dark:text-[#9AA093] hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer shadow-sm"
                  >
                    {darkMode ? (
                      <svg className="h-5 w-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                    ) : (
                      <svg className="h-5 w-5 text-[#6B6F66]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    )}
                  </button>
                </div>

              </div>
            </div>
          </aside>

          {/* CONTENEDOR DERECHO CON SCROLL NATURAL DE PÁGINA */}
          <div className="flex flex-1 flex-col min-w-0 min-h-screen">

            {/* BARRA SUPERIOR STICKY */}
            <header className="h-[65px] border-b border-emerald-900/10 dark:border-emerald-900/30 bg-gradient-to-r from-[#F2F6F3] via-[#EBF2EE] to-[#E2EBE5] dark:from-[#111F17] dark:via-[#15251C] dark:to-[#0D1811] px-3 sm:px-8 flex items-center justify-between gap-2 sm:gap-4 shrink-0 sticky top-0 z-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_3px_rgba(0,0,0,0.02)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_1px_3px_rgba(0,0,0,0.2)]">

              {/* Botón hamburguesa - Solo en móvil */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-senda-input border border-senda-border dark:border-senda-darkborder text-senda-main dark:text-senda-darktext shadow-sm cursor-pointer"
                aria-label="Abrir menú"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Controles derecha */}
              <div className="flex items-center gap-2 sm:gap-6 min-w-0 ml-auto">

                {/* STAT CARD: Fecha */}
                <div className="flex senda-stat-card shrink-0">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-[#DCEBE1] dark:bg-senda-darkborder text-senda-primary dark:text-senda-accent">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="leading-tight">
                    <p className="text-xs text-[#6B6F66] dark:text-[#9AA093] font-medium capitalize">{currentDate}</p>
                  </div>
                </div>

                {/* Bloque admin + logout */}
                <div className="flex items-center gap-2 sm:gap-3 sm:pl-6 sm:border-l border-senda-border dark:border-senda-darkborder min-w-0">

                  {/* Avatar */}
                  <div className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold shadow-sm bg-gradient-to-b from-[#4C7C63] to-[#1F3B2C] hover:from-[#537F69] hover:to-[#234030] text-white dark:from-white dark:via-[#F4F4F0] dark:to-[#E6E6DF] dark:text-senda-main transition">
                    {getInitials(currentUser)}
                  </div>

                  {/* Nombre + rol - Solo visible en en las demás pantallas */}
                  <div className="hidden md:block text-left min-w-0">
                    <p className="text-xs font-bold text-senda-main dark:text-senda-darktext truncate max-w-[160px]">{currentUser}</p>
                    <p className="text-[10px] text-[#6B6F66] dark:text-[#9AA093] font-bold uppercase tracking-wide">
                      {role === 'admin' ? 'Administrador' : 'Investigador'}
                    </p>
                  </div>

                  {/* Botón logout - Solo icono en móvil, con texto en las demás pantallas */}
                  <button
                    onClick={handleLogout}
                    className="ml-1 sm:ml-4 flex items-center gap-1.5 text-xs font-bold text-[#6B6F66] dark:text-[#9AA093] hover:text-red-600 dark:hover:text-red-400 transition cursor-pointer shrink-0"
                    title={t('Logout')}
                  >
                    <svg className="h-5 w-5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span className="hidden md:inline">{t('Logout')}</span>
                  </button>
                </div>
              </div>
            </header>

            {/* ÁREA DE CONTENIDO */}
            <main className="flex-1 bg-senda-light dark:bg-senda-dark px-4 sm:px-8 py-4 sm:py-8">
              {page === 'participants' && <Participants />}
              {page === 'fitbits' && <Fitbits />}
              {page === 'assignments' && <Assignments />}
              {page === 'syncs' && <Syncs />}
              {page === 'physiological' && <PhysiologicalData />}
              {page === 'alerts' && <Alerts onActiveCountChange={setActiveAlertsCount} />}
              {page === 'exports' && <Exports userEmail={currentUser} onNavigate={handleSetPage} />}
              {page === 'admin' && <Admin />}
            </main>
          </div>

        </div>
      )}
    </div>
  );
};

export default App;