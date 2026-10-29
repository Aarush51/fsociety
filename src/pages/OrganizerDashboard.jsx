import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Arrow } from "../components/Icons";
import OrganizationStatusBanner from "../components/OrganizationStatusBanner";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import StarRating from "../components/StarRating";
import { useOrganization } from "../context/OrganizationContext";
import useHackathonRatings from "../hooks/useHackathonRatings";
import { formatEventDate, formatNumber, formatPrice } from "../lib/format";
import { loadOrganizerEvents, summarizeOrganizerEvents } from "../lib/organizations";
import { fetchOrganizationRating, formatRatingSummary } from "../lib/reviews";

const VIEWS = [
  { value: "current", label: "Current" },
  { value: "past", label: "Past" },
];

function EventRow({ event, rating }) {
  const venue = [event.venue_name, event.city].filter(Boolean).join(", ") || "Venue to be announced";
  const dates = `${formatEventDate(event.starts_at)} – ${formatEventDate(event.ends_at)}`;
  const registered = Number(event.registered_count) || 0;
  const capacity = Number(event.capacity) || 0;
  const ended = event.ends_at ? new Date(event.ends_at).getTime() <= Date.now() : false;
  return (
    <article className="dashboard-data-card">
      <span>
        <strong>{event.title}</strong>
        <small>{venue}</small>
        <span className="organizer-event-meta">
          <span>{dates}</span>
          <span>{capacity ? `${registered} of ${capacity} registered` : `${registered} registered`}</span>
          <span>{formatPrice(event.price)}</span>
          {ended ? (
            <span className="event-rating">
              <StarRating value={rating?.average || 0} />
              <span className="muted tiny">{formatRatingSummary(rating)}</span>
              <Link className="text-link" to={`/hackathons/${encodeURIComponent(event.slug)}#reviews`}>
                Reviews <Arrow diagonal />
              </Link>
            </span>
          ) : null}
        </span>
      </span>
      <span className="filter-list">
        <Link className="text-link" to={`/organizer/registrations?event=${encodeURIComponent(event.id)}`}>
          Registrants <Arrow diagonal />
        </Link>
        <Link className="text-link" to={`/hackathons/${encodeURIComponent(event.slug)}`}>
          View <Arrow diagonal />
        </Link>
      </span>
    </article>
  );
}

export default function OrganizerDashboard() {
  const {
    organization,
    loading: organizationLoading,
    error: organizationError,
    refresh,
  } = useOrganization();
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("current");
  const [reloadKey, setReloadKey] = useState(0);
  const [orgRating, setOrgRating] = useState(null);
  const ratings = useHackathonRatings(events);

  useEffect(() => {
    let active = true;
    setOrgRating(null);
    if (!organization?.id) return undefined;
    fetchOrganizationRating(organization.id)
      .then((data) => {
        if (active) setOrgRating(data);
      })
      .catch((requestError) => {
        console.error("Could not load your organization rating.", requestError);
      });
    return () => {
      active = false;
    };
  }, [organization?.id]);

  useEffect(() => {
    if (!organization) return undefined;
    let active = true;
    setLoading(true);
    setError(null);
    loadOrganizerEvents(organization.id)
      .then((rows) => {
        if (active) setEvents(rows);
      })
      .catch((requestError) => {
        console.error("Could not load your hackathons.", requestError);
        if (!active) return;
        setError(requestError);
        setEvents([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [organization, reloadKey]);

  if (organizationLoading) {
    return (
      <>
        <PageTitle title="My organization | HackMate" />
        <main className="page-main wrap">
          <p className="hackathon-status" role="status" aria-live="polite">
            Loading your organization…
          </p>
        </main>
      </>
    );
  }

  if (organizationError) {
    return (
      <>
        <PageTitle title="My organization | HackMate" />
        <main className="page-main wrap">
          <p className="hackathon-status" role="status" aria-live="polite">
            Your organization could not be loaded. If you have not run the organizer SQL migration in
            Supabase yet, run it first.{" "}
            <button className="text-link hackathon-retry" type="button" onClick={() => refresh()}>
              Try again
            </button>
          </p>
        </main>
      </>
    );
  }

  if (!organization) {
    return <Navigate to="/" replace />;
  }

  const approved = organization.status === "approved";
  const summary = summarizeOrganizerEvents(events || []);
  const visible = view === "current" ? summary.current : summary.past;

  const listStatus = loading
    ? "Loading your hackathons…"
    : error
      ? error.message || "Your hackathons could not be loaded."
      : "";

  return (
    <>
      <PageTitle title={`${organization.org_name} | HackMate`} />
      <main className="page-main wrap">
        <PageIntro
          eyebrow="ORGANIZER DASHBOARD"
          title={organization.org_name}
          description="Everything you host on HackMate, in one place. Offline, in-person hackathons only."
        />
        <OrganizationStatusBanner organization={organization} />
        <section className="organizer-stats" aria-label="Organization activity">
          <article>
            <span className="eyebrow">CURRENT HACKATHONS</span>
            <strong>{loading ? "—" : formatNumber(summary.current.length)}</strong>
            <span className="muted tiny">open or happening now</span>
          </article>
          <article>
            <span className="eyebrow">PEOPLE REGISTERED</span>
            <strong>{loading ? "—" : formatNumber(summary.registeredTotal)}</strong>
            <span className="muted tiny">across all your events</span>
          </article>
          <article>
            <span className="eyebrow">PAST HACKATHONS</span>
            <strong>{loading ? "—" : formatNumber(summary.past.length)}</strong>
            <span className="muted tiny">already finished</span>
          </article>
          <article>
            <span className="eyebrow">OVERALL RATING</span>
            <strong>
              {orgRating === null
                ? "—"
                : Number(orgRating.count)
                  ? formatRatingSummary(orgRating)
                  : "No reviews yet"}
            </strong>
            <span className="muted tiny">from your finished events</span>
          </article>
        </section>
        <div className="organizer-toolbar">
          <div className="filter-list" aria-label="Filter your hackathons">
            {VIEWS.map((option) => (
              <button
                className={`${view === option.value ? "filter-active" : "skill"} hackathon-theme`}
                type="button"
                aria-pressed={view === option.value}
                key={option.value}
                onClick={() => setView(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {approved ? (
            <Link className="button button-dark" to="/organizer/host">
              Host a hackathon <Arrow diagonal />
            </Link>
          ) : (
            <button
              className="button button-dark"
              type="button"
              disabled
              title="Available once your organization is approved."
            >
              Host a hackathon
            </button>
          )}
        </div>
        <p className="hackathon-status" role="status" aria-live="polite">
          {listStatus}
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
        <div className="dashboard-item-list" aria-busy={loading}>
          {loading ? null : visible.length ? (
            visible.map((event) => (
              <EventRow event={event} rating={ratings[event.id]} key={event.id} />
            ))
          ) : (
            <p className="dashboard-empty">
              {view === "current"
                ? approved
                  ? "No hackathons yet. Host your first offline event whenever you are ready."
                  : "No hackathons yet. You can host one as soon as your organization is approved."
                : "No finished hackathons yet. Past events will show up here."}
            </p>
          )}
        </div>
      </main>
    </>
  );
}
