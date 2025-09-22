import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onLoadMore?: () => void;
  canLoadMore?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  className?: string;
}

const buildPageNumbers = (current: number, total: number) => {
  const delta = 2;
  const pages: (number | string)[] = [];
  let last = 0;

  for (let i = 1; i <= total; i += 1) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      if (last && i - last > 1) {
        pages.push('...');
      }
      pages.push(i);
      last = i;
    }
  }

  return pages;
};

const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  onLoadMore,
  canLoadMore = true,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  className = ''
}) => {
  const pages = useMemo(
    () => buildPageNumbers(currentPage, Math.max(totalPages, 1)),
    [currentPage, totalPages]
  );

  const showPageSize =
    typeof pageSize === 'number' &&
    typeof onPageSizeChange === 'function' &&
    Array.isArray(pageSizeOptions) &&
    pageSizeOptions.length > 0;

  return (
    <div
      className={`flex w-full flex-col gap-4 md:flex-row md:items-center md:justify-between ${className}`}
    >
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          disabled={currentPage <= 1}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        {pages.map((page, index) =>
          typeof page === 'number' ? (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              className={`inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                currentPage === page
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : 'border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60'
              }`}
            >
              {page}
            </button>
          ) : (
            <span
              key={`ellipsis-${index}`}
              className="px-2 py-1 text-sm text-slate-400 dark:text-slate-500"
            >
              ...
            </span>
          )
        )}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(currentPage + 1, Math.max(totalPages, 1)))}
          disabled={currentPage >= totalPages}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
        >
          Forward
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {onLoadMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={!canLoadMore}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
          >
            Load more
          </button>
        )}
        {showPageSize && pageSizeOptions && onPageSizeChange && (
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            Show
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
};

export default PaginationControls;
