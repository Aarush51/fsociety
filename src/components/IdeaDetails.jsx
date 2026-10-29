import { useEffect, useRef } from "react";

// The generator's idea display, shared with the Dashboard so a saved idea is
// shown in exactly one way. Everything here reuses the existing stylesheet:
// no new classes, no new layout.
//
// Older projects were saved before the full idea was stored, so every field is
// read defensively: a missing array renders nothing and a missing string is
// simply left out instead of printing “undefined”.

const text = (value) => String(value ?? "").trim();

const list = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => text(item))
    .filter(Boolean);

export function IdeaTags({ idea }) {
  const difficulty = text(idea?.difficulty);
  const estimatedTime = text(idea?.estimated_time);
  if (!difficulty && !estimatedTime) return null;
  return (
    <div className="idea-card-tags">
      {difficulty ? <span className="idea-tag">{difficulty}</span> : null}
      {estimatedTime ? <span className="idea-tag idea-tag-time">{estimatedTime}</span> : null}
    </div>
  );
}

export function BriefDetails({ brief }) {
  if (!brief) return null;
  const skills = list(brief.skills);
  const teamSkills = list(brief.teamSkills);
  const timeLabel = text(brief.time?.label) || text(brief.time);
  return (
    <dl className="idea-brief">
      <div>
        <dt>Hackathon</dt>
        <dd>{text(brief.hackathon?.title) || "Not recorded"}</dd>
      </div>
      <div>
        <dt>Theme</dt>
        <dd>{text(brief.hackathon?.category) || "Open innovation"}</dd>
      </div>
      <div>
        <dt>Your skills</dt>
        <dd>{skills.length ? skills.join(", ") : "Not recorded"}</dd>
      </div>
      <div>
        <dt>Teammate skills</dt>
        <dd>{teamSkills.length ? teamSkills.join(", ") : "No teammates added yet"}</dd>
      </div>
      <div>
        <dt>Interests</dt>
        <dd>{text(brief.interests) || "Not recorded"}</dd>
      </div>
      <div>
        <dt>Available time</dt>
        <dd>{timeLabel || "Not set"}</dd>
      </div>
    </dl>
  );
}

export function IdeaDetailBlocks({ idea }) {
  const problem = text(idea?.problem);
  const solution = text(idea?.solution);
  const users = text(idea?.target_users);
  const features = list(idea?.key_features);
  const techStack = list(idea?.tech_stack);
  const roles = list(idea?.required_team_roles);
  const risks = list(idea?.risks);
  const why = text(idea?.why_it_fits);

  return (
    <>
      {problem || solution || users ? (
        <dl className="idea-card-summary">
          {problem ? (
            <div>
              <dt>Problem</dt>
              <dd className="idea-problem">{problem}</dd>
            </div>
          ) : null}
          {solution ? (
            <div>
              <dt>Solution</dt>
              <dd className="idea-solution">{solution}</dd>
            </div>
          ) : null}
          {users ? (
            <div>
              <dt>Target users</dt>
              <dd className="idea-users">{users}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {features.length || techStack.length || roles.length ? (
        <div className="idea-card-columns">
          {features.length ? (
            <section>
              <p className="eyebrow">KEY FEATURES</p>
              <ul className="idea-list idea-features">
                {features.map((feature, featureIndex) => (
                  <li key={`${feature}-${featureIndex}`}>{feature}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {techStack.length || roles.length ? (
            <section>
              {techStack.length ? (
                <>
                  <p className="eyebrow">TECH STACK</p>
                  <div className="idea-chips idea-tech">
                    {techStack.map((item, itemIndex) => (
                      <span className="idea-chip" key={`${item}-${itemIndex}`}>
                        {item}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}
              {roles.length ? (
                <>
                  <p className="eyebrow">TEAM ROLES</p>
                  <div className="idea-chips idea-roles">
                    {roles.map((role, roleIndex) => (
                      <span className="idea-chip" key={`${role}-${roleIndex}`}>
                        {role}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}

      {risks.length ? (
        <section>
          <p className="eyebrow">RISKS</p>
          <ul className="idea-list idea-risks">
            {risks.map((risk, riskIndex) => (
              <li key={`${risk}-${riskIndex}`}>{risk}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {why ? (
        <p className="idea-why">
          <strong>Why it fits:</strong> {why}
        </p>
      ) : null}
    </>
  );
}

// Keyboard-accessible detail dialog. The generator passes `onUse` for “Use This
// Idea”; the Dashboard leaves it out and gets a way back to the Dashboard
// instead. Escape, Tab, background scrolling and focus return are handled here
// so both pages behave the same.
export default function IdeaDetailsDialog({
  idea,
  selected,
  onClose,
  onUse,
  brief = null,
  incomplete = false,
  returnFocusRef = null,
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnTo = returnFocusRef?.current || document.activeElement;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("button, a[href]")?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = [
        ...dialogRef.current.querySelectorAll(
          'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
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
      returnTo?.focus?.();
    };
  }, [returnFocusRef]);

  return (
    <div
      className="idea-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="idea-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="idea-detail-title"
        ref={dialogRef}
      >
        <div className="idea-modal-top">
          <div className="idea-modal-heading">
            <p className="eyebrow">PROJECT IDEA</p>
            <h2 id="idea-detail-title">{text(idea?.title) || "Saved idea"}</h2>
            <IdeaTags idea={idea} />
          </div>
          <button
            className="idea-modal-close"
            type="button"
            aria-label="Close details"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {incomplete ? (
          <p className="muted small">This idea was saved before full details were stored.</p>
        ) : null}

        <IdeaDetailBlocks idea={idea} />

        {brief ? (
          <details className="idea-sent">
            <summary>Brief sent to the AI</summary>
            <BriefDetails brief={brief} />
          </details>
        ) : null}

        <footer className="idea-modal-actions">
          <button className="button button-outline" type="button" onClick={onClose}>
            Close
          </button>
          {onUse ? (
            <button
              className="button button-lime"
              type="button"
              aria-pressed={selected}
              onClick={() => onUse(idea)}
            >
              {selected ? "Using This Idea ✓" : "Use This Idea"}
            </button>
          ) : (
            <button className="button button-lime" type="button" onClick={onClose}>
              Back to dashboard
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
