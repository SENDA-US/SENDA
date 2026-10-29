import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '../components/CustomSelect';
import { Pagination } from '../components/Pagination';
import { SectionHeader } from '../components/SectionHeader';
import ReactDOM from 'react-dom';
import { API_URL } from '../config';

type AssignmentItem = {
  id?: string | number;
  participant?: { participant_code?: string } | string | null;
  participant_code?: string | null;
  fitbit?: { fitbit_code?: string } | string | null;
  fitbit_code?: string | null;
  start_date: string;
  estimated_end_date?: string;
  real_end_date?: string | null;
  status: string;
};

type SortField = 'participant' | 'fitbit' | 'start_date' | 'estimated_end_date' | 'real_end_date' | 'status';
type SortDirection = 'asc' | 'desc';

const Assignments: React.FC = () => {
  const { t } = useTranslation();
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [participantsList, setParticipantsList] = useState<string[]>([]);
  const [fitbitsList, setFitbitsList] = useState<string[]>([]);

  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const [sortField, setSortField] = useState<SortField>('participant');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentItem | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editParticipantCode, setEditParticipantCode] = useState('');
  const [editFitbitCode, setEditFitbitCode] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEstimatedEndDate, setEditEstimatedEndDate] = useState('');
  const [editRealEndDate, setEditRealEndDate] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [newParticipantCode, setNewParticipantCode] = useState('');
  const [newFitbitCode, setNewFitbitCode] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEstimatedEndDate, setNewEstimatedEndDate] = useState('');
  const [newRealEndDate, setNewRealEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [pageSize, setPageSize] = useState<number>(() => {
    const savedSize = localStorage.getItem('assignments_page_size');
    return savedSize ? Number(savedSize) : 10;
  });
  const [currentPage, setCurrentPage] = useState(1);

  const loadAssignments = () => {
    fetch(`${API_URL}/api/assignments/`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : data.items || data.results || [];
        setAssignments(list);
      })
      .catch(() => setError(t('Error loading assignments')));
  };

  const loadDropdownLists = async () => {
    try {
      const [partRes, fitRes] = await Promise.all([
        fetch(`${API_URL}/api/participants/list/`, { credentials: 'include' }),
        fetch(`${API_URL}/api/fitbits/list/`, { credentials: 'include' })
      ]);
      if (partRes.ok) {
        const partData = await partRes.json();
        setParticipantsList(partData.items || []);
      }
      if (fitRes.ok) {
        const fitData = await fitRes.json();
        setFitbitsList(fitData.items || []);
      }
    } catch (err) {
      console.error('Error cargando listas para desplegables', err);
    }
  };

  useEffect(() => {
    loadAssignments();
    loadDropdownLists();
  }, []);

  useEffect(() => {
    localStorage.setItem('assignments_page_size', pageSize.toString());
    setCurrentPage(1);
  }, [pageSize]);

  const getParticipantCode = (item: AssignmentItem): string => {
    if (typeof item.participant === 'string') return item.participant;
    if (item.participant && typeof item.participant === 'object' && item.participant.participant_code) {
      return item.participant.participant_code;
    }
    if (item.participant_code) return item.participant_code;
    return 'N/A';
  };

  const getFitbitCode = (item: AssignmentItem): string => {
    if (typeof item.fitbit === 'string') return item.fitbit;
    if (item.fitbit && typeof item.fitbit === 'object' && item.fitbit.fitbit_code) {
      return item.fitbit.fitbit_code;
    }
    if (item.fitbit_code) return item.fitbit_code;
    return 'N/A';
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const response = await fetch(`${API_URL}/api/assignments/create/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participant_code: newParticipantCode.trim(),
          fitbit_code: newFitbitCode.trim(),
          start_date: newStartDate,
          estimated_end_date: newEstimatedEndDate || null,
          real_end_date: newRealEndDate || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t('Create assignment error'));
      }

      setSubmitSuccess(t('Assignment created successfully'));
      setNewParticipantCode('');
      setNewFitbitCode('');
      setNewStartDate('');
      setNewEstimatedEndDate('');
      setNewRealEndDate('');
      loadAssignments();

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

  const handleUpdateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment || !selectedAssignment.id) return;

    setEditSubmitting(true);
    setEditError(null);

    try {
      const response = await fetch(`${API_URL}/api/assignments/update/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedAssignment.id,
          participant_code: editParticipantCode.trim(),
          fitbit_code: editFitbitCode.trim(),
          start_date: editStartDate,
          estimated_end_date: editEstimatedEndDate || null,
          real_end_date: editRealEndDate || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t('Update assignment error'));
      }

      setIsEditing(false);
      setSelectedAssignment(null);
      loadAssignments();
    } catch (err: any) {
      setEditError(err.message || t('Server connection error'));
    } finally {
      setEditSubmitting(false);
    }
  };

  const toLocalDateTimeInput = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      const offset = date.getTimezoneOffset();
      const adjustedDate = new Date(date.getTime() - (offset * 60 * 1000));
      return adjustedDate.toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

  const filtered = assignments
    .filter((item) => {
      const pCode = getParticipantCode(item).toLowerCase();
      const fCode = getFitbitCode(item).toLowerCase();
      const statusStr = item.status ? item.status.toLowerCase() : '';
      const searchLower = query.toLowerCase();

      const matchesQuery =
        pCode.includes(searchLower) ||
        fCode.includes(searchLower) ||
        statusStr.includes(searchLower);

      const matchesType =
        typeFilter === 'ALL' ||
        getParticipantCode(item).toUpperCase().startsWith(typeFilter.toUpperCase());

      return matchesQuery && matchesType;
    })
    .sort((a, b) => {
      const codeA = getParticipantCode(a);
      const codeB = getParticipantCode(b);

      // Regla especial: 'Piloto_001' siempre va arriba del todo (si estamos ordenando por participante)
      if (sortField === 'participant') {
        if (codeA === 'Piloto_001') return -1;
        if (codeB === 'Piloto_001') return 1;
      }

      let valA: any = '';
      let valB: any = '';

      switch (sortField) {
        case 'participant':
          valA = codeA;
          valB = codeB;
          break;
        case 'fitbit':
          valA = getFitbitCode(a);
          valB = getFitbitCode(b);
          break;
        case 'start_date':
          valA = a.start_date ? new Date(a.start_date).getTime() : 0;
          valB = b.start_date ? new Date(b.start_date).getTime() : 0;
          break;
        case 'estimated_end_date':
          valA = a.estimated_end_date ? new Date(a.estimated_end_date).getTime() : 0;
          valB = b.estimated_end_date ? new Date(b.estimated_end_date).getTime() : 0;
          break;
        case 'real_end_date':
          valA = a.real_end_date ? new Date(a.real_end_date).getTime() : 0;
          valB = b.real_end_date ? new Date(b.real_end_date).getTime() : 0;
          break;
        case 'status':
          valA = a.status || '';
          valB = b.status || '';
          break;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
    });

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginatedAssignments = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const pageSizeOptions = [
    { label: 5, value: 5 },
    { label: 10, value: 10 },
    { label: 15, value: 15 },
    { label: 20, value: 20 },
    { label: 25, value: 25 },
  ];

  return (
    <div className="w-full text-senda-main dark:text-senda-darktext relative space-y-8">
      <SectionHeader
        title={t('Assignments Title')}
        subtitle={`${filtered.length} ${t('Assignments Registered')}`}
        actionLabel={t('New Assignment')}
        onAction={() => {
          setSubmitError(null);
          setSubmitSuccess(null);
          loadDropdownLists();
          setIsModalOpen(true);
        }}
      />

      <div className="rounded-3xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-card p-6 shadow-xl space-y-6 transition-colors duration-300">

        {/* NUEVO: Pestañas de filtrado rápido (All, Senda, Piloto) */}
        <div className="flex items-center gap-2 border-b border-senda-border dark:border-senda-darkborder pb-4">
          {[
            { label: t('All'), value: 'ALL' },
            { label: 'SENDA', value: 'SENDA' },
            { label: 'PILOTO', value: 'PILOTO' }
          ].map((tab) => {
            const isActive = typeFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => { setTypeFilter(tab.value); setCurrentPage(1); }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${isActive
                  ? 'bg-senda-primary dark:bg-senda-accent text-white dark:text-senda-dark shadow-sm'
                  : 'bg-senda-light dark:bg-senda-input text-[#6B6F66] dark:text-[#9AA093] hover:bg-green-[#A5B8A5] dark:hover:bg-slate-700'
                  }`}
              >
                {t(tab.label)}
              </button>
            );
          })}
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
              placeholder={t('Search Assignment')}
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
                  <th
                    onClick={() => handleSort('participant')}
                    className="w-[18%] px-6 py-4 font-bold rounded-l-2xl cursor-pointer select-none hover:opacity-80 transition"
                  >
                    <div className="flex items-center gap-1">
                      {t('Participants Resource')}
                      {sortField === 'participant' && (
                        <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('fitbit')}
                    className="w-[18%] px-6 py-4 font-bold cursor-pointer select-none hover:opacity-80 transition"
                  >
                    <div className="flex items-center gap-1">
                      {t('Fitbit')}
                      {sortField === 'fitbit' && (
                        <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('start_date')}
                    className="w-[18%] px-6 py-4 font-bold cursor-pointer select-none hover:opacity-80 transition"
                  >
                    <div className="flex items-center gap-1">
                      {t('Start Date')}
                      {sortField === 'start_date' && (
                        <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('estimated_end_date')}
                    className="w-[18%] px-6 py-4 font-bold cursor-pointer select-none hover:opacity-80 transition"
                  >
                    <div className="flex items-center gap-1">
                      {t('Estimated End Date')}
                      {sortField === 'estimated_end_date' && (
                        <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('real_end_date')}
                    className="w-[18%] px-6 py-4 font-bold cursor-pointer select-none hover:opacity-80 transition"
                  >
                    <div className="flex items-center gap-1">
                      {t('Real End Date')}
                      {sortField === 'real_end_date' && (
                        <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="w-[18%] px-6 py-4 font-bold rounded-r-2xl cursor-pointer select-none hover:opacity-80 transition"
                  >
                    <div className="flex items-center gap-1">
                      {t('Status')}
                      {sortField === 'status' && (
                        <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-senda-border dark:divide-senda-darkborder">
                {paginatedAssignments.map((item, index) => {
                  const pCode = getParticipantCode(item);
                  const fCode = getFitbitCode(item);

                  return (
                    <tr
                      key={item.id || index}
                      onClick={() => {
                        setSelectedAssignment(item);
                        setIsEditing(false);
                        setEditParticipantCode(getParticipantCode(item));
                        setEditFitbitCode(getFitbitCode(item));
                        setEditStartDate(toLocalDateTimeInput(item.start_date));
                        setEditEstimatedEndDate(toLocalDateTimeInput(item.estimated_end_date));
                        setEditRealEndDate(toLocalDateTimeInput(item.real_end_date));
                        setEditError(null);
                      }}
                      className="cursor-pointer transition-all duration-200 hover:bg-senda-light/80 dark:hover:bg-senda-dark/50 hover:shadow-[inset_3px_0_0_0_theme(colors.senda-primary)] dark:hover:shadow-[inset_3px_0_0_0_theme(colors.senda-accent)]"
                    >
                      <td className="px-6 py-5 text-xs font-bold text-senda-main dark:text-white">
                        {pCode}
                      </td>

                      <td className="px-6 py-5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {fCode}
                      </td>

                      <td className="px-6 py-5 text-xs text-[#6B6F66] dark:text-[#9AA093]">
                        {item.start_date
                          ? new Date(item.start_date).toLocaleDateString("es-ES")
                          : "-"}
                      </td>

                      <td className="px-6 py-5 text-xs text-[#6B6F66] dark:text-[#9AA093]">
                        {item.estimated_end_date
                          ? new Date(item.estimated_end_date).toLocaleDateString("es-ES")
                          : "-"}
                      </td>

                      <td className="px-6 py-5 text-xs text-[#6B6F66] dark:text-[#9AA093]">
                        {item.real_end_date ? (
                          new Date(item.real_end_date).toLocaleDateString("es-ES")
                        ) : (
                          <span className="italic text-slate-400">{t('In Progress')}</span>
                        )}
                      </td>

                      <td className="px-6 py-5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold ${item.status?.toLowerCase() === 'active'
                            ? "border-emerald-100 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                            : item.status?.toLowerCase() === 'pending'
                              ? "border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                              : "border-senda-border dark:border-senda-darkborder bg-senda-light dark:bg-senda-dark text-[#6B6F66] dark:text-[#9AA093]"
                            }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${item.status?.toLowerCase() === 'active'
                              ? "bg-emerald-500"
                              : item.status?.toLowerCase() === 'pending'
                                ? "bg-blue-500"
                                : "bg-slate-400"
                              }`}
                          />
                          {item.status}
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
          <p className="py-8 text-center text-xs text-slate-400">{t('No assignments found')}</p>
        )}
        {error && (
          <p className="py-8 text-center text-xs text-red-500">{error}</p>
        )}
      </div>

      {isModalOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4">
          <div className="relative w-full max-w-[640px] max-h-[90vh] overflow-y-auto rounded-[28px] bg-senda-light dark:bg-senda-card p-5 sm:p-7 shadow-[0_30px_60px_rgba(29,90,61,0.18)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
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

              {/* Icono con punto de estado */}
              <div className="mb-3 sm:mb-4 flex justify-center">
                <div className="relative flex h-[50px] w-[50px] sm:h-[58px] sm:w-[58px] items-center justify-center rounded-2xl bg-[#DCEBE1] dark:bg-senda-darkborder shadow-[0_10px_24px_rgba(29,90,61,0.14)]">
                  <svg className="h-6 w-6 sm:h-7 sm:w-7 text-senda-primary dark:text-senda-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-[3px] border-senda-light dark:border-senda-card bg-[#4FA477]" />
                </div>
              </div>

              <h2
                className="mt-1.5 mb-1 text-center text-lg sm:text-[20px] font-semibold text-senda-main dark:text-white"
                style={{ fontFamily: 'Fraunces, serif' }}
              >
                {t('New Assignment')}
              </h2>
              <p className="mb-4 sm:mb-5 text-center text-[11px] sm:text-xs leading-relaxed text-[#708077] dark:text-[#9AA093]">
                {t('New Assignment Subtitle')}
              </p>

              <form onSubmit={handleCreateAssignment} className="space-y-3.5" autoComplete="off">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3.5">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">
                      {t('Select Participant Label')}
                    </label>
                    <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark px-3 py-1.5 mt-1">
                      <CustomSelect
                        value={newParticipantCode}
                        onChange={(val) => setNewParticipantCode(String(val))}
                        options={[
                          { label: t('Select a participant', { defaultValue: 'Seleccionar participante' }), value: '' },
                          ...participantsList.map((code) => ({ label: code, value: code }))
                        ]}
                        width="w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">
                      {t('Select Fitbit Label')}
                    </label>
                    <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-dark px-3 py-1.5 mt-1">
                      <CustomSelect
                        value={newFitbitCode}
                        onChange={(val) => setNewFitbitCode(String(val))}
                        options={[
                          { label: t('Select a bracelet', { defaultValue: 'Seleccionar pulsera' }), value: '' },
                          ...fitbitsList.map((code) => ({ label: code, value: code }))
                        ]}
                        width="w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">
                      {t('Start Date')}
                    </label>
                    <input
                      type="datetime-local"
                      value={newStartDate}
                      onChange={(e) => setNewStartDate(e.target.value)}
                      required
                      className="w-full h-[42px] rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-3 text-xs text-senda-main dark:text-white outline-none focus:border-senda-secondary cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">
                      {t('Estimated End Date')}
                    </label>
                    <input
                      type="datetime-local"
                      value={newEstimatedEndDate}
                      onChange={(e) => setNewEstimatedEndDate(e.target.value)}
                      className="w-full h-[42px] rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-3 text-xs text-senda-main dark:text-white outline-none focus:border-senda-secondary cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-senda-secondary dark:text-senda-accent">
                    {t('Real End Date Optional')}
                  </label>
                  <input
                    type="datetime-local"
                    value={newRealEndDate}
                    onChange={(e) => setNewRealEndDate(e.target.value)}
                    className="w-full h-[42px] rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-3 text-xs text-senda-main dark:text-white outline-none focus:border-senda-secondary [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>

                {submitError && <p className="text-xs text-red-600 dark:text-red-400 font-medium">{submitError}</p>}
                {submitSuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{submitSuccess}</p>}

                <div className="pt-1.5 space-y-2.5">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-senda-primary dark:bg-senda-accent px-4 py-3.5 text-sm font-semibold text-white dark:text-senda-dark shadow-[0_14px_28px_rgba(29,90,61,0.22)] transition-all hover:-translate-y-0.5 hover:bg-[#174A32] dark:hover:bg-[#8BD7AC] disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    {submitting ? t('Processing') : t('Save Assignment')}
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

      {selectedAssignment && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4">
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-[28px] bg-senda-light dark:bg-senda-card p-5 sm:p-7 shadow-[0_30px_60px_rgba(29,90,61,0.18)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
            <div className="relative">
              <div className="mb-4 sm:mb-6 flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="flex h-11 w-11 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-[#DCEBE1] dark:bg-senda-darkborder text-senda-primary dark:text-senda-accent">
                    <svg className="h-5 w-5 sm:h-7 sm:w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-xl font-extrabold text-senda-main dark:text-white truncate" style={{ fontFamily: 'Fraunces, serif' }}>
                      {isEditing ? t('Edit Assignment') : t('Assignment Detail')}
                    </h2>
                    <p className="text-[10px] sm:text-xs text-[#6B6F66] dark:text-[#9AA093] truncate">
                      {isEditing ? t('Edit Assignment Subtitle') : t('Assignment Detail Subtitle')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedAssignment(null); setIsEditing(false); }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-senda-light dark:bg-senda-input text-[#6B6F66] dark:text-slate-300 hover:bg-senda-border dark:hover:bg-slate-700 cursor-pointer transition"
                >
                  ✕
                </button>
              </div>

              {!isEditing ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6">
                    <div className="rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/70 dark:bg-senda-input/50 p-3 sm:p-4 flex flex-col justify-center">
                      <span className="text-[11px] font-medium text-senda-secondary dark:text-senda-accent mb-1">{t('Participants Resource')}</span>
                      <span className="text-sm font-bold text-senda-main dark:text-white">{getParticipantCode(selectedAssignment)}</span>
                    </div>

                    <div className="rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/70 dark:bg-senda-input/50 p-3 sm:p-4 flex flex-col justify-center">
                      <span className="text-[11px] font-medium text-senda-secondary dark:text-senda-accent mb-1">{t('Fitbit')}</span>
                      <span className="text-sm font-bold text-emerald-900 dark:text-emerald-400">{getFitbitCode(selectedAssignment)}</span>
                    </div>

                    <div className="rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/70 dark:bg-senda-input/50 p-3 sm:p-4 flex flex-col justify-center">
                      <span className="text-[11px] font-medium text-senda-secondary dark:text-senda-accent mb-1">{t('Start Date')}</span>
                      <span className="text-xs font-semibold text-senda-main dark:text-slate-200">
                        {selectedAssignment.start_date ? new Date(selectedAssignment.start_date).toLocaleString('es-ES') : '—'}
                      </span>
                    </div>

                    <div className="rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/70 dark:bg-senda-input/50 p-3 sm:p-4 flex flex-col justify-center">
                      <span className="text-[11px] font-medium text-senda-secondary dark:text-senda-accent mb-1">{t('Estimated End Date')}</span>
                      <span className="text-xs font-semibold text-senda-main dark:text-slate-100">
                        {selectedAssignment.estimated_end_date ? new Date(selectedAssignment.estimated_end_date).toLocaleString('es-ES') : '—'}
                      </span>
                    </div>

                    <div className="rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/70 dark:bg-senda-input/50 p-3 sm:p-4 flex flex-col justify-center">
                      <span className="text-[11px] font-medium text-senda-secondary dark:text-senda-accent mb-1">{t('Real End Date')}</span>
                      <span className="text-xs font-semibold text-senda-main dark:text-slate-100">
                        {selectedAssignment.real_end_date ? new Date(selectedAssignment.real_end_date).toLocaleString('es-ES') : t('In Progress')}
                      </span>
                    </div>

                    <div className="rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light/70 dark:bg-senda-input/50 p-3 sm:p-4 flex flex-col justify-center">
                      <span className="text-[11px] font-medium text-senda-secondary dark:text-senda-accent mb-1">{t('Status')}</span>
                      <div>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${selectedAssignment.status?.toLowerCase() === 'active'
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                          : selectedAssignment.status?.toLowerCase() === 'pending'
                            ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300'
                          }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${selectedAssignment.status?.toLowerCase() === 'active'
                            ? 'bg-emerald-600'
                            : selectedAssignment.status?.toLowerCase() === 'pending'
                              ? 'bg-blue-600'
                              : 'bg-slate-600'
                            }`} />
                          {selectedAssignment.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-3 pt-3 sm:pt-2 border-t border-senda-border dark:border-senda-darkborder">
                    <button
                      onClick={async () => {
                        if (!selectedAssignment || !selectedAssignment.id) return;
                        if (!confirm(`${t('Delete Assignment Confirmation')} ${getParticipantCode(selectedAssignment)}?`)) return;
                        try {
                          const resp = await fetch(`${API_URL}/api/assignments/delete/`, {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: selectedAssignment.id }),
                          });
                          const j = await resp.json();
                          if (resp.ok) {
                            setSelectedAssignment(null);
                            loadAssignments();
                          } else {
                            alert(j.error || t('Delete assignment error'));
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
                      {t('Delete Assignment')}
                    </button>

                    <div className="flex w-full sm:w-auto gap-3">
                      <button
                        onClick={() => setSelectedAssignment(null)}
                        className="flex-1 sm:flex-none rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-4 sm:px-5 py-2.5 sm:py-3 text-xs font-bold text-senda-main dark:text-slate-300 hover:bg-senda-light dark:hover:bg-slate-700 transition cursor-pointer"
                      >
                        {t('Close')}
                      </button>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-2xl bg-senda-primary hover:bg-[#184232] dark:bg-senda-accent dark:text-senda-dark dark:hover:bg-[#59a67e] px-4 sm:px-5 py-2.5 sm:py-3 text-xs font-bold text-white transition cursor-pointer shadow-md"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        {t('Modify')}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <form onSubmit={handleUpdateAssignment} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#6B6F66] dark:text-[#9AA093] mb-1">{t('Select Participant Label')}</label>
                      <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-senda-light dark:bg-senda-dark px-3 py-1.5">
                        <CustomSelect
                          value={editParticipantCode}
                          onChange={(val) => setEditParticipantCode(String(val))}
                          options={participantsList.map((code) => ({ label: code, value: code }))}
                          width="w-full"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#6B6F66] dark:text-[#9AA093] mb-1">{t('Select Fitbit Label')}</label>
                      <div className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-senda-light dark:bg-senda-dark px-3 py-1.5">
                        <CustomSelect
                          value={editFitbitCode}
                          onChange={(val) => setEditFitbitCode(String(val))}
                          options={fitbitsList.map((code) => ({ label: code, value: code }))}
                          width="w-full"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#6B6F66] dark:text-[#9AA093] mb-1">{t('Start Date')}</label>
                    <input
                      type="datetime-local"
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                      required
                      className="w-full h-[42px] rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light dark:bg-senda-dark px-3 text-xs text-senda-main dark:text-white outline-none focus:border-senda-secondary cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#6B6F66] dark:text-[#9AA093] mb-1">{t('Estimated End Date')}</label>
                    <input
                      type="datetime-local"
                      value={editEstimatedEndDate}
                      onChange={(e) => setEditEstimatedEndDate(e.target.value)}
                      className="w-full h-[42px] rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light dark:bg-senda-dark px-3 text-xs text-senda-main dark:text-white outline-none focus:border-senda-secondary cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#6B6F66] dark:text-[#9AA093] mb-1">{t('Real End Date Optional')}</label>
                    <input
                      type="datetime-local"
                      value={editRealEndDate}
                      onChange={(e) => setEditRealEndDate(e.target.value)}
                      className="w-full h-[42px] rounded-2xl border border-senda-border dark:border-senda-darkborder bg-senda-light dark:bg-senda-dark px-3 text-xs text-senda-main dark:text-white outline-none focus:border-senda-secondary [color-scheme:light] dark:[color-scheme:dark]"
                    />
                  </div>

                  {editError && <p className="text-xs text-red-600 dark:text-red-400 font-medium">{editError}</p>}

                  <div className="mt-6 flex justify-end gap-3 pt-2 border-t border-senda-border dark:border-senda-darkborder">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-4 sm:px-5 py-2.5 sm:py-3 text-xs font-bold text-senda-main dark:text-slate-300 hover:bg-senda-light dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      {t('Cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={editSubmitting}
                      className="rounded-2xl bg-senda-primary hover:bg-[#184232] dark:bg-senda-accent dark:text-senda-dark dark:hover:bg-[#59a67e] px-4 sm:px-5 py-2.5 sm:py-3 text-xs font-bold text-white transition disabled:opacity-60 cursor-pointer shadow-md"
                    >
                      {editSubmitting ? t('Processing') : t('Save Changes')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Assignments;