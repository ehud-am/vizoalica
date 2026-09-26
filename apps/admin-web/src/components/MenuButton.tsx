import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface MenuItem {
  id: string;
  label: string;
  /** A small separate tag next to the label, such as a role. */
  badge?: string;
  /** A second line, such as why the item cannot be chosen. */
  detail?: string;
  disabled?: boolean;
}

export interface MenuLink {
  id: string;
  label: string;
  href: string;
}

/**
 * A button that opens a short list to choose one thing from, with optional links underneath. Built
 * as its own control (not a native select) so the name, a role badge and a reason can each be their
 * own element, and the arrow has a column of its own and can never touch the text.
 *
 * Keyboard: Enter, Space or Down opens; arrows, Home and End move; a letter jumps to the next choice
 * starting with it; Enter or Space chooses; Escape closes and returns focus to the button. With
 * `menu={false}` it shows the current value and does not open, for a list of one.
 */
export function MenuButton({
  caption,
  value,
  badge,
  items,
  selected,
  onSelect,
  links = [],
  menu = true,
  title
}: {
  /** What is being chosen, said before the value ("Environment"). */
  caption: string;
  value: string;
  badge?: string;
  items: MenuItem[];
  selected: string | undefined;
  onSelect: (id: string) => void;
  links?: MenuLink[];
  menu?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const entries = useRef<Array<HTMLElement | null>>([]);
  // Disabled items are shown but never focused or chosen, so the keys skip them.
  const focusable = [
    ...items.map((item, index) => ({ index, disabled: !!item.disabled })),
    ...links.map((_, index) => ({ index: items.length + index, disabled: false }))
  ].filter((entry) => !entry.disabled);

  useEffect(() => {
    if (!open) return;
    const start = items.findIndex((item) => item.id === selected && !item.disabled);
    entries.current[start >= 0 ? start : (focusable[0]?.index ?? 0)]?.focus();
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
    // Focus moves once, when the list opens.
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  };

  function move(from: number, step: 1 | -1 | 'first' | 'last') {
    const order = focusable.map((entry) => entry.index);
    if (order.length === 0) return;
    const at = order.indexOf(from);
    const next =
      step === 'first'
        ? order[0]!
        : step === 'last'
          ? order[order.length - 1]!
          : order[(at + step + order.length) % order.length]!;
    entries.current[next]?.focus();
  }

  function onListKey(event: KeyboardEvent<HTMLElement>, index: number) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        return move(index, 1);
      case 'ArrowUp':
        event.preventDefault();
        return move(index, -1);
      case 'Home':
        event.preventDefault();
        return move(index, 'first');
      case 'End':
        event.preventDefault();
        return move(index, 'last');
      case 'Escape':
        event.preventDefault();
        return close(true);
      case 'Tab':
        return close(false);
    }
    // Typing a letter moves to the next choice that starts with it, as in a native list.
    if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey) {
      const labels = [...items.map((item) => item.label), ...links.map((link) => link.label)];
      const order = focusable.map((entry) => entry.index);
      const after = order.indexOf(index);
      const typed = event.key.toLowerCase();
      for (let step = 1; step <= order.length; step += 1) {
        const candidate = order[(after + step) % order.length]!;
        if (labels[candidate]!.toLowerCase().startsWith(typed)) {
          event.preventDefault();
          entries.current[candidate]?.focus();
          return;
        }
      }
    }
  }

  const face = (
    <>
      <span className="menu-caption">{caption}</span>
      <span className="menu-value">{value}</span>
      {badge && <span className="menu-badge">{badge}</span>}
    </>
  );

  if (!menu)
    return (
      <div className="menu-button menu-static" title={title}>
        <span className="menu-face">{face}</span>
      </div>
    );

  return (
    <div className="menu-button" ref={root}>
      <button
        ref={button}
        type="button"
        className="menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        title={title}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="menu-face">{face}</span>
        <span className="menu-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="menu-list" role="menu" id={listId} aria-label={caption}>
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                entries.current[index] = element;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={item.id === selected}
              aria-disabled={item.disabled || undefined}
              tabIndex={-1}
              className="menu-item"
              onClick={() => {
                if (item.disabled) return;
                onSelect(item.id);
                close(true);
              }}
              onKeyDown={(event) => onListKey(event, index)}
            >
              <span className="menu-item-main">
                <span className="menu-item-label">{item.label}</span>
                {item.badge && <span className="menu-badge">{item.badge}</span>}
                {item.id === selected && <span className="menu-mark" aria-hidden="true" />}
              </span>
              {item.detail && <span className="menu-item-detail">{item.detail}</span>}
            </button>
          ))}
          {links.length > 0 && (
            <>
              <div className="menu-divider" role="separator" />
              {links.map((link, offset) => {
                const index = items.length + offset;
                return (
                  <a
                    key={link.id}
                    ref={(element) => {
                      entries.current[index] = element;
                    }}
                    role="menuitem"
                    className="menu-item menu-link"
                    href={link.href}
                    tabIndex={-1}
                    onClick={() => close(false)}
                    onKeyDown={(event) => onListKey(event, index)}
                  >
                    {link.label}
                  </a>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
