import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Arrow } from "../components/Icons";
import PageTitle from "../components/PageTitle";
import { events } from "../lib/demoData";
import { formatEventDate, hackathonCardData } from "../lib/format";
import { supabase } from "../lib/supabase";

const DETAIL_FIELDS =
  "slug, title, organizer, description, category, location, prize, registration_deadline, starts_at, ends_at, status";

function SampleDetail({ event }) {
  return (
    <div className="detail-layout">
      <div>
        <div className={`detail-art ${event.accent}`}>
          <span className="event-category">{event.category}</span>
          <span className="detail-decoration">{event.icon}</span>
          <div>
            <h1>{event.title}</h1>
            <p>Hosted by {event.organizer}</p>
          </div>
        </div>
        <section className="detail-section">
          <p className="eyebrow">ABOUT THIS EVENT</p>
          <p className="detail-description">{event.description}</p>
        </section>
        <section className="detail-section">
          <h2>Tracks to explore</h2>
          <div className="track-grid">
            {event.tracks.map((track, index) => (
              <article className="track-card" key={track}>
                <span className="eyebrow">TRACK 0{index + 1}</span>
                <strong>{track}</strong>
              </article>
            ))}
          </div>
        </section>
      </div>
      <aside className="detail-aside">
        <p className="eyebrow">EVENT DETAILS</p>
        <dl className="detail-facts">
          <div>
            <dt>Dates</dt>
            <dd>
              {event.date}, 2026
            </dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{event.location}</dd>
          </div>
          <div>
            <dt>Prize pool</dt>
            <dd>{event.prize}</dd>
          </div>
          <div>
            <dt>Registration closes</dt>
            <dd>{event.deadline}</dd>
          </div>
        </dl>
        <Link to="/signup" className="button button-dark button-full">
          Join this hackathon <Arrow />
        </Link>
        <p className="muted tiny centered">Create a free account to find a team.</p>
      </aside>
    </div>
  );
}

function DatabaseDetail({ hackathon }) {
  const event = hackathonCardData(hackathon);
  const dates = `${formatEventDate(hackathon.starts_at)} – ${formatEventDate(hackathon.ends_at)}`;
  return (
    <section
      id="database-hackathon-detail"
      className={`detail-layout database-detail ${event.accent}`}
    >
      <div>
        <div className={`detail-art ${event.accent}`}>
          <span className="event-category">{event.category}</span>
          <span className="detail-decoration" aria-hidden="true">
            {event.icon}
          </span>
          <div>
            <h1>{event.title}</h1>
            <p>Hosted by {event.organizer}</p>
          </div>
        </div>
        <section className="detail-section">
          <p className="eyebrow">ABOUT THIS EVENT</p>
          <p className="detail-description">
            {hackathon.description || "More information about this hackathon will be available soon."}
          </p>
        </section>
      </div>
      <aside className="detail-aside">
        <p className="eyebrow">EVENT DETAILS</p>
        <dl className="detail-facts">
          <div>
            <dt>Dates</dt>
            <dd>{dates}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{event.location}</dd>
          </div>
          <div>
            <dt>Prize pool</dt>
            <dd>{event.prize}</dd>
          </div>
          <div>
            <dt>Registration closes</dt>
            <dd>{event.deadline || "Not specified"}</dd>
          </div>
        </dl>
        <Link to="/signup" className="button button-dark button-full">
          Join this hackathon <Arrow />
        </Link>
        <p className="muted tiny centered">Create a free account to find a team.</p>
      </aside>
    </section>
  );
}

export default function HackathonDetail() {
  const { slug } = useParams();
  const sampleEvent = events.find((event) => event.id === slug);
  const [hackathon, setHackathon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setError(sampleEvent ? null : new Error("Supabase is not configured."));
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setNotFound(false);
    supabase
      .from("hackathons")
      .select(DETAIL_FIELDS)
      .eq("slug", slug)
      .in("status", ["upcoming", "active"])
      .maybeSingle()
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) throw requestError;
        if (!data) {
          setHackathon(null);
          setNotFound(!sampleEvent);
        } else {
          setHackathon(data);
        }
      })
      .catch((requestError) => {
        if (!active) return;
        console.error("Could not load hackathon details from Supabase.", requestError);
        setError(requestError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug, sampleEvent, reloadKey]);

  const title = hackathon?.title || sampleEvent?.title;

  return (
    <>
      <PageTitle title={title ? `${title} | HackMate` : "Hackathons | HackMate"} />
      <main className="page-main wrap">
        <Link className="back-link" to="/hackathons">
          ← All hackathons
        </Link>
        {loading ? (
          <section
            id="database-hackathon-detail"
            className="hackathon-status"
            role="status"
            aria-live="polite"
          >
            Loading hackathon…
          </section>
        ) : null}
        {!loading && hackathon ? <DatabaseDetail hackathon={hackathon} /> : null}
        {!loading && !hackathon && sampleEvent ? <SampleDetail event={sampleEvent} /> : null}
        {!loading && !hackathon && !sampleEvent && notFound ? (
          <section
            id="database-hackathon-detail"
            className="hackathon-status"
            role="status"
            aria-live="polite"
          >
            This hackathon is unavailable or no longer open.
          </section>
        ) : null}
        {!loading && !hackathon && !sampleEvent && error ? (
          <section
            id="database-hackathon-detail"
            className="hackathon-status"
            role="status"
            aria-live="polite"
          >
            Hackathon details couldn’t be loaded. Check your connection and try again.{" "}
            <button
              className="text-link hackathon-retry"
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </button>
          </section>
        ) : null}
      </main>
    </>
  );
}
