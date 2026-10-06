import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '../components/CustomSelect';
import { Pagination } from '../components/Pagination';
import { API_URL } from '../config';

type AlertItem = {
  id: string;
  message: string;
  priority: string;
  type: string;
  type_label: string;
  resolved: boolean;
  participant_code: string | null;
  fitbit_code: string | null;
  email: string | null;
  details: Record<string, unknown>;
  first_detected_at: string | null;
  last_detected_at: string | null;
  created_at: string;
  resolved_at: string | null;
};

type AlertsProps = {
  onActiveCountChange?: (count: number) => void;
};

const Alerts: React.FC<AlertsProps> = ({ onActiveCountChange }) => {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>(''); // Nuevo estado para el filtro de fecha
  const [showResolved, setShowResolved] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [pageSize, setPageSize] = useState<number>(() => {
    const savedSize = localStorage.getItem('alerts_page_size');
    return savedSize ? Number(savedSize) : 10;
  });
  const [currentPage, setCurrentPage] = useState(1);
  const activeAlerts = alerts.filter((item) => !item.resolved);

  const fetchAlerts = () => {
    fetch(`${API_URL}/api/alerts/`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        const items = data.items || [];
        // Ordenar por fecha descendente (la más reciente arriba)
        items.sort((a: AlertItem, b: AlertItem) => {
          const dateA = new Date(a.first_detected_at || a.created_at).getTime();
          const dateB = new Date(b.first_detected_at || b.created_at).getTime();
          return dateB - dateA;
        });
        setAlerts(items);
      })
      .catch(() => setError(t('Error loading alerts')));
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  useEffect(() => {
    localStorage.setItem('alerts_page_size', pageSize.toString());
    setCurrentPage(1);
  }, [pageSize]);

  useEffect(() => {
    if (onActiveCountChange) {
      onActiveCountChange(activeAlerts.length);
    }
  }, [activeAlerts.length, onActiveCountChange]);

  const handleResolve = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/alerts/${id}/resolve/`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((item) => (item.id === id ? { ...item, resolved: true } : item))
        );
      } else {
        setError(t('Error resolving alert'));
      }
    } catch {
      setError(t('Server connection error'));
    }
  };

  const filtered = alerts.filter((alert) => {
    if (!showResolved && alert.resolved) return false;
    if (showResolved && !alert.resolved) return false;

    const matchesQuery =
      alert.message.toLowerCase().includes(query.toLowerCase()) ||
      (alert.participant_code && alert.participant_code.toLowerCase().includes(query.toLowerCase())) ||
      (alert.email && alert.email.toLowerCase().includes(query.toLowerCase()));

    const matchesPriority =
      selectedPriority === 'ALL' || alert.priority === selectedPriority;

    // Filtro por fecha (compara el día YYYY-MM-DD)
    let matchesDate = true;
    if (selectedDate && alert.first_detected_at) {
      const alertDateStr = alert.first_detected_at.split('T')[0];
      matchesDate = alertDateStr === selectedDate;
    }

    return matchesQuery && matchesPriority && matchesDate;
  });

  const countHigh = activeAlerts.filter((item) => item.priority === 'HIGH').length;
  const countMedium = activeAlerts.filter((item) => item.priority === 'MEDIUM').length;

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginatedAlerts = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const pageSizeOptions = [
    { label: 5, value: 5 },
    { label: 10, value: 10 },
    { label: 15, value: 15 },
    { label: 20, value: 20 },
    { label: 25, value: 25 },
  ];

  return (
    <div className="w-full text-senda-main dark:text-senda-darktext space-y-8">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-senda-main dark:text-white" style={{ fontFamily: 'Fraunces, serif' }}>{t('Alerts Title')}</h1>
          <p className="mt-1 text-xs font-medium text-[#6B6F66] dark:text-[#9AA093]">{t('Alerts Subtitle')}</p>
        </div>
        <div className="flex items-center gap-1.5 bg-senda-light dark:bg-senda-card p-1 rounded-xl self-start sm:self-auto border border-senda-border dark:border-senda-darkborder">
          <button
            onClick={() => { setShowResolved(false); setCurrentPage(1); }}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${!showResolved
              ? 'bg-white dark:bg-senda-darkborder text-senda-main dark:text-white shadow-sm'
              : 'text-[#6B6F66] dark:text-[#9AA093] hover:text-senda-main dark:hover:text-white'
              }`}
          >
            {t('Active Count', { count: activeAlerts.length })}
          </button>
          <button
            onClick={() => { setShowResolved(true); setCurrentPage(1); }}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${showResolved
              ? 'bg-white dark:bg-senda-darkborder text-senda-main dark:text-white shadow-sm'
              : 'text-[#6B6F66] dark:text-[#9AA093] hover:text-senda-main dark:hover:text-white'
              }`}
          >
            {t('Resolved History')}
          </button>
        </div>
      </div>

      {!showResolved && (
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          <div
            onClick={() => { setSelectedPriority('HIGH'); setCurrentPage(1); }}
            className={`cursor-pointer rounded-2xl border bg-white dark:bg-senda-card p-3 sm:p-5 shadow-lg shadow-slate-100 dark:shadow-none transition-all duration-200 text-center 
        ${selectedPriority === 'HIGH'
                ? 'border-rose-500 ring-2 ring-rose-500/20'
                : 'border-rose-200 dark:border-rose-900'
              }`}
          >
            <div className="flex items-center justify-center gap-1.5 sm:gap-2">
              <p className="text-[9px] sm:text-[11px] font-extrabold uppercase tracking-[0.08em] sm:tracking-[0.25em] text-rose-600 dark:text-rose-400 leading-tight whitespace-nowrap">
                {t('Critical')}
              </p>
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-rose-500 animate-pulse shrink-0"></span>
            </div>
            <p className="mt-1 sm:mt-2 text-xl sm:text-3xl font-extrabold text-senda-main dark:text-white">
              {countHigh}
            </p>
          </div>

          <div
            onClick={() => { setSelectedPriority('MEDIUM'); setCurrentPage(1); }}
            className={`cursor-pointer rounded-2xl border bg-white dark:bg-senda-card p-3 sm:p-5 shadow-lg shadow-slate-100 dark:shadow-none transition-all duration-200 text-center 
        ${selectedPriority === 'MEDIUM'
                ? 'border-amber-500 ring-2 ring-amber-500/20'
                : 'border-amber-200 dark:border-amber-900'
              }`}
          >
            <div className="flex items-center justify-center">
              <p className="text-[9px] sm:text-[11px] font-extrabold uppercase tracking-[0.08em] sm:tracking-[0.25em] text-amber-600 dark:text-amber-400 leading-tight whitespace-nowrap">
                {t('Warnings')}
              </p>
            </div>
            <p className="mt-1 sm:mt-2 text-xl sm:text-3xl font-extrabold text-senda-main dark:text-white">
              {countMedium}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-card p-6 shadow-xl space-y-6 transition-colors duration-300">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-wider text-senda-main dark:text-slate-300">
              {showResolved ? t('Resolved Tray') : t('Active Tray')}
            </p>
            <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900">
              {filtered.length} {t('Records')}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-senda-light dark:bg-senda-input p-1.5 rounded-2xl border border-senda-border dark:border-senda-darkborder">
              <button
                onClick={() => { setSelectedPriority('ALL'); setCurrentPage(1); }}
                className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.25em] rounded-xl transition cursor-pointer ${selectedPriority === 'ALL'
                  ? 'bg-white dark:bg-senda-darkborder text-senda-primary dark:text-senda-accent shadow-sm'
                  : 'text-[#6B6F66] dark:text-[#9AA093] hover:text-senda-main dark:hover:text-white'
                  }`}
              >
                {t('All')}
              </button>
              <button
                onClick={() => { setSelectedPriority('HIGH'); setCurrentPage(1); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${selectedPriority === 'HIGH'
                  ? 'bg-white dark:bg-senda-darkborder text-rose-600 dark:text-rose-400 shadow-sm'
                  : 'text-[#6B6F66] dark:text-[#9AA093] hover:text-senda-main dark:hover:text-white'
                  }`}
              >
                {t('Critical')}
              </button>
              <button
                onClick={() => { setSelectedPriority('MEDIUM'); setCurrentPage(1); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${selectedPriority === 'MEDIUM'
                  ? 'bg-white dark:bg-senda-darkborder text-amber-600 dark:text-amber-400 shadow-sm'
                  : 'text-[#6B6F66] dark:text-[#9AA093] hover:text-senda-main dark:hover:text-white'
                  }`}
              >
                {t('Warnings')}
              </button>
            </div>
          </div>
        </div>

        {/* BARRA DE BÚSQUEDA Y FILTRO DE FECHA */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-1/2">
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
              className="w-full rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/60 dark:bg-senda-dark h-[37px] pl-11 pr-4 text-xs text-senda-main dark:text-white outline-none transition focus:border-senda-secondary"
            />
          </div>

          <div className="flex flex-row items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Input de Filtro por Fecha */}
            <div className="flex items-center gap-2 bg-senda-light dark:bg-senda-input px-3 h-[37px] rounded-2xl text-xs font-semibold text-[#6B6F66] dark:text-[#9AA093] border border-senda-border dark:border-senda-darkborder shrink-0 min-w-[135px]">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => { setSelectedDate(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-xs text-senda-main dark:text-white outline-none cursor-pointer w-full appearance-none"
              />
              {selectedDate && (
                <button
                  onClick={() => { setSelectedDate(''); setCurrentPage(1); }}
                  className="text-slate-400 hover:text-red-500 font-bold ml-1"
                  title="Limpiar fecha"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Selector de Paginación */}
            <div className="flex items-center gap-1.5 bg-senda-light dark:bg-senda-input px-3 h-[37px] rounded-2xl text-xs font-semibold text-[#6B6F66] dark:text-[#9AA093] border border-senda-border dark:border-senda-darkborder shrink-0 whitespace-nowrap">
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

        <div className="space-y-3">
          {paginatedAlerts.map((alert) => {
            const isHigh = alert.priority === 'HIGH';
            const isMedium = alert.priority === 'MEDIUM';

            const borderLeftColor = isHigh
              ? 'border-l-rose-500 dark:border-l-rose-400'
              : isMedium
                ? 'border-l-amber-500 dark:border-l-amber-400'
                : 'border-l-blue-500 dark:border-l-blue-400';

            const badgeStyle = isHigh
              ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900'
              : isMedium
                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
                : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900';

            const dotColor = isHigh
              ? 'bg-rose-500'
              : isMedium
                ? 'bg-amber-500'
                : 'bg-blue-500';

            return (
              <div
                key={alert.id}
                className={`rounded-2xl border border-senda-border dark:border-senda-darkborder border-l-4 ${borderLeftColor} bg-senda-light/40 dark:bg-senda-dark/40 p-5 transition hover:bg-white dark:hover:bg-senda-dark hover:shadow-md`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-[#DCEBE1] dark:bg-senda-darkborder text-senda-primary dark:text-senda-accent">
                        {t(`${alert.type}_title`)}
                      </span>

                      {alert.participant_code && (
                        <span className="text-[11px] font-semibold text-[#6B6F66] dark:text-[#9AA093]">
                          {alert.participant_code}
                        </span>
                      )}

                      {alert.fitbit_code && (
                        <span className="text-[11px] text-[#6B6F66] dark:text-[#9AA093]">
                          · {alert.fitbit_code}
                        </span>
                      )}
                    </div>

                    <p className="text-xs font-bold text-senda-main dark:text-white">
                      {t(`${alert.type}_msg`)}
                    </p>

                    <div className="text-[10px] text-[#6B6F66] dark:text-[#9AA093] space-x-2 pt-1">
                      {alert.first_detected_at && (
                        <span>
                          <strong>Detectada:</strong> {new Date(alert.first_detected_at).toLocaleString('es-ES')}
                        </span>
                      )}
                      {alert.resolved && alert.resolved_at && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          · <strong>Resuelta:</strong> {new Date(alert.resolved_at).toLocaleString('es-ES')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border shadow-sm ${badgeStyle}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`}></span>
                      {alert.priority}
                    </span>

                    {!alert.resolved ? (
                      <button
                        onClick={() => handleResolve(alert.id)}
                        className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-4 py-2 text-xs font-semibold text-senda-main dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 dark:hover:text-emerald-300 hover:border-emerald-200 transition shadow-sm cursor-pointer"
                      >
                        {t('Resolve')}
                      </button>
                    ) : (
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1.5 rounded-xl border border-emerald-100 dark:border-emerald-900">
                        {t('Resolved')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />

        {filtered.length === 0 && !error && (
          <p className="py-12 text-center text-xs text-slate-400">{t('No Alerts')}</p>
        )}
        {error && (
          <p className="py-12 text-center text-xs text-red-500">{error}</p>
        )}
      </div>
    </div>
  );
};

export default Alerts;