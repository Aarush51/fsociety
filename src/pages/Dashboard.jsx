import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EventCard from "../components/EventCard";
import { Arrow } from "../components/Icons";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { events } from "../lib/demoData";
import { formatEventDate, formatNumber, formatReputation, initialsFromName, hackathonCardData } from "../lib/format";
import { supabase } from "../lib/supabase";

const HOME_HACKATHON_FIELDS =
  "id, slug, title, organizer, category, location, prize, registration_deadline, starts_at, ends_at, status, venue_name, city, maps_url, capacity, price";

const shortcuts = [
  ["✳", "Explore events", "Find a challenge that excites you.", "/hackathons", "lime"],
  ["↗", "Meet teammates", "Find people with complementary skills.", "/teams", "blue"],
  ["◉", "Update your profile", "Let the community know what you do.", "/profile", "peach"],
];

export default function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [upcoming, setUpcoming] = useState(events);
  const [eventsStatus, setEventsStatus] = useState("Loading hackathons…");
  const [eventsBusy, setEventsBusy] = useState(true);

  const loadDashboard = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { data, error: requestError } = await supabase.rpc("get_my_dashboard");
    if (requestError) {
      setError(requestError);
      setLoading(false);
      throw requestError;
    }
    if (!data) {
      const missing = new Error("Your dashboard data is unavailable.");
      setError(missing);
      setLoading(false);
      throw missing;
    }
    setDashboard(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard().catch((requestError) => {
      console.error("Could not load dashboard data.", requestError);
    });
  }, [loadDashboard, reloadKey]);

  useEffect(() => {
    if (!supabase) {
      setEventsStatus("Showing sample hackathons. Configure Supabase to load live events.");
      setEventsBusy(false);
      return undefined;
    }

    let active = true;
    supabase
      .from("hackathons")
      .select(HOME_HACKATHON_FIELDS)
      .in("status", ["upcoming", "active"])
      .order("starts_at", { ascending: true })
      .limit(3)
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) throw requestError;
        if (data?.length) {
          setUpcoming(data.map(hackathonCardData));
          setEventsStatus(
            `${data.length} upcoming ${data.length === 1 ? "event" : "events"} from HackMate.`,
          );
        } else {
          setEventsStatus("No live events yet; showing sample hackathons.");
        }
      })
      .catch((requestError) => {
        if (!active) return;
        console.error("Could not load dashboard events.", requestError);
        setEventsStatus("Live events are unavailable; showing sample hackathons.");
      })
      .finally(() => {
        if (active) setEventsBusy(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const profile = dashboard?.profile;
  const tasks = dashboard?.tasks || [];
  const activeTasks = tasks.filter((task) => task.status !== "done");
  const teams = dashboard?.teams || [];
  const projects = dashboard?.projects || [];

  const statusText = loading
    ? "Loading your activity…"
    : error
      ? error.message || "Could not load your dashboard."
      : `Your dashboard is up to date, ${profile?.full_name || "builder"}.`;

  return (
    <>
      <PageTitle title="Dashboard | HackMate" />
      <main className="page-main wrap">
        <PageIntro
          eyebrow="YOUR HACKMATE HOME BASE"
          title="Good things start with a first step."
          description="A few ways to get moving: find an event, meet a collaborator, or share a little more about yourself."
        />
        <div className="dashboard-greeting">
          <span className="avatar avatar-large lime" id="dashboard-avatar">
            {initialsFromName(profile?.full_name, "HM")}
          </span>
          <div>
            <p className="eyebrow">WELCOME BACK</p>
            <h2 id="dashboard-name">{profile?.full_name || "Loading your dashboard…"}</h2>
            <p id="dashboard-username" className="muted small">
              {profile ? `@${profile.username}` : ""}
            </p>
          </div>
        </div>
        <p
          id="dashboard-status"
          className="hackathon-status"
          role="status"
          aria-live="polite"
          data-error={Boolean(error)}
        >
          {statusText}
          {error ? (
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
        <section id="dashboard-stats" className="profile-stats" aria-label="Your activity">
          <article>
            <span className="eyebrow">COIN BALANCE</span>
            <strong id="dashboard-coins">{dashboard ? formatNumber(dashboard.coin_balance) : "—"}</strong>
            <span className="muted tiny">coins</span>
          </article>
          <article>
            <span className="eyebrow">REPUTATION</span>
            <strong id="dashboard-reputation">
              {dashboard ? formatReputation(dashboard.reputation) : "—"}
            </strong>
            <span id="dashboard-review-count" className="muted tiny">
              {dashboard
                ? `${dashboard.review_count} ${dashboard.review_count === 1 ? "review" : "reviews"}`
                : "Based on reviews"}
            </span>
          </article>
          <article>
            <span className="eyebrow">TEAMS</span>
            <strong id="dashboard-team-count">{dashboard ? teams.length : "—"}</strong>
            <span className="muted tiny">joined</span>
          </article>
          <article>
            <span className="eyebrow">TASKS</span>
            <strong id="dashboard-task-count">{dashboard ? activeTasks.length : "—"}</strong>
            <span className="muted tiny">on your teams</span>
          </article>
        </section>
        <div className="shortcut-grid">
          {shortcuts.map(([icon, title, description, href, color]) => (
            <Link className="shortcut-card" to={href} key={title}>
              <span className={`avatar ${color}`}>{icon}</span>
              <strong>
                {title} <Arrow diagonal />
              </strong>
              <p className="muted tiny">{description}</p>
            </Link>
          ))}
        </div>
        <section className="dashboard-data-section">
          <div className="section-heading dashboard-heading">
            <div>
              <p className="eyebrow">YOUR TEAMS</p>
              <h2>Build together.</h2>
            </div>
            <Link className="text-link" to="/teams">
              Find a team <Arrow />
            </Link>
          </div>
          <div id="dashboard-teams" className="dashboard-item-list" aria-live="polite">
            {loading ? (
              "Loading your teams…"
            ) : error ? (
              <p className="dashboard-empty">Your teams couldn’t be loaded.</p>
            ) : teams.length ? (
              teams.map((team) => (
                <Link
                  className="dashboard-data-card"
                  to={`/teams?hackathon=${encodeURIComponent(team.hackathon_slug)}`}
                  key={team.id}
                >
                  <span>
                    <strong>{team.name}</strong>
                    <small>
                      {team.hackathon_title} · {team.role} · {team.member_count}/{team.max_members}{" "}
                      members
                    </small>
                  </span>
                  <Arrow diagonal />
                </Link>
              ))
            ) : (
              <p className="dashboard-empty">
                You haven’t joined a team yet. Find a hackathon team to build with.
              </p>
            )}
          </div>
        </section>
        <section className="dashboard-data-section">
          <div className="section-heading dashboard-heading">
            <div>
              <p className="eyebrow">YOUR PROJECTS</p>
              <h2>Ideas in progress.</h2>
            </div>
          </div>
          <div id="dashboard-projects" className="dashboard-item-list" aria-live="polite">
            {loading ? (
              "Loading your projects…"
            ) : error ? (
              <p className="dashboard-empty">Your projects couldn’t be loaded.</p>
            ) : projects.length ? (
              projects.map((project) => (
                <article className="dashboard-data-card" key={project.id}>
                  <span>
                    <strong>{project.title}</strong>
                    <small>
                      {project.team_name} · {project.status.replaceAll("_", " ")}
                    </small>
                  </span>
                </article>
              ))
            ) : (
              <p className="dashboard-empty">Your team projects will show up here.</p>
            )}
          </div>
        </section>
        <section className="dashboard-data-section">
          <div className="section-heading dashboard-heading">
            <div>
              <p className="eyebrow">YOUR TASKS</p>
              <h2>What’s next?</h2>
            </div>
          </div>
          <div id="dashboard-tasks" className="dashboard-item-list" aria-live="polite">
            {loading ? (
              "Loading your tasks…"
            ) : error ? (
              <p className="dashboard-empty">Your tasks couldn’t be loaded.</p>
            ) : tasks.length ? (
              tasks.slice(0, 8).map((task) => (
                <article className="dashboard-data-card" key={task.id}>
                  <span>
                    <strong>{task.title}</strong>
                    <small>
                      {task.project_title} · {task.status.replaceAll("_", " ")}
                      {task.due_at ? ` · Due ${formatEventDate(task.due_at)}` : ""}
                    </small>
                  </span>
                </article>
              ))
            ) : (
              <p className="dashboard-empty">No tasks on your team projects yet.</p>
            )}
          </div>
        </section>
        <div className="section-heading dashboard-heading">
          <div>
            <p className="eyebrow">COMING UP</p>
            <h2>Find something to build.</h2>
          </div>
          <Link className="text-link" to="/hackathons">
            All events <Arrow />
          </Link>
        </div>
        <p
          id="dashboard-events-status"
          className="hackathon-status"
          role="status"
          aria-live="polite"
        >
          {eventsStatus}
        </p>
        <div id="dashboard-events" className="event-grid" aria-busy={eventsBusy}>
          {upcoming.map((event) => (
            <EventCard event={event} key={event.id} />
          ))}
        </div>
      </main>
    </>
  );
}
