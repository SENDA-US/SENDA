import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '../components/CustomSelect';
import { Pagination } from '../components/Pagination';
import { SectionHeader } from '../components/SectionHeader';
import ReactDOM from 'react-dom';
import { API_URL } from '../config';

type FitbitItem = {
  fitbit_code: string;
  status: string;
};

const Fitbits: React.FC = () => {
  const { t } = useTranslation();
  const [fitbits, setFitbits] = useState<FitbitItem[]>([]);
  const [summary, setSummary] = useState({ in_use: 0, free: 0, maintenance: 0, inactive: 0 });
  const [query, setQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nextCode, setNextCode] = useState('F_001');
  const [selectedStatus, setSelectedStatus] = useState('FREE');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [selectedFitbit, setSelectedFitbit] = useState<FitbitItem | null>(null);
  const [originalCode, setOriginalCode] = useState('');

  const [pageSize, setPageSize] = useState<number>(() => {
    const savedSize = localStorage.getItem('fitbits_page_size');
    return savedSize ? Number(savedSize) : 10;
  });
  const [currentPage, setCurrentPage] = useState(1);

  const loadFitbits = () => {
    fetch(`${API_URL}/api/fitbits/`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => {
        const items = data.items || [];

        // Ordenar los elementos por fitbit_code de forma ascendente (F_001, F_002...)
        items.sort((a: FitbitItem, b: FitbitItem) =>
          a.fitbit_code.localeCompare(b.fitbit_code, undefined, { numeric: true })
        );

        setFitbits(items);
        setSummary(data.counts || { in_use: 0, free: 0, maintenance: 0, inactive: 0 });

        if (items.length > 0) {
          const codes = items.map((f: FitbitItem) => {
            const match = f.fitbit_code.match(/F_(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
          });
          const maxNum = Math.max(...codes, 0);
          setNextCode(`F_${String(maxNum + 1).padStart(3, '0')}`);
        } else {
          setNextCode('F_001');
        }
      })
      .catch(() => setError(t('Error loading fitbits')));
  };

  useEffect(() => {
    loadFitbits();
  }, []);

  useEffect(() => {
    localStorage.setItem('fitbits_page_size', pageSize.toString());
    setCurrentPage(1);
  }, [pageSize]);

  const handleCreateFitbit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const response = await fetch(`${API_URL}/api/fitbits/create/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fitbit_code: nextCode, status: selectedStatus }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t('Create fitbit error'));
      }

      setSubmitSuccess(`${t('Fitbit registered')} ${nextCode}.`);
      setSelectedStatus('FREE');
      loadFitbits();

      setTimeout(() => {
        setIsModalOpen(false);
        setSubmitSuccess(null);
      }, 1200);

    } catch (err: any) {
      setSubmitError(err.message || t('Server connection error'));
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = fitbits.filter((fitbit) => {
    const matchesQuery =
      fitbit.fitbit_code.toLowerCase().includes(query.toLowerCase()) ||
      fitbit.status.toLowerCase().includes(query.toLowerCase());

    const matchesStatus =
      selectedStatusFilter === 'ALL' || fitbit.status.toUpperCase() === selectedStatusFilter.toUpperCase();

    return matchesQuery && matchesStatus;
  });

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginatedFitbits = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const pageSizeOptions = [
    { label: 5, value: 5 },
    { label: 10, value: 10 },
    { label: 15, value: 15 },
    { label: 20, value: 20 },
    { label: 25, value: 25 },
  ];

  const statusOptions = [
    { label: t('Free'), value: 'FREE' },
    { label: t('In Use'), value: 'IN_USE' },
    { label: t('Maintenance'), value: 'MAINTENANCE' },
    { label: t('Inactive'), value: 'INACTIVE' },
  ];

  return (
    <div className="w-full text-senda-main dark:text-senda-darktext relative space-y-8">
      <SectionHeader
        title="Fitbit"
        subtitle={`${filtered.length} ${t('Devices Registered')}`}
        actionLabel={t('Register Fitbit')}
        onAction={() => {
          setSubmitError(null);
          setSubmitSuccess(null);
          setIsModalOpen(true);
        }}
      />

      <div className="grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-4">
        {[
          {
            statusKey: 'IN_USE',
            label: t('In Use'),
            value: summary.in_use,
            textColor: 'text-emerald-700 dark:text-emerald-400',
            backgroundColor: 'bg-[#EAF1EA] dark:bg-senda-card',
            borderColor: 'border-[#8DC29A]/40 dark:border-senda-darkborder',
            activeRing: 'border-senda-primary dark:border-senda-accent ring-2 ring-emerald-600/20',
            hoverShadow: 'hover:shadow-md'
          },
          {
            statusKey: 'FREE',
            label: t('Free'),
            value: summary.free,
            textColor: 'text-blue-700 dark:text-blue-400',
            backgroundColor: 'bg-blue-50/50 dark:bg-senda-card',
            borderColor: 'border-blue-200 dark:border-blue-900',
            activeRing: 'border-blue-500 ring-2 ring-blue-600/20',
            hoverShadow: 'hover:shadow-md'
          },
          {
            statusKey: 'MAINTENANCE',
            label: t('Maintenance'),
            value: summary.maintenance,
            textColor: 'text-amber-700 dark:text-amber-400',
            backgroundColor: 'bg-amber-50/50 dark:bg-senda-card',
            borderColor: 'border-amber-200 dark:border-amber-900',
            activeRing: 'border-amber-500 ring-2 ring-amber-600/20',
            hoverShadow: 'hover:shadow-md'
          },
          {
            statusKey: 'INACTIVE',
            label: t('Inactive'),
            value: summary.inactive,
            textColor: 'text-red-600 dark:text-red-400',
            backgroundColor: 'bg-red-50/50 dark:bg-senda-card',
            borderColor: 'border-red-200 dark:border-red-900',
            activeRing: 'border-red-500 ring-2 ring-red-600/20',
            hoverShadow: 'hover:shadow-md'
          },
        ].map((item) => {
          const isSelected = selectedStatusFilter === item.statusKey;
          return (
            <div
              key={item.label}
              onClick={() => {
                setSelectedStatusFilter(isSelected ? 'ALL' : item.statusKey);
                setCurrentPage(1);
              }}
              className={`cursor-pointer rounded-2xl border ${item.backgroundColor} p-3 sm:p-5 shadow-sm transition-all duration-200 text-center ${item.hoverShadow} ${isSelected ? item.activeRing : item.borderColor
                }`}
            >
              <p className={`text-[9px] sm:text-[11px] font-extrabold uppercase tracking-[0.08em] sm:tracking-[0.25em] leading-tight ${item.textColor}`}>
                {item.label}
              </p>
              <p className="mt-1 sm:mt-2 text-2xl sm:text-3xl font-extrabold text-senda-main dark:text-white" style={{ fontFamily: 'Fraunces, serif' }}>
                {item.value}
              </p>
            </div>
          );
        })}
      </div>
      <div className="rounded-3xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-card p-6 shadow-xl space-y-6 transition-colors duration-300">
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
              placeholder={t('Search Fitbit')}
              className="w-full rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/60 dark:bg-senda-dark/80 h-[37px] pl-11 pr-4 text-xs text-senda-main dark:text-white outline-none transition focus:border-senda-secondary"
            />
          </div>

          <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto">
            {selectedStatusFilter !== 'ALL' && (
              <button
                onClick={() => { setSelectedStatusFilter('ALL'); setCurrentPage(1); }}
                className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-senda-light dark:bg-senda-input px-4 h-[37px] text-xs font-bold text-[#6B6F66] dark:text-slate-300 hover:bg-slate-200 transition cursor-pointer flex items-center"
              >
                {t('Clear filter')} ({selectedStatusFilter})
              </button>
            )}

            <div className="flex items-center gap-1.5 bg-senda-light dark:bg-senda-input px-3 h-[37px] rounded-2xl text-xs font-semibold text-[#6B6F66] dark:text-[#9AA093] border border-senda-border dark:border-senda-darkborder">
              <CustomSelect
                value={pageSize}
                onChange={(val) => setPageSize(Number(val))}
                options={pageSizeOptions}
                width="w-28"
              />
              <span>{t('Per Page')}</span>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed border-collapse text-left">
              <thead>
                <tr className="bg-[#DCEBE1]/60 dark:bg-senda-darkborder/80 text-senda-primary dark:text-senda-accent uppercase text-[10px] tracking-wider">
                  <th className="w-[50%] px-6 py-3.5 font-bold rounded-l-2xl">{t('Fitbit')}</th>
                  <th className="w-[50%] px-6 py-3.5 font-bold rounded-r-2xl">{t('Status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-senda-border dark:divide-senda-darkborder">
                {paginatedFitbits.map((fitbit) => {
                  const statusLower = fitbit.status.toLowerCase();
                  const badgeStyle = statusLower.includes('in_use') || statusLower.includes('uso')
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900'
                    : statusLower.includes('free') || statusLower.includes('libre')
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-900'
                      : statusLower.includes('inactive') || statusLower.includes('inactivo')
                        ? 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900'
                        : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-900';

                  return (
                    <tr
                      key={fitbit.fitbit_code}
                      onClick={() => {
                        setSelectedFitbit(fitbit);
                        setOriginalCode(fitbit.fitbit_code);
                      }}
                      className="cursor-pointer transition-all duration-200 hover:bg-senda-light/80 dark:hover:bg-senda-dark/50 hover:shadow-[inset_3px_0_0_0_theme(colors.senda-primary)] dark:hover:shadow-[inset_3px_0_0_0_theme(colors.senda-accent)]"
                    >
                      <td className="px-6 py-4 text-xs font-bold text-senda-main dark:text-white flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-senda-light dark:bg-senda-dark text-[#6B6F66] dark:text-[#9AA093] flex items-center justify-center font-bold shadow-sm border border-senda-border dark:border-senda-darkborder">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        </div>
                        {fitbit.fitbit_code}
                      </td>
                      <td className="px-6 py-4 text-xs text-[#6B6F66] dark:text-[#9AA093] capitalize">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border ${badgeStyle}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                          {fitbit.status.replace('_', ' ').toLowerCase()}
                        </span>
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
          <p className="py-8 text-center text-xs text-slate-400">{t('No Fitbits found')}</p>
        )}
        {error && (
          <p className="py-8 text-center text-xs text-red-500">{error}</p>
        )}
      </div>

      {isModalOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-[400px] overflow-hidden rounded-[28px] bg-senda-light dark:bg-senda-card p-7 shadow-[0_30px_60px_rgba(29,90,61,0.18)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
            <div className="relative">
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label={t('Close')}
                className="absolute right-0 top-0 flex h-6.5 w-6.5 cursor-pointer items-center justify-center rounded-full border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input text-[#708077] dark:text-[#9AA093] hover:text-senda-main dark:hover:text-white transition"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="mb-4 flex justify-center">
                <div className="relative flex h-[58px] w-[58px] items-center justify-center rounded-2xl bg-[#DCEBE1] dark:bg-senda-darkborder shadow-[0_10px_24px_rgba(29,90,61,0.14)]">
                  <svg className="h-7 w-7 text-senda-primary dark:text-senda-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-[3px] border-senda-light dark:border-senda-card bg-[#4FA477]" />
                </div>
              </div>

              <h2
                className="mt-1.5 mb-1 text-center text-[20px] font-semibold text-senda-main dark:text-white"
                style={{ fontFamily: 'Fraunces, serif' }}
              >
                {t('Register New Fitbit')}
              </h2>
              <p className="mb-5 text-center text-xs leading-relaxed text-[#708077] dark:text-[#9AA093]">
                {t('Register New Fitbit Subtitle')}
              </p>

              <form onSubmit={handleCreateFitbit} className="space-y-3.5" autoComplete="off">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">
                    {t('Fitbit Code')}
                  </label>
                  <div className="flex items-center gap-1 rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-3.5 py-2.5">
                    <span className="text-sm font-bold text-senda-primary dark:text-senda-accent select-none">F_</span>
                    <input
                      type="text"
                      value={nextCode.replace('F_', '')}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        setNextCode(`F_${digits}`);
                      }}
                      className="w-full bg-transparent text-sm font-bold text-senda-main dark:text-white outline-none"
                      placeholder="001"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">
                    {t('Operational Status')}
                  </label>
                  <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark px-3 py-1.5 mt-1">
                    <CustomSelect
                      value={selectedStatus}
                      onChange={(val) => setSelectedStatus(String(val))}
                      options={statusOptions}
                      width="w-full"
                    />
                  </div>
                </div>

                {submitError && <p className="text-xs text-red-600 dark:text-red-400">{submitError}</p>}
                {submitSuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400">{submitSuccess}</p>}

                <div className="pt-1.5 space-y-2.5">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-senda-primary dark:bg-senda-accent px-4 py-3.5 text-sm font-semibold text-white dark:text-senda-dark shadow-[0_14px_28px_rgba(29,90,61,0.22)] transition-all hover:-translate-y-0.5 hover:bg-[#174A32] dark:hover:bg-[#8BD7AC] disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    {submitting ? t('Processing') : t('Save Fitbit')}
                    {!submitting && (
                      <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
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

      {selectedFitbit && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-xl rounded-[28px] bg-senda-light dark:bg-senda-card p-7 shadow-[0_30px_60px_rgba(29,90,61,0.18)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
            <div className="relative">
              <div className="mb-6 flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#DCEBE1] dark:bg-senda-darkborder text-senda-primary dark:text-senda-accent">
                    <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-senda-main dark:text-white" style={{ fontFamily: 'Fraunces, serif' }}>{t('Fitbit Detail')}</h2>
                    <p className="text-xs text-[#6B6F66] dark:text-[#9AA093]">{t('Fitbit Full Info')}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedFitbit(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-senda-input text-[#6B6F66] dark:text-slate-300 border border-senda-border dark:border-senda-darkborder hover:text-senda-main dark:hover:text-white cursor-pointer transition"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                <div className="rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/70 dark:bg-senda-input/50 p-4 flex flex-col justify-center">
                  <span className="text-[11px] font-medium text-senda-secondary dark:text-senda-accent mb-1">{t('Code')}</span>
                  <div className="flex items-center gap-1 w-full text-sm font-bold text-senda-main dark:text-white bg-transparent outline-none border border-senda-border dark:border-senda-darkborder rounded-xl px-3 py-2 mt-1 focus-within:border-senda-secondary transition-all">
                    <span className="text-sm font-bold text-senda-primary dark:text-senda-accent select-none">F_</span>
                    <input
                      type="text"
                      value={selectedFitbit.fitbit_code.replace('F_', '')}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        setSelectedFitbit({ ...selectedFitbit, fitbit_code: `F_${digits}` });
                      }}
                      onBlur={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        if (digits) {
                          const padded = digits.padStart(3, '0');
                          setSelectedFitbit({ ...selectedFitbit, fitbit_code: `F_${padded}` });
                        }
                      }}
                      className="w-full bg-transparent text-sm font-bold text-senda-main dark:text-white outline-none"
                      placeholder="001"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/70 dark:bg-senda-input/50 p-4 flex flex-col justify-center">
                  <span className="text-[11px] font-medium text-senda-secondary dark:text-senda-accent mb-1">{t('Status')}</span>
                  <div className="flex flex-col gap-2">
                    <div>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold capitalize ${selectedFitbit.status.toLowerCase().includes('in_use') || selectedFitbit.status.toLowerCase().includes('uso')
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                        : selectedFitbit.status.toLowerCase().includes('free') || selectedFitbit.status.toLowerCase().includes('libre')
                          ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
                          : selectedFitbit.status.toLowerCase().includes('inactive') || selectedFitbit.status.toLowerCase().includes('inactivo')
                            ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                        }`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                        {selectedFitbit.status.replace('_', ' ').toLowerCase()}
                      </span>
                    </div>

                    <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark px-3 py-1.5 mt-1">
                      <CustomSelect
                        value={selectedFitbit.status}
                        onChange={async (newStatus) => {
                          try {
                            const resp = await fetch(`${API_URL}/api/fitbits/update/status/`, {
                              method: 'POST',
                              credentials: 'include',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ fitbit_code: selectedFitbit.fitbit_code, status: newStatus }),
                            });
                            if (resp.ok) {
                              setSelectedFitbit({ ...selectedFitbit, status: newStatus });
                              loadFitbits();
                            } else {
                              alert(t('Error updating status'));
                            }
                          } catch {
                            alert(t('Server connection error'));
                          }
                        }}
                        options={statusOptions}
                        width="w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-5 mt-5 border-t border-senda-border dark:border-senda-darkborder flex flex-col sm:flex-row justify-between items-center gap-3">
                <button
                  onClick={async () => {
                    if (!selectedFitbit) return;
                    if (!confirm(`${t('Delete Fitbit Confirmation')} ${selectedFitbit.fitbit_code}?`)) return;
                    try {
                      const resp = await fetch(`${API_URL}/api/fitbits/delete/`, {
                        method: 'DELETE',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fitbit_code: selectedFitbit.fitbit_code }),
                      });
                      const j = await resp.json();
                      if (resp.ok) {
                        setSelectedFitbit(null);
                        loadFitbits();
                      } else {
                        alert(j.error || t('Delete Fitbit error'));
                      }
                    } catch (e) {
                      alert(t('Server connection error'));
                    }
                  }}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-4 py-2.5 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-100 transition cursor-pointer"
                >
                  {t('Delete Fitbit')}
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={async () => {
                      try {
                        // Formatear estrictamente a 3 dígitos antes de enviar
                        const digits = selectedFitbit.fitbit_code.replace('F_', '').replace(/\D/g, '');
                        const formattedCode = `F_${digits.padStart(3, '0')}`;

                        const resp = await fetch(`${API_URL}/api/fitbits/update/code/`, {
                          method: 'POST',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            original_code: originalCode,
                            fitbit_code: formattedCode
                          }),
                        });
                        const data = await resp.json();
                        if (resp.ok) {
                          alert(t('Fitbit updated successfully'));
                          setOriginalCode(formattedCode);
                          loadFitbits();
                        } else {
                          alert(data.error || t('Error updating fitbit code'));
                        }
                      } catch {
                        alert(t('Server connection error'));
                      }
                    }}
                    className="rounded-2xl bg-senda-primary dark:bg-senda-accent text-white dark:text-senda-dark px-5 py-2.5 text-xs font-bold shadow-md hover:opacity-90 transition cursor-pointer"
                  >
                    {t('Save Changes')}
                  </button>

                  <button
                    onClick={() => setSelectedFitbit(null)}
                    className="rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-5 py-2.5 text-xs font-bold text-senda-main dark:text-slate-300 hover:bg-senda-light dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    {t('Close')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Fitbits;