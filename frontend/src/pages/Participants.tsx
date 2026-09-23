import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '../components/CustomSelect';
import { Pagination } from '../components/Pagination';
import { SectionHeader } from '../components/SectionHeader';
import { API_URL } from '../config';

type Participant = {
  participant_code: string;
  email?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  access_token_expiration?: string | null;
  authentication_status?: string;
};

const Participants: React.FC = () => {
  const { t } = useTranslation();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [oauthModalVisible, setOauthModalVisible] = useState(false);
  const [oauthModalMessage, setOauthModalMessage] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pageSize, setPageSize] = useState<number>(() => {
    const savedSize = localStorage.getItem('participants_page_size');
    return savedSize ? Number(savedSize) : 10;
  });
  const [currentPage, setCurrentPage] = useState(1);

  const loadParticipants = () => {
    fetch(`${API_URL}/api/participants/`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.items || data.results || [];
        setParticipants(list);
      })
      .catch(() => setError(t('Error loading participants')));
  };

  useEffect(() => {
    loadParticipants();
  }, []);

  useEffect(() => {
    localStorage.setItem('participants_page_size', pageSize.toString());
    setCurrentPage(1);
  }, [pageSize]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get('oauth');
    const participantCode = params.get('participant_code');

    if (oauthStatus === 'success') {
      setOauthModalMessage(
        `${t('Authorization success')} ${participantCode || ''}.`
      );
      setOauthModalVisible(true);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const getEmail = (p: Participant): string => {
    return p.email || t('No email');
  };

  const getAccessToken = (p: Participant): string | null => {
    return p.access_token || null;
  };

  const getRefreshToken = (p: Participant): string | null => {
    return p.refresh_token || null;
  };

  const getExpiration = (p: Participant): string | null => {
    return p.access_token_expiration || null;
  };

  const truncateToken = (token: string | null, startLen = 6, endLen = 4): string => {
    if (!token) return '';
    if (token.length <= startLen + endLen) return token;
    return `${token.substring(0, startLen)}...${token.substring(token.length - endLen)}`;
  };

  const handleCreateParticipant = async () => {
    setSubmitError(null);
    setSubmitSuccess(null);
    if (!newEmail.trim()) {
      setSubmitError(t('Valid email error'));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/participants/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: newEmail.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        setSubmitError(data.error || t('Create participant error'));
      } else {
        setSubmitSuccess(`${t('Participant created')} ${data.participant_code}.`);
        setNewEmail('');
        setShowModal(false);
        loadParticipants();
        window.location.href = `${API_URL}/auth/login/`;
      }
    } catch (err) {
      setSubmitError(t('Server connection error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = participants.filter((person) => {
    const emailStr = getEmail(person);
    return (
      person.participant_code.toLowerCase().includes(query.toLowerCase()) ||
      emailStr.toLowerCase().includes(query.toLowerCase())
    );
  });

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginatedParticipants = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const pageSizeOptions = [
    { label: 5, value: 5 },
    { label: 10, value: 10 },
    { label: 15, value: 15 },
    { label: 20, value: 20 },
    { label: 25, value: 25 },
  ];

  const avatarColors = [
    { bg: 'bg-[#DCEBE1] dark:bg-senda-darkborder text-senda-primary dark:text-senda-accent', border: 'border-[#8DC29A]/40 dark:border-[#3E8563]' },
    { bg: 'bg-[#DCEBE1] dark:bg-senda-darkborder text-senda-primary dark:text-senda-accent', border: 'border-[#8DC29A]/40 dark:border-[#3E8563]' },
    { bg: 'bg-[#DCEBE1] dark:bg-senda-darkborder text-senda-primary dark:text-senda-accent', border: 'border-[#8DC29A]/40 dark:border-[#3E8563]' },
  ];

  return (
    <div className="w-full text-senda-main dark:text-senda-darktext relative space-y-8">
      <SectionHeader
        title={t('Participants Title')}
        subtitle={`${filtered.length} ${t('Enrolled People')}`}
        actionLabel={t('Register Participant')}
        onAction={() => setShowModal(true)}
      />

      {showModal && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-[400px] overflow-hidden rounded-[28px] bg-senda-light dark:bg-senda-card p-7 shadow-[0_30px_60px_rgba(29,90,61,0.18)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
            <div className="relative">
              <button
                onClick={() => {
                  setShowModal(false);
                  setSubmitError(null);
                  setSubmitSuccess(null);
                }}
                aria-label={t('Close')}
                className="absolute right-0 top-0 flex h-6.5 w-6.5 cursor-pointer items-center justify-center rounded-full border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input text-[#708077] dark:text-[#9AA093] hover:text-senda-main dark:hover:text-white transition"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Icono con punto de estado */}
              <div className="mb-4 flex justify-center">
                <div className="relative flex h-[58px] w-[58px] items-center justify-center rounded-2xl bg-[#DCEBE1] dark:bg-senda-darkborder shadow-[0_10px_24px_rgba(29,90,61,0.14)]">
                  <svg className="h-7 w-7 text-senda-primary dark:text-senda-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h8m9-6v6m3-3h-6" />
                  </svg>
                  <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-[3px] border-senda-light dark:border-senda-card bg-[#4FA477]" />
                </div>
              </div>

              <h2
                className="mt-1.5 mb-1 text-center text-[20px] font-semibold text-senda-main dark:text-white"
                style={{ fontFamily: 'Fraunces, serif' }}
              >
                {t('Add Participant')}
              </h2>
              <p className="mb-5 text-center text-xs leading-relaxed text-[#708077] dark:text-[#9AA093]">
                {t('Message')} <span className="font-semibold text-[#397D59] dark:text-senda-accent">SENDA Health Platform</span>
              </p>

              <form onSubmit={(e) => { e.preventDefault(); handleCreateParticipant(); }} className="space-y-3.5" autoComplete="off">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">
                    {t('Email')}
                  </label>
                  <div className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-3.5 py-2.5 shadow-[0_0_0_4px_rgba(220,235,225,0.5)] dark:shadow-none focus-within:border-senda-secondary transition-all">
                    <svg className="h-4 w-4 shrink-0 text-[#63A982] dark:text-senda-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <input
                      type="email"
                      value={newEmail}
                      autoComplete="off"
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full bg-transparent text-sm text-senda-main dark:text-white outline-none placeholder:text-[#A2AEA7]"
                      placeholder="usuario@email.com"
                    />
                  </div>
                </div>

                {submitError && <p className="text-xs text-red-600 dark:text-red-400">{submitError}</p>}
                {submitSuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400">{submitSuccess}</p>}

                <div className="pt-1.5 space-y-2.5">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-senda-primary dark:bg-senda-accent px-4 py-3.5 text-sm font-semibold text-white dark:text-senda-dark shadow-[0_14px_28px_rgba(29,90,61,0.22)] transition-all hover:-translate-y-0.5 hover:bg-[#174A32] dark:hover:bg-[#8BD7AC] disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    {isSubmitting ? t('Processing') : t('Save Participant')}
                    {!isSubmitting && (
                      <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="w-full cursor-pointer rounded-2xl border border-senda-border dark:border-senda-darkborder bg-transparent px-4 py-3 text-sm font-semibold text-[#708077] dark:text-[#9AA093] hover:bg-white dark:hover:bg-senda-input transition"
                  >
                    {t('Cancel')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {selectedParticipant && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4">
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-[28px] bg-senda-light dark:bg-senda-card p-5 sm:p-7 shadow-[0_30px_60px_rgba(29,90,61,0.18)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
            <div className="relative">
              <div className="mb-4 sm:mb-6 flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="flex h-11 w-11 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-[#DCEBE1] dark:bg-senda-darkborder text-senda-primary dark:text-senda-accent">
                    <svg className="h-5 w-5 sm:h-7 sm:w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-xl font-extrabold text-senda-main dark:text-white truncate" style={{ fontFamily: 'Fraunces, serif' }}>{t('Participant Detail')}</h2>
                    <p className="text-[10px] sm:text-xs text-[#6B6F66] dark:text-[#9AA093] truncate">{t('Full Info')}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedParticipant(null)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-senda-light dark:bg-senda-input text-[#6B6F66] dark:text-slate-300 hover:border-senda-border dark:hover:bg-slate-700 cursor-pointer transition"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6">
                <div className="rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/70 dark:bg-senda-input/50 p-3 sm:p-4 flex flex-col justify-center">
                  <span className="text-[11px] font-medium text-senda-secondary dark:text-senda-accent mb-1">{t('Code')}</span>
                  <span className="text-sm font-bold text-senda-main dark:text-white">{selectedParticipant.participant_code}</span>
                </div>

                <div className="rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/70 dark:bg-senda-input/50 p-3 sm:p-4 flex flex-col justify-center">
                  <span className="text-[11px] font-medium text-senda-secondary dark:text-senda-accent mb-1">{t('Email')}</span>
                  <span className="text-xs font-semibold text-senda-main dark:text-slate-200">{selectedParticipant.email || '—'}</span>
                </div>

                <div className="rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/70 dark:bg-senda-input/50 p-3 sm:p-4 flex flex-col justify-center">
                  <span className="text-[11px] font-medium text-senda-secondary dark:text-senda-accent mb-1">{t('Status')}</span>
                  <div>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold ${selectedParticipant.authentication_status === 'ACTIVE'
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                      : 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
                      }`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                      {selectedParticipant.authentication_status || 'PENDING'}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/70 dark:bg-senda-input/50 p-3 sm:p-4 flex flex-col justify-center">
                  <span className="text-[11px] font-medium text-senda-secondary dark:text-senda-accent mb-1">{t('Token Expiration')}</span>
                  <span className="text-xs font-semibold text-senda-main dark:text-slate-200">
                    {selectedParticipant.access_token_expiration ? new Date(selectedParticipant.access_token_expiration).toLocaleString('es-ES') : t('Not available')}
                  </span>
                </div>

                <div className="md:col-span-2 rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/70 dark:bg-senda-input/50 p-4 flex flex-col justify-center">
                  <span className="text-[11px] font-medium text-senda-secondary dark:text-senda-accent mb-1">{t('Access Token')}</span>
                  <pre className="mt-1 whitespace-normal break-all rounded-xl p-2 sm:p-3 bg-white dark:bg-senda-dark border border-senda-border dark:border-senda-darkborder font-mono text-[10px] sm:text-[11px] text-senda-main dark:text-slate-300">
                    {selectedParticipant.access_token || t('Not available')}
                  </pre>
                </div>

                <div className="md:col-span-2 rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/70 dark:bg-senda-input/50 p-4 flex flex-col justify-center">
                  <span className="text-[11px] font-medium text-senda-secondary dark:text-senda-accent mb-1">{t('Refresh Token')}</span>
                  <pre className="mt-1 whitespace-normal break-all rounded-xl p-2 sm:p-3 bg-white dark:bg-senda-dark border border-senda-border dark:border-senda-darkborder font-mono text-[10px] sm:text-[11px] text-senda-main dark:text-slate-300">
                    {selectedParticipant.refresh_token || t('Not available')}
                  </pre>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-3 pt-3 sm:pt-2 border-t border-senda-border dark:border-senda-darkborder">
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={async () => {
                      if (!selectedParticipant) return;
                      if (!confirm(`${t('Delete confirmation')} ${selectedParticipant.participant_code}?`)) return;
                      try {
                        const resp = await fetch(`${API_URL}/api/participants/`, {
                          method: 'DELETE',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ participant_code: selectedParticipant.participant_code }),
                        });
                        const j = await resp.json();
                        if (resp.ok) {
                          setSelectedParticipant(null);
                          loadParticipants();
                        } else {
                          alert(j.error || t('Delete participant error'));
                        }
                      } catch (e) {
                        alert(t('Server connection error'));
                      }
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-4 sm:px-5 py-2.5 sm:py-3 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-100 transition cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    {t('Delete Participant')}
                  </button>

                  <a
                    href={`${API_URL}/auth/login/`}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/50 px-4 sm:px-5 py-2.5 sm:py-3 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-100 transition cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {t('Reconnect Google')}
                  </a>
                </div>

                <button
                  onClick={() => setSelectedParticipant(null)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-4 sm:px-5 py-2.5 sm:py-3 text-xs font-bold text-senda-main dark:text-slate-300 hover:bg-senda-light dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  {t('Close')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {oauthModalVisible && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-senda-card border border-senda-border dark:border-senda-darkborder p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-senda-main dark:text-white" style={{ fontFamily: 'Fraunces, serif' }}>{t('Authorization Completed Title')}</h2>
              <button
                onClick={() => setOauthModalVisible(false)}
                className="text-[#6B6F66] dark:text-[#9AA093] hover:text-senda-main dark:hover:text-white cursor-pointer text-base font-bold"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300">{oauthModalMessage}</p>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setOauthModalVisible(false)}
                className="rounded-2xl bg-senda-primary hover:bg-[#184232] dark:bg-senda-accent dark:text-senda-dark dark:hover:bg-[#59a67e] px-5 py-3 text-sm font-semibold text-white transition cursor-pointer"
              >
                {t('Close')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="rounded-3xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-card p-6 shadow-xl transition-colors duration-300 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full">
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-slate-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setCurrentPage(1); }}
              placeholder={t('Search Participant')}
              className="w-full rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/60 dark:bg-senda-dark/80 h-[37px] pl-11 pr-4 text-xs text-senda-main dark:text-white outline-none transition focus:border-senda-secondary"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-senda-light dark:bg-senda-input px-3 h-[37px] rounded-2xl text-xs font-semibold text-[#6B6F66] dark:text-[#9AA093] border border-senda-border dark:border-senda-darkborder shrink-0 self-start sm:self-auto">
            <CustomSelect
              value={pageSize}
              onChange={(val) => setPageSize(Number(val))}
              options={pageSizeOptions}
              width="w-28"
            />
            <span>{t('Per Page')}</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed border-collapse text-left">
              <thead>
                <tr className="bg-[#DCEBE1]/60 dark:bg-senda-darkborder/80 text-senda-primary dark:text-senda-accent uppercase text-[10px] tracking-wider">
                  <th className="w-[18%] px-6 py-3.5 font-bold rounded-l-2xl">{t('Code')}</th>
                  <th className="w-[25%] px-6 py-3.5 font-bold">{t('Email')}</th>
                  <th className="w-[18%] px-6 py-3.5 font-bold">{t('Access Token')}</th>
                  <th className="w-[18%] px-6 py-3.5 font-bold">{t('Refresh Token')}</th>
                  <th className="w-[21%] px-6 py-3.5 font-bold rounded-r-2xl">{t('Token Expiration')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-senda-border dark:divide-senda-darkborder">
                {paginatedParticipants.map((participant, idx) => {
                  const emailVal = getEmail(participant);
                  const accessToken = getAccessToken(participant);
                  const refreshToken = getRefreshToken(participant);
                  const expirationVal = getExpiration(participant);
                  const colorStyle = avatarColors[idx % avatarColors.length];

                  return (
                    <tr
                      key={participant.participant_code}
                      onClick={() => setSelectedParticipant(participant)}
                      className="cursor-pointer transition-all duration-200 hover:bg-senda-light/80 dark:hover:bg-senda-dark/50 hover:shadow-[inset_3px_0_0_0_theme(colors.senda-primary)] dark:hover:shadow-[inset_3px_0_0_0_theme(colors.senda-accent)]"
                    >
                      <td className="px-6 py-4 text-xs font-bold text-senda-main dark:text-white flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-xl ${colorStyle.bg} flex items-center justify-center font-bold shadow-sm`}>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        {participant.participant_code}
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-[#6B6F66] dark:text-[#9AA093]">{emailVal}</td>
                      <td className="px-6 py-4 text-xs text-[#6B6F66] dark:text-[#9AA093]">
                        {accessToken ? (
                          <span
                            title={accessToken}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-900 font-mono"
                          >
                            <svg className="h-3.5 w-3.5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {truncateToken(accessToken)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium bg-[#DCEBE1]/50 dark:bg-slate-800 text-senda-primary dark:text-senda-accent border border-[#8DC29A]/30">
                            <svg className="h-3.5 w-3.5 text-senda-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {t('No token')}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-[#6B6F66] dark:text-[#9AA093]">
                        {refreshToken ? (
                          <span
                            title={refreshToken}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-900 font-mono"
                          >
                            <svg className="h-3.5 w-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {truncateToken(refreshToken)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium bg-[#DCEBE1]/50 dark:bg-slate-800 text-senda-primary dark:text-senda-accent border border-[#8DC29A]/30">
                            <svg className="h-3.5 w-3.5 text-senda-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {t('No token')}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-[#6B6F66] dark:text-[#9AA093]">
                        {expirationVal ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900">
                            <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {new Date(expirationVal).toLocaleString('es-ES')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium bg-[#DCEBE1]/50 dark:bg-slate-800 text-senda-primary dark:text-senda-accent border border-[#8DC29A]/30">
                            <svg className="h-3.5 w-3.5 text-senda-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {t('No token info')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />

        {filtered.length === 0 && !error && (
          <p className="py-8 text-center text-xs text-slate-400">{t('No participants found')}</p>
        )}
        {error && (
          <p className="py-8 text-center text-xs text-red-500">{error}</p>
        )}
      </div>
    </div>
  );
};

export default Participants;