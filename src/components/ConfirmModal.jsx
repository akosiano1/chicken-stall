import { useEffect, useRef } from 'react';

/**
 * Reusable Confirmation Modal Component
 * Uses DaisyUI modal pattern
 * 
 * @param {boolean} isOpen - Whether the modal is open
 * @param {string} title - Modal title
 * @param {string} message - Modal message/content
 * @param {function} onConfirm - Callback when user confirms
 * @param {function} onCancel - Callback when user cancels
 * @param {string} confirmText - Text for confirm button (default: "Confirm")
 * @param {string} cancelText - Text for cancel button (default: "Cancel")
 * @param {string} variant - Modal variant: 'error', 'warning', 'info' (default: 'info')
 */
export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info'
}) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (modalRef.current) {
      if (isOpen) {
        modalRef.current.showModal();
      } else {
        modalRef.current.close();
      }
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    if (modalRef.current) {
      modalRef.current.close();
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    if (modalRef.current) {
      modalRef.current.close();
    }
  };

  const getButtonClass = () => {
    switch (variant) {
      case 'error':
        return 'btn-error';
      case 'warning':
        return 'btn-warning';
      case 'info':
      default:
        return 'btn-primary';
    }
  };

  if (!isOpen) return null;

  return (
    <dialog ref={modalRef} className="modal">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">{title}</h3>
        <p className="py-4">{message}</p>
        <div className="modal-action">
          <form method="dialog">
            <button 
              type="button"
              className="btn btn-ghost mr-2"
              onClick={handleCancel}
            >
              {cancelText}
            </button>
            <button 
              type="button"
              className={`btn ${getButtonClass()}`}
              onClick={handleConfirm}
            >
              {confirmText}
            </button>
          </form>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={handleCancel}>close</button>
      </form>
    </dialog>
  );
}

