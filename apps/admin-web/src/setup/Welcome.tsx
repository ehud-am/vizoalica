import type { EnvironmentsList } from '../api/local-operations.js';

/**
 * Shown instead of the console when no environment is usable. It says what is wrong with each one and
 * sends the person to `vizoalica env`; the console never edits environments itself.
 */
export function Welcome({
  list,
  checking,
  onRecheck
}: {
  list: EnvironmentsList | undefined;
  checking: boolean;
  onRecheck: () => void;
}) {
  const broken = list?.file.status === 'broken';
  const environments = list?.environments ?? [];
  return (
    <section className="welcome" aria-labelledby="welcome-heading">
      <h1 id="welcome-heading">Welcome to Vizoalica</h1>
      <p>
        The console needs at least one working environment: a Vizoalica backend, the role you use it
        with, and its secret. Environments are set up outside the console, so they are ready before
        it opens.
      </p>
      {broken ? (
        <div className="notice error" role="alert">
          <p>
            <strong>The environments file cannot be used.</strong> {list?.file.reason}
          </p>
          <p>
            <code>{list?.file.path}</code>
          </p>
          <p>
            Fix it by hand, or move it aside and add your environments again with{' '}
            <code>vizoalica env add &lt;name&gt;</code>.
          </p>
        </div>
      ) : environments.length === 0 ? (
        <div className="notice" role="status">
          <p>
            <strong>No environments are set up yet.</strong>
          </p>
          <p>
            Add one in your terminal: <code>vizoalica env add &lt;name&gt;</code>
          </p>
        </div>
      ) : (
        <div role="status">
          <p>
            <strong>None of your environments can be used yet.</strong> Here is what is wrong with
            each:
          </p>
          <ul className="welcome-problems">
            {environments.map((environment) => (
              <li key={environment.name}>
                <strong>{environment.name}</strong>
                {environment.role ? ` (${environment.role})` : ''}
                <ul>
                  {environment.problems.map((problem) => (
                    <li key={problem.code + problem.message}>{problem.message}</li>
                  ))}
                </ul>
                <p>
                  Fix it with: <code>vizoalica env update {environment.name}</code>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p>
        See every environment and its state with <code>vizoalica env list</code>. The list is a
        plain file you can also edit by hand.
      </p>
      <button className="primary" type="button" onClick={onRecheck} disabled={checking}>
        {checking ? 'Checking…' : 'Check again'}
      </button>
    </section>
  );
}
