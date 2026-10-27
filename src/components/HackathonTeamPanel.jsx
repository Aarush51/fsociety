import { useAuth } from "../context/AuthContext";

// The Teams section shown on a hackathon page after registering, and to anyone
// with a pending invite for that hackathon. Names only — no emails.
export default function HackathonTeamPanel({
  teamState,
  busy,
  onAccept,
  onDecline,
  onReduce,
  onRefresh,
}) {
  const { user } = useAuth();
  const team = teamState?.team || null;
  const invites = (teamState?.invites_for_me || []).filter(
    (invite) => invite.status === "pending",
  );
  const outgoing = teamState?.outgoing_invites || [];
  const canReduce =
    Boolean(team?.is_creator) &&
    outgoing.some((invite) => invite.status === "declined" || invite.status === "expired");
  const hasNewInvite = invites.length > 0;

  if (!team && !invites.length) return null;

  return (
    <section className="friend-code-block" aria-label="Your team for this hackathon">
      <p className="eyebrow">
        YOUR TEAM
        {hasNewInvite ? (
          <>
            {" "}
            <span className="online-dot" role="img" aria-label="New invite" />
          </>
        ) : null}
      </p>

      {team ? (
        <>
          <p className="muted small">{team.name}</p>
          <p className="muted tiny">
            {team.member_count} of {team.size} spots filled · {team.open_spots} open
          </p>
          <div className="dashboard-item-list">
            {team.members.map((member) => (
              <article className="dashboard-data-card" key={member.id}>
                <span>
                  <strong>{member.full_name}</strong>
                  <small>
                    @{member.username}
                    {member.role === "leader" ? " · Leader" : ""}
                    {member.id === user?.id ? " · You" : ""}
                  </small>
                </span>
              </article>
            ))}
          </div>

          {teamState?.waiting_for_match ? (
            <>
              <p className="registration-status" data-state="registered">
                Looking for teammates. Skill-based matching adds compatible people automatically
                as they register.
              </p>
              {onRefresh ? (
                <button
                  className="button button-outline button-full"
                  type="button"
                  onClick={onRefresh}
                  disabled={busy}
                >
                  Refresh team
                </button>
              ) : null}
            </>
          ) : null}

          {outgoing.length ? (
            <>
              <p className="eyebrow">INVITES SENT</p>
              {outgoing.map((invite) => (
                <p className="muted tiny" key={invite.id}>
                  {invite.full_name} · {invite.status}
                </p>
              ))}
            </>
          ) : null}

          {canReduce ? (
            <button
              className="button button-outline button-full"
              type="button"
              onClick={() => onReduce(team.id)}
              disabled={busy}
            >
              Reduce team size
            </button>
          ) : null}
        </>
      ) : null}

      {invites.length ? (
        <>
          <p className="eyebrow">PENDING INVITES</p>
          {invites.map((invite) => (
            <div className="friend-code-found" key={invite.id}>
              <div className="friend-code-found-person">
                <div>
                  <strong>{invite.team_name}</strong>
                  <span className="muted tiny">from {invite.invited_by_name}</span>
                </div>
              </div>
              <div className="filter-list">
                <button
                  className="button button-dark"
                  type="button"
                  onClick={() => onAccept(invite.id)}
                  disabled={busy}
                >
                  Accept
                </button>
                <button
                  className="button button-outline"
                  type="button"
                  onClick={() => onDecline(invite.id)}
                  disabled={busy}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </>
      ) : null}
    </section>
  );
}
