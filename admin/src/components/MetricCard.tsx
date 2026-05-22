import { useEffect, useRef, useState } from 'react';

function useCountUp(target: number, duration = 600) {
  const [value, setValue] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (!target || isNaN(target)) { setValue(0); return; }
    const start = performance.now();
    function step(now: number) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - p) ** 3; // ease-out cubic
      setValue(Math.round(eased * target));
      if (p < 1) raf.current = requestAnimationFrame(step);
    }
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return value;
}

interface Props {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  variant?: 'default' | 'danger' | 'success' | 'warning' | 'purple';
  className?: string;
}

const VARIANTS = {
  default: {
    icon: 'bg-brand-500/10 text-brand-400',
    value: 'text-gray-900 dark:text-gh-text',
    border: 'border-gray-200 dark:border-white/[0.08]',
    glow: '',
  },
  danger: {
    icon: 'bg-red-500/10 text-red-400',
    value: 'text-red-600 dark:text-red-400',
    border: 'border-red-200 dark:border-red-500/30',
    glow: 'dark:shadow-[0_0_24px_rgba(239,68,68,0.08)]',
  },
  success: {
    icon: 'bg-emerald-500/10 text-emerald-400',
    value: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-500/25',
    glow: '',
  },
  warning: {
    icon: 'bg-orange-500/10 text-orange-400',
    value: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-500/25',
    glow: '',
  },
  purple: {
    icon: 'bg-purple-500/10 text-purple-400',
    value: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-500/25',
    glow: '',
  },
};

export default function MetricCard({ label, value, sub, icon, variant = 'default', className = '' }: Props) {
  const numVal = typeof value === 'number' ? value : 0;
  const animated = useCountUp(numVal);
  const display = typeof value === 'number'
    ? animated.toLocaleString('pt-BR')
    : (value ?? '—');

  const v = VARIANTS[variant];

  return (
    <div className={`bg-white dark:bg-gh-card rounded-xl border p-5 hover:-translate-y-0.5 transition-transform duration-200 ${v.border} ${v.glow} ${className}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${v.icon}`}>
          {icon}
        </div>
      </div>
      <p className={`text-2xl font-bold leading-none ${v.value}`}>{display}</p>
      <p className="text-sm font-medium text-gray-700 dark:text-gh-text mt-1.5">{label}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-gh-muted mt-0.5 leading-snug">{sub}</p>}
    </div>
  );
}
