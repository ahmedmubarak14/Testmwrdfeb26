import React, { useCallback, useMemo } from 'react';
import { SearchBar } from './SearchBar';
import { debounce } from '../../utils/helpers';

interface SearchInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value: controlledValue,
  onChange,
  placeholder,
  debounceMs = 300,
  className = '',
  size = 'md'
}) => {
  const debouncedOnChange = useMemo(
    () => debounce((val: string) => onChange(val), debounceMs),
    [onChange, debounceMs]
  );

  const handleChange = useCallback((value: string) => {
    if (debounceMs > 0) {
      debouncedOnChange(value);
      return;
    }
    onChange(value);
  }, [debouncedOnChange, debounceMs, onChange]);

  return (
    <SearchBar
      value={controlledValue}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      size={size}
    />
  );
};
