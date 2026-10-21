import React, { useEffect, useRef, useState } from 'react';

interface CustomSelectProps {
  value: string | number;
  onChange: (val: any) => void;
  options: { label: string | number; value: string | number }[];
  width?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  width = 'w-28',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className="relative" ref={containerRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 px-3 py-1 text-xs font-bold text-senda-main dark:text-white cursor-pointer transition hover:text-senda-secondary"
      >
        <span>{selectedOption ? selectedOption.label : value}</span>
        <svg
          className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isOpen && (
        <div
          className={`absolute left-0 z-50 mt-2 ${width} rounded-2xl border border-senda-border dark:border-senda-darkborder bg-white dark:bg-senda-card p-1.5 shadow-2xl`}
        >
          <div className="space-y-1">
            {options.map((opt) => {
              const isSelected = value === opt.value;
              return (
                <div
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`flex items-center justify-between cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    isSelected
                      ? 'bg-[#DCEBE1] dark:bg-senda-darkborder text-senda-primary dark:text-senda-accent'
                      : 'text-[#6B6F66] dark:text-slate-300 hover:bg-senda-light dark:hover:bg-senda-dark'
                  }`}
                >
                  <span>{opt.label}</span>
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
  );
};