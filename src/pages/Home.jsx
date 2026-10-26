import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EventCard from "../components/EventCard";
import { Arrow } from "../components/Icons";
import LeaderboardRows from "../components/LeaderboardRows";
import PageTitle from "../components/PageTitle";
import PersonCard from "../components/PersonCard";
import SectionHeading from "../components/SectionHeading";
import { events, leaderboard, teammates } from "../lib/demoData";
import { hackathonCardData } from "../lib/format";
import { supabase } from "../lib/supabase";

const HOME_HACKATHON_FIELDS =
  "id, slug, title, organizer, category, location, prize, registration_deadline, starts_at, ends_at, status, venue_name, city, maps_url, capacity, price";

function avatarColors(index) {
  return ["lime", "blue", "peach"][index % 3];
}

function builderInitials(name) {
  return (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function Home() {
  const [homeEvents, setHomeEvents] = useState(events);
  const [eventStatus, setEventStatus] = useState("Loading hackathons…");
  const [eventsBusy, setEventsBusy] = useState(true);
  const [builders, setBuilders] = useState(null);
  const [buildersNote, setBuildersNote] = useState("A few students looking for a team");
  const [leaderboardPeople, setLeaderboardPeople] = useState(leaderboard);
  const [leaderboardStatus, setLeaderboardStatus] = useState("Loading leaderboard…");

  useEffect(() => {
    if (!supabase) {
      setEventStatus("Showing sample hackathons. Configure Supabase to load live events.");
      setEventsBusy(false);
      return undefined;
    }

    let active = true;
    setEventsBusy(true);
    supabase
      .from("hackathons")
      .select(HOME_HACKATHON_FIELDS)
      .in("status", ["upcoming", "active"])
      .order("starts_at", { ascending: true })
      .limit(3)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        if (data?.length) {
          setHomeEvents(data.map(hackathonCardData));
          setEventStatus(
            `${data.length} upcoming ${data.length === 1 ? "event" : "events"} from HackMate.`,
          );
        } else {
          setEventStatus("No live events yet; showing sample hackathons.");
        }
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load homepage hackathons.", error);
        setEventStatus("Live events are unavailable; showing sample hackathons.");
      })
      .finally(() => {
        if (active) setEventsBusy(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setBuildersNote("Sample member profiles");
      return undefined;
    }

    let active = true;
    supabase
      .rpc("get_featured_builders")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        if (data?.length) {
          setBuilders(data);
          setBuildersNote(`${data.length} member profiles`);
        } else {
          setBuilders(null);
          setBuildersNote("No live member profiles yet; showing sample members.");
        }
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load community builders.", error);
        setBuilders(null);
        setBuildersNote("Live member profiles are unavailable; showing sample members.");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLeaderboardStatus("Sample leaderboard.");
      return undefined;
    }

    let active = true;
    supabase
      .rpc("get_public_leaderboard")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        if (!data?.length) {
          setLeaderboardPeople(leaderboard);
          setLeaderboardStatus("No live rankings yet; showing sample members.");
          return;
        }
        const people = data.map((person, index) => ({
          rank: String(index + 1).padStart(2, "0"),
          initials: builderInitials(person.full_name),
          name: person.full_name,
          school: `${person.institution || person.username}${person.reputation ? ` · ${Number(person.reputation).toFixed(1)} ★` : ""}`,
          points: new Intl.NumberFormat().format(Number(person.coins) || 0),
          score: Number(person.coins) || 0,
          isDemo: Boolean(person.is_demo),
          color: ["lime", "blue", "peach", "lavender"][index % 4],
        }));
        setLeaderboardPeople(people);
        setLeaderboardStatus(
          people.every((person) => person.isDemo)
            ? "Demo leaderboard data. Real member rankings will appear after users join."
            : `${people.length} builders ranked by earned coins.`,
        );
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load the leaderboard.", error);
        setLeaderboardPeople(leaderboard);
        setLeaderboardStatus("Live rankings are unavailable; showing sample members.");
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <PageTitle title="HackMate — Your people. Your project. Your moment." />
      <main>
        <section className="hero wrap">
          <div className="hero-copy">
            <p className="status-pill">
              <span className="online-dot" /> YOUR NEXT BIG THING STARTS HERE
            </p>
            <h1>
              Your people.
              <br />
              Your project.
              <br />
              <span className="highlight">Your moment.</span>
            </h1>
            <p className="hero-description">
              Find a hackathon, meet your future teammates, and turn that “what if?” into
              something real.
            </p>
            <div className="hero-actions">
              <Link className="button button-dark" to="/hackathons">
                Explore hackathons <Arrow />
              </Link>
              <Link className="button button-outline" to="/teams">
                Find your team
              </Link>
            </div>
            <p className="social-proof">
              <span className="avatar-stack">
                <span className="avatar peach">JD</span>
                <span className="avatar blue">SK</span>
                <span className="avatar pink">AR</span>
                <span className="avatar lime">+</span>
              </span>
              <span>
                <strong>2,400+</strong> students building together
              </span>
            </p>
          </div>
          <div className="hero-visual">
            <span className="hero-orb" />
            <span className="hero-ring" />
            <div className="project-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">A GOOD PLACE TO START</p>
                  <h2>The idea-to-team pipeline</h2>
                </div>
                <span className="panel-star">✳</span>
              </div>
              <div className="project-preview">
                <div className="project-topline">
                  <strong>Your next project</strong>
                  <span className="status-label">OPEN FOR IDEAS</span>
                </div>
                <div className="project-white">
                  <span className="project-icon">◉</span>
                  <div>
                    <strong>Campus Climate Map</strong>
                    <p className="muted tiny">Making sustainability easier to see</p>
                  </div>
                </div>
                <div className="skill-list">
                  <span className="skill">Climate tech</span>
                  <span className="skill">Web app</span>
                  <span className="skill">Beginner friendly</span>
                </div>
                <div className="project-team">
                  <span className="avatar-stack">
                    <span className="avatar pink">MK</span>
                    <span className="avatar blue">JD</span>
                    <span className="avatar lime">+</span>
                  </span>
                  <span className="muted tiny">2 builders on board</span>
                  <strong>2 spots left</strong>
                </div>
              </div>
              <div className="panel-banner">
                <div>
                  <span className="tiny">THIS WEEK ON HACKMATE</span>
                  <strong>18 hackathons. 146 teams. One you.</strong>
                </div>
                <span className="round-lime">
                  <Arrow />
                </span>
              </div>
            </div>
            <div className="floating-note">
              <span className="tiny muted">TEAM MATCH</span>
              <strong>It just clicks. ✨</strong>
            </div>
          </div>
        </section>

        <section id="hackathons" className="section section-tint">
          <div className="wrap">
            <SectionHeading
              eyebrow="PICK A CHALLENGE"
              title="Find your next hackathon."
              description="Good people, big ideas, a weekend you won't forget. Find the one that feels like you."
              action="See all hackathons"
              href="/hackathons"
            />
            <p
              className="hackathon-status"
              data-home-event-status=""
              role="status"
              aria-live="polite"
            >
              {eventStatus}
            </p>
            <div className="event-grid" data-home-events="" aria-busy={eventsBusy}>
              {homeEvents.map((event) => (
                <EventCard event={event} key={event.id} />
              ))}
            </div>
          </div>
        </section>

        <section id="teams" className="section wrap team-section">
          <div className="team-copy">
            <p className="eyebrow">BETTER TOGETHER</p>
            <h2>
              You bring a skill.
              <br />
              We’ll find the
              <br />
              <span className="highlight">rest of the team.</span>
            </h2>
            <p className="muted section-description">
              Designer who wants to build? Developer with an idea? First hackathon ever? There's a
              seat at the table with your name on it.
            </p>
            <div className="filter-list">
              <span className="skill">Designers</span>
              <span className="skill">Developers</span>
              <span className="skill">Idea people</span>
              <span className="skill">First-timers</span>
            </div>
            <Link className="button button-dark" to="/teams">
              Meet your teammates <Arrow />
            </Link>
            <p className="muted tiny">No awkward cold DMs. Just people excited to make things.</p>
          </div>
          <div className="team-panel">
            <div className="team-panel-heading">
              <div>
                <strong>{builders ? "Builders in the community" : "People like you, building things"}</strong>
                <p className="muted tiny">{buildersNote}</p>
              </div>
              {builders ? (
                <Link className="status-label" to="/teams">
                  FIND A TEAM
                </Link>
              ) : (
                <span className="status-label">42 ONLINE</span>
              )}
            </div>
            {builders
              ? builders.map((person, index) => {
                  const reputation = Number(person.reputation) || 0;
                  const skills = person.skills || [];
                  return (
                    <article className="person-card" key={`${person.username}-${index}`}>
                      <div className={`avatar ${avatarColors(index)}`}>
                        {builderInitials(person.full_name)}
                      </div>
                      <div className="person-main">
                        <div className="person-heading">
                          <strong>{person.full_name}</strong>
                        </div>
                        <p className="muted tiny">
                          {person.institution || `@${person.username}`} ·{" "}
                          {reputation ? `${reputation.toFixed(1)} ★` : "New member"}
                        </p>
                        <div className="skill-list">
                          {skills.length ? (
                            skills.map((skill) => (
                              <span className="skill" key={skill}>
                                {skill}
                              </span>
                            ))
                          ) : (
                            <span className="muted tiny">Skills coming soon</span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })
              : teammates.map((person) => <PersonCard person={person} key={person.name} />)}
            <Link to="/teams" className="browse-link">
              Browse {builders ? "teams" : "all teammates"} <Arrow />
            </Link>
          </div>
        </section>

        <section id="leaderboard" className="section leaderboard-section">
          <div className="wrap leaderboard-layout">
            <div>
              <p className="eyebrow light-eyebrow">A LITTLE FRIENDLY COMPETITION</p>
              <h2>
                Show up.
                <br />
                Make stuff.
                <br />
                <span>Your name goes here.</span>
              </h2>
              <p className="leaderboard-copy">
                Every project, new skill, and teammate helped along the way counts. Here's to the
                students making moves this month.
              </p>
              <Link to="/leaderboard" className="button button-lime">
                Visit the leaderboard <Arrow />
              </Link>
            </div>
            <div className="leaderboard-card">
              <div className="leaderboard-heading">
                <div>
                  <strong>Campus creators</strong>
                  <p className="tiny muted">The people doing the thing</p>
                </div>
                <span className="dark-chip">ALL-TIME</span>
              </div>
              <p className="hackathon-status" role="status" aria-live="polite">
                {leaderboardStatus}
              </p>
              <ol className="rank-list" data-live-leaderboard="">
                <LeaderboardRows dark people={leaderboardPeople} />
              </ol>
            </div>
          </div>
        </section>

        <section className="wrap closing-cta">
          <div>
            <p className="eyebrow">YOUR NEXT CHAPTER IS A TEAM PROJECT</p>
            <h2>Ready when you are.</h2>
          </div>
          <Link to="/signup" className="button button-dark">
            Let's find your thing <Arrow />
          </Link>
        </section>
      </main>
    </>
  );
}
