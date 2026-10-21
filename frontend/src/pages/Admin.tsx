import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '../components/CustomSelect';
import { Pagination } from '../components/Pagination';
import { SectionHeader } from '../components/SectionHeader';
import { API_URL } from '../config';

type Researcher = {
  email: string;
  created_at: string;
  is_active: boolean;
};

const Admin: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pageSize, setPageSize] = useState<number>(() => {
    const savedSize = localStorage.getItem('admin_page_size');
    return savedSize ? Number(savedSize) : 10;
  });
  const [currentPage, setCurrentPage] = useState(1);

  const loadResearchers = () => {
    fetch(`${API_URL}/api/admin/researchers/`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setResearchers(data.items || []))
      .catch(() => setError(t('Error loading researchers')));
  };

  useEffect(() => {
    loadResearchers();
  }, []);

  useEffect(() => {
    localStorage.setItem('admin_page_size', pageSize.toString());
    setCurrentPage(1);
  }, [pageSize]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/admin/researchers/create/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || t('Create researcher error'));
        return;
      }
      setMessage(`${t('Email sent to researcher')} ${data.email} ${t('pending acceptance')}.`);
      setResearchers((prev) => [{ email: data.email, created_at: new Date().toISOString(), is_active: false }, ...prev]);
      setEmail('');
    } catch {
      setError(t('Server connection error'));
    }
  };

  const deleteResearcher = async (researcherEmail: string) => {
    if (!window.confirm(`${t('Delete researcher confirmation')} ${researcherEmail}?`)) {
      return;
    }

    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/admin/researchers/delete/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: researcherEmail }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || t('Delete researcher error'));
        return;
      }
      setMessage(`${t('Researcher deleted successfully')}: ${researcherEmail}`);
      setResearchers((prev) => prev.filter((r) => r.email !== researcherEmail));
    } catch {
      setError(t('Server connection error'));
    }
  };

  const filtered = researchers.filter((r) => {
    const searchLower = query.toLowerCase();
    const emailMatch = r.email.toLowerCase().includes(searchLower);
    const statusText = r.is_active ? t('Active').toLowerCase() : t('Pending').toLowerCase();
    const statusMatch = statusText.includes(searchLower);
    return emailMatch || statusMatch;
  });

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginatedResearchers = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const pageSizeOptions = [
    { label: 5, value: 5 },
    { label: 10, value: 10 },
    { label: 15, value: 15 },
    { label: 20, value: 20 },
    { label: 25, value: 25 },
  ];

  return (
    <div className="w-full text-senda-main dark:text-senda-darktext space-y-8">
      <SectionHeader
        title={t('Admin Title')}
        subtitle={t('Admin Subtitle')}
      />

      <div id="researcher-form-card" className="rounded-3xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-card p-8 shadow-xl transition-colors duration-300">
        <form onSubmit={submit} autoComplete="off">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B6F66] dark:text-[#9AA093] mb-1.5">
            {t('Researcher Email Input')}
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-xl">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-slate-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="investigador@senda.es"
                required
                autoComplete="off"
                className="w-full rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/60 dark:bg-senda-dark h-[46px] pl-11 pr-4 text-xs text-senda-main dark:text-white outline-none transition focus:border-senda-secondary"
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center px-5 py-2.5 bg-gradient-to-b from-[#4C7C63] to-[#1F3B2C] hover:from-[#537F69] hover:to-[#234030] text-white font-semibold rounded-full shadow-md transition gap-2 cursor-pointer shrink-0"
            >
              <span className="text-base font-bold leading-none">+</span>
              <span className="text-xs">{t('Authorize Btn')}</span>
            </button>
          </div>
        </form>

        {message && <p className="mt-4 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 p-4 rounded-2xl shadow-sm">{message}</p>}
        {error && <p className="mt-4 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 p-4 rounded-2xl shadow-sm">{error}</p>}
      </div>

      <div className="rounded-3xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-card p-6 shadow-xl transition-colors duration-300 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-wider text-senda-main dark:text-slate-300">{t('Authorized Researchers')}</p>
            <span className="inline-flex items-right px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900">
              {filtered.length} {t('Accounts Registered')}
            </span>
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
              placeholder={t('Search Researcher')}
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
                  <th className="w-[40%] px-6 py-3.5 font-bold rounded-l-2xl">{t('Email')}</th>
                  <th className="w-[30%] px-6 py-3.5 font-bold">{t('Created')}</th>
                  <th className="w-[15%] px-6 py-3.5 font-bold">{t('Status')}</th>
                  <th className="w-[15%] px-6 py-3.5 font-bold rounded-r-2xl text-right">{t('Action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-senda-border dark:divide-senda-darkborder">
                {paginatedResearchers.map((r) => (
                  <tr key={r.email} className="cursor-pointer transition-all duration-200 hover:bg-senda-light/80 dark:hover:bg-senda-dark/50 hover:shadow-[inset_3px_0_0_0_theme(colors.senda-primary)] dark:hover:shadow-[inset_3px_0_0_0_theme(colors.senda-accent)]">
                    <td className="px-6 py-4 text-xs font-bold text-senda-main dark:text-white">{r.email}</td>
                    <td className="px-6 py-4 text-xs text-[#6B6F66] dark:text-[#9AA093]">{new Date(r.created_at).toLocaleDateString('es-ES')}</td>
                    <td className="px-6 py-4 text-xs">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-semibold border ${r.is_active
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
                        : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
                        }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${r.is_active ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                        {r.is_active ? t('Active') : t('Pending')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-right">
                      <button
                        type="button"
                        onClick={() => deleteResearcher(r.email)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-senda-input text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-700 dark:hover:text-rose-300 transition shadow-sm cursor-pointer"
                        title={t('Delete Researcher')}
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
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
          <p className="py-12 text-center text-xs text-slate-400">{t('No Researchers')}</p>
        )}
      </div>
    </div>
  );
};

export default Admin;