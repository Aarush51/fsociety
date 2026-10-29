import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Arrow } from "../components/Icons";
import PageTitle from "../components/PageTitle";
import EventReviews from "../components/EventReviews";
import RegistrationCTA from "../components/RegistrationCTA";
import { events } from "../lib/demoData";
import { formatEventDate, formatPrice, hackathonCardData } from "../lib/format";
import { supabase } from "../lib/supabase";

// team_size_max is intentionally absent: the column only exists after the team
// formation migration, and requesting a missing column fails the whole query.
const DETAIL_FIELDS =
  "id, slug, title, organizer, description, category, location, prize, registration_deadline, starts_at, ends_at, status, organization_id, venue_name, address, city, maps_url, capacity, price, rules, prize_details";

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
  const venue = [hackathon.venue_name, hackathon.city].filter(Boolean).join(", ");
  const address = hackathon.address || "";
  const price = formatPrice(hackathon.price) || "Free";
  // Prefer the organizer's Maps link; without one, search Google Maps for the venue address.
  const mapQuery = [hackathon.venue_name, address, hackathon.city].filter(Boolean).join(", ");
  const directionsUrl =
    hackathon.maps_url ||
    (mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : "");
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
            {venue ? <p>{venue}</p> : null}
          </div>
        </div>
        <section className="detail-section">
          <p className="eyebrow">ABOUT THIS EVENT</p>
          <p className="detail-description">
            {hackathon.description || "More information about this hackathon will be available soon."}
          </p>
        </section>
        {hackathon.prize_details ? (
          <section className="detail-section">
            <h2>Prizes</h2>
            <p className="detail-description">{hackathon.prize_details}</p>
          </section>
        ) : null}
        {hackathon.rules ? (
          <section className="detail-section">
            <h2>Rules</h2>
            <p className="detail-description">{hackathon.rules}</p>
          </section>
        ) : null}
      </div>
      <aside className="detail-aside">
        <p className="eyebrow">EVENT DETAILS</p>
        <dl className="detail-facts">
          <div>
            <dt>Dates</dt>
            <dd>{dates}</dd>
          </div>
          <div>
            <dt>Venue</dt>
            <dd>{hackathon.venue_name || event.location}</dd>
          </div>
          {hackathon.city ? (
            <div>
              <dt>City</dt>
              <dd>{hackathon.city}</dd>
            </div>
          ) : null}
          {address ? (
            <div>
              <dt>Address</dt>
              <dd>{address}</dd>
            </div>
          ) : null}
          <div>
            <dt>Entry price</dt>
            <dd>{price}</dd>
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
        {directionsUrl ? (
          <div className="detail-directions">
            <a
              className="button button-outline button-full"
              href={directionsUrl}
              target="_blank"
              rel="noreferrer"
            >
              Get directions <Arrow diagonal />
            </a>
          </div>
        ) : null}
        <RegistrationCTA hackathon={hackathon} slug={hackathon.slug} />
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
      // 'completed' events stay readable for the organizers and admins that RLS
      // already allows, so a finished hackathon's Reviews anchor still resolves.
      .in("status", ["upcoming", "active", "completed"])
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
        {!loading && hackathon ? <EventReviews hackathon={hackathon} /> : null}
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
