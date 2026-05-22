// Shared Tailwind class helpers — dark mode uses GitHub-dark design tokens (gh-*)

export const s = {
  // Page wrapper
  page: 'p-6 lg:p-8',

  // Headings
  h1: 'text-2xl font-bold text-gray-900 dark:text-gh-text',
  sub: 'text-gray-600 dark:text-gray-400 text-sm mt-1',

  // Cards / panels
  card: 'bg-white dark:bg-gh-card rounded-xl border border-gray-200 dark:border-white/[0.08]',
  cardPad: 'bg-white dark:bg-gh-card rounded-xl border border-gray-200 dark:border-white/[0.08] p-6',

  // Table
  tableWrap: 'bg-white dark:bg-gh-card rounded-xl border border-gray-200 dark:border-white/[0.08] overflow-hidden',
  thead: 'bg-gray-50 dark:bg-gh-over/60 border-b border-gray-200 dark:border-white/[0.08]',
  th: 'px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide',
  tr: 'hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors',
  tdDiv: 'divide-y divide-gray-100 dark:divide-white/[0.06]',

  // Form inputs
  input: [
    'w-full border border-gray-300 dark:border-white/[0.12]',
    'bg-white dark:bg-gh-over',
    'text-gray-900 dark:text-gh-text',
    'placeholder-gray-400 dark:placeholder-gray-500',
    'rounded-lg px-3 py-2 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-brand-500/50',
    'transition-colors',
  ].join(' '),
  inputMono: [
    'w-full border border-gray-300 dark:border-white/[0.12]',
    'bg-white dark:bg-gh-over',
    'text-gray-900 dark:text-gh-text font-mono',
    'placeholder-gray-400 dark:placeholder-gray-500',
    'rounded-lg px-3 py-2 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-brand-500/50',
    'transition-colors',
  ].join(' '),
  select: [
    'w-full border border-gray-300 dark:border-white/[0.12]',
    'bg-white dark:bg-gh-over',
    'text-gray-900 dark:text-gh-text',
    'rounded-lg px-3 py-2 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-brand-500/50',
    'transition-colors',
  ].join(' '),
  label: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1',
  hint: 'text-xs text-gray-500 dark:text-gray-400 mt-1',

  // Buttons
  btnPrimary:   'bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors',
  btnSecondary: 'text-sm text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg border border-gray-300 dark:border-white/[0.15] hover:border-gray-400 dark:hover:border-white/[0.3] hover:text-gray-900 dark:hover:text-gray-100 transition-colors',
  btnDanger:    'text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors text-red-600 dark:text-red-400 border-red-200 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20',
  btnLink:      'text-sm text-brand-500 hover:text-brand-400 font-medium transition-colors',

  // Modals
  overlay:     'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4',
  modal:       'bg-white dark:bg-gh-card rounded-xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-white/[0.08] animate-scale-in',
  modalLg:     'bg-white dark:bg-gh-card rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-white/[0.08] animate-scale-in',
  modalHeader: 'px-6 py-4 border-b border-gray-200 dark:border-white/[0.08]',
  modalBody:   'px-6 py-5 space-y-4',
  modalFooter: 'px-6 py-4 border-t border-gray-100 dark:border-white/[0.08] flex justify-end gap-3',
  modalTitle:  'text-base font-semibold text-gray-900 dark:text-gh-text',

  // Alerts
  alertError:   'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3',
  alertSuccess: 'bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400 text-sm rounded-lg px-4 py-3',
  alertWarn:    'bg-amber-50 dark:bg-orange-500/10 border border-amber-200 dark:border-orange-500/20 text-amber-800 dark:text-orange-300 text-sm rounded-lg px-4 py-3',

  // Text helpers — all upgraded for legibility in both themes
  textPrimary:   'text-gray-900 dark:text-gh-text',
  textSecondary: 'text-gray-600 dark:text-gray-300',
  textMuted:     'text-gray-500 dark:text-gray-400',
  textXs:        'text-xs text-gray-500 dark:text-gray-400',

  // Badges / code tags
  codeTag:      'text-xs bg-gray-100 dark:bg-gh-over text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded font-mono',
  codeTagBrand: 'text-xs bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded font-mono',
} as const;
