import React, { useEffect, useState, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Brain3D } from '../components/Brain3D';

type FrontPageProps = {
  onGoToLogin: () => void;
};

const FrontPage: React.FC<FrontPageProps> = ({ onGoToLogin }) => {
  const { t, i18n } = useTranslation();

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('senda_dark_mode') === 'true';
    }
    return false;
  });

  const [isCtaVisible, setIsCtaVisible] = useState(false);
  const [visibleSections, setVisibleSections] = useState<{ [key: string]: boolean }>({});

  const ctaRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

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
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.getAttribute('data-animate-id');
          if (id) {
            setVisibleSections((prev) => ({ ...prev, [id]: true }));
          }
          if (entry.target === ctaRef.current) {
            setIsCtaVisible(true);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -50px 0px' }
    );

    Object.values(sectionRefs.current).forEach((element) => {
      if (element) observer.observe(element);
    });

    if (ctaRef.current) observer.observe(ctaRef.current);

    return () => observer.disconnect();
  }, []);

  const setSectionRef = (id: string) => (element: HTMLDivElement | null) => {
    sectionRefs.current[id] = element;
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const navLinks = [
    { id: 'about', label: t('About SENDA') },
    { id: 'platform', label: t('Platform') },
    { id: 'research', label: t('Research') },
  ];

  const pillars = [
    {
      title: t('Pillar1 Title'),
      text: t('Pillar1 Text'),
      icon: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
    },
    {
      title: t('Pillar2 Title'),
      text: t('Pillar2 Text'),
      icon: 'M12 4a4 4 0 100 8 4 4 0 000-8zM4 20a4 4 0 100-8 4 4 0 000 8zM20 20a4 4 0 100-8 4 4 0 000 8zM12 12l-4 4M12 12l4 4',
    },
    {
      title: t('Pillar3 Title'),
      text: t('Pillar3 Text'),
      icon: 'M12 4c-4.42 0-8 1.79-8 4v8c0 2.21 3.58 4 8 4s8-1.79 8-4V8c0-2.21-3.58-4-8-4zM4 8c0 2.21 3.58 4 8 4s8-1.79 8-4M4 12c0 2.21 3.58 4 8 4s8-1.79 8-4',
    },
  ];

  const features = [
    { number: '01', title: t('Feature1 Title'), text: t('Feature1 Text') },
    { number: '02', title: t('Feature2 Title'), text: t('Feature2 Text') },
    { number: '03', title: t('Feature3 Title'), text: t('Feature3 Text') },
    { number: '04', title: t('Feature4 Title'), text: t('Feature4 Text') },
    { number: '05', title: t('Feature5 Title'), text: t('Feature5 Text') },
    { number: '06', title: t('Feature6 Title'), text: t('Feature6 Text') },
  ];

  const dataFlowSteps = [
    { title: t('Step1 Title'), subtitle: t('Step1 Subtitle'), iconPath: 'M7 3h10v18H7zM10 7h4M10 17h4' },
    { title: t('Step2 Title'), subtitle: t('Step2 Subtitle'), isLogo: true },
    { title: t('Step3 Title'), subtitle: t('Step3 Subtitle'), iconPath: 'M4 18V6m5 12V9m5 9V4m5 14v-7' },
  ];

  const checklistItems = [t('Checklist1'), t('Checklist2'), t('Checklist3')];

  const metrics = [t('Metric HRV'), t('Metric Sleep'), t('Metric HeartRate'), t('Metric Activity'), t('Metric Night')];

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#F7FAF7] font-sans text-[#18352A] transition-colors duration-500 dark:bg-[#0A130F] dark:text-[#E8F0EA]">

      {/* NAVBAR */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-[#DCE7DF]/80 bg-[#F7FAF7]/80 backdrop-blur-2xl dark:border-[#263A2F] dark:bg-[#0A130F]/80">
        <div className="mx-auto flex h-[72px] max-w-[1380px] items-center justify-between px-6 sm:px-10 lg:px-14">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="cursor-pointer">
            <img
              src={darkMode ? '/images/senda-dark-sin.png' : '/images/senda-claro-sin.png'}
              alt="SENDA"
              className="-ml-1 mt-3 h-[54px] w-auto object-contain sm:h-[78px]"
            />
          </button>

          <div className="hidden items-center gap-9 lg:flex">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => scrollToSection(link.id)}
                className="cursor-pointer text-sm font-medium text-[#607269] transition-colors hover:text-[#216345] dark:text-[#A8B9AD] dark:hover:text-[#72C99B]"
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Selector de idioma */}
            <div className="flex items-center rounded-full border border-[#D9E5DB] bg-white/70 p-1 dark:border-[#30453A] dark:bg-[#14221A]/80">
              <button
                onClick={() => i18n.changeLanguage('es')}
                className={`flex cursor-pointer items-center gap-1 rounded-full px-2 py-1.5 text-[10px] font-semibold transition-all sm:gap-1.5 sm:px-3 sm:text-[11px] ${i18n.language === 'es'
                  ? 'bg-[#DCEBE1] text-[#1D5A3D] dark:bg-[#284738] dark:text-[#A9E1C0]'
                  : 'text-[#75847A] dark:text-[#91A298]'
                  }`}
              >
                <img src="https://flagcdn.com/w40/es.png" alt={t('Lang ES Alt')} className="h-3.5 w-3.5 rounded-full object-cover sm:h-4 sm:w-4" />
                ES
              </button>
              <button
                onClick={() => i18n.changeLanguage('en')}
                className={`flex cursor-pointer items-center gap-1 rounded-full px-2 py-1.5 text-[10px] font-semibold transition-all sm:gap-1.5 sm:px-3 sm:text-[11px] ${i18n.language === 'en'
                  ? 'bg-[#DCEBE1] text-[#1D5A3D] dark:bg-[#284738] dark:text-[#A9E1C0]'
                  : 'text-[#75847A] dark:text-[#91A298]'
                  }`}
              >
                <img src="https://flagcdn.com/w40/gb.png" alt={t('Lang EN Alt')} className="h-3.5 w-3.5 rounded-full object-cover sm:h-4 sm:w-4" />
                EN
              </button>
            </div>

            {/* Botón modo claro/oscuro */}
            <button
              onClick={() => setDarkMode((value) => !value)}
              title={darkMode ? t('Toggle Light Mode') : t('Toggle Dark Mode')}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#D9E5DB] bg-white/70 text-[#527062] transition-all hover:scale-105 dark:border-[#30453A] dark:bg-[#14221A] dark:text-[#A9D7B9] sm:h-10 sm:w-10"
            >
              {darkMode ? (
                <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l-1.41 1.41M18.66 5.34l-1.41 1.41" />
                </svg>
              )}
            </button>

            {/* Botón "Sign in" */}
            <button
              onClick={onGoToLogin}
              className="flex h-9 cursor-pointer items-center rounded-full bg-[#1D5A3D] px-3 text-xs font-semibold text-white shadow-[0_8px_25px_rgba(29,90,61,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#174A32] dark:bg-[#72C99B] dark:text-[#102018] dark:hover:bg-[#8BD7AC] sm:h-10 sm:px-5 sm:text-sm"
            >
              {t('Login')}
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden pt-[76px]">
        {/* IMAGEN DE FONDO Y DEGRADADO SUPERPUESTO */}
        <div className="absolute inset-0 z-0">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-90 dark:opacity-30 transition-opacity duration-200"
            style={{ backgroundImage: "url('/images/fondo-front.png')" }}
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-[#1D5A3D]/15 via-[#72C99B]/8 to-transparent dark:from-[#07100B]/10 dark:via-[#163A29]/10 dark:to-transparent" />
        </div>

        <div className="relative mx-auto grid min-h-[690px] max-w-[1380px] grid-cols-1 items-center gap-6 px-6 py-16 sm:px-10 lg:grid-cols-12 lg:px-14 lg:py-20">

          <div className="relative z-10 lg:col-span-7">
            <div className="mb-7 flex w-fit items-center gap-2 rounded-full border border-[#BBD5C2] bg-[#E4F0E7]/80 px-4 py-2 dark:border-[#365B48] dark:bg-[#172B21]/80 -mt-28">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#4FA477]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#397353] dark:text-[#8BD4A9]">
                {t('FrontCardTitle')}
              </span>
            </div>

            <h1
              className="max-w-[690px] text-[22px] font-semibold leading-[1.08] tracking-[-0.035em] text-[#18352A] dark:text-[#EAF3ED] sm:text-[32px] lg:text-[40px]"
              style={{ fontFamily: 'Fraunces, serif' }}
            >
              {t('Hero Title Line1')}
              <span className="mt-2 block text-[#397D59] dark:text-[#78C99A]">
                {t('Hero Title Line2')}
              </span>
            </h1>

            <p className="mt-7 max-w-[600px] text-[16px] leading-[1.8] text-[#617168] dark:text-[#A9B9AE] sm:text-[17px]">
              <Trans
                i18nKey="Subtitle"
                components={{
                  neuro: <a href="https://grupo.us.es/neurobi/" target="_blank" rel="noopener noreferrer" className="underline hover:text-senda-primary font-semibold transition-colors" />,
                  indrho: <a href="https://grupo.us.es/grupoindrho/" target="_blank" rel="noopener noreferrer" className="underline hover:text-senda-primary font-semibold transition-colors" />
                }}
              />
            </p>
            <p className="mt-7 max-w-[600px] text-[12px] leading-[1.8] text-[#617168] dark:text-[#A9B9AE] sm:text-[13px]">
              <Trans
                i18nKey="Subtitle2"
                components={{
                  centra: <a href="https://www.centrodeestudiosandaluces.es/cea-proyectos/2132" target="_blank" rel="noopener noreferrer" className="underline hover:text-senda-primary font-semibold transition-colors" />,
                }}
              />
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <button
                onClick={onGoToLogin}
                className="group flex h-[52px] cursor-pointer items-center gap-3 rounded-full bg-[#1D5A3D] px-7 text-[14px] font-semibold text-white shadow-[0_14px_35px_rgba(29,90,61,0.2)] transition-all duration-300 hover:-translate-y-1 hover:bg-[#174A32] dark:bg-[#72C99B] dark:text-[#102018] dark:hover:bg-[#8BD7AC]"
              >
                {t('Login')}
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </button>

              <button
                onClick={() => scrollToSection('about')}
                className="flex h-[52px] cursor-pointer items-center gap-2 rounded-full border border-[#C9D8CC] bg-white/60 px-7 text-[14px] font-semibold text-[#3E5E4D] transition-all hover:bg-white dark:border-[#344B3E] dark:bg-[#132019]/60 dark:text-[#B6C9BC] dark:hover:bg-[#1B2D23]"
              >
                {t('Discover SENDA')}
                <span>↓</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section
        id="about"
        data-animate-id="about"
        ref={setSectionRef('about')}
        className={`scroll-mt-24 border-t border-[#E0E9E2] bg-white transition-all duration-1000 dark:border-[#22352A] dark:bg-[#101B15] ${visibleSections.about ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
          }`}
      >
        <div className="mx-auto max-w-[1180px] px-6 py-24 sm:px-10 lg:px-14 lg:py-28">
          <div className="space-y-10">
            <div className="max-w-[970px]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4A8A65] dark:text-[#7DC89A]">
                {t('About SENDA')}
              </span>
              <h2
                className="mt-4 text-[38px] font-semibold leading-[1.08] tracking-[-0.025em] text-[#18352A] dark:text-[#E7F0EA] sm:text-[45px]"
                style={{ fontFamily: 'Fraunces, serif' }}
              >
                {t('About Heading')}
              </h2>
              <p className="mt-6 text-[16px] leading-[1.8] text-[#607066] dark:text-[#A9B9AE]">
                {t('About SENDA text')}
              </p>
              <p className="mt-4 text-[15px] leading-[1.8] text-[#748078] dark:text-[#91A298]">
                {t('About SENDA text 2')}
              </p>
            </div>

            <div className="relative w-full overflow-hidden rounded-[24px] md:rounded-[32px] border border-[#DCE7DF] bg-[#0B2116] shadow-[0_20px_45px_rgba(29,90,61,0.08)] dark:border-[#263D31]">
              <img
                src="/images/research-lab.jpg"
                alt={t('Research Image Alt')}
                className="mx-auto w-full h-[220px] md:h-auto md:max-h-[500px] object-cover transition-transform duration-700 hover:scale-[1.01]"
              />
              <div className="absolute bottom-3 right-3 md:bottom-4 md:right-7 rounded-xl md:rounded-2xl border border-white/15 bg-[#0B2116]/80 px-3 py-2 md:px-5 md:py-3 backdrop-blur-md">
                <p className="text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A9D9BA]">
                  {t('Research')}
                </p>
                <p className="mt-0.5 md:mt-1 text-xs md:text-sm font-medium text-white">
                  {t('Pre Wearable Phase')}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-24 grid border-t border-[#E0E9E2] md:grid-cols-3 dark:border-[#293C30]">
            {pillars.map((pillar, idx) => (
              <div
                key={pillar.title}
                className={`py-10 transition-transform duration-500 hover:-translate-y-2 ${idx === 0
                  ? 'border-b border-[#E0E9E2] md:border-b-0 md:pr-10 md:border-r dark:border-[#293C30]'
                  : idx === 1
                    ? 'border-b border-[#E0E9E2] md:border-b-0 md:px-10 md:border-r dark:border-[#293C30]'
                    : 'md:pl-10'
                  }`}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E5F0E8] text-[#397653] dark:bg-[#1B3828] dark:text-[#8BD3A7]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                    <path strokeLinecap="round" strokeLinejoin="round" d={pillar.icon} />
                  </svg>
                </div>
                <h3 className="mt-6 text-[23px] font-semibold text-[#234334] dark:text-[#DCE9E0]" style={{ fontFamily: 'Fraunces, serif' }}>
                  {pillar.title}
                </h3>
                <p className="mt-3 text-[14px] leading-7 text-[#708077] dark:text-[#94A59B]">{pillar.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WEARABLE / DATA */}
      <section className="relative overflow-hidden bg-[#F2F7F3] py-24 dark:bg-[#0C1511] lg:py-28">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 lg:px-14">
          <div className="grid items-center gap-14 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4A8A65] dark:text-[#7DC89A]">
                {t('Data Overline')}
              </span>
              <h2
                className="mt-4 text-[39px] font-semibold leading-[1.07] tracking-[-0.03em] text-[#18352A] dark:text-[#E7F0EA] sm:text-[50px]"
                style={{ fontFamily: 'Fraunces, serif' }}
              >
                {t('Data Heading')}
              </h2>
              <p className="mt-6 text-[16px] leading-7 text-[#6A786F] dark:text-[#99A99F]">
                {t('Data Text')}
              </p>
              <div className="mt-9 grid grid-cols-2 gap-3">
                {metrics.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-xl border border-[#D9E5DC] bg-white/70 px-3 py-3 text-xs font-medium text-[#557063] dark:border-[#2B4033] dark:bg-[#142019] dark:text-[#A3B4AA]"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#63A77E]" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative lg:col-span-7">
              <div className="relative overflow-hidden rounded-[28px] border border-[#D5E3D9] p-2 shadow-[0_30px_70px_rgba(29,90,61,0.10)] dark:border-[#294033] dark:bg-[#142019]">
                <div className="relative overflow-hidden rounded-[20px]">
                  <img
                    src="/images/wearable.jpg"
                    alt={t('Wearable Image Alt')}
                    className="h-[290px] w-full object-cover transition-transform duration-700 hover:scale-[1.025]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-tr from-[#092015]/60 via-transparent to-transparent" />
                  <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A8D9B9]">Fitbit</p>
                      <p className="mt-1 text-lg font-semibold uppercase tracking-[0.22em] text-white">{t('Wearable Official')}</p>
                    </div>
                    <div className="rounded-full border border-white/20 bg-black/25 px-3 py-1.5 text-[10px] font-semibold text-white backdrop-blur-md">
                      Google Health API
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PLATFORM */}
      <section
        id="platform"
        data-animate-id="platform"
        ref={setSectionRef('platform')}
        className={`scroll-mt-24 bg-white py-24 transition-all duration-1000 dark:bg-[#101B15] lg:py-28 ${visibleSections.platform ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
          }`}
      >
        <div className="mx-auto max-w-[1280px] px-6 sm:px-10 lg:px-14">
          <div className="max-w-[980px]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4A8A65] dark:text-[#7DC89A]">
              {t('Platform')}
            </span>
            <h2
              className="mt-4 text-[40px] font-semibold leading-[1.06] tracking-[-0.03em] text-[#18352A] dark:text-[#E7F0EA] sm:text-[45px]"
              style={{ fontFamily: 'Fraunces, serif' }}
            >
              {t('Platform Heading Pre')}<span className="text-[#4B8A65] dark:text-[#79C89A]">{t('Platform Heading Highlight')}</span>
            </h2>
            <p className="mt-6 text-[16px] leading-7 text-[#6A786F] dark:text-[#99A99F]">
              {t('Platform Text')}
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <div
                key={feature.number}
                className="group rounded-[22px] border border-[#8C8050] bg-[#22362B] p-6 transition-all duration-100 hover:-translate-y-1 hover:border-[#c7b570] shadow-[0_25px_60px_rgba(29,90,61,0.07)] dark:border-[#2A3E31] dark:bg-[#142019]"
                style={{ transitionDelay: `${index * 70}ms` }}
              >
                <span className="text-[10px] font-semibold tracking-[0.15em] text-[#69997C] dark:text-[#95BDA3]">
                  {feature.number}
                </span>
                <h3 className="mt-6 text-[21px] font-semibold text-[#DDEAE1] dark:text-[#5A9973]" style={{ fontFamily: 'Fraunces, serif' }}>
                  {feature.title}
                </h3>
                <p className="mt-2 text-[13px] leading-6 text-[#96A69C] dark:text-[#A3B4AA]">{feature.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RESEARCH FLOW */}
      <section id="research" className="scroll-mt-24 bg-[#F2F7F3] py-24 dark:bg-[#0C1511] lg:py-28">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 lg:px-14">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4A8A65] dark:text-[#7DC89A]">
                {t('Research Overline')}
              </span>
              <h2
                className="mt-4 text-[40px] font-semibold leading-[1.08] tracking-[-0.03em] text-[#18352A] dark:text-[#E7F0EA] sm:text-[40px]"
                style={{ fontFamily: 'Fraunces, serif' }}
              >
                {t('Research Heading Line1')}
                <span className="block text-[#4B8A65] dark:text-[#79C89A]"> {t('Research Heading Line2')}</span>
              </h2>
              <p className="mt-6 max-w-[520px] text-[16px] leading-7 text-[#6D7B72] dark:text-[#9BAAA0]">
                {t('Research Text')}
              </p>
            </div>

            <div className="rounded-[30px] border border-[#DCE7DF] bg-white p-8 shadow-[0_25px_60px_rgba(29,90,61,0.07)] dark:border-[#2A3E31] dark:bg-[#142019] sm:p-10">
              {dataFlowSteps.map((step, index) => (
                <React.Fragment key={step.title}>
                  <div className="group flex items-center gap-5">
                    <div
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-105 ${step.isLogo
                        ? 'bg-[#1D5A3D] text-white shadow-lg dark:bg-[#72C99B] dark:text-[#102018]'
                        : 'bg-[#E2EFE6] text-[#3D7D59] dark:bg-[#1D3829] dark:text-[#8CD2A6]'
                        }`}
                    >
                      {step.isLogo ? (
                        <span className="text-lg font-bold" style={{ fontFamily: 'Fraunces, serif' }}>
                          S
                        </span>
                      ) : (
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                          <path strokeLinecap="round" strokeLinejoin="round" d={step.iconPath} />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#264837] dark:text-[#DDEBE1]">{step.title}</p>
                      <p className="mt-1 text-xs text-[#77857D] dark:text-[#93A49A]">{step.subtitle}</p>
                    </div>
                  </div>
                  {index < dataFlowSteps.length - 1 && (
                    <div className="ml-7 h-12 border-l border-dashed border-[#BBD2C1] dark:border-[#365342]" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SCIENTIFIC CINEMATIC BANNER */}
      <section className="relative h-[350px] overflow-hidden sm:h-[430px]">
        <img src="/images/brain-data.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[#08170F]/75" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07150D] via-transparent to-[#07150D]/80" />
        <div className="relative z-10 flex h-full items-center justify-center px-6 text-center">
          <div className="max-w-[850px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#7CC79A]">{t('Banner Overline')}</span>
            <h2
              className="mt-4 text-[30px] font-semibold leading-tight text-white sm:text-[44px] lg:text-[52px]"
              style={{ fontFamily: 'Fraunces, serif' }}
            >
              {t('Banner Heading')}
            </h2>
          </div>
        </div>
      </section>

      {/* MONITORING */}
      <section className="bg-white py-24 dark:bg-[#101B15] lg:py-28">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 lg:px-14">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div className="order-2 rounded-[30px] border border-[#DCE7DF] bg-[#F8FBF9] p-6 shadow-[0_25px_60px_rgba(29,90,61,0.07)] dark:border-[#2A3E31] dark:bg-[#142019] lg:order-1">
              <div className="flex items-center justify-between border-b border-[#E5ECE7] pb-5 dark:border-[#2B3E32]">
                <div>
                  <p className="text-sm font-semibold text-[#264837] dark:text-[#DDEBE1]">{t('Monitor Title')}</p>
                  <p className="mt-1 text-xs text-[#849188] dark:text-[#91A299]">{t('Monitor Subtitle')}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#4D8765] dark:text-[#8BCDA5]">
                  <span className="h-2 w-2 rounded-full bg-[#5DB27E]" />
                  {t('Monitor Active')}
                </div>
              </div>

              {/* Sistema de Alertas */}
              <div className="mt-5 rounded-2xl border border-[#E5E9DD] bg-[#FAF9F7] p-5 dark:border-[#394337] dark:bg-[#19221A]">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F1EEDB] font-bold text-[#8C8050] dark:bg-[#3B3825]">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#354438] dark:text-[#EAF3ED]">{t('Monitor Alert Title')}</p>
                      <span className="rounded-full bg-[#F1EEDB] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#847A4E] dark:bg-[#3B3825]">
                        {t('Monitor Alert Badge')}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-[#78847C] dark:text-[#99A69D]">
                      {t('Monitor Alert Text')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-[#DDEAE1] bg-[#F6FAF7] p-5 dark:border-[#294335] dark:bg-[#17261D]">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#DDEEE3] font-bold text-[#43825E] dark:bg-[#234632] dark:text-[#91D1AA]">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#354438] dark:text-[#D8E4DB]">{t('Monitor Oauth Title')}</p>
                    </div>
                    <p className="mt-1 text-xs text-[#78847C] dark:text-[#99A69D]">{t('Monitor Oauth Text')}</p>
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-[#E2E7DE] bg-[#FAFCF9] p-5 dark:border-[#313B33] dark:bg-[#151E19]">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8ECE5] font-bold text-[#5A6E60] dark:bg-[#2C352F] dark:text-[#A4B5AB]">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#354438] dark:text-[#D8E4DB]">{t('Monitor Sync Title')}</p>
                    </div>
                    <p className="mt-1 text-xs text-[#78847C] dark:text-[#99A69D]">{t('Monitor Sync Text')}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4A8A65] dark:text-[#7DC89A]">
                {t('Monitor Overline')}
              </span>
              <h2
                className="mt-4 text-[40px] font-semibold leading-[1.08] tracking-[-0.03em] text-[#18352A] dark:text-[#E7F0EA] sm:text-[50px]"
                style={{ fontFamily: 'Fraunces, serif' }}
              >
                {t('Monitor Heading')}
              </h2>
              <p className="mt-6 text-[16px] leading-7 text-[#6D7B72] dark:text-[#9BAAA0]">
                {t('Monitor Text')}
              </p>
              <div className="mt-8 space-y-4">
                {checklistItems.map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#DDEEE3] text-xs text-[#43825E] dark:bg-[#234632] dark:text-[#91D1AA]">
                      ✓
                    </span>
                    <span className="text-sm text-[#637169] dark:text-[#A0AFA5]">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* INSTITUTIONS */}
      <section className="border-t border-[#E1EAE3] bg-[#F7FAF7] py-24 dark:border-[#26392D] dark:bg-[#0C1511]">
        <div className="mx-auto max-w-[1000px] px-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#738078] dark:text-[#91A097]">
            {t('Institutions Overline')}
          </p>
          <h2
            className="mt-4 text-[34px] font-semibold text-[#203D2E] dark:text-[#E1ECE5] sm:text-[42px]"
            style={{ fontFamily: 'Fraunces, serif' }}
          >
            {t('Institutions Heading')}
          </h2>
          <p className="mx-auto mt-5 max-w-[650px] text-[15px] leading-7 text-[#728078] dark:text-[#9AA9A0]">
            {t('Institutions Text')}
          </p>

          {/* Contenedor para los logos */}
          <div className="mt-16 grid grid-cols-2 gap-y-12 sm:gap-x-6 lg:grid-cols-4 lg:gap-x-0">

            {/* Logo CENTRA */}
            <div className="flex items-center justify-center lg:border-r lg:border-[#DCE5DE] lg:dark:border-[#2C4033] last:lg:border-r-0">
              <a
                href="https://www.centrodeestudiosandaluces.es/cea-proyectos/2132"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-24 w-full items-center justify-center lg:justify-end px-6 lg:pr-8"
              >
                <img
                  src={darkMode ? '/images/centra-dark.png' : '/images/centra-claro.png'}
                  alt={t('CENTRA Logo Alt')}
                  className="max-h-16 w-auto max-w-[160px] object-contain opacity-75 transition-all duration-300 group-hover:scale-105 group-hover:opacity-100 sm:max-h-20 sm:max-w-[180px]"
                />
              </a>
            </div>

            {/* Logo de la facultad */}
            <div className="flex items-center justify-center lg:border-r lg:border-[#DCE5DE] lg:dark:border-[#2C4033] last:lg:border-r-0">
              <a
                href="https://psicologia.us.es/investigacion"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-24 w-full items-center justify-center px-6"
              >
                <img
                  src={darkMode ? '/images/facultad-logo-blanco.png' : '/images/facultad-logo.png'}
                  alt={t('Faculty Logo Alt')}
                  className="max-h-16 w-auto max-w-[160px] object-contain opacity-75 transition-all duration-300 group-hover:scale-105 group-hover:opacity-100 sm:max-h-20 sm:max-w-[180px]"
                />
              </a>
            </div>

            {/* Logo del grupo Neurociencia */}
            <div className="flex items-center justify-center lg:border-r lg:border-[#DCE5DE] lg:dark:border-[#2C4033] last:lg:border-r-0">
              <a
                href="https://grupo.us.es/neurobi"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-24 w-full items-center justify-center px-6"
              >
                <img
                  src={darkMode ? '/images/wellness.jpg' : '/images/wellness.jpg'}
                  alt="Neurociencia del Bienestar"
                  className="max-h-16 w-auto max-w-[160px] object-contain opacity-75 transition-all duration-300 group-hover:scale-105 group-hover:opacity-100 sm:max-h-20 sm:max-w-[180px]"
                />
              </a>
            </div>

            {/* Logo INDHRO */}
            <div className="flex items-center justify-center last:lg:border-r-0">
              <a
                href="https://grupo.us.es/grupoindrho/"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-24 w-full items-center justify-center px-6"
              >
                <img
                  src={darkMode ? '/images/Indhro-negativo.png' : '/images/Indhropositivo.png'}
                  alt="INDHRO"
                  className="max-h-16 w-auto max-w-[160px] object-contain opacity-75 transition-all duration-300 group-hover:scale-105 group-hover:opacity-100 sm:max-h-20 sm:max-w-[180px]"
                />
              </a>
            </div>

          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section ref={ctaRef} className="bg-white px-6 py-10 dark:bg-[#101B15] sm:px-10 lg:px-14">
        <div className="relative mx-auto max-w-[1180px] overflow-hidden rounded-[32px] border border-white/5 bg-[#0B1F16] px-8 py-16 sm:px-16 sm:py-20">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-20 -top-32 h-[420px] w-[420px] rounded-full bg-[#3E7C5E]/30 blur-[120px]" />
            <div className="absolute -bottom-40 -right-10 h-[380px] w-[380px] rounded-full bg-[#1F4E36]/40 blur-[110px]" />
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage: 'radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)',
                backgroundSize: '22px 22px',
              }}
            />
          </div>

          <div className="relative z-10 grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7AB49A]" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A9D9BA]">SENDA</span>
              </div>
              <h2
                className="mt-6 text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-white sm:text-[40px]"
                style={{ fontFamily: 'Fraunces, serif' }}
              >
                {t('CTA Heading')}
              </h2>
              <p className="mt-5 max-w-[550px] text-[15px] leading-7 text-[#B9CFC1]">
                {t('CTA Text')}
              </p>
              <p className="mt-5 max-w-[500px] text-[13px] leading-7 text-[#E3A1A9]">
                {t('CTA Text2')}
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-6">
                <button
                  onClick={onGoToLogin}
                  className="group flex h-[52px] cursor-pointer items-center gap-3 rounded-full bg-white px-7 text-[14px] font-semibold text-[#173726] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-8px_rgba(255,255,255,0.35)]"
                >
                  {t('Login')}
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </button>
                <div className="flex items-center gap-6 text-[13px] text-[#9CBBA9]">
                  <div>
                    <span className="block text-base font-semibold text-white">24/7</span>
                    {t('CTA Sync 24_7')}
                  </div>
                  <div className="h-8 w-px bg-white/10" />
                  <div>
                    <span className="block text-base font-semibold text-white">OAuth</span>
                    {t('CTA Security')}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center lg:col-span-5">
              <div
                className={`relative transition-all duration-1000 ${isCtaVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-12 scale-95 opacity-0'
                  }`}
              >
                <div className="relative rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-sm">
                  <img
                    src="/images/fitbit-blanca.jpg"
                    alt={t('Fitbit Image Alt')}
                    className="mx-auto block max-h-[220px] w-auto rounded-xl object-contain transition-transform duration-500 hover:scale-105"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#DCE6DF] bg-white dark:border-[#273A2E] dark:bg-[#101B15]">
        <div className="mx-auto max-w-[1180px] px-6 py-8 text-[11px] text-[#8A958E] dark:text-[#77877D] sm:px-10 lg:px-14">
          <div className="flex flex-col items-start space-y-1.5">
            <span className=" font-medium text-[#354438] dark:text-[#D8E4DB]">
              {t('FooterProject')}
            </span>
            <span>
              {t('FooterFunding')}
            </span>
            <span>
              {t('FooterVersion')}
            </span>
            <span>
              {t('FooterRights')}
            </span>
            <div className="flex items-center gap-2 pt-0.5">
              <a href="#privacy" className="hover:underline transition-colors">{t('Privacy')}</a>
              <span>·</span>
              <a href="#dataprotection" className="hover:underline transition-colors">{t('DataProtection')}</a>
              <span>·</span>
              <a href="#legal" className="hover:underline transition-colors">{t('LegalNotice')}</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default FrontPage;