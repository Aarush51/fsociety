import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Arrow } from "../components/Icons";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { supabase, supabaseSetupMessage } from "../lib/supabase";
import { teamCodeFrom } from "../lib/teams";

export default function Teams() {
  const [teams, setTeams] = useState([]);
  const [status, setStatus] = useState("Loading your teams…");
  const [statusError, setStatusError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const loadTeams = useCallback(async () => {
    if (!supabase) {
      setStatus(supabaseSetupMessage);
      setStatusError(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatus("Loading your teams…");
    setStatusError(false);
    const { data, error } = await supabase.rpc("get_my_dashboard");
    if (error) {
      setTeams([]);
      setStatus(error.message || "Your teams couldn’t be loaded.");
      setStatusError(true);
    } else {
      setTeams(Array.isArray(data?.teams) ? data.teams : []);
      setStatus("");
      setStatusError(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTeams().catch((error) => {
      console.error("Could not load your teams.", error);
      setStatus(error.message || "Your teams couldn’t be loaded.");
      setStatusError(true);
      setLoading(false);
    });
  }, [loadTeams, reloadKey]);

  return (
    <>
      <PageTitle title="My teams | HackMate" />
      <main className="page-main wrap">
        <PageIntro
          eyebrow="YOUR TEAMS"
          title="The people you build with."
          description="Teams are formed when you register for a hackathon. Open one to see its members, pending invites and matching status."
        />
        <p
          id="teams-status"
          className="hackathon-status"
          role="status"
          aria-live="polite"
          data-error={statusError}
        >
          {status}
          {statusError ? (
            <>
              {" "}
              <button
                className="text-link hackathon-retry"
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                Try again
              </button>
            </>
          ) : null}
        </p>
        <section className="team-list" aria-busy={loading}>
          {teams.map((team) => {
            const memberCount = Number(team.member_count) || 0;
            const size = Number(team.size ?? team.max_members) || memberCount;
            const openSpots = Math.max(size - memberCount, 0);
            return (
              <article className="team-card" key={team.id}>
                <div className="team-card-heading">
                  <div>
                    <p className="eyebrow">
                      {team.hackathon_title} · ID {teamCodeFrom(team.id)}
                    </p>
                    <h2>{team.name}</h2>
                  </div>
                  <span className="team-member-count">
                    {memberCount} / {size} members
                  </span>
                </div>
                <p className="team-description">
                  {team.role === "leader" ? "You lead this team." : "You’re a member of this team."}{" "}
                  {openSpots > 0
                    ? `${openSpots} ${openSpots === 1 ? "spot is" : "spots are"} still open.`
                    : "The team is full."}{" "}
                  Open the hackathon to manage members and answer invites.
                </p>
                <div className="team-card-actions">
                  <Link
                    className="button button-dark"
                    to={`/hackathons/${encodeURIComponent(team.hackathon_slug)}`}
                  >
                    Open hackathon <Arrow />
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
        {!loading && !statusError && !teams.length ? (
          <div className="team-empty team-empty-action">
            <p>
              You’re not on a team yet. Register for a hackathon to create your team, invite
              friends by ID, or let matching fill your open spots.
            </p>
            <Link className="button button-dark" to="/hackathons">
              Find a hackathon <Arrow />
            </Link>
          </div>
        ) : null}
      </main>
    </>
  );
}
