import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '../../utils/helpers';

type WorkflowType = 'rfq' | 'order';

interface StatusProgressProps {
  type: WorkflowType;
  currentStatus: string;
  size?: 'sm' | 'md';
}

interface Step {
  key: string;
  labelKey: string;
}

const RFQ_STEPS: Step[] = [
  { key: 'submitted', labelKey: 'statusProgress.rfq.submitted' },
  { key: 'quoted', labelKey: 'statusProgress.rfq.quoted' },
  { key: 'accepted', labelKey: 'statusProgress.rfq.accepted' },
  { key: 'ordered', labelKey: 'statusProgress.rfq.ordered' },
];

const ORDER_STEPS: Step[] = [
  { key: 'pending', labelKey: 'statusProgress.order.pending' },
  { key: 'confirmed', labelKey: 'statusProgress.order.confirmed' },
  { key: 'shipped', labelKey: 'statusProgress.order.shipped' },
  { key: 'delivered', labelKey: 'statusProgress.order.delivered' },
];

export const StatusProgress: React.FC<StatusProgressProps> = ({
  type,
  currentStatus,
  size = 'md',
}) => {
  const { t } = useTranslation();

  const steps = type === 'rfq' ? RFQ_STEPS : ORDER_STEPS;
  const normalizedStatus = currentStatus.toLowerCase().replace(/-/g, '_');
  const currentIndex = steps.findIndex((step) => step.key === normalizedStatus);

  const getStepState = (index: number): 'completed' | 'current' | 'pending' => {
    if (currentIndex === -1) return index === 0 ? 'current' : 'pending';
    if (index < currentIndex) return 'completed';
    if (index === currentIndex) return 'current';
    return 'pending';
  };

  const sizeConfig = {
    sm: {
      circle: 'w-6 h-6',
      currentCircle: 'w-7 h-7',
      icon: 'w-3 h-3',
      text: 'text-xs',
      line: 'h-0.5',
      gap: 'gap-1',
    },
    md: {
      circle: 'w-8 h-8',
      currentCircle: 'w-10 h-10',
      icon: 'w-4 h-4',
      text: 'text-sm',
      line: 'h-1',
      gap: 'gap-2',
    },
  };

  const config = sizeConfig[size];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const state = getStepState(index);
          const isLast = index === steps.length - 1;

          return (
            <React.Fragment key={step.key}>
              <div className={cn('flex flex-col items-center', config.gap)}>
                <div
                  className={cn(
                    'rounded-full flex items-center justify-center transition-all duration-200 font-medium',
                    state === 'completed' && 'bg-green-500 text-white',
                    state === 'current' && cn(config.currentCircle, 'bg-blue-500 text-white ring-4 ring-blue-100'),
                    state === 'pending' && cn(config.circle, 'bg-gray-200 text-gray-400'),
                    state !== 'current' && config.circle
                  )}
                >
                  {state === 'completed' ? (
                    <Check className={config.icon} strokeWidth={3} />
                  ) : (
                    <span className={cn(config.text, state === 'pending' && 'text-gray-400')}>
                      {index + 1}
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    'text-center max-w-[80px] sm:max-w-none leading-tight',
                    config.text,
                    state === 'completed' && 'text-green-600 font-medium',
                    state === 'current' && 'text-blue-600 font-semibold',
                    state === 'pending' && 'text-gray-400'
                  )}
                >
                  {t(step.labelKey)}
                </span>
              </div>

              {!isLast && (
                <div
                  className={cn(
                    'flex-1 mx-2 sm:mx-4 rounded-full',
                    config.line,
                    index < currentIndex ? 'bg-green-500' : 'bg-gray-200'
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
