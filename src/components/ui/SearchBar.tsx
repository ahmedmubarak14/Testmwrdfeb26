import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface SearchBarProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSearch?: (value: string) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const SearchBar: React.FC<SearchBarProps> = ({
  placeholder,
  value: controlledValue,
  onChange,
  onSearch,
  className = '',
  size = 'md'
}) => {
  const { t } = useTranslation();
  const [internalValue, setInternalValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const value = controlledValue !== undefined ? controlledValue : internalValue;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (controlledValue === undefined) {
      setInternalValue(newValue);
    }
    onChange?.(newValue);
  };

  const handleClear = () => {
    if (controlledValue === undefined) {
      setInternalValue('');
    }
    onChange?.('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      onSearch(value);
    }
    if (e.key === 'Escape') {
      handleClear();
    }
  };

  const sizeClasses = {
    sm: 'h-8',
    md: 'h-9',
    lg: 'h-10'
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-sm'
  };

  const iconSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl'
  };

  return (
    <div className={`relative w-full ${className}`}>
      <div
        className={`
          flex items-center w-full bg-slate-100 rounded-lg
          transition-all duration-200 ease-out
          ${isFocused 
            ? 'bg-white shadow-sm ring-1 ring-[#137fec]/40' 
            : 'hover:bg-slate-50'
          }
          ${sizeClasses[size]}
        `}
      >
        <div className="flex items-center justify-center pl-3 pr-2">
          <span 
            className={`material-symbols-outlined ${iconSizes[size]} transition-colors duration-200 ${
              isFocused ? 'text-[#137fec]' : 'text-slate-400'
            }`}
          >
            search
          </span>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || t('common.search')}
          className={`
            flex-1 h-full bg-transparent outline-none
            text-slate-900 placeholder:text-slate-400
            ${textSizes[size]}
          `}
        />

        {value && value.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className={`flex items-center justify-center rounded-full mx-2
              text-slate-400 hover:text-slate-600 hover:bg-slate-200
              transition-all duration-150 ease-out
              ${size === 'sm' ? 'w-5 h-5' : 'w-6 h-6'}
            `}
            aria-label="Clear search"
          >
            <span className={`material-symbols-outlined ${size === 'sm' ? 'text-sm' : 'text-base'}`}>close</span>
          </button>
        )}
      </div>
    </div>
  );
};
