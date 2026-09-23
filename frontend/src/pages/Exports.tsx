import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '../components/CustomSelect';
import { Pagination } from '../components/Pagination';
import { SectionHeader } from '../components/SectionHeader';
import { API_URL } from '../config';

type ExportLog = {
  id: string;
  type: string;
  label: string;
  format: string;
  dateStr: string;
  timeStr: string;
};

interface ExportsProps {
  userEmail: string;
  onNavigate?: (view: string) => void;
}

const Exports: React.FC<ExportsProps> = ({ onNavigate, userEmail }) => {
  const { t } = useTranslation();
  const storageKey = userEmail ? `export_history_${userEmail}` : 'export_history_guest';
  const settingsKey = userEmail ? `export_max_logs_${userEmail}` : 'export_max_logs_guest';

  const [pageSize, setPageSize] = useState<number>(() => {
    const savedLimit = localStorage.getItem(settingsKey);
    return savedLimit ? Number(savedLimit) : 5;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [history, setHistory] = useState<ExportLog[]>(() => {
    const savedHistory = localStorage.getItem(storageKey);
    return savedHistory ? JSON.parse(savedHistory) : [];
  });

  const [selectedCard, setSelectedCard] = useState<{ type: string; label: string; format: string } | null>(null);
  const [filterValues, setFilterValues] = useState<{ [key: string]: string }>({});
  const [modalError, setModalError] = useState<string | null>(null);

  const [participantsList, setParticipantsList] = useState<{ participant_code: string }[]>([]);
  const [fitbitsList, setFitbitsList] = useState<{ fitbit_code: string }[]>([]);

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(history));
  }, [history, storageKey]);

  useEffect(() => {
    localStorage.setItem(settingsKey, pageSize.toString());
    setCurrentPage(1);
  }, [pageSize, settingsKey]);

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [pRes, fRes] = await Promise.all([
          fetch(`${API_URL}/api/participants/`, { credentials: 'include' }),
          fetch(`${API_URL}/api/fitbits/`, { credentials: 'include' })
        ]);

        if (pRes.ok) {
          const pData = await pRes.json();
          const pList = Array.isArray(pData) ? pData : pData.items || pData.participants || pData.results || [];
          setParticipantsList(pList);
        }

        if (fRes.ok) {
          const fData = await fRes.json();
          const fList = Array.isArray(fData) ? fData : fData.items || fData.fitbits || fData.results || [];
          setFitbitsList(fList);
        }
      } catch (err) {
        console.error('Error cargando catálogos para filtros de exportación', err);
      }
    };
    fetchDropdownData();
  }, []);

  const handleOpenModalOrDownload = (type: string, label: string, format: string) => {
    if (type === 'researchers') {
      const params = new URLSearchParams({ type, format });
      window.open(`${API_URL}/api/export/?${params.toString()}`, '_blank');

      const now = new Date();
      const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      setHistory((prev) => [{
        id: Math.random().toString(36).substring(2, 9),
        type, label, format: format.toUpperCase(), dateStr, timeStr,
      }, ...prev].slice(0, 25));
    } else {
      setSelectedCard({ type, label, format });
      setFilterValues({});
      setModalError(null);
    }
  };

  const executeDownload = async (type: string, label: string, format: string, filters: { [key: string]: string }) => {
    setModalError(null);

    const today = new Date();
    const currentYear = today.getFullYear();
    const todayStr = today.toISOString().split('T')[0];

    // Eliminar valores vacíos o 'ALL'
    const cleanedFilters: { [key: string]: string } = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'ALL' && value.trim() !== '') {
        cleanedFilters[key] = value.trim();
      }
    });

    const hasFilters = Object.keys(cleanedFilters).length > 0;

    // Validación de fechas y años futuros
    for (const [key, val] of Object.entries(cleanedFilters)) {
      if (!val) continue;

      const valStr = String(val).trim();
      const isDateField = key.includes('date') || key.includes('at') || key.includes('from') || key.includes('to');

      if (isDateField) {
        // Si contiene un año de 4 dígitos y es superior al actual
        const yearMatch = valStr.match(/^(\d{4})/);
        if (yearMatch) {
          const year = parseInt(yearMatch[1], 10);
          if (year > currentYear) {
            setModalError(t('El año seleccionado no puede ser posterior al actual.'));
            return;
          }
        }

        // Si es una fecha completa y es mayor a la de hoy
        if (/^\d{4}-\d{2}-\d{2}$/.test(valStr)) {
          if (valStr > todayStr) {
            setModalError(t("The date must not be later than today's date"));
            return;
          }
        }
      }
    }

    // Si no hay filtros, descargar todo sin verificación previa
    if (!hasFilters) {
      const downloadParams = new URLSearchParams({ type, format });
      window.open(`${API_URL}/api/export/?${downloadParams.toString()}`, '_blank');

      const now = new Date();
      setHistory((prev) => [{
        id: Math.random().toString(36).substring(2, 9),
        type,
        label,
        format: format.toUpperCase(),
        dateStr: now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        timeStr: now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      }, ...prev].slice(0, 25));
      setSelectedCard(null);
      return;
    }

    // Verificar si hay datos con los filtros aplicados
    const checkParams = new URLSearchParams({ type, format, check: 'true', ...cleanedFilters });

    try {
      const checkResponse = await fetch(`${API_URL}/api/export/?${checkParams.toString()}`, {
        credentials: 'include'
      });

      const contentType = checkResponse.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        setModalError(t('Error interno en el servidor.'));
        return;
      }

      const data = await checkResponse.json();

      if (!checkResponse.ok || !data.ok) {
        setModalError(data.error || t('There is no information for the selected filters'));
        return;
      }

      if (!data.has_data || data.count === 0) {
        setModalError(t('There is no information for the selected filters'));
        return;
      }

      const downloadParams = new URLSearchParams({ type, format, ...cleanedFilters });
      const downloadResponse = await fetch(`${API_URL}/api/export/?${downloadParams.toString()}`, {
        credentials: 'include'
      });

      if (!downloadResponse.ok) {
        const errContentType = downloadResponse.headers.get("content-type");
        if (errContentType && errContentType.includes("application/json")) {
          const errorData = await downloadResponse.json();
          setModalError(errorData.error || t('Error al descargar el archivo'));
        } else {
          setModalError(t('Error al descargar el archivo.'));
        }
        return;
      }

      const blob = await downloadResponse.blob();
      if (blob.size === 0) {
        setModalError(t('El archivo descargado está vacío'));
        return;
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const contentDisposition = downloadResponse.headers.get('Content-Disposition');
      let filename = `${type}.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="([^"]+)"/) || contentDisposition.match(/filename=([^;]+)/);
        if (match && match[1]) {
          filename = match[1].trim().replace(/['"]/g, '');
        }
      }

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 100);

      const now = new Date();
      setHistory((prev) => [{
        id: Math.random().toString(36).substring(2, 9),
        type,
        label,
        format: format.toUpperCase(),
        dateStr: now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        timeStr: now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      }, ...prev].slice(0, 25));
      setSelectedCard(null);

    } catch (error) {
      console.error('Error en la descarga:', error);
      setModalError(t('Error al conectar con el servidor.'));
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(storageKey);
  };

  const getCardIcon = (type: string) => {
    switch (type) {
      case 'participants': return <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
      case 'fitbits': return <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
      case 'assignments': return <svg className="h-6 w-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>;
      case 'syncs': return <svg className="h-6 w-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
      case 'alerts': return <svg className="h-6 w-6 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>;
      case 'researchers': return <svg className="h-6 w-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
      default: return null;
    }
  };

  const getTableIcon = (type: string) => {
    switch (type) {
      case 'participants': return <div className="h-7 w-7 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center"><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></div>;
      case 'fitbits': return <div className="h-7 w-7 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>;
      case 'assignments': return <div className="h-7 w-7 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center"><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg></div>;
      case 'syncs': return <div className="h-7 w-7 rounded-full bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center"><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></div>;
      case 'alerts': return <div className="h-7 w-7 rounded-full bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center"><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg></div>;
      case 'researchers': return <div className="h-7 w-7 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center"><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg></div>;
      default: return <div className="h-7 w-7 rounded-full bg-senda-light dark:bg-senda-input text-senda-main dark:text-slate-400 flex items-center justify-center"></div>;
    }
  };

  const totalPages = Math.ceil(history.length / pageSize) || 1;
  const paginatedHistory = history.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const pageSizeOptions = [
    { label: 5, value: 5 },
    { label: 10, value: 10 },
    { label: 15, value: 15 },
    { label: 20, value: 20 },
    { label: 25, value: 25 },
  ];

  return (
    <div className="w-full text-senda-main dark:text-senda-darktext space-y-8">
      <SectionHeader title={t('Exports Title')} subtitle={t('Exports Subtitle')} />

      <div className="rounded-2xl border border-[#95c9ab] dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/30 p-4 flex items-center gap-3">
        <div className="h-8 w-8 rounded-xl bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-xs text-blue-900 dark:text-blue-200">
          {t('Export Notice')}{' '}
          <span
            onClick={() => onNavigate && onNavigate('physiological')}
            className="font-bold underline cursor-pointer text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-blue-300 transition"
          >
            {t('Physiological Data Title')}
          </span>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: t('Participants Resource'), type: 'participants', description: t('Participants Desc') },
          { label: t('Fitbits Resource'), type: 'fitbits', description: t('Fitbits Desc') },
          { label: t('Assignments Resource'), type: 'assignments', description: t('Assigments Desc') },
          { label: t('Syncs Resource'), type: 'syncs', description: t('Syncs Desc') },
          { label: t('Alerts Resource'), type: 'alerts', description: t('Alerts Desc') },
          { label: t('Researchers Resource'), type: 'researchers', description: t('Researchers Desc') },
        ].map((item) => (
          <div key={item.type} className="rounded-3xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-card p-6 shadow-sm flex flex-col justify-between transition-colors duration-300">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-2xl bg-senda-light dark:bg-senda-input flex items-center justify-center border border-senda-border dark:border-senda-darkborder">
                  {getCardIcon(item.type)}
                </div>
                <h2 className="text-xs font-semibold tracking-wide text-senda-main dark:text-white">{item.label}</h2>
              </div>
              <p className="text-xs text-[#6B6F66] dark:text-[#9AA093] leading-relaxed mb-6">{item.description}</p>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleOpenModalOrDownload(item.type, item.label, 'csv')}
                className="w-full grid grid-cols-[1fr_auto_1fr] items-center px-4 py-3 text-[11px] bg-gradient-to-b from-[#4C7C63] to-[#1F3B2C] hover:from-[#537F69] hover:to-[#234030] text-white font-semibold rounded-full shadow-md transition cursor-pointer">
                <span></span>
                <span className="text-center">{t('Download CSV')}</span>
                <div className="flex justify-end">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleOpenModalOrDownload(item.type, item.label, 'xlsx')}
                className="w-full grid grid-cols-[1fr_auto_1fr] items-center px-4 py-3 text-[11px] font-semibold border border-senda-border dark:border-senda-darkborder bg-gradient-to-b from-white via-[#F4F4F0] to-[#E6E6DF] dark:from-[#22382D] dark:via-senda-input dark:to-[#122019] text-senda-main dark:text-slate-300 rounded-full shadow-md transition cursor-pointer"
              >
                <span></span>
                <span className="text-center">{t('Download Excel')}</span>
                <div className="flex justify-end">
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 rounded font-mono">.XLSX</span>
                </div>
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedCard && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-xl rounded-[28px] bg-senda-light dark:bg-senda-card p-7 shadow-[0_30px_60px_rgba(29,90,61,0.18)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.4)]">

            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#DCEBE1] opacity-70 blur-3xl dark:bg-[#163A29]/40" />
            <div className="pointer-events-none absolute -bottom-16 -left-12 h-40 w-40 rounded-full bg-[#E7F1E9] opacity-80 blur-3xl dark:bg-[#153426]/30" />

            <div className="relative">
              <div className="mb-6 flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DCEBE1] dark:bg-senda-darkborder text-senda-primary dark:text-senda-accent">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-senda-main dark:text-white flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
                      <span>{t('Modal Title')}</span>
                      <span className="text-senda-secondary dark:text-senda-accent font-semibold">{selectedCard.label}</span>
                    </h2>
                    <p className="text-xs text-[#6B6F66] dark:text-[#9AA093] mt-0.5">
                      {t('Modal Subtitle')}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedCard(null)}
                  aria-label={t('Close')}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-senda-input text-[#708077] dark:text-[#9AA093] border border-senda-border dark:border-senda-darkborder hover:text-senda-main dark:hover:text-white cursor-pointer transition"
                >
                  ✕
                </button>
              </div>

              {modalError && (
                <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-2">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{modalError}</span>
                </div>
              )}

              <div className="space-y-4 pr-1">
                {selectedCard.type === 'participants' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Select Participant Label')}</label>
                      <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark px-3 py-1.5 mt-1">
                        <CustomSelect
                          value={filterValues.participant_code || 'ALL'}
                          onChange={(val) => setFilterValues({ ...filterValues, participant_code: String(val) })}
                          options={[
                            { label: t('All participants'), value: 'ALL' },
                            ...participantsList.map((p) => ({ label: p.participant_code, value: p.participant_code }))
                          ]}
                          width="w-full"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Study Status')}</label>
                      <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark px-3 py-1.5 mt-1">
                        <CustomSelect
                          value={filterValues.study_status || 'ALL'}
                          onChange={(val) => setFilterValues({ ...filterValues, study_status: String(val) })}
                          options={[
                            { label: t('All status'), value: 'ALL' },
                            { label: t('Pending'), value: 'PENDING' },
                            { label: t('Active'), value: 'ACTIVE' },
                            { label: t('Completed'), value: 'COMPLETED' }
                          ]}
                          width="w-full"
                        />
                      </div>
                    </div>
                  </>
                )}

                {selectedCard.type === 'fitbits' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Select Fitbit Label')}</label>
                      <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark px-3 py-1.5 mt-1">
                        <CustomSelect
                          value={filterValues.fitbit_code || 'ALL'}
                          onChange={(val) => setFilterValues({ ...filterValues, fitbit_code: String(val) })}
                          options={[
                            { label: t('All Fitbits'), value: 'ALL' },
                            ...fitbitsList.map((f) => ({ label: f.fitbit_code, value: f.fitbit_code }))
                          ]}
                          width="w-full"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Operational Status')}</label>
                      <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark px-3 py-1.5 mt-1">
                        <CustomSelect
                          value={filterValues.status || 'ALL'}
                          onChange={(val) => setFilterValues({ ...filterValues, status: String(val) })}
                          options={[
                            { label: t('All status'), value: 'ALL' },
                            { label: t('Free'), value: 'FREE' },
                            { label: t('In Use'), value: 'IN_USE' },
                            { label: t('Maintenance'), value: 'MAINTENANCE' },
                            { label: t('Inactive'), value: 'INACTIVE' }
                          ]}
                          width="w-full"
                        />
                      </div>
                    </div>
                  </>
                )}

                {selectedCard.type === 'assignments' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Select Participant Label')}</label>
                      <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark px-3 py-1.5 mt-1">
                        <CustomSelect
                          value={filterValues.participant_code || 'ALL'}
                          onChange={(val) => setFilterValues({ ...filterValues, participant_code: String(val) })}
                          options={[
                            { label: t('All participants'), value: 'ALL' },
                            ...participantsList.map((p) => ({ label: p.participant_code, value: p.participant_code }))
                          ]}
                          width="w-full"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Select Fitbit Label')}</label>
                      <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark px-3 py-1.5 mt-1">
                        <CustomSelect
                          value={filterValues.fitbit_code || 'ALL'}
                          onChange={(val) => setFilterValues({ ...filterValues, fitbit_code: String(val) })}
                          options={[
                            { label: t('All Fitbits'), value: 'ALL' },
                            ...fitbitsList.map((f) => ({ label: f.fitbit_code, value: f.fitbit_code }))
                          ]}
                          width="w-full"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Start Date')}</label>
                        <input
                          type="date"
                          max={todayStr}
                          value={filterValues.start_date || ''}
                          onChange={(e) => setFilterValues({ ...filterValues, start_date: e.target.value })}
                          className="w-full rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-3.5 py-3 text-xs text-senda-main dark:text-white outline-none focus:border-senda-secondary"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Real End Date')}</label>
                        <input
                          type="date"
                          max={todayStr}
                          value={filterValues.end_date || ''}
                          onChange={(e) => setFilterValues({ ...filterValues, end_date: e.target.value })}
                          className="w-full rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-3.5 py-3 text-xs text-senda-main dark:text-white outline-none focus:border-senda-secondary"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Status assignment')}</label>
                      <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark px-3 py-1.5 mt-1">
                        <CustomSelect
                          value={filterValues.status || 'ALL'}
                          onChange={(val) => setFilterValues({ ...filterValues, status: String(val) })}
                          options={[
                            { label: t('All status'), value: 'ALL' },
                            { label: t('Pending'), value: 'PENDING' },
                            { label: t('Activa'), value: 'ACTIVE' },
                            { label: t('Completada'), value: 'COMPLETED' }
                          ]}
                          width="w-full"
                        />
                      </div>
                    </div>
                  </>
                )}

                {selectedCard.type === 'syncs' && (
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Synchronization date')}</label>
                    <input
                      type="date"
                      max={todayStr}
                      value={filterValues.sync_date || ''}
                      onChange={(e) => setFilterValues({ ...filterValues, sync_date: e.target.value })}
                      className="w-full rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-3.5 py-3 text-xs text-senda-main dark:text-white outline-none focus:border-senda-secondary"
                    />
                  </div>
                )}

                {selectedCard.type === 'alerts' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Alarm type')}</label>
                      <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark px-3 py-1.5 mt-1">
                        <CustomSelect
                          value={filterValues.alert_type || 'ALL'}
                          onChange={(val) => setFilterValues({ ...filterValues, alert_type: String(val) })}
                          options={[
                            { label: t('All alarm types'), value: 'ALL' },
                            { label: 'SYNC_ERROR', value: 'SYNC_ERROR' },
                            { label: 'NO_DATA_24H', value: 'NO_DATA_24H' },
                            { label: 'DEVICE_OFF', value: 'DEVICE_OFF' },
                            { label: 'LOW_BATTERY', value: 'LOW_BATTERY' },
                            { label: 'TOKEN_EXPIRED', value: 'TOKEN_EXPIRED' },
                            { label: 'DEVICE_UNLINKED', value: 'DEVICE_UNLINKED' },
                            { label: 'NO_RECORDS', value: 'NO_RECORDS' },
                            { label: 'HRV_UNAVAILABLE', value: 'HRV_UNAVAILABLE' },
                            { label: 'INSUFFICIENT_SLEEP', value: 'INSUFFICIENT_SLEEP' },
                            { label: 'INSUFFICIENT_USAGE', value: 'INSUFFICIENT_USAGE' }
                          ]}
                          width="w-full"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Priority')}</label>
                      <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark px-3 py-1.5 mt-1">
                        <CustomSelect
                          value={filterValues.priority || 'ALL'}
                          onChange={(val) => setFilterValues({ ...filterValues, priority: String(val) })}
                          options={[
                            { label: t('All priorities'), value: 'ALL' },
                            { label: t('High'), value: 'HIGH' },
                            { label: t('Medium'), value: 'MEDIUM' }
                          ]}
                          width="w-full"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Select Participant Label')}</label>
                        <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark px-3 py-1.5 mt-1">
                          <CustomSelect
                            value={filterValues.participant_code || 'ALL'}
                            onChange={(val) => setFilterValues({ ...filterValues, participant_code: String(val) })}
                            options={[
                              { label: t('All participants'), value: 'ALL' },
                              ...participantsList.map((p) => ({ label: p.participant_code, value: p.participant_code }))
                            ]}
                            width="w-full"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Select Fitbit Label')}</label>
                        <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark px-3 py-1.5 mt-1">
                          <CustomSelect
                            value={filterValues.fitbit_code || 'ALL'}
                            onChange={(val) => setFilterValues({ ...filterValues, fitbit_code: String(val) })}
                            options={[
                              { label: t('All Fitbits'), value: 'ALL' },
                              ...fitbitsList.map((f) => ({ label: f.fitbit_code, value: f.fitbit_code }))
                            ]}
                            width="w-full"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Detected')}</label>
                        <input
                          type="date"
                          max={todayStr}
                          value={filterValues.first_detected_at || ''}
                          onChange={(e) => setFilterValues({ ...filterValues, first_detected_at: e.target.value })}
                          className="w-full rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-3.5 py-3 text-xs text-senda-main dark:text-white outline-none focus:border-senda-secondary"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">{t('Resolved')}</label>
                        <input
                          type="date"
                          max={todayStr}
                          value={filterValues.resolved_at || ''}
                          onChange={(e) => setFilterValues({ ...filterValues, resolved_at: e.target.value })}
                          className="w-full rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-3.5 py-3 text-xs text-senda-main dark:text-white outline-none focus:border-senda-secondary"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-5 mt-5 border-t border-senda-border dark:border-senda-darkborder">
                <button
                  type="button"
                  onClick={() => setSelectedCard(null)}
                  className="rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-5 py-3 text-xs font-bold text-senda-main dark:text-slate-300 hover:bg-senda-light dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cleanedFilters: { [key: string]: string } = {};
                    Object.entries(filterValues).forEach(([k, v]) => {
                      if (v && v !== 'ALL') cleanedFilters[k] = v;
                    });
                    executeDownload(selectedCard.type, selectedCard.label, selectedCard.format, cleanedFilters);
                  }}
                  className="rounded-2xl bg-senda-primary hover:bg-[#184232] dark:bg-senda-accent dark:text-senda-dark dark:hover:bg-[#59a67e] px-5 py-3 text-xs font-bold text-white transition cursor-pointer shadow-md"
                >
                  {t('Download Filtered File')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* HISTORIAL DE DESCARGAS */}
      <div className="rounded-3xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-card p-6 shadow-xl transition-colors duration-300 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-senda-main dark:text-white">{t('Latest Downloads')}</h2>
              <p className="text-[11px] text-[#6B6F66] dark:text-[#9AA093]">{t('Logs History Desc', { count: pageSize })}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="rounded-xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-senda-input px-3 h-[37px] text-xs font-bold text-rose-500 dark:text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer shadow-sm flex items-center"
              >
                {t('Clear History')}
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

        {paginatedHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-senda-border dark:border-senda-darkborder text-[10px] font-bold tracking-wider text-[#6B6F66] dark:text-[#9AA093] uppercase">
                  <th className="pb-3 pl-2">{t('Resource')}</th>
                  <th className="pb-3">{t('Format')}</th>
                  <th className="pb-3">{t('Date and Time')}</th>
                  <th className="pb-3 pr-2 text-right">{t('Action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-senda-border dark:divide-senda-darkborder text-xs">
                {paginatedHistory.map((log) => (
                  <tr key={log.id} className="cursor-pointer transition-all duration-200 hover:bg-senda-light/80 dark:hover:bg-senda-dark/50 hover:shadow-[inset_3px_0_0_0_theme(colors.senda-primary)] dark:hover:shadow-[inset_3px_0_0_0_theme(colors.senda-accent)]">
                    <td className="py-3.5 pl-2 flex items-center gap-3">
                      {getTableIcon(log.type)}
                      <span className="font-semibold text-senda-main dark:text-slate-200 first-letter:uppercase lowercase">{log.label}</span>
                    </td>
                    <td className="py-3.5">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-extrabold ring-1 ring-inset ${log.format === 'XLSX'
                        ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-900'
                        : 'bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 ring-sky-200 dark:ring-sky-900'
                        }`}>
                        {log.format}
                      </span>
                    </td>
                    <td className="py-3.5 text-[#6B6F66] dark:text-[#9AA093] font-medium">
                      <span className="flex items-center gap-1.5">
                        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {log.dateStr} &nbsp;&nbsp;
                        <svg className="h-3.5 w-3.5 text-slate-400 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {log.timeStr}
                      </span>
                    </td>
                    <td className="py-3.5 pr-2 text-right">
                      <button
                        onClick={() => executeDownload(log.type, log.label, log.format.toLowerCase() === 'xlsx' ? 'xlsx' : 'csv', {})}
                        title="Volver a descargar"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input text-[#6B6F66] dark:text-slate-300 hover:bg-senda-light dark:hover:bg-slate-700 hover:text-senda-primary dark:hover:text-senda-accent transition shadow-sm cursor-pointer"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-xs text-slate-400">{t('No Downloads')}</p>
        )}

        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>
    </div>
  );
};

export default Exports;