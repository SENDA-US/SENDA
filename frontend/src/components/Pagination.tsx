import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  const { t } = useTranslation();
  const [isPageOpen, setIsPageOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsPageOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const pageOptions = Array.from({ length: totalPages || 1 }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-3 border-t border-senda-border dark:border-senda-darkborder pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[11px] font-medium text-slate-400">
        {t('Page', { page: currentPage, totalPages: totalPages || 1 })}
      </p>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          disabled={currentPage === 1}
          className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-3 py-2 text-[11px] font-bold text-senda-main dark:text-slate-300 transition hover:bg-senda-light dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          {t('Previous')}
        </button>

        <div className="relative" ref={containerRef}>
          <div
            onClick={() => {
              if (totalPages > 1) setIsPageOpen(!isPageOpen);
            }}
            className={`flex items-center gap-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 px-4 py-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 select-none ${
              totalPages > 1 ? 'cursor-pointer hover:opacity-80 transition' : ''
            }`}
          >
            <span>{currentPage}</span>
            {totalPages > 1 && (
              <svg
                className={`h-3 w-3 transition-transform ${isPageOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </div>

          {isPageOpen && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 max-h-48 w-24 overflow-y-auto rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-card p-1.5 shadow-2xl">
              <div className="space-y-1">
                {pageOptions.map((p) => {
                  const isSelected = currentPage === p;
                  return (
                    <div
                      key={p}
                      onClick={() => {
                        onPageChange(p);
                        setIsPageOpen(false);
                      }}
                      className={`flex items-center justify-between cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                        isSelected
                          ? 'bg-[#DCEBE1] dark:bg-senda-darkborder text-senda-primary dark:text-senda-accent'
                          : 'text-[#6B6F66] dark:text-slate-300 hover:bg-senda-light dark:hover:bg-senda-dark'
                      }`}
                    >
                      <span>{p}</span>
                      {isSelected && (
                        <svg
                          className="h-3 w-3 text-senda-primary dark:text-senda-accent"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages || 1))}
          disabled={currentPage === totalPages || totalPages <= 1}
          className="rounded-xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-input px-3 py-2 text-[11px] font-bold text-senda-main dark:text-slate-300 transition hover:bg-senda-light dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          {t('Next')}
        </button>
      </div>
    </div>
  );
};