import { s } from '../lib/styles';

interface Props {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  title, body, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  danger = false, isPending = false, onConfirm, onCancel,
}: Props) {
  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <h2 className={s.modalTitle}>{title}</h2>
        </div>
        <div className={s.modalBody}>
          <p className={`text-sm ${s.textSecondary} leading-relaxed`}>{body}</p>
        </div>
        <div className={s.modalFooter}>
          <button onClick={onCancel} className={s.btnSecondary}>{cancelLabel}</button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className={danger
              ? 'bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors'
              : s.btnPrimary
            }
          >
            {isPending ? '...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
