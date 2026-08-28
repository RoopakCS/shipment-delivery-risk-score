import React from 'react';
import { cn } from './BandPill';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  valueClassName?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ 
  label, 
  value, 
  subValue, 
  icon,
  className,
  valueClassName
}) => {
  return (
    <div className={cn("bg-surface border border-border-warm rounded-md p-4 shadow-sm flex flex-col justify-between", className)}>
      <div className="flex justify-between items-start mb-2">
        <span className="text-sm font-medium text-text-muted">{label}</span>
        {icon && <span className="text-ups-brown-400">{icon}</span>}
      </div>
      <div>
        <div className={cn("text-2xl font-semibold tabular-nums text-text-main", valueClassName)}>
          {value}
        </div>
        {subValue && (
          <div className="text-xs text-text-muted mt-1">{subValue}</div>
        )}
      </div>
    </div>
  );
};
