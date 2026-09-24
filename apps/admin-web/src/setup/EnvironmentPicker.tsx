import { useState } from 'react';
import { selectEnvironment, type EnvironmentsList } from '../api/local-operations.js';

/** The only environment control in the console: choose which usable environment to work on. */
export function EnvironmentPicker({
  list,
  onChanged
}: {
  list: EnvironmentsList | undefined;
  onChanged: () => void;
}) {
  const [error, setError] = useState('');
  if (!list || !list.selected || list.environments.length === 0) return null;
  const selected = list.environments.find((item) => item.name === list.selected);
  if (list.environments.length === 1)
    return (
      <span className="environment-label" title={selected?.url}>
        Environment: <strong>{list.selected}</strong>
      </span>
    );
  return (
    <div className="environment-picker">
      <label htmlFor="environment-select">Environment</label>
      <select
        id="environment-select"
        value={list.selected}
        onChange={(event) => {
          setError('');
          selectEnvironment(event.target.value)
            .then(onChanged)
            .catch(() => setError('That environment could not be selected.'));
        }}
      >
        {list.environments.map((environment) => (
          <option key={environment.name} value={environment.name} disabled={!environment.usable}>
            {environment.name}
            {environment.role ? ` (${environment.role})` : ''}
            {environment.usable
              ? ''
              : ` - ${environment.problems[0]?.message ?? 'needs attention'}`}
          </option>
        ))}
      </select>
      {error && (
        <span className="notice error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
