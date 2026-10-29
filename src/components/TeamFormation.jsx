import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { initialsFromName, shortName } from "../lib/format";
import { rankTeamsForMe } from "../lib/skillMatch";
import {
  createHackathonTeam,
  findTeamsByQuery,
  joinHackathonTeam,
  memberCount,
  openSpots,
  teamCodeFrom,
  teamSize,
} from "../lib/teams";
import { displayUserId } from "../lib/userIds";
import { TEAM_SIZE_OPTIONS } from "../lib/teamSizes";
import { Arrow } from "./Icons";

function MemberRow({ member, userId }) {
  const skills = member.skills || [];
  return (
    <div className="team-member">
      <span className={`avatar avatar-small ${member.id === userId ? "lime" : "blue"}`}>
        {initialsFromName(member.full_name)}
      </span>
      <div className="team-member-details">
        <strong>{shortName(member.full_name)}</strong>
        <span className="muted tiny">
          @{member.username} · ID {displayUserId(member)}
          {member.role === "leader" ? " · Leader" : ""}
          {member.id === userId ? " · You" : ""}
        </span>
        <div className="skill-list">
          {skills.length ? (
            skills.map((skill) => (
              <span className="skill" key={skill}>
                {skill}
              </span>
            ))
          ) : (
            <span className="muted tiny">No skills added</span>
          )}
        </div>
      </div>
    </div>
  );
}

// One shareable team: its unique ID, who is on it and what they know.
function TeamCard({ team, userId, reasons, badge, action, children }) {
  const full = openSpots(team) <= 0;
  return (
    <article className="team-card">
      <div className="team-card-heading">
        <div>
          <p className="eyebrow">
            TEAM ID {teamCodeFrom(team.id)}
            {reasons ? ` · ${badge || ""}` : ""}
          </p>
          <h2>{team.name}</h2>
        </div>
        <span className="team-member-count">
          {memberCount(team)}/{teamSize(team)} members
        </span>
      </div>
      {team.description ? <p className="team-description">{team.description}</p> : null}
      {reasons?.length ? (
        <ul className="team-fit-reasons muted tiny">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <div className="team-members">
        {(team.members || []).map((member) => (
          <MemberRow member={member} userId={userId} key={member.id} />
        ))}
      </div>
      <div className="team-card-actions">
        {children ||
          action || (
            <button className="button button-dark" type="button" disabled>
              {full ? "Team is full" : "Team"}
            </button>
          )}
      </div>
    </article>
  );
}

/**
 * The post-registration formation step:
 *   Make a team   — name it, pick a size, get its unique ID
 *   Join a team   — browse the directory or paste a team ID
 *   Skill match   — ranked by what you add, share and would learn
 */
export default function TeamFormation({ hackathon, userId, mySkills, teams, myTeam, onChanged }) {
  const [choice, setChoice] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", size: "4" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: "", error: false });
  const [copied, setCopied] = useState(false);

  const rankedTeams = useMemo(
    () => rankTeamsForMe(mySkills || [], teams || []).slice(0, 6),
    [mySkills, teams],
  );
  const joinMatches = useMemo(
    () => (query.trim() ? findTeamsByQuery(teams || [], query) : teams || []),
    [teams, query],
  );

  const run = async (action, successText) => {
    setBusy(true);
    setMessage({ text: "", error: false });
    try {
      await action();
      await onChanged();
      setMessage({ text: successText, error: false });
    } catch (actionError) {
      setMessage({ text: actionError.message || "That didn’t work. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const errors = {};
    const name = form.name.trim();
    if (!name) errors.name = "Give your team a name.";
    else if (name.length > 100) errors.name = "Keep the name under 100 characters.";
    if (form.description.trim().length > 1000) errors.description = "Keep it under 1000 characters.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    let createdId = "";
    await run(async () => {
      createdId = await createHackathonTeam({
        hackathonId: hackathon.id,
        name,
        description: form.description,
        size: form.size,
      });
      setForm({ name: "", description: "", size: form.size });
    }, `Team “${name}” created${createdId ? ` · share ID ${teamCodeFrom(createdId)} so others can join` : ""}.`);
  };

  const handleJoin = (team) =>
    run(
      () => joinHackathonTeam(team.id),
      `You joined “${team.name}” · team ID ${teamCodeFrom(team.id)}.`,
    );

  const copyTeamId = async () => {
    if (!myTeam) return;
    try {
      await navigator.clipboard.writeText(myTeam.id);
      setCopied(true);
      setMessage({ text: `Team ID ${teamCodeFrom(myTeam.id)} copied.`, error: false });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({ text: "Copying failed — select the ID manually.", error: true });
    }
  };

  // ---------------------------------------------------------------------
  // Already on a team: show it, with its unique ID front and centre.
  // ---------------------------------------------------------------------
  if (myTeam) {
    return (
      <section aria-label="Your team">
        <TeamCard team={myTeam} userId={userId}>
          <div className="filter-list">
            <button className="button button-outline" type="button" onClick={copyTeamId}>
              {copied ? "ID copied" : "Copy team ID"}
            </button>
            <Link className="button button-dark" to={`/hackathons/${encodeURIComponent(hackathon.slug)}`}>
              Back to hackathon <Arrow />
            </Link>
          </div>
        </TeamCard>
        <p className="muted tiny">
          Team ID {teamCodeFrom(myTeam.id)} · {openSpots(myTeam)} open{" "}
          {openSpots(myTeam) === 1 ? "spot" : "spots"} · others join from the registration page of
          this hackathon.
        </p>
        <p className="form-message" role="status" aria-live="polite" data-error={message.error}>
          {message.text}
        </p>
      </section>
    );
  }

  // ---------------------------------------------------------------------
  // No team yet: choose how to form one.
  // ---------------------------------------------------------------------
  return (
    <section aria-label="Form your team">
      <div className="filter-list" role="group" aria-label="How to form your team">
        <button
          className={`${choice === "make" ? "filter-active" : "skill"} hackathon-theme`}
          type="button"
          aria-pressed={choice === "make"}
          onClick={() => {
            setChoice("make");
            setMessage({ text: "", error: false });
          }}
        >
          Make a team
        </button>
        <button
          className={`${choice === "join" ? "filter-active" : "skill"} hackathon-theme`}
          type="button"
          aria-pressed={choice === "join"}
          onClick={() => {
            setChoice("join");
            setMessage({ text: "", error: false });
          }}
        >
          Join a team
        </button>
        <button
          className={`${choice === "skill" ? "filter-active" : "skill"} hackathon-theme`}
          type="button"
          aria-pressed={choice === "skill"}
          onClick={() => {
            setChoice("skill");
            setMessage({ text: "", error: false });
          }}
        >
          Skill-based match
        </button>
      </div>

      {choice === null ? (
        <p className="muted small">
          Pick how you want to form your team. Every team gets a unique ID you can share, and you
          can change your mind until you join or create one.
        </p>
      ) : null}

      {choice === "make" ? (
        <form className="org-form" onSubmit={handleCreate} noValidate>
          <label htmlFor="team-create-name">
            Team name
            {fieldErrors.name ? <span className="org-field-error">{fieldErrors.name}</span> : null}
          </label>
          <input
            id="team-create-name"
            name="name"
            maxLength="100"
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <label htmlFor="team-create-description">
            What are you building? <span className="muted tiny">Optional</span>
            {fieldErrors.description ? (
              <span className="org-field-error">{fieldErrors.description}</span>
            ) : null}
          </label>
          <textarea
            id="team-create-description"
            name="description"
            maxLength="1000"
            rows="3"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          <label htmlFor="team-create-size">Team size</label>
          <select
            id="team-create-size"
            name="size"
            value={form.size}
            onChange={(event) => setForm({ ...form, size: event.target.value })}
          >
            {TEAM_SIZE_OPTIONS.map((option) => (
              <option value={option.size} key={option.size}>
                {option.name} ({option.size} {option.size === 1 ? "member" : "members"})
              </option>
            ))}
          </select>
          <div className="org-form-actions">
            <button className="button button-dark" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create team"}
            </button>
            <button className="text-link" type="button" onClick={() => setChoice(null)}>
              Decide later
            </button>
          </div>
        </form>
      ) : null}

      {choice === "join" ? (
        <div className="team-browser">
          <label htmlFor="team-join-search">Find a team by its ID</label>
          <input
            id="team-join-search"
            type="text"
            placeholder="Paste a team ID or code, e.g. 4F2A-91C7"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="muted tiny">
            {joinMatches.length
              ? `${joinMatches.length} team${joinMatches.length === 1 ? "" : "s"} found — ${joinMatches.filter((team) => openSpots(team) > 0).length} with open spots.`
              : "No team matches that ID yet. Ask them to share it again."}
          </p>
          <div className="team-list" aria-live="polite">
            {joinMatches.map((team) => (
              <TeamCard team={team} userId={userId} key={team.id}>
                <button
                  className="button button-dark"
                  type="button"
                  disabled={busy || openSpots(team) <= 0}
                  onClick={() => handleJoin(team)}
                >
                  {openSpots(team) <= 0 ? "Team is full" : busy ? "Joining…" : "Join this team"}
                </button>
              </TeamCard>
            ))}
          </div>
        </div>
      ) : null}

      {choice === "skill" ? (
        <div className="team-browser">
          <p className="muted small">
            Teams ranked by what you add to them, what you already share, and what you would learn.
            Only teams with open spots are shown.
          </p>
          {mySkills?.length ? (
            <div className="profile-skill-list">
              {mySkills.map((skill) => (
                <span className="skill" key={skill}>
                  {skill}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted tiny">
              Your profile has no skills yet —{" "}
              <Link className="text-link" to="/profile">
                add skills
              </Link>{" "}
              to improve matches.
            </p>
          )}
          <div className="team-list" aria-live="polite">
            {rankedTeams.length ? (
              rankedTeams.map(({ team, fit }) => (
                <TeamCard
                  team={team}
                  userId={userId}
                  key={team.id}
                  badge={`Fit ${fit.score}`}
                  reasons={fit.reasons}
                >
                  <button
                    className="button button-dark"
                    type="button"
                    disabled={busy}
                    onClick={() => handleJoin(team)}
                  >
                    {busy ? "Joining…" : "Join this team"}
                  </button>
                </TeamCard>
              ))
            ) : (
              <p className="team-empty">
                No teams with open spots yet. Make one and share its team ID so others can join you.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <p className="form-message" role="status" aria-live="polite" data-error={message.error}>
        {message.text}
      </p>
    </section>
  );
}
