import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Arrow } from "../components/Icons";
import OrganizationStatusBanner from "../components/OrganizationStatusBanner";
import OrganizerEventTools from "../components/OrganizerEventTools";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { useOrganization } from "../context/OrganizationContext";
import { formatEventDate, formatPrice } from "../lib/format";
import { loadOrganizerEvents, summarizeOrganizerEvents } from "../lib/organizations";

function EventRow({ event, toolsOpen, onToggleTools }) {
  const venue = [event.venue_name, event.city].filter(Boolean).join(", ") || "Venue to be announced";
  const dates = `${formatEventDate(event.starts_at)} – ${formatEventDate(event.ends_at)}`;
  const registered = Number(event.registered_count) || 0;
  const capacity = Number(event.capacity) || 0;
  const reviewStatus = event.approval_status || "approved";
  const tier = Number(event.tier) || null;
  const claimedTier = Number(event.claimed_tier) || null;
  const ended = event.ends_at ? new Date(event.ends_at).getTime() <= Date.now() : false;

  const statusLabel =
    reviewStatus === "pending"
      ? "Pending review"
      : reviewStatus === "rejected"
        ? "Rejected"
        : tier
          ? `Live · Tier ${tier}`
          : "Live";

  const tierNote =
    reviewStatus === "approved" && tier && claimedTier && tier !== claimedTier
      ? `Tier ${tier} (you chose Tier ${claimedTier})`
      : "";

  return (
    <article className="dashboard-data-card">
      <div className="dashboard-card-header">
        <div>
          <strong>{event.title}</strong>
          <small>{venue}</small>
        </div>
        <span className="badge badge-neutral">{statusLabel}</span>
      </div>

      <div className="organizer-event-meta">
        <span>{dates}</span>
        <span>{capacity ? `${registered} of ${capacity} registered` : `${registered} registered`}</span>
        <span>{formatPrice(event.price)}</span>
        {ended ? <span>Ended</span> : <span>Open</span>}
        {tierNote ? <span>{tierNote}</span> : null}
      </div>

      <div className="organizer-dashboard-actions">
        <Link className="button button-dark" to={`/hackathons/${encodeURIComponent(event.slug)}`}>
          View event <Arrow />
        </Link>
        <button className="button secondary" type="button" onClick={onToggleTools}>
          {toolsOpen ? "Hide tools" : "Open tools"}
        </button>
      </div>

      {toolsOpen ? <OrganizerEventTools event={event} /> : null}
    </article>
  );
}

export default function OrganizerDashboard() {
  const { organization, loading: organizationLoading, error: organizationError } = useOrganization();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openTools, setOpenTools] = useState({});

  useEffect(() => {
    if (!organization) return undefined;

    let active = true;
    setLoading(true);
    setError(null);

    loadOrganizerEvents(organization.id)
      .then((rows) => {
        if (!active) return;
        setEvents(rows);
      })
      .catch((requestError) => {
        if (!active) return;
        console.error("Could not load organizer dashboard events.", requestError);
        setError(requestError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [organization]);

  const toggleTools = (eventId) => {
    setOpenTools((current) => ({
      ...current,
      [eventId]: !current[eventId],
    }));
  };

  const { current, past, registeredTotal } = useMemo(
    () => summarizeOrganizerEvents(events),
    [events],
  );

  if (organizationLoading || (loading && !organization)) {
    return (
      <main className="page-main wrap">
        <PageTitle title="Organizer dashboard | HackMate" />
        <p className="hackathon-status" role="status" aria-live="polite">
          Loading your organizer dashboard…
        </p>
      </main>
    );
  }

  if (organizationError || (!organization && !organizationError)) {
    return (
      <main className="page-main wrap">
        <PageTitle title="Organizer dashboard | HackMate" />
        <PageIntro
          eyebrow="ORGANIZER"
          title="Organizer dashboard"
          description="Register an organization first to start hosting hackathons."
        />
        <p className="form-message" role="status" data-error="true">
          {organizationError
            ? "Your organization could not be loaded. Please try again."
            : "You need an approved organization before you can host hackathons."}
        </p>
        <div className="org-form-actions">
          <Link className="button button-dark" to="/organization/register">
            Register an organization <Arrow />
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-main wrap">
      <PageTitle title="Organizer dashboard | HackMate" />
      <PageIntro
        eyebrow="ORGANIZER"
        title="Organizer dashboard"
        description="Track your events, attendance, and results in one place."
      />

      <OrganizationStatusBanner organization={organization} />

      <div className="summary-grid">
        <div className="dashboard-stat">
          <span className="eyebrow">CURRENT</span>
          <strong>{current.length}</strong>
          <small>active events</small>
        </div>
        <div className="dashboard-stat">
          <span className="eyebrow">PAST</span>
          <strong>{past.length}</strong>
          <small>completed events</small>
        </div>
        <div className="dashboard-stat">
          <span className="eyebrow">REGISTERED</span>
          <strong>{registeredTotal}</strong>
          <small>people across all events</small>
        </div>
      </div>

      {error ? (
        <p className="form-message" role="status" data-error="true">
          {error.message || "Your hackathon data could not be loaded."}
        </p>
      ) : null}

      {!loading && !events.length ? (
        <div className="team-empty">
          <p>You haven’t hosted a hackathon yet.</p>
          <Link className="button button-dark" to="/organizer/host">
            Host a hackathon <Arrow />
          </Link>
        </div>
      ) : null}

      {current.length ? (
        <section>
          <h2 className="section-heading">Current events</h2>
          {current.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              toolsOpen={Boolean(openTools[event.id])}
              onToggleTools={() => toggleTools(event.id)}
            />
          ))}
        </section>
      ) : null}

      {past.length ? (
        <section>
          <h2 className="section-heading">Past events</h2>
          {past.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              toolsOpen={Boolean(openTools[event.id])}
              onToggleTools={() => toggleTools(event.id)}
            />
          ))}
        </section>
      ) : null}
    </main>
  );
}
