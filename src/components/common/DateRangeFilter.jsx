import { useState, useEffect } from 'react';
import {
  DATE_PRESETS,
  getPresetDateRange,
  validateDateRange,
  getPresetLabel,
} from '../../utils/dateFilterUtils';

/**
 * Reusable Date Range Filter Component
 * 
 * @param {Object} props
 * @param {string} props.startDate - Current start date value (YYYY-MM-DD)
 * @param {string} props.endDate - Current end date value (YYYY-MM-DD)
 * @param {Function} props.onChange - Callback when dates change: (startDate, endDate) => void
 * @param {Object} props.options - Additional options
 * @param {number} options.maxDays - Maximum allowed days in range
 * @param {boolean} options.allowFuture - Allow future dates (default: false)
 * @param {boolean} options.showPresets - Show preset dropdown (default: true)
 * @param {string} options.size - Input size: 'sm', 'md', 'lg' (default: 'sm')
 * @param {string} options.labelSize - Label text size class (default: 'text-xs')
 * @param {string} options.maxWidth - Max width class for dropdown (default: 'max-w-xs')
 */
export default function DateRangeFilter({
  startDate = '',
  endDate = '',
  onChange,
  options = {},
}) {
  const {
    maxDays,
    allowFuture = false,
    showPresets = true,
    size = 'sm',
    labelSize = 'text-xs',
    maxWidth = 'max-w-xs',
  } = options;

  const [localStartDate, setLocalStartDate] = useState(startDate);
  const [localEndDate, setLocalEndDate] = useState(endDate);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [validationError, setValidationError] = useState(null);

  // Sync with external state changes
  useEffect(() => {
    setLocalStartDate(startDate);
    setLocalEndDate(endDate);
    // Detect preset from dates or set to empty if no dates
    if (startDate || endDate) {
      const preset = detectPreset(startDate, endDate);
      setSelectedPreset(preset);
    } else {
      setSelectedPreset('');
    }
  }, [startDate, endDate]);

  // Detect which preset matches current dates
  const detectPreset = (start, end) => {
    if (!start && !end) return '';

    for (const preset of Object.values(DATE_PRESETS)) {
      if (preset === DATE_PRESETS.CUSTOM) continue;
      const range = getPresetDateRange(preset);
      if (range.startDate === start && range.endDate === end) {
        return preset;
      }
    }
    return DATE_PRESETS.CUSTOM;
  };

  // Handle preset dropdown change
  const handlePresetChange = (presetValue) => {
    setSelectedPreset(presetValue);
    setValidationError(null);

    // Empty selection means no filter
    if (!presetValue || presetValue === '') {
      setLocalStartDate('');
      setLocalEndDate('');
      if (onChange) {
        onChange('', '');
      }
      return;
    }

    // Custom range - show date inputs but don't change dates yet
    if (presetValue === DATE_PRESETS.CUSTOM) {
      // Keep existing dates if any, otherwise leave empty for user to fill
      return;
    }

    // Apply preset dates
    const range = getPresetDateRange(presetValue);
    setLocalStartDate(range.startDate);
    setLocalEndDate(range.endDate);

    if (onChange) {
      onChange(range.startDate, range.endDate);
    }
  };

  // Handle date input change
  const handleDateChange = (type, value) => {
    const newStartDate = type === 'start' ? value : localStartDate;
    const newEndDate = type === 'end' ? value : localEndDate;

    // Update local state immediately for responsive UI
    if (type === 'start') {
      setLocalStartDate(value);
    } else {
      setLocalEndDate(value);
    }

    // Validate
    const validation = validateDateRange(newStartDate, newEndDate, {
      maxDays,
      allowFuture,
    });

    if (!validation.valid) {
      setValidationError(validation.error);
      return;
    }

    setValidationError(null);
    // When user manually changes dates, set to custom
    setSelectedPreset(DATE_PRESETS.CUSTOM);

    // Notify parent
    if (onChange) {
      onChange(newStartDate, newEndDate);
    }
  };

  // Handle clear
  const handleClear = () => {
    setLocalStartDate('');
    setLocalEndDate('');
    setSelectedPreset('');
    setValidationError(null);
    if (onChange) {
      onChange('', '');
    }
  };

  const inputSizeClass = size === 'sm' ? 'input-sm' : size === 'lg' ? 'input-lg' : '';
  const selectSizeClass = size === 'sm' ? 'select-sm' : size === 'lg' ? 'select-lg' : '';
  const hasActiveFilter = localStartDate || localEndDate;
  const showCustomInputs = selectedPreset === DATE_PRESETS.CUSTOM;

  const buttonSizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';

  return (
    <div className="space-y-2">
      {/* Preset Dropdown with Clear Button Inline */}
      {showPresets && (
        <div className="form-control">
          <label className="label">
            <span className={`label-text ${labelSize}`}>Period</span>
          </label>
          <div className="flex gap-2 items-end">
            <select
              className={`select select-bordered w-full ${maxWidth} ${selectSizeClass}`}
              value={selectedPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
            >
              <option value="">Select Period</option>
              {Object.values(DATE_PRESETS)
                .filter((p) => p !== DATE_PRESETS.CUSTOM)
                .map((preset) => (
                  <option key={preset} value={preset}>
                    {getPresetLabel(preset)}
                  </option>
                ))}
              <option value={DATE_PRESETS.CUSTOM}>Custom Range</option>
            </select>
            {hasActiveFilter && (
              <button
                type="button"
                className={`btn btn-ghost btn-square ${buttonSizeClass} border-primary`}
                onClick={handleClear}
                title="Clear filter"
                aria-label="Clear filter"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Date Inputs - Only show when Custom Range is selected */}
      {showCustomInputs && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="form-control">
            <label className="label">
              <span className={`label-text ${labelSize}`}>Start Date</span>
            </label>
            <input
              type="date"
              className={`input input-bordered ${inputSizeClass} ${
                validationError ? 'input-error' : ''
              }`}
              value={localStartDate}
              max={allowFuture ? undefined : new Date().toISOString().split('T')[0]}
              onChange={(e) => handleDateChange('start', e.target.value)}
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className={`label-text ${labelSize}`}>End Date</span>
            </label>
            <input
              type="date"
              className={`input input-bordered ${inputSizeClass} ${
                validationError ? 'input-error' : ''
              }`}
              value={localEndDate}
              min={localStartDate || undefined}
              max={allowFuture ? undefined : new Date().toISOString().split('T')[0]}
              onChange={(e) => handleDateChange('end', e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Validation Error */}
      {validationError && (
        <div className="text-error text-xs mt-1">{validationError}</div>
      )}

      {/* Active Filter Indicator */}
      {hasActiveFilter && !validationError && !showCustomInputs && (
        <div className="text-xs text-base-content/70 mt-1">
          {localStartDate && localEndDate
            ? `${localStartDate} to ${localEndDate}`
            : localStartDate
            ? `From ${localStartDate}`
            : `Until ${localEndDate}`}
        </div>
      )}
    </div>
  );
}

