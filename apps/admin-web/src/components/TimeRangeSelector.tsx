import { useEffect, useId, useRef, useState } from 'react';
import {
  RANGE_PRESETS,
  datetimeLocalValueToUtc,
  localTimeZoneLabel,
  presetToRange,
  rangeSummary,
  utcToDatetimeLocalValue,
  validateCustomRange,
  type AppliedRange,
  type RangeFieldError,
  type RangePreset
} from '../time-range.js';

export function TimeRangeSelector({
  applied,
  onApply
}: {
  applied: AppliedRange;
  onApply: (range: AppliedRange) => void;
}) {
  const [open, setOpen] = useState(false);
  // Draft state is initialized once from the currently applied range and is
  // intentionally never resynced on open/close: an unapplied edit must
  // survive dismiss + reopen (T039), and only a successful Apply changes it.
  const [draftMode, setDraftMode] = useState<RangePreset | 'custom'>(
    applied.kind === 'preset' ? applied.preset : 'custom'
  );
  const [draftStart, setDraftStart] = useState(() => utcToDatetimeLocalValue(applied.startUtc));
  const [draftEnd, setDraftEnd] = useState(() => utcToDatetimeLocalValue(applied.endUtc));
  const [error, setError] = useState<RangeFieldError>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const startFieldId = useId();
  const endFieldId = useId();

  function closePopover(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closePopover(true);
    }
    function onPointerDown(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        closePopover(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  function apply() {
    if (draftMode === 'custom') {
      const startUtc = datetimeLocalValueToUtc(draftStart);
      const endUtc = datetimeLocalValueToUtc(draftEnd);
      const fieldError =
        startUtc === undefined
          ? { field: 'start' as const, message: 'Start is not a valid date.' }
          : endUtc === undefined
            ? { field: 'end' as const, message: 'End is not a valid date.' }
            : validateCustomRange(startUtc, endUtc);
      if (fieldError) {
        setError(fieldError);
        return;
      }
      setError(undefined);
      onApply({ kind: 'custom', startUtc: startUtc!, endUtc: endUtc! });
    } else {
      setError(undefined);
      onApply(presetToRange(draftMode));
    }
    closePopover(true);
  }

  return (
    <div className="time-range-selector">
      <button
        ref={triggerRef}
        type="button"
        className="time-range-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {rangeSummary(applied)}
      </button>
      <div
        ref={popoverRef}
        className="time-range-popover"
        role="dialog"
        aria-label="Choose a time range"
        hidden={!open}
      >
        <fieldset className="time-range-presets">
          <legend>Preset range</legend>
          {RANGE_PRESETS.map((preset) => (
            <label key={preset.value}>
              <input
                type="radio"
                name="time-range-preset"
                value={preset.value}
                checked={draftMode === preset.value}
                onChange={() => setDraftMode(preset.value)}
              />
              {preset.label}
            </label>
          ))}
          <label>
            <input
              type="radio"
              name="time-range-preset"
              value="custom"
              checked={draftMode === 'custom'}
              onChange={() => setDraftMode('custom')}
            />
            Custom
          </label>
        </fieldset>

        {draftMode === 'custom' && (
          <div className="time-range-custom">
            <label htmlFor={startFieldId}>
              From
              <input
                id={startFieldId}
                type="datetime-local"
                value={draftStart}
                aria-invalid={error?.field === 'start'}
                onChange={(event) => setDraftStart(event.target.value)}
              />
            </label>
            <label htmlFor={endFieldId}>
              To
              <input
                id={endFieldId}
                type="datetime-local"
                value={draftEnd}
                aria-invalid={error?.field === 'end'}
                onChange={(event) => setDraftEnd(event.target.value)}
              />
            </label>
            <p className="time-range-timezone">Times shown in {localTimeZoneLabel()}</p>
          </div>
        )}

        {error && (
          <p className="notice error" role="alert">
            {error.message}
          </p>
        )}

        <div className="time-range-actions">
          <button type="button" onClick={() => closePopover(true)}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={apply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
