export const formatMoney = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(amount);
};

export const formatNumber = (num: number, maxDecimals = 1): string => {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: maxDecimals
  }).format(num);
};

export const formatPercent = (val: number, decimals = 1): string => {
  return `${(val * 100).toFixed(decimals)}%`;
};

export const formatDate = (isoStr: string | undefined): string => {
  if (!isoStr) return 'Unknown';
  return new Date(isoStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};
