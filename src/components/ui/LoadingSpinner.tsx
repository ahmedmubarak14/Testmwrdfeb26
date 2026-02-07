import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/helpers';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className,
}) => {
  const sizeStyles = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <Loader2
      className={cn('animate-spin text-blue-600', sizeStyles[size], className)}
    />
  );
};

export const LoadingScreen: React.FC<{ message?: string }> = ({ message }) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-50">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        {message && <p className="mt-4 text-gray-600">{message}</p>}
      </div>
    </div>
  );
};
