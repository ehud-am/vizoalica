import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

interface Flash {
  message: string;
  /** True while the message is waiting for the navigation that should carry it. */
  carrying: boolean;
}

interface FlashValue {
  message: string;
  /** Show a confirmation on this page; it is cleared at the next navigation. */
  show: (message: string) => void;
  /** Show a confirmation on the page the operator is about to be sent to. */
  carry: (message: string) => void;
  dismiss: () => void;
}

const FlashContext = createContext<FlashValue | undefined>(undefined);

export function useFlash(): FlashValue {
  const value = useContext(FlashContext);
  if (!value) throw new Error('useFlash must be used inside FlashProvider');
  return value;
}

/**
 * Confirmations that follow an action ("Website updated"). `routeKey` changes on every
 * navigation: a message from `show` is dropped, while one from `carry` survives exactly one.
 */
export function FlashProvider({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const [flash, setFlash] = useState<Flash>({ message: '', carrying: false });
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setFlash((current) =>
      current.carrying
        ? { message: current.message, carrying: false }
        : { message: '', carrying: false }
    );
  }, [routeKey]);

  const show = useCallback((message: string) => setFlash({ message, carrying: false }), []);
  const carry = useCallback((message: string) => setFlash({ message, carrying: true }), []);
  const dismiss = useCallback(() => setFlash({ message: '', carrying: false }), []);
  const value = useMemo(
    () => ({ message: flash.message, show, carry, dismiss }),
    [flash.message, show, carry, dismiss]
  );
  return <FlashContext.Provider value={value}>{children}</FlashContext.Provider>;
}

/** The live region exists before any message does, so assistive technology announces it. */
export function FlashMessage() {
  const { message, dismiss } = useFlash();
  return (
    <div className="flash" role="status" aria-live="polite">
      {message && (
        <p className="notice success">
          {message}{' '}
          <button className="link-button" type="button" onClick={dismiss}>
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}
