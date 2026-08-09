import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${width} card p-0 overflow-hidden max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800">
          <h3 className="font-semibold text-surface-50">{title}</h3>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-100">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-surface-800 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
