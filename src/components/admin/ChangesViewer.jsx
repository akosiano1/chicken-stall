import { useState, useMemo, useRef, useEffect } from 'react';
import { formatPHDate } from '../../utils/dateUtils';
import { useNotifications } from '../../contexts/NotificationContext';

/**
 * ChangesViewer Component
 * Displays audit log changes with field-level diff, formatting, and enhanced UX
 * 
 * @param {string} oldValue - JSON string of old value
 * @param {string} newValue - JSON string of new value
 * @param {string} action - Action type (CREATE, UPDATE, DELETE)
 * @param {string} entity - Entity type
 */
export default function ChangesViewer({ oldValue, newValue, action, entity }) {
  const { showSuccess, showError } = useNotifications();
  const [showModal, setShowModal] = useState(false);
  const [parseError, setParseError] = useState(null);

  // Parse and memoize values
  const { oldVal, newVal, changes, hasChanges } = useMemo(() => {
    let parsedOld = null;
    let parsedNew = null;
    let error = null;

    try {
      if (oldValue) {
        parsedOld = JSON.parse(oldValue);
      }
    } catch (e) {
      error = `Failed to parse old value: ${e.message}`;
    }

    try {
      if (newValue) {
        parsedNew = JSON.parse(newValue);
      }
    } catch (e) {
      error = error ? `${error}; Failed to parse new value: ${e.message}` : `Failed to parse new value: ${e.message}`;
    }

    if (error) {
      setParseError(error);
    } else {
      setParseError(null);
    }

    // Calculate field-level changes
    const changesList = calculateChanges(parsedOld, parsedNew, action);
    const hasChangesData = changesList.length > 0 || parsedOld || parsedNew;

    return {
      oldVal: parsedOld,
      newVal: parsedNew,
      changes: changesList,
      hasChanges: hasChangesData
    };
  }, [oldValue, newValue, action]);

  /**
   * Calculate field-level changes between old and new values
   */
  function calculateChanges(oldObj, newObj, actionType) {
    if (!oldObj && !newObj) return [];
    if (actionType === 'CREATE' || actionType === 'DELETE') return [];

    if (!oldObj || !newObj) return [];

    // Only calculate changes for objects (not arrays or primitives)
    if (typeof oldObj !== 'object' || Array.isArray(oldObj) ||
        typeof newObj !== 'object' || Array.isArray(newObj)) {
      return [];
    }

    const changes = [];
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    allKeys.forEach(key => {
      const oldVal = oldObj[key];
      const newVal = newObj[key];

      if (oldVal === undefined && newVal !== undefined) {
        // Added field
        changes.push({
          field: key,
          type: 'added',
          oldValue: null,
          newValue: newVal
        });
      } else if (oldVal !== undefined && newVal === undefined) {
        // Removed field
        changes.push({
          field: key,
          type: 'removed',
          oldValue: oldVal,
          newValue: null
        });
      } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        // Modified field
        changes.push({
          field: key,
          type: 'modified',
          oldValue: oldVal,
          newValue: newVal
        });
      }
    });

    return changes;
  }

  /**
   * Format a value based on field name and value type
   */
  function formatValue(value, fieldName = '') {
    if (value === null || value === undefined) return 'null';

    // Format dates
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return formatPHDate(value, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    // Format currency (fields with price, cost, amount, total)
    if (typeof value === 'number' && 
        (fieldName.toLowerCase().includes('price') || 
         fieldName.toLowerCase().includes('cost') || 
         fieldName.toLowerCase().includes('amount') || 
         fieldName.toLowerCase().includes('total'))) {
      return `₱${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Format numbers
    if (typeof value === 'number') {
      return value.toLocaleString('en-US');
    }

    // Format booleans
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    // Format arrays
    if (Array.isArray(value)) {
      return `[${value.length} item${value.length !== 1 ? 's' : ''}]`;
    }

    // Format objects
    if (typeof value === 'object') {
      return `{${Object.keys(value).length} field${Object.keys(value).length !== 1 ? 's' : ''}}`;
    }

    return String(value);
  }

  /**
   * Copy value to clipboard
   */
  async function copyToClipboard(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(`${label} copied to clipboard`);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      showError('Failed to copy to clipboard');
    }
  }

  if (!hasChanges && !parseError) {
    return <span className="text-base-content/50">-</span>;
  }

  // Show parse error
  if (parseError) {
    return (
      <div className="tooltip tooltip-left" data-tip={parseError}>
        <button
          className="btn btn-xs btn-error btn-ghost"
          onClick={() => setShowModal(true)}
        >
          ⚠️ Error
        </button>
      </div>
    );
  }

  // For CREATE actions, show new value summary
  if (action === 'CREATE' && newVal) {
    const fieldCount = typeof newVal === 'object' && !Array.isArray(newVal) 
      ? Object.keys(newVal).length 
      : Array.isArray(newVal) ? newVal.length : 1;
    return (
      <>
        <button
          className="btn btn-xs btn-success btn-ghost"
          onClick={() => setShowModal(true)}
        >
          View ({fieldCount} {typeof newVal === 'object' && !Array.isArray(newVal) ? 'field' : 'item'}{fieldCount !== 1 ? 's' : ''})
        </button>
        {showModal && (
          <ChangesModal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            oldVal={null}
            newVal={newVal}
            changes={[]}
            action={action}
            entity={entity}
            formatValue={formatValue}
            copyToClipboard={copyToClipboard}
          />
        )}
      </>
    );
  }

  // For DELETE actions, show old value summary
  if (action === 'DELETE' && oldVal) {
    const fieldCount = typeof oldVal === 'object' && !Array.isArray(oldVal) 
      ? Object.keys(oldVal).length 
      : Array.isArray(oldVal) ? oldVal.length : 1;
    return (
      <>
        <button
          className="btn btn-xs btn-error btn-ghost"
          onClick={() => setShowModal(true)}
        >
          View ({fieldCount} {typeof oldVal === 'object' && !Array.isArray(oldVal) ? 'field' : 'item'}{fieldCount !== 1 ? 's' : ''})
        </button>
        {showModal && (
          <ChangesModal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            oldVal={oldVal}
            newVal={null}
            changes={[]}
            action={action}
            entity={entity}
            formatValue={formatValue}
            copyToClipboard={copyToClipboard}
          />
        )}
      </>
    );
  }

  // For UPDATE actions, show change summary
  if (changes.length > 0) {
    return (
      <>
        <button
          className="btn btn-xs btn-warning btn-ghost"
          onClick={() => setShowModal(true)}
        >
          {changes.length} change{changes.length !== 1 ? 's' : ''}
        </button>
        {showModal && (
          <ChangesModal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            oldVal={oldVal}
            newVal={newVal}
            changes={changes}
            action={action}
            entity={entity}
            formatValue={formatValue}
            copyToClipboard={copyToClipboard}
          />
        )}
      </>
    );
  }

  // Fallback: show both values if no specific changes detected
  return (
    <>
      <button
        className="btn btn-xs btn-info btn-ghost"
        onClick={() => setShowModal(true)}
      >
        View
      </button>
      {showModal && (
        <ChangesModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          oldVal={oldVal}
          newVal={newVal}
          changes={changes}
          action={action}
          entity={entity}
          formatValue={formatValue}
          copyToClipboard={copyToClipboard}
        />
      )}
    </>
  );
}

/**
 * ChangesModal Component
 * Modal for detailed change comparison
 */
function ChangesModal({
  isOpen,
  onClose,
  oldVal,
  newVal,
  changes,
  action,
  entity,
  formatValue,
  copyToClipboard
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

  if (!isOpen) return null;

  return (
    <dialog ref={modalRef} className="modal">
      <div className="modal-box max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-4 md:p-6">
        <h3 className="font-bold text-lg mb-4">Change Details</h3>
        
        <div className="flex-1 overflow-y-auto">
          {changes.length > 0 ? (
            // Field-level diff view
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="badge badge-primary">{action}</span>
                <span className="badge badge-secondary">{entity}</span>
                <span className="text-sm text-base-content/70">
                  {changes.length} field{changes.length !== 1 ? 's' : ''} changed
                </span>
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="table table-zebra w-full">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Old Value</th>
                      <th>New Value</th>
                      <th>Change Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((change, idx) => (
                      <tr key={idx}>
                        <td className="font-semibold">{change.field}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className={change.type === 'removed' || change.type === 'modified' ? 'text-error' : ''}>
                              {change.oldValue !== null ? formatValue(change.oldValue, change.field) : '-'}
                            </span>
                            {change.oldValue !== null && (
                              <button
                                className="btn btn-xs btn-ghost"
                                onClick={() => copyToClipboard(JSON.stringify(change.oldValue, null, 2), 'Old value')}
                                title="Copy old value"
                              >
                                📋
                              </button>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className={change.type === 'added' || change.type === 'modified' ? 'text-success' : ''}>
                              {change.newValue !== null ? formatValue(change.newValue, change.field) : '-'}
                            </span>
                            {change.newValue !== null && (
                              <button
                                className="btn btn-xs btn-ghost"
                                onClick={() => copyToClipboard(JSON.stringify(change.newValue, null, 2), 'New value')}
                                title="Copy new value"
                              >
                                📋
                              </button>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`badge badge-sm ${
                            change.type === 'added' ? 'badge-success' :
                            change.type === 'removed' ? 'badge-error' :
                            'badge-warning'
                          }`}>
                            {change.type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {changes.map((change, idx) => (
                  <div key={idx} className="card bg-base-200 shadow-sm">
                    <div className="card-body p-3">
                      {/* Field Name Header */}
                      <div className="mb-2">
                        <p className="font-semibold text-sm">{change.field}</p>
                      </div>
                      
                      {/* Old Value */}
                      <div className="mb-2">
                        <p className="text-xs text-base-content/70 mb-1">Old Value</p>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm ${change.type === 'removed' || change.type === 'modified' ? 'text-error' : ''}`}>
                            {change.oldValue !== null ? formatValue(change.oldValue, change.field) : '-'}
                          </span>
                          {change.oldValue !== null && (
                            <button
                              className="btn btn-xs btn-ghost"
                              onClick={() => copyToClipboard(JSON.stringify(change.oldValue, null, 2), 'Old value')}
                              title="Copy old value"
                            >
                              📋
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Divider */}
                      <div className="mb-2 pb-2 border-b border-base-300"></div>
                      
                      {/* New Value */}
                      <div className="mb-2">
                        <p className="text-xs text-base-content/70 mb-1">New Value</p>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm ${change.type === 'added' || change.type === 'modified' ? 'text-success' : ''}`}>
                            {change.newValue !== null ? formatValue(change.newValue, change.field) : '-'}
                          </span>
                          {change.newValue !== null && (
                            <button
                              className="btn btn-xs btn-ghost"
                              onClick={() => copyToClipboard(JSON.stringify(change.newValue, null, 2), 'New value')}
                              title="Copy new value"
                            >
                              📋
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Change Type Badge */}
                      <div className="mt-2">
                        <span className={`badge badge-sm ${
                          change.type === 'added' ? 'badge-success' :
                          change.type === 'removed' ? 'badge-error' :
                          'badge-warning'
                        }`}>
                          {change.type}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Full object view when no specific changes detected
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {oldVal && (
                <div className="card bg-base-200 shadow-sm">
                  <div className="card-body p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-error text-sm">Old Value</h4>
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={() => copyToClipboard(JSON.stringify(oldVal, null, 2), 'Old value')}
                      >
                        📋 Copy
                      </button>
                    </div>
                    <pre className="bg-base-100 p-3 rounded-lg text-xs overflow-x-auto">
                      {JSON.stringify(oldVal, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              {newVal && (
                <div className="card bg-base-200 shadow-sm">
                  <div className="card-body p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-success text-sm">New Value</h4>
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={() => copyToClipboard(JSON.stringify(newVal, null, 2), 'New value')}
                      >
                        📋 Copy
                      </button>
                    </div>
                    <pre className="bg-base-100 p-3 rounded-lg text-xs overflow-x-auto">
                      {JSON.stringify(newVal, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-action mt-4">
          <form method="dialog">
            <button className="btn" onClick={onClose}>Close</button>
          </form>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}

