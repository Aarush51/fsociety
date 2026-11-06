import { useEffect, useState } from "react";
import { formatEventDate, initialsFromName } from "../lib/format";
import { fetchTeamJoinRequests, respondToJoinRequest } from "../lib/teams";

function skillNames(value) {
  if (Array.isArray(value)) {
    return value.map((skill) => String(skill).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
}

export function JoinRequestList({ requests = [], busyId = "", onRespond = () => {} }) {
  return (
    <div className="team-members">
      {requests.map((request) => {
        const skills = skillNames(request.skills);
        const name = request.full_name || request.username || "A builder";
        return (
          <div className="team-member" key={request.id}>
            <span className="avatar avatar-small blue">{initialsFromName(name)}</span>
            <div className="team-member-details">
              <strong>{name}</strong>
              <span className="muted tiny">
                {request.username ? `@${request.username} · ` : ""}
                ID {request.friend_code || "—"}
                {request.created_at
                  ? ` · Requested ${formatEventDate(request.created_at, {
                      month: "short",
                      day: "numeric",
                    })}`
                  : ""}
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
            <div className="filter-list">
              <button
                className="button button-dark"
                type="button"
                disabled={busyId === request.id}
                onClick={() => onRespond(request.id, true)}
              >
                {busyId === request.id ? "Saving…" : "Accept"}
              </button>
              <button
                className="button button-outline"
                type="button"
                disabled={busyId === request.id}
                onClick={() => onRespond(request.id, false)}
              >
                Decline
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Leader-only: everyone waiting to join this team, with the identities and
// skills the leader needs to decide. Every action goes through
// respond_to_join_request(), which re-checks leader access and team capacity.
export default function TeamJoinRequests({ teamId, teamName = "", onCountChange }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setActionError("");

    fetchTeamJoinRequests(teamId)
      .then((rows) => {
        if (!active) return;
        setRequests(rows);
        onCountChange?.(teamId, rows.length);
      })
      .catch((requestError) => {
        if (!active) return;
        console.error("Could not load join requests.", requestError);
        setRequests([]);
        setError(requestError.message || "Join requests could not be loaded.");
        onCountChange?.(teamId, 0);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [teamId, reloadKey, onCountChange]);

  const respond = async (requestId, accept) => {
    setBusyId(requestId);
    setActionError("");
    try {
      await respondToJoinRequest(requestId, accept);
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      setActionError(requestError.message || "The request could not be updated.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <section
      className="team-join-requests"
      aria-label={teamName ? `Join requests for ${teamName}` : "Join requests"}
    >
      <div className="team-card-heading">
        <div>
          <p className="eyebrow">LEADER TOOLS</p>
          <h2>Join requests</h2>
        </div>
        {requests.length ? (
          <span className="team-member-count">{requests.length} pending</span>
        ) : null}
      </div>

      {loading ? (
        <p className="muted tiny" role="status">
          Loading join requests…
        </p>
      ) : null}

      {error ? (
        <p className="form-message" role="status" data-error="true">
          {error}{" "}
          <button
            className="text-link hackathon-retry"
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Try again
          </button>
        </p>
      ) : null}

      {actionError ? (
        <p className="form-message" role="status" data-error="true">
          {actionError}
        </p>
      ) : null}

      {!loading && !error && !requests.length ? (
        <p className="team-empty">No pending join requests.</p>
      ) : null}

      {!loading && !error && requests.length ? (
        <JoinRequestList requests={requests} busyId={busyId} onRespond={respond} />
      ) : null}
    </section>
  );
}
