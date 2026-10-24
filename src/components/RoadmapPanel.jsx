import { formatMinutes } from "../lib/roadmap";

export default function RoadmapPanel({
  roadmap,
  loading,
  error,
  deadline,
  tasksGenerated,
  onRetry,
  onGenerateTasks,
}) {
  if (!roadmap && !loading && !error) return null;

  const status = loading ? "BUILDING ROADMAP" : error ? "ROADMAP UNAVAILABLE" : "ROADMAP READY";

  return (
    <section className="idea-roadmap" aria-labelledby="idea-roadmap-heading">
      <div className="idea-roadmap-top">
        <div>
          <span className="status-label">{status}</span>
          <h3 id="idea-roadmap-heading">
            {loading
              ? "Mapping the work to your time."
              : error
                ? "The roadmap didn't come through."
                : `${formatMinutes(roadmap.total_minutes)} across ${roadmap.phases.length} phases`}
          </h3>
        </div>
        <div className="idea-roadmap-meta">
          {deadline ? <span className="muted tiny">Deadline: {deadline}</span> : null}
          {roadmap ? (
            <span className="muted tiny">
              Budget: {formatMinutes(roadmap.budget_minutes)} · plan fits it
            </span>
          ) : null}
        </div>
      </div>

      <div aria-live="polite">
        {loading ? (
          <div className="roadmap-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {!loading && error ? (
          <div className="roadmap-error">
            <p className="muted small">{error}</p>
            <button className="button button-dark idea-roadmap-retry" type="button" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : null}

        {!loading && !error && roadmap ? (
          <>
            <ol className="roadmap-list">
              {roadmap.phases.map((phase, index) => (
                <li className="roadmap-phase" key={`${phase.name}-${index}`}>
                  <div className="roadmap-phase-top">
                    <span className="roadmap-step" aria-hidden="true">
                      0{index + 1}
                    </span>
                    <h4>{phase.name}</h4>
                    <span className="roadmap-time">{phase.estimated_time}</span>
                    <span
                      className={`roadmap-priority roadmap-priority-${phase.priority.toLocaleLowerCase()}`}
                    >
                      {phase.priority} priority
                    </span>
                  </div>
                  <p className="roadmap-objective">{phase.objective}</p>
                  <ul className="roadmap-tasks">
                    {phase.tasks.map((task, taskIndex) => (
                      <li key={`${task}-${taskIndex}`}>{task}</li>
                    ))}
                  </ul>
                  <p className="roadmap-role">
                    <strong>Suggested role:</strong> {phase.team_role}
                  </p>
                </li>
              ))}
            </ol>
            <div className="roadmap-actions">
              <div>
                <button
                  className="button button-dark roadmap-tasks-button"
                  type="button"
                  onClick={onGenerateTasks}
                >
                  {tasksGenerated ? "Regenerate Tasks" : "Generate Tasks"}
                </button>
                <p className="muted tiny roadmap-note">
                  Breaks these phases into tasks you can review. Nothing is saved until you confirm.
                </p>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
