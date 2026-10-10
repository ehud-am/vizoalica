import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { getSetupState, type SetupState } from '../api/local-operations.js';

export type SetupValue = {
  /** Undefined when the console could not ask; nothing is then held back. */
  state: SetupState | undefined;
  /** Asks again and returns the answer; a failed ask keeps what was known. */
  refresh: () => Promise<SetupState | undefined>;
  replace: (state: SetupState) => void;
};

const SetupContext = createContext<SetupValue>({
  state: undefined,
  refresh: async () => undefined,
  replace: () => undefined
});

export const useSetup = (): SetupValue => useContext(SetupContext);

const POLL_MS = 30_000;

export const journeyComplete = (state: SetupState | undefined): boolean =>
  !state || state.stages.every((stage) => stage.status === 'done');

/**
 * Holds the setup state (who this is, what the backend is, how far along) for the whole console.
 * While the journey is unfinished it asks again every so often, so it advances by itself once
 * data arrives.
 */
export function SetupProvider({
  initial,
  children
}: {
  initial: SetupState | undefined;
  children: ReactNode;
}) {
  const [state, setState] = useState<SetupState | undefined>(initial);
  const refresh = useCallback(async () => {
    try {
      const next = await getSetupState();
      setState(next);
      return next;
    } catch {
      return undefined;
    }
  }, []);
  const complete = journeyComplete(state);
  useEffect(() => {
    if (complete) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [complete, refresh]);
  const value = useMemo(() => ({ state, refresh, replace: setState }), [state, refresh]);
  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}
