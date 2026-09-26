/** Sits in the deploy step: says "I've deployed" and starts the check below. */
export function DeployedButton({ onDeployed }: { onDeployed: () => void }) {
  return (
    <p>
      <button className="secondary" type="button" onClick={onDeployed}>
        I&rsquo;ve deployed, check now
      </button>
    </p>
  );
}
