import React from 'react';
import type { RiskBand } from '../../types';
import { cn } from './BandPill';
import { formatNumber } from '../../utils/formatters';

interface RiskScoreProps {
  score: number;
  band: RiskBand;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const colorMap: Record<RiskBand, string> = {
  LOW: 'text-risk-low',
  MEDIUM: 'text-risk-medium',
  HIGH: 'text-risk-high',
  CRITICAL: 'text-risk-critical'
};

const sizeMap = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl font-semibold',
  xl: 'text-4xl font-bold tracking-tight'
};

export const RiskScore: React.FC<RiskScoreProps> = ({ score, band, size = 'md', className }) => {
  return (
    <span className={cn("tabular-nums", colorMap[band], sizeMap[size], className)}>
      {formatNumber(score, 1)}
    </span>
  );
};
