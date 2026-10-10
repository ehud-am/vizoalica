import type { Stage } from '../api/local-operations.js';
import { journeyComplete, useSetup } from './SetupProvider.js';

const STATUS: Record<Stage['status'], { text: string; icon: string }> = {
  done: { text: 'Done', icon: '✓' },
  current: { text: 'Current step', icon: '●' },
  todo: { text: 'To do', icon: '○' },
  blocked: { text: 'Blocked', icon: '⚠' }
};

/** Explains, on an analytics screen, why there is nothing to see yet and what to do about it. */
export function AnalyticsSetupHint() {
  const { state } = useSetup();
  if (!state || state.connection.status !== 'connected' || journeyComplete(state)) return null;
  const waiting = state.stages.find((stage) => stage.status === 'current');
  if (!waiting || (waiting.id !== 'website' && waiting.id !== 'data')) return null;
  return (
    <p className="notice" role="status">
      {waiting.id === 'website'
        ? 'There is nothing to show yet: no website is registered.'
        : 'There is nothing to show yet: no data has arrived from your websites.'}{' '}
      {waiting.next?.href ? (
        <a href={waiting.next.href}>{waiting.next.label}</a>
      ) : (
        waiting.next?.label
      )}
    </p>
  );
}

/**
 * Four stages from a running console to results: which are done, which is current, and the one
 * thing to do next. It hides itself once data is arriving.
 */
export function Journey() {
  const { state } = useSetup();
  if (!state || journeyComplete(state)) return null;
  const current = state.stages.find(
    (stage) => stage.status === 'current' || stage.status === 'blocked'
  );
  return (
    <section className="journey" aria-label="Setup progress">
      <ol className="journey-stages">
        {state.stages.map((stage, index) => {
          const shown = STATUS[stage.status];
          return (
            <li
              key={stage.id}
              className={`journey-stage ${stage.status}`}
              aria-current={stage === current ? 'step' : undefined}
            >
              <span className="journey-number" aria-hidden="true">
                {index + 1}
              </span>
              <span className="journey-label">
                <strong>{stage.label}</strong>
                <span className="journey-status">
                  <span aria-hidden="true">{shown.icon} </span>
                  {shown.text}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {current?.next && (
        <p className="journey-next">
          <strong>Next:</strong>{' '}
          {current.next.href ? (
            <a href={current.next.href}>{current.next.label}</a>
          ) : (
            current.next.label
          )}
        </p>
      )}
    </section>
  );
}
