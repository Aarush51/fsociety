import { Link } from "react-router-dom";
import { Arrow } from "./Icons";
import { formatMinutes } from "../lib/roadmap";

// Review-first task conversion. Tasks only exist in this list until the user
// presses “Confirm & Save Tasks”.
export default function RoadmapTasksPanel({
  tasks,
  status,
  projectId,
  projects,
  projectsLoading,
  projectsError,
  signedIn,
  saving,
  containerRef,
  onProjectChange,
  onConfirm,
  onCreateProject,
  onRetryProjects,
}) {
  if (!tasks.length) return null;

  const totalMinutes = tasks.reduce((sum, task) => sum + task.estimated_minutes, 0);
  const canConfirm = signedIn && Boolean(projectId) && !saving && !status.done;

  return (
    <section
      className="roadmap-task-panel"
      aria-labelledby="roadmap-tasks-heading"
      ref={containerRef}
    >
      <div className="roadmap-task-top">
        <div>
          <span className="status-label">
            {status.done ? "TASKS SAVED" : "TASKS READY FOR REVIEW"}
          </span>
          <h3 id="roadmap-tasks-heading">
            {status.done
              ? "Your project board is up to date."
              : `${tasks.length} tasks from your roadmap.`}
          </h3>
          <p className="muted tiny">
            {formatMinutes(totalMinutes)} of estimated work · {tasks[0].phase} to{" "}
            {tasks[tasks.length - 1].phase}
          </p>
        </div>
        <span className="muted tiny">
          {status.done ? "Review complete" : "Nothing is saved yet"}
        </span>
      </div>

      <ol className="roadmap-task-list" aria-label="Generated project tasks">
        {tasks.map((task) => (
          <li className="roadmap-task" key={task.id}>
            <div className="roadmap-task-heading">
              <h4>{task.title}</h4>
              <span
                className={`roadmap-priority roadmap-priority-${task.priority.toLocaleLowerCase()}`}
              >
                {task.priority} priority
              </span>
            </div>
            <p className="roadmap-task-description">{task.description}</p>
            <dl className="roadmap-task-meta">
              <div>
                <dt>Phase</dt>
                <dd>{task.phase}</dd>
              </div>
              <div>
                <dt>Assigned role</dt>
                <dd>{task.role}</dd>
              </div>
              <div>
                <dt>Estimated time</dt>
                <dd>{task.estimated_time}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{task.priority}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>

      <div className="roadmap-task-save">
        <div className="idea-field">
          <label htmlFor="roadmap-task-project">Save to project</label>
          {!signedIn ? (
            <p className="muted small">
              <Link to="/login?redirect=%2Fideas">Log in</Link> to save these tasks to one of your
              team's projects.
            </p>
          ) : projectsLoading ? (
            <p className="muted small" role="status">
              Loading your projects…
            </p>
          ) : projectsError ? (
            <div className="roadmap-task-projects-error">
              <p className="muted small">{projectsError}</p>
              <button className="text-link" type="button" onClick={onRetryProjects}>
                Try again
              </button>
            </div>
          ) : projects.length ? (
            <>
              <select
                id="roadmap-task-project"
                value={projectId}
                onChange={(event) => onProjectChange(event.target.value)}
                disabled={saving || status.done}
              >
                <option value="">Choose a project</option>
                {projects.map((project) => (
                  <option value={project.id} key={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
              <p className="muted tiny">
                The tasks are added to this project's board. Existing titles are skipped.
              </p>
            </>
          ) : (
            <div className="roadmap-task-no-project">
              <p className="muted small">
                You don't have a project to hold these tasks yet. Create one first — the tasks stay
                here, unsaved, until you confirm.
              </p>
              <button className="button button-outline" type="button" onClick={onCreateProject}>
                Create a project
              </button>
            </div>
          )}
        </div>

        {signedIn && projects.length ? (
          <button className="text-link roadmap-task-new-project" type="button" onClick={onCreateProject}>
            Create another project
          </button>
        ) : null}

        <div className="roadmap-task-actions">
          <p className="muted tiny">
            {status.done
              ? status.savedCount
                ? `${status.savedCount} new ${status.savedCount === 1 ? "task" : "tasks"} added to the project.`
                : "No new tasks were needed — the project already had them."
              : "Review every task before saving. Nothing is inserted until you confirm."}
          </p>
          <div className="roadmap-task-buttons">
            <button
              className="button button-dark"
              type="button"
              onClick={onConfirm}
              disabled={!canConfirm}
              aria-busy={saving}
            >
              {saving ? "Saving tasks…" : status.done ? "Tasks saved" : "Confirm & Save Tasks"}
            </button>
            {status.done ? (
              <Link className="text-link" to="/dashboard">
                Open dashboard <Arrow />
              </Link>
            ) : null}
          </div>
        </div>

        <p className="form-message" role="status" aria-live="polite" data-error={status.error}>
          {status.text}
        </p>

      </div>
    </section>
  );
}
