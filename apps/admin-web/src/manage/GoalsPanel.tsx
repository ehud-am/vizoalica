import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  ApiError,
  createGoal,
  deleteGoal,
  getGoalsList,
  type Goal,
  type GoalKind
} from '../api/local-operations.js';
import { ActionButton } from '../components/ActionButton.js';
import { hrefFor } from '../router.js';

const MAX_GOALS = 20;
const KINDS: Array<{ id: GoalKind; label: string; hint: string; example: string }> = [
  { id: 'page', label: 'Page view', hint: 'A page key such as /thanks', example: '/thanks' },
  {
    id: 'action',
    label: 'Click',
    hint: 'An action name such as Start free trial',
    example: 'Start free trial'
  },
  { id: 'event', label: 'Event', hint: 'A custom event name such as signup', example: 'signup' }
];

/**
 * The goals of one website: what counts as a conversion. Conversions are counted from data the
 * website already sends, so a new goal also covers earlier days within retention.
 */
export function GoalsPanel({ projectId, websiteId }: { projectId: string; websiteId: string }) {
  const id = useId();
  const [goals, setGoals] = useState<Goal[] | 'unavailable' | 'failed' | undefined>();
  const [reload, setReload] = useState(0);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GoalKind>('event');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = KINDS.find((entry) => entry.id === kind)!;

  useEffect(() => {
    let cancelled = false;
    setGoals(undefined);
    getGoalsList(projectId, websiteId)
      .then((list) => !cancelled && setGoals(Array.isArray(list) ? list : 'unavailable'))
      .catch(
        (caught: unknown) =>
          !cancelled &&
          // Only a backend that predates goals says "older"; any other error is a failed request.
          setGoals(
            caught instanceof ApiError &&
              (caught.code === 'database_update_needed' || caught.status === 404)
              ? 'unavailable'
              : 'failed'
          )
      );
    return () => {
      cancelled = true;
    };
  }, [projectId, websiteId, reload]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !target.trim()) {
      setError('Enter a name and what to count.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const goal = await createGoal(projectId, websiteId, {
        name: name.trim(),
        kind,
        target: target.trim()
      });
      setGoals((list) => [...(Array.isArray(list) ? list : []), goal]);
      setName('');
      setTarget('');
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === 'database_update_needed'
          ? 'The backend database needs its latest update. Run vizoalica deploy <name> --update, then add the goal again.'
          : kind === 'page' && !target.trim().startsWith('/')
            ? 'A page goal starts with /, such as /thanks.'
            : kind === 'page'
              ? 'A page goal is a path as the website reports it, such as /thanks: no trailing slash or spaces, and :id in place of numbers.'
              : 'The goal could not be added. Check the entries and try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(goal: Goal) {
    setBusy(true);
    setError('');
    try {
      await deleteGoal(projectId, websiteId, goal.id);
      setGoals((list) =>
        Array.isArray(list) ? list.filter((entry) => entry.id !== goal.id) : list
      );
    } catch {
      setError('The goal could not be deleted. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (goals === 'failed')
    return (
      <p className="hint" role="alert">
        The goals could not be loaded. Check the connection and try again.{' '}
        <button type="button" className="link-button" onClick={() => setReload((n) => n + 1)}>
          Retry
        </button>
      </p>
    );
  if (goals === 'unavailable')
    return (
      <p className="hint">
        This backend is older than 0.14, so it cannot count goals yet. Update it with{' '}
        <code>vizoalica deploy &lt;name&gt; --update</code>.
      </p>
    );
  const list = goals ?? [];
  return (
    <>
      {goals !== undefined &&
        (list.length === 0 ? (
          <p className="hint">
            No goals yet. A goal counts a page view, a click, or an event that you care about.
          </p>
        ) : (
          <ul className="plain-list" aria-label="Goals">
            {list.map((goal) => (
              <li key={goal.id}>
                <strong>{goal.name}</strong> ·{' '}
                {KINDS.find((entry) => entry.id === goal.kind)?.label} <code>{goal.target}</code>{' '}
                <ActionButton
                  capability="delete-goal"
                  className="link-button"
                  disabled={busy}
                  onClick={() => void remove(goal)}
                  aria-label={`Delete goal ${goal.name}`}
                >
                  Delete
                </ActionButton>
              </li>
            ))}
          </ul>
        ))}
      {list.length < MAX_GOALS && (
        <form onSubmit={add} className="inline-form" aria-label="Add a goal">
          <div className="field">
            <label htmlFor={`${id}-name`}>Goal name</label>
            <input
              id={`${id}-name`}
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="Signed up"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-kind`}>Counts</label>
            <select
              id={`${id}-kind`}
              value={kind}
              onChange={(event) => setKind(event.target.value as GoalKind)}
            >
              {KINDS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-target`}>What to count</label>
            <input
              id={`${id}-target`}
              value={target}
              maxLength={kind === 'page' ? 512 : 80}
              onChange={(event) => setTarget(event.target.value)}
              placeholder={current.example}
              autoComplete="off"
              spellCheck={false}
              aria-describedby={`${id}-target-help`}
            />
            <small id={`${id}-target-help`}>{current.hint}.</small>
          </div>
          <ActionButton capability="add-goal" type="submit" className="secondary" disabled={busy}>
            Add goal
          </ActionButton>
        </form>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <a className="secondary button-link" href={hrefFor('analytics/goals')}>
        See conversions
      </a>
    </>
  );
}
