import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  danger = true,
  onConfirm,
  onCancel,
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width="max-w-sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={loading}>
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className={`shrink-0 mt-0.5 ${danger ? 'text-red-400' : 'text-accent-400'}`}>
          <AlertTriangle size={20} />
        </div>
        <p className="text-sm text-surface-300">{message}</p>
      </div>
    </Modal>
  );
}
