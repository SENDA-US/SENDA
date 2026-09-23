import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '../components/CustomSelect';
import { Pagination } from '../components/Pagination';
import { SectionHeader } from '../components/SectionHeader';
import { API_URL } from '../config';

type PhysiologicalDataItem = {
  participant_code: string;
  fitbit_code: string;
  variable_type: string;
  physical_time: string;
  metric_value: number;
};

const VARIABLE_OPTIONS = [
  'SLEEP_DURATION', 'SLEEP_LIGHT', 'SLEEP_DEEP', 'SLEEP_REM',
  'SLEEP_AWAKE', 'SLEEP_START', 'SLEEP_END', 'SLEEP_MINUTES_TO_FALL_ASLEEP',
  'SLEEP_MINUTES_ASLEEP', 'SLEEP_AFTER_WAKE_UP',
  'RESPIRATORY_RATE_NOCTURNAL', 'RESPIRATORY_RATE_LIGHT',
  'RESPIRATORY_RATE_DEEP', 'RESPIRATORY_RATE_REM',
  'HEART_RATE', 'HEART_RATE_RESTING', 'HRV_AVERAGE_MS', 'HRV_RMSSD',
  'HRV_NON_REM_HR', 'HRV_ENTROPY',
  'HR_ZONE_FAT_BURN', 'HR_ZONE_CARDIO', 'HR_ZONE_PEAK',
  'ACTIVE_ZONE_MINUTES', 'STEPS', 'DISTANCE'
];

const CustomMultiSearchableSelect: React.FC<{
  label: string;
  selectedValues: string[];
  onChange: (vals: string[]) => void;
  options: string[];
  placeholder?: string;
}> = ({ label, selectedValues, onChange, options, placeholder = "Buscar..." }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  const toggleOption = (opt: string) => {
    if (selectedValues.includes(opt)) {
      onChange(selectedValues.filter(v => v !== opt));
    } else {
      onChange([...selectedValues, opt]);
    }
  };

  const getDisplayText = () => {
    if (selectedValues.length === 0) return `${t('All')} ${label.toLowerCase()}`;
    if (selectedValues.length === 1) return selectedValues[0];
    return `${selectedValues.length} ${label.toLowerCase()} ${t('Selected plural')}`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B6F66] dark:text-[#9AA093] mb-1.5">{label}</label>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/60 dark:bg-senda-dark/80 px-4 py-3 text-xs font-semibold text-senda-main dark:text-white cursor-pointer transition hover:border-senda-secondary hover:bg-white dark:hover:bg-senda-dark"
      >
        <span className="truncate">{getDisplayText()}</span>
        <div className="flex items-center gap-1.5 text-slate-400">
          {selectedValues.length > 0 && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="hover:text-senda-main dark:hover:text-slate-200 p-0.5 rounded-full"
              title={t('Clear selection')}
            >
              ✕
            </span>
          )}
          <svg className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-2 rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-card p-3 shadow-2xl">
          <div className="relative mb-2">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="search"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-xl border border-senda-border dark:border-senda-darkborder bg-senda-light/60 dark:bg-senda-dark py-2 pl-9 pr-3 text-xs text-senda-main dark:text-white outline-none focus:border-senda-secondary"
            />
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1">
            <div
              onClick={() => onChange([])}
              className={`cursor-pointer rounded-xl px-3 py-2 text-xs font-semibold transition ${selectedValues.length === 0 ? 'bg-[#DCEBE1] dark:bg-senda-darkborder text-senda-primary dark:text-senda-accent' : 'text-[#6B6F66] dark:text-slate-300 hover:bg-senda-light dark:hover:bg-senda-dark'}`}
            >
              {t('All (Clear selection)')}
            </div>
            {filtered.map(opt => {
              const isSelected = selectedValues.includes(opt);
              return (
                <div
                  key={opt}
                  onClick={() => toggleOption(opt)}
                  className={`flex items-center justify-between cursor-pointer rounded-xl px-3 py-2 text-xs font-semibold transition ${isSelected ? 'bg-[#DCEBE1] dark:bg-senda-darkborder text-senda-primary dark:text-senda-accent' : 'text-[#6B6F66] dark:text-slate-300 hover:bg-senda-light dark:hover:bg-senda-dark'}`}
                >
                  <span className="truncate mr-2">{opt}</span>
                  <div className={`h-4 w-4 rounded-md border flex items-center justify-center transition ${isSelected ? 'bg-senda-primary border-senda-primary dark:bg-senda-accent dark:border-senda-accent text-white dark:text-senda-dark' : 'border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark'}`}>
                    {isSelected && (
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-400">{t('No results found')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const PhysiologicalData: React.FC = () => {
  const { t } = useTranslation();
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [selectedFitbits, setSelectedFitbits] = useState<string[]>([]);
  const [selectedVariables, setSelectedVariables] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');

  const [data, setData] = useState<PhysiologicalDataItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [pageSize, setPageSize] = useState<number>(() => {
    const savedSize = localStorage.getItem('physiological_page_size');
    return savedSize ? Number(savedSize) : 10;
  });
  const [currentPage, setCurrentPage] = useState(1);

  const [sortOrderDate, setSortOrderDate] = useState<'desc' | 'asc'>('desc');
  const [sortOrderValue, setSortOrderValue] = useState<'desc' | 'asc'>('desc');

  const [participantsList, setParticipantsList] = useState<string[]>([]);
  const [fitbitsList, setFitbitsList] = useState<string[]>([]);
  const [participantsStatusMap, setParticipantsStatusMap] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/participants/`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${API_URL}/api/fitbits/list/`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${API_URL}/api/physiological-data/`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${API_URL}/api/assignments/`, { credentials: 'include' }).then(r => r.json())
    ])
      .then(([partData, fitData, physData, assignData]) => {
        const itemsPart = partData.items || partData || [];
        setParticipantsList(itemsPart.map((p: any) => p.participant_code));
        setFitbitsList(fitData.items || []);

        const statusMap: Record<string, string> = {};
        const assignments = assignData.items || assignData || [];

        itemsPart.forEach((p: any) => {
          const assign = assignments.find((a: any) => {
            const aCode = typeof a.participant === 'string'
              ? a.participant
              : a.participant?.participant_code || a.participant_code;
            return aCode === p.participant_code;
          });

          if (!assign) {
            statusMap[p.participant_code] = 'PENDING';
          } else if (assign.real_end_date && new Date(assign.real_end_date) <= new Date()) {
            statusMap[p.participant_code] = 'COMPLETED';
          } else {
            statusMap[p.participant_code] = 'ACTIVE';
          }
        });
        setParticipantsStatusMap(statusMap);
      })
      .catch((err) => console.error("Error cargando metadatos", err));
  }, []);

  useEffect(() => {
    localStorage.setItem('physiological_page_size', pageSize.toString());
    setCurrentPage(1);
  }, [pageSize]);

  const loadData = () => {
    setError(null);
    const params = new URLSearchParams();
    if (selectedParticipants.length > 0) params.append('participant', selectedParticipants.join(','));
    if (selectedFitbits.length > 0) params.append('fitbit', selectedFitbits.join(','));
    if (selectedVariables.length > 0) params.append('variable_type', selectedVariables.join(','));
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (statusFilter && statusFilter !== 'ALL') params.append('status', statusFilter);

    fetch(`${API_URL}/api/physiological-data/?${params.toString()}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((result) => {
        setData(result.items || []);
        setCurrentPage(1);
      })
      .catch(() => setError(t('Error loading physiological data')));
  };

  useEffect(() => {
    loadData();
  }, [selectedParticipants, selectedFitbits, selectedVariables, from, to, statusFilter]);

  const filteredDataByStatus = data.filter((item) => {
    const pStatus = participantsStatusMap[item.participant_code] || 'ACTIVE';
    if (statusFilter === 'ALL') return true;
    return pStatus === statusFilter;
  });

  const totalPages = Math.ceil(filteredDataByStatus.length / pageSize) || 1;
  const paginatedData = filteredDataByStatus.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const pageSizeOptions = [
    { label: 5, value: 5 },
    { label: 10, value: 10 },
    { label: 15, value: 15 },
    { label: 20, value: 20 },
    { label: 25, value: 25 },
  ];

  const clearFilters = () => {
    setSelectedParticipants([]);
    setSelectedFitbits([]);
    setSelectedVariables([]);
    setFrom('');
    setTo('');
    setStatusFilter('ALL');
    setSortOrderDate('desc');
    setSortOrderValue('desc');
    setCurrentPage(1);
  };

  const handleExport = (format: 'csv' | 'xlsx') => {
    const params = new URLSearchParams();
    params.append('type', 'physiological');
    params.append('format', format);
    if (selectedParticipants.length > 0) params.append('participant', selectedParticipants.join(','));
    if (selectedFitbits.length > 0) params.append('fitbit', selectedFitbits.join(','));
    if (selectedVariables.length > 0) params.append('variable_type', selectedVariables.join(','));
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (statusFilter && statusFilter !== 'ALL') params.append('status', statusFilter);

    window.open(`${API_URL}/api/export/physiological/data/?${params.toString()}`, '_blank');
  };

  const toggleSortOrderDate = () => {
    const newOrder = sortOrderDate === 'desc' ? 'asc' : 'desc';
    setSortOrderDate(newOrder);

    const sortedData = [...data].sort((a, b) => {
      const dateA = new Date(a.physical_time).getTime();
      const dateB = new Date(b.physical_time).getTime();
      return newOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
    setData(sortedData);
  };

  const toggleSortOrderValue = () => {
    const newOrder = sortOrderValue === 'desc' ? 'asc' : 'desc';
    setSortOrderValue(newOrder);

    const sortedData = [...data].sort((a, b) => {
      return newOrder === 'desc' ? b.metric_value - a.metric_value : a.metric_value - b.metric_value;
    });
    setData(sortedData);
  };

  return (
    <div className="w-full text-senda-main dark:text-senda-darktext space-y-8">
      <SectionHeader
        title={t('Physiological Data Title')}
        subtitle={t('Physiological Subtitle')}
      />

      <div className="flex items-center gap-1.5 bg-senda-light dark:bg-senda-card p-1 rounded-xl w-fit border border-senda-border dark:border-senda-darkborder">
        <button
          onClick={() => { setStatusFilter('ALL'); setCurrentPage(1); }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${statusFilter === 'ALL'
            ? 'bg-white dark:bg-senda-darkborder text-senda-main dark:text-white shadow-sm'
            : 'text-[#6B6F66] dark:text-[#9AA093] hover:text-senda-main dark:hover:text-white'
            }`}
        >
          {t('All')}
        </button>
        <button
          onClick={() => { setStatusFilter('ACTIVE'); setCurrentPage(1); }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${statusFilter === 'ACTIVE'
            ? 'bg-white dark:bg-senda-darkborder text-senda-main dark:text-white shadow-sm'
            : 'text-[#6B6F66] dark:text-[#9AA093] hover:text-senda-main dark:hover:text-white'
            }`}
        >
          {t('Active')}
        </button>
        <button
          onClick={() => { setStatusFilter('COMPLETED'); setCurrentPage(1); }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${statusFilter === 'COMPLETED'
            ? 'bg-white dark:bg-senda-darkborder text-senda-main dark:text-white shadow-sm'
            : 'text-[#6B6F66] dark:text-[#9AA093] hover:text-senda-main dark:hover:text-white'
            }`}
        >
          {t('Completed')}
        </button>
      </div>

      <div className="rounded-3xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-card p-4 sm:p-8 shadow-xl transition-colors duration-300">
        {/* Cabecera: botones de exportación + limpiar filtros */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => handleExport('csv')}
            className="px-3 sm:px-4 py-2 sm:py-3 text-[11px] bg-gradient-to-b from-[#4C7C63] to-[#1F3B2C] hover:from-[#537F69] hover:to-[#234030] text-white dark:from-white dark:via-[#F4F4F0] dark:to-[#E6E6DF] dark:text-senda-main font-semibold rounded-full shadow-md transition cursor-pointer whitespace-nowrap"
          >
            {t('Export CSV')}
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            className="px-3 sm:px-4 py-2 sm:py-3 text-[11px] bg-gradient-to-b from-[#4C7C63] to-[#1F3B2C] hover:from-[#537F69] hover:to-[#234030] text-white dark:from-white dark:via-[#F4F4F0] dark:to-[#E6E6DF] dark:text-senda-main font-semibold rounded-full shadow-md transition cursor-pointer whitespace-nowrap"
          >
            {t('Export Excel')}
          </button>
          <button
            onClick={clearFilters}
            className="ml-auto rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-3 py-2 text-[11px] font-bold text-rose-500 dark:text-rose-400 transition hover:bg-rose-500 hover:text-white cursor-pointer shadow-sm whitespace-nowrap"
          >
            {t('Clear Filters')}
          </button>
        </div>

        <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-senda-border dark:border-senda-darkborder grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-1">
            <CustomMultiSearchableSelect
              label={t('Participants Resource')}
              selectedValues={selectedParticipants}
              onChange={setSelectedParticipants}
              options={participantsList}
              placeholder={t('Search Participant')}
            />
          </div>

          <div className="col-span-2 sm:col-span-1">
            <CustomMultiSearchableSelect
              label={t('Fitbit')}
              selectedValues={selectedFitbits}
              onChange={setSelectedFitbits}
              options={fitbitsList}
              placeholder={t('Search Fitbit')}
            />
          </div>

          <div className="col-span-2 sm:col-span-1">
            <CustomMultiSearchableSelect
              label={t('Variable')}
              selectedValues={selectedVariables}
              onChange={setSelectedVariables}
              options={VARIABLE_OPTIONS}
              placeholder={t('Search Variable')}
            />
          </div>

          <div className="col-span-1">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B6F66] dark:text-[#9AA093] mb-1.5">{t('From')}</label>
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full h-[42px] rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/60 dark:bg-senda-dark px-2 sm:px-4 text-xs text-senda-main dark:text-white outline-none transition focus:border-senda-secondary [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>

          <div className="col-span-1">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B6F66] dark:text-[#9AA093] mb-1.5">{t('To')}</label>
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full h-[42px] rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/60 dark:bg-senda-dark px-2 sm:px-4 text-xs text-senda-main dark:text-white outline-none transition focus:border-senda-secondary [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-card p-6 shadow-xl transition-colors duration-300 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <p className="text-xs font-bold uppercase tracking-wider text-senda-main dark:text-slate-300">{t('Detailed Records')}</p>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900">
              {t('Showing Filtered Records', { count: paginatedData.length, total: filteredDataByStatus.length })}
            </span>

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
                  <th className="w-[18%] px-6 py-3.5 font-bold rounded-l-2xl">{t('Participants Resource')}</th>
                  <th className="w-[17%] px-6 py-3.5 font-bold">{t('Status')}</th>
                  <th className="w-[18%] px-6 py-3.5 font-bold">{t('Fitbit')}</th>
                  <th className="w-[18%] px-6 py-3.5 font-bold">{t('Variable')}</th>
                  <th className="w-[15%] px-6 py-3.5 font-bold cursor-pointer select-none hover:text-senda-primary dark:hover:text-senda-accent transition" onClick={toggleSortOrderDate}>
                    <div className="flex items-center gap-1.5">
                      <span>{t('Time')}</span>
                    </div>
                  </th>
                  <th className="w-[14%] px-6 py-3.5 font-bold cursor-pointer select-none hover:text-senda-primary dark:hover:text-senda-accent transition rounded-r-2xl" onClick={toggleSortOrderValue}>
                    <div className="flex items-center gap-1.5">
                      <span>{t('Value')}</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-senda-border dark:divide-senda-darkborder">
                {paginatedData.map((item, index) => {
                  const status = participantsStatusMap[item.participant_code] || 'ACTIVE';
                  return (
                    <tr key={`${item.participant_code}-${index}`} className="cursor-pointer transition-all duration-200 hover:bg-senda-light/80 dark:hover:bg-senda-dark/50 hover:shadow-[inset_3px_0_0_0_theme(colors.senda-primary)] dark:hover:shadow-[inset_3px_0_0_0_theme(colors.senda-accent)]">
                      <td className="px-6 py-4 text-xs font-bold text-senda-main dark:text-white">{item.participant_code}</td>
                      <td className="px-6 py-4 text-xs">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-[10px] font-bold ${status === 'COMPLETED'
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-900'
                          : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900'
                          }`}>
                          {status === 'COMPLETED' ? t('Completed') : t('Active')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-blue-600 dark:text-blue-400">{item.fitbit_code}</td>
                      <td className="px-6 py-4 text-xs">
                        <span className="inline-flex items-center px-3 py-1 rounded-xl text-[11px] font-semibold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-100 dark:border-sky-900">
                          {item.variable_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-[#6B6F66] dark:text-[#9AA093]">{new Date(item.physical_time).toLocaleString('es-ES')}</td>
                      <td className="px-6 py-4 text-xs font-bold text-senda-main dark:text-white">
                        {item.metric_value !== null && item.metric_value !== undefined ? (() => {
                          const v = item.variable_type;
                          const val = item.metric_value;

                          if (v.startsWith('SLEEP_') && v !== 'SLEEP_START' && v !== 'SLEEP_END') return `${val} ${t('unit_min')}`;
                          if (v.includes('ZONE') || v === 'ACTIVE_ZONE_MINUTES') return `${val} ${t('unit_min')}`;
                          if (v === 'HEART_RATE' || v === 'HEART_RATE_RESTING' || v === 'HRV_NON_REM_HR') return `${val} ${t('unit_bpm')}`;
                          if (v.startsWith('RESPIRATORY_RATE_')) return `${val} ${t('unit_resp')}`;
                          if (v === 'HRV_AVERAGE_MS' || v === 'HRV_RMSSD') return `${val} ${t('unit_ms')}`;
                          if (v === 'HRV_ENTROPY') return `${val}`;
                          if (v === 'DISTANCE') return `${Number(val).toFixed(4)} ${t('unit_km')}`;
                          if (v === 'STEPS') return `${val} ${t('unit_steps')}`;

                          return val;
                        })() : '-'}
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

        {filteredDataByStatus.length === 0 && !error && (
          <p className="py-12 text-center text-xs text-slate-400">{t('No Physiological Data')}</p>
        )}
        {error && (
          <p className="py-12 text-center text-xs text-red-500">{error}</p>
        )}
      </div>
    </div>
  );
};

export default PhysiologicalData;