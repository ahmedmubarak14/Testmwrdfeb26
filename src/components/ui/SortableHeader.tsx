import React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../utils/helpers';

export type SortDirection = 'asc' | 'desc' | null;

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSortKey: string | null;
  currentDirection: SortDirection;
  onSort: (key: string, direction: SortDirection) => void;
  className?: string;
}

export const SortableHeader: React.FC<SortableHeaderProps> = ({
  label,
  sortKey,
  currentSortKey,
  currentDirection,
  onSort,
  className
}) => {
  const isActive = currentSortKey === sortKey;

  const handleClick = () => {
    if (!isActive) {
      onSort(sortKey, 'asc');
    } else if (currentDirection === 'asc') {
      onSort(sortKey, 'desc');
    } else {
      onSort(sortKey, null);
    }
  };

  const getIcon = () => {
    if (!isActive || currentDirection === null) {
      return <ChevronsUpDown className="w-4 h-4 text-gray-400" />;
    }
    if (currentDirection === 'asc') {
      return <ChevronUp className="w-4 h-4 text-[#137fec]" />;
    }
    return <ChevronDown className="w-4 h-4 text-[#137fec]" />;
  };

  const ariaSort = !isActive || currentDirection === null
    ? 'none' as const
    : currentDirection === 'asc'
      ? 'ascending' as const
      : 'descending' as const;

  return (
    <button
      onClick={handleClick}
      aria-sort={ariaSort}
      className={cn(
        'inline-flex items-center gap-1 text-left font-medium text-gray-700 hover:text-gray-900 transition-colors group',
        isActive && 'text-[#137fec]',
        className
      )}
    >
      {label}
      <span className="opacity-50 group-hover:opacity-100 transition-opacity">
        {getIcon()}
      </span>
    </button>
  );
};

export const useSort = <T,>(items: T[], defaultKey: string | null = null, defaultDirection: SortDirection = null) => {
  const [sortKey, setSortKey] = React.useState<string | null>(defaultKey);
  const [sortDirection, setSortDirection] = React.useState<SortDirection>(defaultDirection);

  const handleSort = (key: string, direction: SortDirection) => {
    setSortKey(direction === null ? null : key);
    setSortDirection(direction);
  };

  const sortedItems = React.useMemo(() => {
    if (!sortKey || !sortDirection) return items;

    return [...items].sort((a, b) => {
      const aValue = (a as any)[sortKey];
      const bValue = (b as any)[sortKey];

      if (aValue === bValue) return 0;
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      let comparison = 0;
      if (typeof aValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === 'number') {
        comparison = aValue - bValue;
      } else if (aValue instanceof Date) {
        comparison = aValue.getTime() - bValue.getTime();
      }

      return sortDirection === 'desc' ? -comparison : comparison;
    });
  }, [items, sortKey, sortDirection]);

  return {
    sortedItems,
    sortKey,
    sortDirection,
    handleSort
  };
};
