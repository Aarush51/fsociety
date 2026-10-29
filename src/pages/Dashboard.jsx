import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import EventCard from "../components/EventCard";
import { Arrow, CopyIcon } from "../components/Icons";
import IdeaDetailsDialog from "../components/IdeaDetails";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { useAuth } from "../context/AuthContext";
import useHackathonRatings from "../hooks/useHackathonRatings";
import { events } from "../lib/demoData";
import {
  formatEventDate,
  formatNumber,
  formatReputation,
  initialsFromName,
  hackathonCardData,
} from "../lib/format";
import { fetchMyHackathons, fetchMyRank, splitMyHackathons } from "../lib/personal";
import { ideaFromProject } from "../lib/projects";
import { supabase } from "../lib/supabase";

const HOME_HACKATHON_FIELDS =
  "id, slug, title, organizer, category, location, prize, registration_deadline, starts_at, ends_at, status, venue_name, city, maps_url, capacity, price";

const shortcuts = [
  ["✳", "Explore events", "Find a challenge that excites you.", "/hackathons", "lime"],
  ["◎", "The Huddle", "Friends, requests and your teams.", "/huddle", "blue"],
  ["◉", "Edit profile", "Keep your skills and interests current.", "/profile", "peach"],
];

// The Dashboard is the personal page: your ID, your points and rank, the
// hackathons you signed up for, what you bring, and the way to edit yourself.
// The social half (friends, requests, teams, reviews) lives on /huddle, and the
// profile editor lives on /profile, so the three pages never repeat each other.
export default function Dashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [me, setMe] = useState(null);
  const [rank, setRank] = useState(null);
  const [myHackathons, setMyHackathons] = useState([]);
  const [extras, setExtras] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [upcoming, setUpcoming] = useState(events);
  const [eventsStatus, setEventsStatus] = useState("Loading hackathons…");
  const [eventsBusy, setEventsBusy] = useState(true);
  const [copied, setCopied] = useState(false);
  const [codeStatus, setCodeStatus] = useState({ text: "", error: false });
  const [searchParams, setSearchParams] = useSearchParams();
  // Saved ideas are opened from their own row, so the selected project lives in
  // the URL (?idea=<project id>) and a refresh keeps the same idea open.
  const [ideaDetails, setIdeaDetails] = useState(null);
  const ratings = useHackathonRatings(upcoming);

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

  // Everything else the personal page shows. Each read is independent: a
  // project without the newest SQL still gets its name, points and skills.
  useEffect(() => {
    if (!supabase || !user?.id) return undefined;
    let active = true;

    Promise.allSettled([
      supabase.from("profiles").select("friend_code").eq("id", user.id).maybeSingle(),
      fetchMyRank(),
      fetchMyHackathons(),
      supabase.rpc("get_my_profile_extras"),
    ]).then(([profileResult, rankResult, hackathonResult, extrasResult]) => {
      if (!active) return;
      if (profileResult.status === "fulfilled") {
        console.log("Current profile friend_code query result:", profileResult.value.data);
        console.log("Current profile friend_code query error:", profileResult.value.error);
        if (!profileResult.value.error) setMe(profileResult.value.data || null);
      } else {
        console.log("Current profile friend_code query result:", null);
        console.error("Current profile friend_code query error:", profileResult.reason);
      }
      if (rankResult.status === "fulfilled") setRank(rankResult.value);
      if (hackathonResult.status === "fulfilled") setMyHackathons(hackathonResult.value || []);
      if (extrasResult.status === "fulfilled" && !extrasResult.value.error) {
        setExtras(extrasResult.value.data || null);
      }
    });

    return () => {
      active = false;
    };
  }, [reloadKey, user?.id]);

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

  // The copy button reads "Copied" for a moment, then returns to "Copy".
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => {
      setCopied(false);
      setCodeStatus({ text: "", error: false });
    }, 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const profile = dashboard?.profile;
  const projects = dashboard?.projects || [];
  const tasks = dashboard?.tasks || [];
  const friendCode = String(me?.friend_code || "");
  const { current: registered, past } = splitMyHackathons(myHackathons);
  const skills = Object.keys(extras?.skill_levels || {});
  const interests = Array.isArray(extras?.interests) ? extras.interests : [];

  // The dashboard RPC returns the project rows without their stored idea, so
  // the full idea_data (and the plain description for older rows) is read here
  // for the caller's own team projects. RLS already limits these rows.
  const projectKey = projects.map((project) => project.id).join(",");
  useEffect(() => {
    if (!supabase || !projectKey) {
      setIdeaDetails({});
      return undefined;
    }
    let active = true;
    supabase
      .from("projects")
      .select("id, description, idea_data")
      .in("id", projectKey.split(","))
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) throw requestError;
        setIdeaDetails(
          Object.fromEntries((data || []).map((row) => [row.id, row])),
        );
      })
      .catch((requestError) => {
        if (!active) return;
        console.error("Could not load the saved idea details.", requestError);
        // Older projects still open with whatever the dashboard already has.
        setIdeaDetails({});
      });
    return () => {
      active = false;
    };
  }, [projectKey]);

  const openProjectId = searchParams.get("idea") || "";
  const openProject = openProjectId
    ? projects.find((project) => project.id === openProjectId) || null
    : null;
  const openIdea =
    openProject && ideaDetails
      ? ideaFromProject(openProject, ideaDetails[openProject.id] || {})
      : null;

  const closeIdea = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("idea");
    setSearchParams(next, { replace: true });
  };

  const handleCopyFriendCode = async () => {
    if (!friendCode) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable in this browser.");
      }
      await navigator.clipboard.writeText(friendCode);
      setCopied(true);
      setCodeStatus({ text: "Copied", error: false });
    } catch (copyError) {
      console.error("Could not copy the friend ID.", copyError);
      setCopied(false);
      setCodeStatus({
        text: "Could not copy automatically — select the ID and copy it.",
        error: true,
      });
    }
  };

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
          description="Your ID, your points, the events you signed up for and the skills you bring — all in one place."
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
          <Link className="button button-outline" to="/profile">
            Edit profile <Arrow diagonal />
          </Link>
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

        <div className="friend-code-block">
          <span className="eyebrow">YOUR ID</span>
          <div className="friend-code-row">
            <input
              id="dashboard-friend-code"
              type="text"
              readOnly
              value={friendCode}
              placeholder="Not generated yet"
              aria-label="Your HackMate ID"
              onFocus={(event) => event.target.select()}
            />
            <button
              id="dashboard-copy-friend-code"
              className="button button-outline"
              type="button"
              onClick={handleCopyFriendCode}
              disabled={!friendCode}
              aria-label={copied ? "ID copied" : "Copy your six-digit friend ID"}
            >
              <CopyIcon />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="muted tiny friend-code-share">
            {friendCode ? (
              <>
                Share your ID: <strong>{friendCode}</strong> — friends can add you with it in the
                Huddle.
              </>
            ) : (
              "Your ID isn’t available yet."
            )}
          </p>
          <p
            id="dashboard-friend-code-message"
            className="form-message"
            role="status"
            aria-live="polite"
            data-error={codeStatus.error}
          >
            {codeStatus.text}
          </p>
        </div>

        <section id="dashboard-stats" className="profile-stats" aria-label="Your activity">
          <article>
            <span className="eyebrow">POINTS</span>
            <strong id="dashboard-points">
              {dashboard ? formatNumber(dashboard.coin_balance) : "—"}
            </strong>
            <span className="muted tiny">coins earned</span>
          </article>
          <article>
            <span className="eyebrow">RANK</span>
            <strong id="dashboard-rank">{rank ? `#${rank.position}` : "—"}</strong>
            <span className="muted tiny">
              {rank ? `of ${formatNumber(rank.total)} builders` : "No ranking yet"}
            </span>
          </article>
          <article>
            <span className="eyebrow">HACKATHONS</span>
            <strong id="dashboard-hackathon-count">{formatNumber(registered.length)}</strong>
            <span className="muted tiny">registered</span>
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
              <p className="eyebrow">YOUR HACKATHONS</p>
              <h2>Where you’re building.</h2>
            </div>
            <Link className="text-link" to="/hackathons">
              Find another <Arrow />
            </Link>
          </div>
          <div id="dashboard-hackathons" className="dashboard-item-list" aria-live="polite">
            {registered.length ? (
              registered.map((hackathon) => (
                <Link
                  className="dashboard-data-card"
                  to={`/hackathons/${encodeURIComponent(hackathon.slug)}`}
                  key={hackathon.id}
                >
                  <span>
                    <strong>{hackathon.title}</strong>
                    <small>
                      {formatEventDate(hackathon.starts_at)} – {formatEventDate(hackathon.ends_at)}
                      {hackathon.venue_name ? ` · ${hackathon.venue_name}` : ""}
                      {hackathon.city ? `, ${hackathon.city}` : ""}
                    </small>
                  </span>
                  <Arrow diagonal />
                </Link>
              ))
            ) : (
              <p className="dashboard-empty">
                You haven’t registered for a hackathon yet. Find one and form your team.
              </p>
            )}
          </div>
        </section>

        {past.length ? (
          <section className="dashboard-data-section">
            <div className="section-heading dashboard-heading">
              <div>
                <p className="eyebrow">PAST HACKATHONS</p>
                <h2>What you’ve already joined.</h2>
              </div>
            </div>
            <div id="dashboard-past-hackathons" className="dashboard-item-list">
              {past.map((hackathon) => (
                <Link
                  className="dashboard-data-card"
                  to={`/hackathons/${encodeURIComponent(hackathon.slug)}`}
                  key={hackathon.id}
                >
                  <span>
                    <strong>{hackathon.title}</strong>
                    <small>
                      {formatEventDate(hackathon.starts_at)} – {formatEventDate(hackathon.ends_at)}
                      {hackathon.city ? ` · ${hackathon.city}` : ""}
                    </small>
                  </span>
                  <Arrow diagonal />
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="dashboard-data-section">
          <div className="section-heading dashboard-heading">
            <div>
              <p className="eyebrow">WHAT YOU BRING</p>
              <h2>Skills and interests.</h2>
            </div>
            <Link className="text-link" to="/profile">
              Edit profile <Arrow />
            </Link>
          </div>
          <div id="dashboard-skills" className="dashboard-item-list">
            <div>
              <p className="eyebrow">SKILLS</p>
              <div className="profile-skill-list">
                {skills.length ? (
                  skills.map((skill) => (
                    <span className="skill" key={skill}>
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="muted tiny">
                    No skills yet — add a few so teammates can find you.
                  </span>
                )}
              </div>
            </div>
            <div>
              <p className="eyebrow">INTERESTS</p>
              <div className="profile-skill-list">
                {interests.length ? (
                  interests.map((interest) => (
                    <span className="skill" key={interest}>
                      {interest}
                    </span>
                  ))
                ) : (
                  <span className="muted tiny">
                    No interests yet — tell people what you want to build for.
                  </span>
                )}
              </div>
            </div>
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
                <Link
                  className="dashboard-data-card"
                  to={`/dashboard?idea=${encodeURIComponent(project.id)}`}
                  key={project.id}
                >
                  <span>
                    <strong>{project.title}</strong>
                    <small>
                      {project.team_name} · {project.status.replaceAll("_", " ")}
                    </small>
                  </span>
                </Link>
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
            <EventCard event={{ ...event, rating: ratings[event.uuid] }} key={event.id} />
          ))}
        </div>
      </main>
      {openIdea ? (
        <IdeaDetailsDialog
          idea={openIdea.idea}
          brief={openIdea.brief}
          incomplete={openIdea.incomplete}
          onClose={closeIdea}
        />
      ) : null}
    </>
  );
}
