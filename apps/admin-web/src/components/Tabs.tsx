import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<T extends string> {
  id: T;
  /** Accessible name. */
  label: string;
  /** Visible content of the tab; defaults to the label. */
  content?: ReactNode;
  /** Text that describes the tab, read after its name. */
  description?: string;
  disabled?: boolean;
}

/**
 * Tab pattern: one choice among a few, where each choice shows its own panel. Arrow keys, Home and
 * End move between enabled tabs and select as they go.
 */
export function Tabs<T extends string>({
  label,
  items,
  value,
  onChange,
  variant = 'segmented',
  children
}: {
  label: string;
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  variant?: 'segmented' | 'cards';
  children: ReactNode;
}) {
  const base = useId();
  const list = useRef<HTMLDivElement>(null);
  const enabled = items.filter((item) => !item.disabled);
  const tabId = (id: string) => `${base}-tab-${id}`;

  function onKeyDown(event: KeyboardEvent) {
    const index = enabled.findIndex((item) => item.id === value);
    let next = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = (index + 1) % enabled.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + enabled.length) % enabled.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = enabled[next]!;
    onChange(target.id);
    list.current?.querySelector<HTMLElement>(`[id="${tabId(target.id)}"]`)?.focus();
  }

  return (
    <>
      <div
        ref={list}
        role="tablist"
        aria-label={label}
        className={`tabs tabs-${variant}`}
        onKeyDown={onKeyDown}
      >
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              id={tabId(item.id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              aria-label={item.label}
              aria-disabled={item.disabled || undefined}
              disabled={item.disabled}
              tabIndex={selected ? 0 : -1}
              className={selected ? 'tab selected' : 'tab'}
              onClick={() => onChange(item.id)}
            >
              {item.content ?? item.label}
              {item.description && <span className="sr-only">{item.description}</span>}
            </button>
          );
        })}
      </div>
      <div
        id={`${base}-panel`}
        role="tabpanel"
        aria-labelledby={tabId(value)}
        className="tab-panel"
      >
        {children}
      </div>
    </>
  );
}
