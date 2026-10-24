import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  composeProjectDescription,
  findDuplicateProject,
  splitCommas,
  splitLines,
} from "../lib/projects";
import { supabase } from "../lib/supabase";
import { Arrow } from "./Icons";

const MAX_TITLE = 160;
const MAX_DESCRIPTION = 4000;

function friendlyError(error) {
  const message = String(error?.message || "");
  if (/row-level security|permission denied|policy/i.test(message)) {
    return "Only the team leader can create a project for this team.";
  }
  if (/duplicate key|already exists/i.test(message)) {
    return "A project with this title already exists for that team.";
  }
  return message || "Could not create the project. Try again.";
}

// Review-first project creation for a generated idea. Nothing is written until
// the user presses “Create project”; the existing projects table is used as-is.
export default function ProjectCreateDialog({ idea, onClose, onCreated }) {
  const { user } = useAuth();
  const dialogRef = useRef(null);
  const savingRef = useRef(false);
  const closeRef = useRef(onClose);
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState({
    teamId: "",
    title: idea.title.slice(0, MAX_TITLE),
    description: idea.solution,
    features: idea.key_features.join("\n"),
    techStack: idea.tech_stack.join(", "),
    targetUsers: idea.target_users,
  });
  const [message, setMessage] = useState({ text: "", error: false });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Escape closes, Tab stays inside, background scrolling pauses.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("button, a[href], input, select, textarea")?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = [
        ...dialogRef.current.querySelectorAll(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setStatus("unconfigured");
      return undefined;
    }
    if (!user) {
      setStatus("signed-out");
      return undefined;
    }

    let active = true;
    setStatus("loading");
    setLoadError("");
    setMessage({ text: "", error: false });

    supabase
      .rpc("get_my_dashboard")
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) throw error;

        const leaderTeams = (Array.isArray(data?.teams) ? data.teams : []).filter(
          (team) => team?.role === "leader",
        );
        if (!leaderTeams.length) {
          setStatus("no-team");
          return;
        }

        const teamIds = leaderTeams.map((team) => team.id);
        const { data: rows, error: projectError } = await supabase
          .from("projects")
          .select("id, team_id, title")
          .in("team_id", teamIds);
        if (!active) return;
        if (projectError) throw projectError;

        setTeams(leaderTeams);
        setProjects(rows || []);
        setForm((current) => ({
          ...current,
          teamId: leaderTeams.some((team) => team.id === current.teamId)
            ? current.teamId
            : leaderTeams[0].id,
        }));
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load teams for project creation.", error);
        setLoadError(error?.message || "Could not load your teams.");
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [user, reloadKey]);

  const duplicate = findDuplicateProject(projects, form.teamId, form.title);
  const canSave =
    status === "ready" &&
    !created &&
    !saving &&
    Boolean(form.teamId) &&
    Boolean(form.title.trim()) &&
    Boolean(form.description.trim()) &&
    !duplicate;

  const updateField = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setMessage({ text: "", error: false });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSave || savingRef.current) return;

    // Guard the round trip, not just the rendered disabled state: two clicks
    // can land before React commits the first “saving” render.
    savingRef.current = true;
    setSaving(true);
    setMessage({ text: "Checking for an existing project…", error: false });
    try {
      const { data: latest, error: refreshError } = await supabase
        .from("projects")
        .select("id, team_id, title")
        .eq("team_id", form.teamId);
      if (refreshError) throw refreshError;

      setProjects((current) => [
        ...current.filter((project) => project.team_id !== form.teamId),
        ...(latest || []),
      ]);
      if (findDuplicateProject(latest || [], form.teamId, form.title)) {
        setMessage({
          text: "A project with this title already exists for that team. Change the title to continue.",
          error: true,
        });
        return;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("projects")
        .insert({
          team_id: form.teamId,
          title: form.title.trim(),
          description: composeProjectDescription({
            description: form.description,
            features: splitLines(form.features),
            techStack: splitCommas(form.techStack),
            targetUsers: form.targetUsers,
          }),
          status: "draft",
        })
        .select("id, title, team_id")
        .single();
      if (insertError) throw insertError;

      setCreated(inserted);
      setMessage({ text: "", error: false });
      onCreated?.(inserted);
    } catch (error) {
      console.error("Could not create the project.", error);
      setMessage({ text: friendlyError(error), error: true });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const selectedTeam = teams.find((team) => team.id === form.teamId) || null;

  return (
    <div
      className="project-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="project-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-dialog-title"
        ref={dialogRef}
      >
        <div className="project-modal-top">
          <div className="idea-modal-heading">
            <p className="eyebrow">NEW PROJECT · REVIEW FIRST</p>
            <h2 id="project-dialog-title">
              {created ? "Project saved." : "Turn this idea into a project."}
            </h2>
          </div>
          <button
            className="idea-modal-close"
            type="button"
            aria-label="Close project creation"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {status === "loading" ? (
          <p className="muted small">Loading your teams…</p>
        ) : null}

        {status === "unconfigured" ? (
          <p className="muted small">
            Project creation needs the Supabase connection configured for this app.
          </p>
        ) : null}

        {status === "signed-out" ? (
          <div className="project-empty">
            <p className="muted small">
              Log in to save this idea as a project draft for one of your teams.
            </p>
            <Link className="button button-dark" to="/login?redirect=%2Fideas">
              Log in to continue <Arrow />
            </Link>
          </div>
        ) : null}

        {status === "no-team" ? (
          <div className="project-empty">
            <p className="muted small">
              Only a team leader can create a project. Create a team, or ask your team leader to
              add you to theirs.
            </p>
            <Link className="button button-dark" to="/teams">
              Find a team <Arrow />
            </Link>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="project-empty">
            <p className="muted small">{loadError}</p>
            <button
              className="button button-outline"
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </button>
          </div>
        ) : null}

        {status === "ready" && created ? (
          <div className="project-success" role="status">
            <p>
              <strong>“{created.title}”</strong> is saved as a draft
              {selectedTeam ? ` for ${selectedTeam.name}` : ""}.
            </p>
            <p className="muted small">
              Review or edit it from your dashboard whenever you're ready.
            </p>
            <div className="project-form-actions">
              <button className="button button-outline" type="button" onClick={onClose}>
                Close
              </button>
              <Link className="button button-dark" to="/dashboard">
                Go to dashboard <Arrow />
              </Link>
            </div>
          </div>
        ) : null}

        {status === "ready" && !created ? (
          <>
            <p className="muted small">
              Prefilled from “{idea.title}”. Nothing is saved until you press Create project.
            </p>

            <form className="project-form" onSubmit={handleSubmit}>
              <div className="idea-field">
                <label htmlFor="project-team">Team</label>
                <select
                  id="project-team"
                  value={form.teamId}
                  onChange={(event) => updateField({ teamId: event.target.value })}
                  required
                >
                  {teams.map((team) => (
                    <option value={team.id} key={team.id}>
                      {team.name}
                      {team.hackathon_title ? ` · ${team.hackathon_title}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="idea-field">
                <label htmlFor="project-title">Project title</label>
                <input
                  id="project-title"
                  type="text"
                  maxLength={MAX_TITLE}
                  required
                  value={form.title}
                  onChange={(event) => updateField({ title: event.target.value })}
                />
              </div>

              <div className="idea-field">
                <label htmlFor="project-description">Description</label>
                <textarea
                  id="project-description"
                  rows="3"
                  maxLength={MAX_DESCRIPTION}
                  required
                  value={form.description}
                  onChange={(event) => updateField({ description: event.target.value })}
                />
              </div>

              <div className="idea-field">
                <label htmlFor="project-features">
                  Key features <span className="muted tiny">One per line</span>
                </label>
                <textarea
                  id="project-features"
                  rows="3"
                  value={form.features}
                  onChange={(event) => updateField({ features: event.target.value })}
                />
              </div>

              <div className="idea-field">
                <label htmlFor="project-tech">
                  Tech stack <span className="muted tiny">Comma separated</span>
                </label>
                <input
                  id="project-tech"
                  type="text"
                  value={form.techStack}
                  onChange={(event) => updateField({ techStack: event.target.value })}
                />
              </div>

              <div className="idea-field">
                <label htmlFor="project-users">Target users</label>
                <input
                  id="project-users"
                  type="text"
                  value={form.targetUsers}
                  onChange={(event) => updateField({ targetUsers: event.target.value })}
                />
              </div>

              {duplicate ? (
                <p className="project-warning" role="alert">
                  A project called “{duplicate.title}” already exists for this team. Change the
                  title to continue.
                </p>
              ) : null}

              <p
                className="form-message"
                role="status"
                aria-live="polite"
                data-error={message.error}
              >
                {message.text}
              </p>

              <div className="project-form-actions">
                <button className="button button-outline" type="button" onClick={onClose}>
                  Cancel
                </button>
                <button className="button button-dark" type="submit" disabled={!canSave}>
                  {saving ? "Creating…" : "Create project"}
                </button>
              </div>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}
