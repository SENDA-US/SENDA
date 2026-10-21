import React from 'react';

interface SectionHeaderProps {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1
          className="mt-1 text-3xl font-extrabold tracking-tight text-senda-main dark:text-white"
          style={{ fontFamily: 'Fraunces, serif' }}
        >
          {title}
        </h1>
        <p className="mt-1 text-xs font-medium text-[#6B6F66] dark:text-[#9AA093]">{subtitle}</p>
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center justify-center px-5 py-2.5 bg-gradient-to-b from-[#4C7C63] to-[#1F3B2C] hover:from-[#537F69] hover:to-[#234030] text-white font-semibold rounded-full shadow-md transition gap-2 cursor-pointer self-start sm:self-auto">
          <span className="text-base font-bold leading-none">+</span>
          <span className="text-xs">{actionLabel}</span>
        </button>
      )}
    </div>
  );
};