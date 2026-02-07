import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '../../utils/helpers';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showFirstLast?: boolean;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  showFirstLast = true,
  className
}) => {
  const { t } = useTranslation();

  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const showPages = 5;
    
    if (totalPages <= showPages + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('...');
      }
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('...');
      }
      
      pages.push(totalPages);
    }
    
    return pages;
  };

  const buttonBase = 'inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-xs sm:text-sm font-medium transition-all';
  const buttonActive = 'bg-[#137fec] text-white';
  const buttonInactive = 'text-gray-600 hover:bg-gray-100';
  const buttonDisabled = 'text-gray-300 cursor-not-allowed';

  return (
    <nav className={cn('flex items-center justify-center gap-0.5 sm:gap-1 flex-wrap', className)} aria-label="Pagination">
      {showFirstLast && (
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className={cn(buttonBase, 'hidden sm:inline-flex', currentPage === 1 ? buttonDisabled : buttonInactive)}
          aria-label={t('pagination.first', 'First page')}
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
      )}

      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className={cn(buttonBase, currentPage === 1 ? buttonDisabled : buttonInactive)}
        aria-label={t('pagination.previous', 'Previous page')}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {getPageNumbers().map((page, index) => (
        page === '...' ? (
          <span key={`ellipsis-${index}`} className="px-1 sm:px-2 text-gray-400 text-xs sm:text-sm">...</span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page as number)}
            className={cn(buttonBase, page === currentPage ? buttonActive : buttonInactive)}
            aria-current={page === currentPage ? 'page' : undefined}
          >
            {page}
          </button>
        )
      ))}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className={cn(buttonBase, currentPage === totalPages ? buttonDisabled : buttonInactive)}
        aria-label={t('pagination.next', 'Next page')}
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {showFirstLast && (
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className={cn(buttonBase, 'hidden sm:inline-flex', currentPage === totalPages ? buttonDisabled : buttonInactive)}
          aria-label={t('pagination.last', 'Last page')}
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      )}
    </nav>
  );
};

interface PaginationInfoProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  className?: string;
}

export const PaginationInfo: React.FC<PaginationInfoProps> = ({
  currentPage,
  pageSize,
  totalItems,
  className
}) => {
  const { t } = useTranslation();
  
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <p className={cn('text-sm text-gray-500', className)}>
      {t('pagination.showing', 'Showing')} {start}-{end} {t('pagination.of', 'of')} {totalItems}
    </p>
  );
};

export const usePagination = <T,>(items: T[], pageSize: number = 10) => {
  const [currentPage, setCurrentPage] = React.useState(1);
  
  const totalPages = Math.ceil(items.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedItems = items.slice(startIndex, startIndex + pageSize);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const resetPage = () => setCurrentPage(1);

  return {
    currentPage,
    totalPages,
    paginatedItems,
    goToPage,
    resetPage,
    pageSize,
    totalItems: items.length
  };
};
