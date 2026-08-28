import React from 'react';
import type { RiskBand } from '../../types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: (string | undefined | null | false)[]) => {
  return twMerge(clsx(inputs));
};

interface BandPillProps {
  band: RiskBand;
  className?: string;
}

const bandStyles: Record<RiskBand, string> = {
  LOW: 'bg-risk-low/10 text-risk-low border-risk-low/20',
  MEDIUM: 'bg-risk-medium/10 text-risk-medium border-risk-medium/20',
  HIGH: 'bg-risk-high/10 text-risk-high border-risk-high/20',
  CRITICAL: 'bg-risk-critical/10 text-risk-critical border-risk-critical/20'
};

export const BandPill: React.FC<BandPillProps> = ({ band, className }) => {
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider border",
      bandStyles[band],
      className
    )}>
      {band}
    </span>
  );
};
