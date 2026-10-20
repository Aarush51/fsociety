import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Arrow } from "../components/Icons";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { demoHackathons, demoTeams } from "../lib/demoData";
import { supabase } from "../lib/supabase";

function initialsFromName(name) {
  return (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function TeamCard({ team, userId, joining, onJoin, loginHref }) {
  const members = team.members || [];
  const isMember = members.some((member) => member.id === userId);
  const atCapacity = members.length >= team.max_members;

  let action;
  if (team.demo) {
    action = (
      <button className="button button-outline" type="button" disabled>
        Sample team
      </button>
    );
  } else if (isMember) {
    action = (
      <button className="button button-outline" type="button" disabled>
        You are on this team
      </button>
    );
  } else if (atCapacity) {
    action = (
      <button className="button button-outline" type="button" disabled>
        Team is full
      </button>
    );
  } else if (userId) {
    action = (
      <button
        className="button button-dark"
        type="button"
        onClick={() => onJoin(team.id)}
        disabled={joining}
      >
        Join team
      </button>
    );
  } else {
    action = (
      <Link className="button button-dark" to={loginHref}>
        Log in to join
      </Link>
    );
  }

  return (
    <article className="team-card">
      <div className="team-card-heading">
        <div>
          <p className="eyebrow">TEAM</p>
          <h2>{team.name}</h2>
        </div>
        <span className="team-member-count">
          {members.length} / {team.max_members} members
        </span>
      </div>
      <p className="team-description">
        {team.description || "This team is ready to build something great."}
      </p>
      <div className="team-members">
        {members.map((member) => {
          const reputation = Number(member.reputation) || 0;
          return (
            <div className="team-member" key={member.id}>
              <span className={`avatar avatar-small ${member.id === userId ? "lime" : "blue"}`}>
                {initialsFromName(member.full_name)}
              </span>
              <div className="team-member-details">
                <strong>{member.full_name}</strong>
                <span className="muted tiny">
                  @{member.username}
                  {member.role === "leader" ? " · Team leader" : ""}
                </span>
                <div className="skill-list">
                  {(member.skills || []).length ? (
                    member.skills.map((skill) => (
                      <span className="skill" key={skill}>
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="muted tiny">No skills added</span>
                  )}
                </div>
              </div>
              <span className="team-reputation" title={`${member.review_count} reviews`}>
                {reputation ? `${reputation.toFixed(1)} ★` : "New"}
                <small>
                  {member.review_count} {member.review_count === 1 ? "review" : "reviews"}
                </small>
              </span>
            </div>
          );
        })}
      </div>
      <div className="team-card-actions">{action}</div>
    </article>
  );
}

export default function Teams() {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSlug = searchParams.get("hackathon");

  const [hackathons, setHackathons] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [teams, setTeams] = useState([]);
  const [status, setStatus] = useState("Loading hackathons…");
  const [statusError, setStatusError] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [demoNote, setDemoNote] = useState(
    "Showing sample teams and members. Configure Supabase for live data.",
  );
  const [initKey, setInitKey] = useState(0);
  const [form, setForm] = useState({ name: "", description: "", max_members: "4" });
  const [createMessage, setCreateMessage] = useState("");
  const [createError, setCreateError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const useDemoData = useCallback(
    (note) => {
      const requested = demoHackathons.find((event) => event.slug === requestedSlug);
      const selected = requested || demoHackathons[0];
      setHackathons(demoHackathons);
      setSelectedId(selected.id);
      setDemoMode(true);
      setDemoNote(note);
      setStatus(note);
      setStatusError(false);
    },
    [requestedSlug],
  );

  useEffect(() => {
    if (!supabase) {
      useDemoData("Showing sample teams and members. Configure Supabase for live data.");
      return undefined;
    }

    let active = true;
    setStatus("Loading hackathons…");
    setStatusError(false);
    supabase
      .from("hackathons")
      .select("id, slug, title, status")
      .in("status", ["upcoming", "active"])
      .order("starts_at", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        if (!data?.length) {
          useDemoData("No live hackathons yet; showing sample hackathons and members.");
          return;
        }
        const requestedEvent = data.find((event) => event.slug === requestedSlug);
        setHackathons(data);
        setSelectedId(requestedEvent ? requestedEvent.id : data[0].id);
        setDemoMode(false);
        setStatus("");
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load hackathons for teams.", error);
        useDemoData("Live hackathons are unavailable; showing sample hackathons and members.");
      });

    return () => {
      active = false;
    };
  }, [requestedSlug, useDemoData, initKey]);

  const loadTeams = useCallback(async () => {
    if (!selectedId) return;

    if (demoMode) {
      const index = hackathons.findIndex((event) => event.id === selectedId);
      const demoSelection = demoTeams[(index < 0 ? 0 : index) % demoTeams.length];
      setTeams([{ ...demoSelection, demo: true }]);
      setStatus(demoNote);
      setStatusError(false);
      return;
    }

    setTeamsLoading(true);
    setStatus("Loading teams…");
    setStatusError(false);
    try {
      const { data, error } = await supabase.rpc("list_hackathon_teams", {
        p_hackathon_id: selectedId,
      });
      if (error) throw error;
      if (data?.length) {
        setTeams(data);
        const selected = hackathons.find((event) => event.id === selectedId);
        setStatus(selected ? `Teams for ${selected.title}.` : "");
      } else {
        const index = hackathons.findIndex((event) => event.id === selectedId);
        const demoSelection = demoTeams[(index < 0 ? 0 : index) % demoTeams.length];
        setTeams([{ ...demoSelection, demo: true }]);
        setStatus("No live teams yet. Showing sample members for now.");
      }
    } catch (error) {
      console.error("Could not load hackathon teams.", error);
      const index = hackathons.findIndex((event) => event.id === selectedId);
      const demoSelection = demoTeams[(index < 0 ? 0 : index) % demoTeams.length];
      setTeams([{ ...demoSelection, demo: true }]);
      setStatus("Live teams are unavailable. Showing sample members for now.");
      setStatusError(true);
    } finally {
      setTeamsLoading(false);
    }
  }, [selectedId, demoMode, hackathons, demoNote]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const handleSelect = (event) => {
    const nextId = event.target.value;
    setSelectedId(nextId);
    const slug = hackathons.find((hackathon) => hackathon.id === nextId)?.slug;
    if (slug) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("hackathon", slug);
      setSearchParams(nextParams, { replace: true });
    }
  };

  const handleJoin = async (teamId) => {
    if (!supabase) return;
    setJoining(true);
    setStatus("Joining team…");
    setStatusError(false);
    try {
      const { error } = await supabase.rpc("join_hackathon_team", { p_team_id: teamId });
      if (error) throw error;
      await loadTeams();
    } catch (error) {
      console.error("Could not join team.", error);
      setStatus(error.message || "Could not join the team.");
      setStatusError(true);
    } finally {
      setJoining(false);
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!supabase || !selectedId) return;
    setCreating(true);
    setCreateMessage("Creating your team…");
    setCreateError(false);
    try {
      const { error } = await supabase.rpc("create_hackathon_team", {
        p_hackathon_id: selectedId,
        p_name: form.name.trim(),
        p_description: form.description.trim(),
        p_max_members: Number(form.max_members),
      });
      if (error) throw error;
      setForm({ name: "", description: "", max_members: "4" });
      setCreateMessage("Team created. You are its leader.");
      await loadTeams();
    } catch (error) {
      console.error("Could not create team.", error);
      setCreateMessage(error.message || "Could not create your team.");
      setCreateError(true);
    } finally {
      setCreating(false);
    }
  };

  const showCreate = Boolean(user) && !demoMode && hackathons.length > 0;
  const loginHref = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;

  return (
    <>
      <PageTitle title="Find your team | HackMate" />
      <main className="page-main wrap">
        <PageIntro
          eyebrow="BUILD SOMETHING TOGETHER"
          title="Find your hackathon team."
          description="Choose an event to see teams, meet their members, and join a team or start one of your own."
        />
        <section className="team-browser">
          <label htmlFor="team-hackathon">Selected hackathon</label>
          <select
            id="team-hackathon"
            value={selectedId}
            onChange={handleSelect}
            disabled={!hackathons.length}
          >
            {hackathons.length ? (
              hackathons.map((hackathon) => (
                <option value={hackathon.id} data-slug={hackathon.slug} key={hackathon.id}>
                  {hackathon.title}
                </option>
              ))
            ) : (
              <option>Loading hackathons…</option>
            )}
          </select>
          <p
            id="team-status"
            className="hackathon-status"
            role="status"
            aria-live="polite"
            data-error={statusError}
          >
            {status}
          </p>
          <section id="team-create-panel" className="team-create-panel" hidden={!showCreate}>
            <h2>Create a team</h2>
            <form id="team-create-form" onSubmit={handleCreate}>
              <label htmlFor="team-name">Team name</label>
              <input
                id="team-name"
                name="name"
                maxLength="100"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
              <label htmlFor="team-description">
                What are you building? <span className="muted tiny">Optional</span>
              </label>
              <textarea
                id="team-description"
                name="description"
                maxLength="1000"
                rows="3"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
              <label htmlFor="team-capacity">Team size</label>
              <select
                id="team-capacity"
                name="max_members"
                value={form.max_members}
                onChange={(event) => setForm({ ...form, max_members: event.target.value })}
              >
                <option value="2">2 members</option>
                <option value="3">3 members</option>
                <option value="4">4 members</option>
                <option value="5">5 members</option>
                <option value="6">6 members</option>
              </select>
              <button className="button button-dark" type="submit" disabled={creating}>
                Create team
              </button>
              <p
                id="team-create-message"
                className="form-message"
                role="status"
                aria-live="polite"
                data-error={createError}
              >
                {createMessage}
              </p>
            </form>
          </section>
          <div id="team-list" className="team-list" aria-live="polite" aria-busy={teamsLoading}>
            {teams.map((team) => (
              <TeamCard
                team={team}
                userId={user?.id}
                joining={joining}
                onJoin={handleJoin}
                loginHref={loginHref}
                key={team.id}
              />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
