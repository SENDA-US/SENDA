import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '../components/CustomSelect';
import { Pagination } from '../components/Pagination';
import { SectionHeader } from '../components/SectionHeader';
import { API_URL } from '../config';

type SyncLog = {
  id?: string;
  google_account_email?: string | null;
  google_account?: { email?: string } | string | null;
  email?: string | null;
  sync_date: string;
  result: string;
  downloaded_records: number;
};

const Syncs: React.FC = () => {
  const { t } = useTranslation();
  const [syncs, setSyncs] = useState<SyncLog[]>([]);
  const [metrics, setMetrics] = useState({ success: 0, error: 0, total: 0 });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'ERROR'>('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pageSize, setPageSize] = useState<number>(() => {
    const savedSize = localStorage.getItem('syncs_page_size');
    return savedSize ? Number(savedSize) : 10;
  });

  const [currentPage, setCurrentPage] = useState(1);

  const [sortField, setSortField] = useState<'date' | 'records'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const fetchSyncs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/synclogs/`, { credentials: 'include' });
      const data = await res.json();
      const items = data.items || [];
      setSyncs(items);
      setMetrics({
        success: items.filter((item: SyncLog) => item.result.toLowerCase().includes('success')).length,
        error: items.filter((item: SyncLog) => !item.result.toLowerCase().includes('success')).length,
        total: items.length,
      });
    } catch {
      setError(t('Error loading syncs'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSyncs();
  }, []);

  useEffect(() => {
    localStorage.setItem('syncs_page_size', pageSize.toString());
    setCurrentPage(1);
  }, [pageSize]);

  const clearHistory = async () => {
    if (!window.confirm(t('Clear history confirmation'))) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/clear/synclogs/`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setSyncs([]);
        setMetrics({ success: 0, error: 0, total: 0 });
        setCurrentPage(1);
      } else {
        setError(t('Clear history error'));
      }
    } catch {
      setError(t('Server connection error'));
    }
  };

  const getAccountEmail = (sync: SyncLog): string => {
    if (sync.google_account_email) return sync.google_account_email;
    if (typeof sync.google_account === 'string') return sync.google_account;
    if (sync.google_account && typeof sync.google_account === 'object' && sync.google_account.email) {
      return sync.google_account.email;
    }
    if (sync.email) return sync.email;
    return t('No account');
  };

  const handleSort = (field: 'date' | 'records') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  const filteredAndSorted = syncs
    .filter((sync) => {
      const email = getAccountEmail(sync);
      const isSuccess = sync.result.toLowerCase().includes('success');

      if (statusFilter === 'SUCCESS' && !isSuccess) return false;
      if (statusFilter === 'ERROR' && isSuccess) return false;

      return email.toLowerCase().includes(query.toLowerCase()) || sync.result.toLowerCase().includes(query.toLowerCase());
    })
    .sort((a, b) => {
      if (sortField === 'date') {
        const dateA = new Date(a.sync_date).getTime();
        const dateB = new Date(b.sync_date).getTime();
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      } else {
        return sortOrder === 'desc' ? b.downloaded_records - a.downloaded_records : a.downloaded_records - b.downloaded_records;
      }
    });

  const totalPages = Math.ceil(filteredAndSorted.length / pageSize) || 1;
  const paginatedSyncs = filteredAndSorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-senda-main dark:text-white" style={{ fontFamily: 'Fraunces, serif' }}>{t('Syncs Title')}</h1>
          <p className="mt-1 text-xs font-medium text-[#6B6F66] dark:text-[#9AA093]">{t('Syncs Subtitle')}</p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {syncs.length > 0 && (
            <button
              onClick={clearHistory}
              className="inline-flex items-center justify-center px-4 py-2.5 bg-white dark:bg-senda-input border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-2xl shadow-sm transition gap-2 cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>{t('Clear History Btn')}</span>
            </button>
          )}
          <button
            onClick={fetchSyncs}
            disabled={loading}
            className="inline-flex items-center justify-center px-4 py-2.5 bg-white dark:bg-senda-input border border-senda-border dark:border-senda-darkborder hover:bg-senda-light dark:hover:bg-slate-700 text-senda-main dark:text-slate-200 text-xs font-bold rounded-2xl shadow-sm transition gap-2 cursor-pointer disabled:opacity-50"
          >
            <svg className={`h-4 w-4 text-[#6B6F66] dark:text-[#9AA093] ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{loading ? t('Updating') : t('Update Data')}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="rounded-2xl sm:rounded-3xl border border-emerald-200/80 dark:border-emerald-900 bg-white dark:bg-senda-card p-3 sm:p-5 shadow-lg shadow-emerald-100/40 dark:shadow-none transition-all duration-200 text-center">
          <p className="text-[9px] sm:text-[11px] font-extrabold uppercase tracking-[0.08em] sm:tracking-[0.25em] text-emerald-600 dark:text-emerald-400 leading-tight">
            {t('Success Metric')}
          </p>
          <p className="mt-1 sm:mt-2 text-xl sm:text-3xl font-extrabold text-emerald-800 dark:text-emerald-300">
            {metrics.success}
          </p>
        </div>

        <div className="rounded-2xl sm:rounded-3xl border border-rose-200/80 dark:border-rose-900 bg-white dark:bg-senda-card p-3 sm:p-5 shadow-lg shadow-rose-100/40 dark:shadow-none transition-all duration-200 text-center">
          <p className="text-[9px] sm:text-[11px] font-extrabold uppercase tracking-[0.08em] sm:tracking-[0.25em] text-rose-600 dark:text-rose-400 leading-tight">
            {t('Error Metric')}
          </p>
          <p className="mt-1 sm:mt-2 text-xl sm:text-3xl font-extrabold text-rose-800 dark:text-rose-300">
            {metrics.error}
          </p>
        </div>

        <div className="rounded-2xl sm:rounded-3xl border border-blue-200/80 dark:border-blue-900 bg-white dark:bg-senda-card p-3 sm:p-5 shadow-lg shadow-blue-100/40 dark:shadow-none transition-all duration-200 text-center">
          <p className="text-[9px] sm:text-[11px] font-extrabold uppercase tracking-[0.08em] sm:tracking-[0.25em] text-blue-600 dark:text-blue-400 leading-tight">
            {t('Total Metric')}
          </p>
          <p className="mt-1 sm:mt-2 text-xl sm:text-3xl font-extrabold text-blue-800 dark:text-blue-300">
            {metrics.total}
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-card p-6 shadow-xl space-y-6 transition-colors duration-300">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-1.5 bg-senda-light dark:bg-senda-input p-1 rounded-xl border border-senda-border dark:border-senda-darkborder">
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
              onClick={() => { setStatusFilter('SUCCESS'); setCurrentPage(1); }}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${statusFilter === 'SUCCESS'
                  ? 'bg-white dark:bg-senda-darkborder text-emerald-700 dark:text-emerald-300 shadow-sm'
                  : 'text-[#6B6F66] dark:text-[#9AA093] hover:text-senda-main dark:hover:text-white'
                }`}
            >
              {t('Successes')}
            </button>
            <button
              onClick={() => { setStatusFilter('ERROR'); setCurrentPage(1); }}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${statusFilter === 'ERROR'
                  ? 'bg-white dark:bg-senda-darkborder text-rose-700 dark:text-rose-300 shadow-sm'
                  : 'text-[#6B6F66] dark:text-[#9AA093] hover:text-senda-main dark:hover:text-white'
                }`}
            >
              {t('Errors')}
            </button>
          </div>
        </div>

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
              placeholder={t('Search Sync')}
              className="w-full rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/60 dark:bg-senda-dark h-[37px] pl-11 pr-4 text-xs text-senda-main dark:text-white outline-none transition focus:border-senda-secondary"
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
                  <th className="w-[20%] px-6 py-3.5 font-bold rounded-l-2xl">{t('Sync ID')}</th>
                  <th className="w-[30%] px-6 py-3.5 font-bold">{t('Account')}</th>
                  <th
                    className="w-[25%] px-6 py-3.5 font-bold cursor-pointer select-none hover:text-senda-primary dark:hover:text-senda-accent transition"
                    onClick={() => handleSort('date')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t('Start')}</span>
                      <svg className={`h-3.5 w-3.5 transition-transform ${sortField === 'date' && sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </th>
                  <th className="w-[15%] px-6 py-3.5 font-bold">{t('Result')}</th>
                  <th
                    className="w-[10%] px-6 py-3.5 font-bold rounded-r-2xl cursor-pointer select-none hover:text-senda-primary dark:hover:text-senda-accent transition"
                    onClick={() => handleSort('records')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t('Records Count')}</span>
                      <svg className={`h-3.5 w-3.5 transition-transform ${sortField === 'records' && sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-senda-border dark:divide-senda-darkborder">
                {paginatedSyncs.map((sync, index) => {
                  const isSuccess = sync.result.toLowerCase().includes('success');
                  const shortId = sync.id ? `SYNC_${sync.id.substring(0, 6).toUpperCase()}` : `SYNC_${index + 1}`;
                  const accountEmail = getAccountEmail(sync);

                  return (
                    <tr key={sync.id || index} className="cursor-pointer transition-all duration-200 hover:bg-senda-light/80 dark:hover:bg-senda-dark/50 hover:shadow-[inset_3px_0_0_0_theme(colors.senda-primary)] dark:hover:shadow-[inset_3px_0_0_0_theme(colors.senda-accent)]">
                      <td className="px-6 py-4 text-xs font-mono text-[#6B6F66] dark:text-[#9AA093] font-semibold">{shortId}</td>
                      <td className="px-6 py-4 text-xs font-semibold text-senda-main dark:text-slate-200 truncate" title={accountEmail}>{accountEmail}</td>
                      <td className="px-6 py-4 text-xs text-[#6B6F66] dark:text-[#9AA093]">{new Date(sync.sync_date).toLocaleString('es-ES')}</td>
                      <td className="px-6 py-4 text-xs">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-semibold border ${isSuccess
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
                            : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900'
                          }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${isSuccess ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                          {sync.result}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-senda-main dark:text-white">{sync.downloaded_records}</td>
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

        {paginatedSyncs.length === 0 && !error && (
          <p className="py-12 text-center text-xs text-slate-400">{t('No Syncs')}</p>
        )}
        {error && (
          <p className="py-12 text-center text-xs text-red-500">{error}</p>
        )}
      </div>
    </div>
  );
};

export default Syncs;