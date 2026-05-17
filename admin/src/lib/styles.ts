// Shared Tailwind class helpers for consistent dark/light mode across all pages

export const s = {
  // Page wrapper
  page: 'p-8',

  // Headings
  h1: 'text-2xl font-bold text-gray-900 dark:text-white',
  sub: 'text-gray-500 dark:text-gray-400 text-sm mt-1',

  // Cards / panels
  card: 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700',
  cardPad: 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6',

  // Table
  tableWrap: 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden',
  thead: 'bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700',
  th: 'px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide',
  tr: 'hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors',
  tdDiv: 'divide-y divide-gray-100 dark:divide-gray-700',

  // Form inputs
  input: [
    'w-full border border-gray-300 dark:border-gray-600',
    'bg-white dark:bg-gray-700',
    'text-gray-900 dark:text-white',
    'placeholder-gray-400 dark:placeholder-gray-500',
    'rounded-lg px-3 py-2 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-brand-500',
  ].join(' '),
  inputMono: [
    'w-full border border-gray-300 dark:border-gray-600',
    'bg-white dark:bg-gray-700',
    'text-gray-900 dark:text-white font-mono',
    'placeholder-gray-400 dark:placeholder-gray-500',
    'rounded-lg px-3 py-2 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-brand-500',
  ].join(' '),
  select: [
    'w-full border border-gray-300 dark:border-gray-600',
    'bg-white dark:bg-gray-700',
    'text-gray-900 dark:text-white',
    'rounded-lg px-3 py-2 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-brand-500',
  ].join(' '),
  label: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1',
  hint: 'text-xs text-gray-400 dark:text-gray-500 mt-1',

  // Buttons
  btnPrimary: 'bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors',
  btnSecondary: 'text-sm text-gray-600 dark:text-gray-400 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors',
  btnDanger: 'text-sm text-red-500 hover:text-red-700 dark:hover:text-red-400 font-medium transition-colors',
  btnLink: 'text-sm text-brand-600 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300 font-medium transition-colors',

  // Modals
  overlay: 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4',
  modal: 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md',
  modalLg: 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg',
  modalHeader: 'px-6 py-4 border-b border-gray-200 dark:border-gray-700',
  modalBody: 'px-6 py-5 space-y-4',
  modalFooter: 'px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3',
  modalTitle: 'font-semibold text-gray-900 dark:text-white',

  // Alerts
  alertError: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3',
  alertSuccess: 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/40 text-green-700 dark:text-green-400 text-sm rounded-lg px-4 py-3',
  alertWarn: 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 text-amber-800 dark:text-amber-400 text-sm rounded-lg px-4 py-3',

  // Text helpers
  textPrimary: 'text-gray-900 dark:text-white',
  textSecondary: 'text-gray-600 dark:text-gray-400',
  textMuted: 'text-gray-400 dark:text-gray-500',
  textXs: 'text-xs text-gray-500 dark:text-gray-400',

  // Badges
  codeTag: 'text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded font-mono',
  codeTagBrand: 'text-xs bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-2 py-1 rounded font-mono',
} as const;
