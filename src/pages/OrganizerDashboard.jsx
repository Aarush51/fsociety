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

  const statusBadgeClass =
    reviewStatus === "pending"
      ? "admin-badge admin-badge-pending"
      : reviewStatus === "rejected"
        ? "admin-badge admin-badge-rejected"
        : "organizer-event-badge";

  const tierNote =
    reviewStatus === "approved" && tier && claimedTier && tier !== claimedTier
      ? `Tier ${tier} (you chose Tier ${claimedTier})`
      : "";

  return (
    <article className="team-card">
      <div className="team-card-heading">
        <div>
          <p className="eyebrow">HACKATHON</p>
          <h2>{event.title}</h2>
        </div>
        <span className={statusBadgeClass}>{statusLabel}</span>
      </div>

      <p className="team-description">{venue}</p>

      <div className="skill-list">
        <span className="organizer-event-badge">{dates}</span>
        <span className="organizer-event-badge">
          {registered} registered{capacity ? ` of ${capacity}` : ""}
        </span>
        <span className="organizer-event-badge">{formatPrice(event.price)}</span>
        <span className="organizer-event-badge">{ended ? "Ended" : "Open"}</span>
        {tierNote ? <span className="organizer-event-badge">{tierNote}</span> : null}
      </div>

      <div className="org-form-actions">
        <Link className="button button-dark" to={`/hackathons/${encodeURIComponent(event.slug)}`}>
          View event <Arrow />
        </Link>
        <button className="button button-outline" type="button" onClick={onToggleTools}>
          {toolsOpen ? "Hide tools" : "Open tools"}
        </button>
      </div>

      {toolsOpen ? <OrganizerEventTools event={event} /> : null}
    </article>
  );
}

// `listOnly` is the Manage Hackathons view: the same page component without the
// dashboard stats and shortcuts, leaving the organizer's hackathon list and the
// existing per-event tools (View event / Open tools).
export default function OrganizerDashboard({ listOnly = false }) {
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

  const pageTitle = listOnly ? "Manage hackathons | HackMate" : "Organizer dashboard | HackMate";
  const introTitle = listOnly ? "Manage hackathons" : "Organizer dashboard";
  const introDescription = listOnly
    ? "Every hackathon you host, with the team, attendance and results tools in one place."
    : "Track your events, attendance, and results in one place.";

  if (organizationLoading || (loading && !organization)) {
    return (
      <main className="page-main wrap">
        <PageTitle title={pageTitle} />
        <p className="hackathon-status" role="status" aria-live="polite">
          Loading your organizer dashboard…
        </p>
      </main>
    );
  }

  if (organizationError || (!organization && !organizationError)) {
    return (
      <main className="page-main wrap">
        <PageTitle title={pageTitle} />
        <PageIntro
          eyebrow="ORGANIZER"
          title={introTitle}
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
      <PageTitle title={pageTitle} />
      <PageIntro
        eyebrow="ORGANIZER"
        title={introTitle}
        description={introDescription}
      />

      {listOnly ? null : (
        <>
          <OrganizationStatusBanner organization={organization} />

          <section className="profile-stats organizer-stats" aria-label="Organizer stats">
            <article>
              <span className="eyebrow">CURRENT</span>
              <strong>{current.length}</strong>
              <span className="muted tiny">active events</span>
            </article>
            <article>
              <span className="eyebrow">PAST</span>
              <strong>{past.length}</strong>
              <span className="muted tiny">completed events</span>
            </article>
            <article>
              <span className="eyebrow">REGISTERED</span>
              <strong>{registeredTotal}</strong>
              <span className="muted tiny">people across all events</span>
            </article>
          </section>

          <div className="shortcut-grid organizer-shortcuts">
            <Link className="shortcut-card" to="/organizer/profile">
              <span className="avatar blue">◉</span>
              <strong>
                Organizer profile <Arrow diagonal />
              </strong>
              <p className="muted tiny">The organization details participants see.</p>
            </Link>
            <Link className="shortcut-card" to="/organizer/registrations">
              <span className="avatar peach">☰</span>
              <strong>
                Registrations <Arrow diagonal />
              </strong>
              <p className="muted tiny">Everyone signed up, their teams and IDs.</p>
            </Link>
          </div>
        </>
      )}

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
        <section className="dashboard-data-section">
          <div className="section-heading dashboard-heading">
            <div>
              <p className="eyebrow">CURRENT</p>
              <h2>Current events</h2>
            </div>
          </div>
          <div className="team-list">
            {current.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                toolsOpen={Boolean(openTools[event.id])}
                onToggleTools={() => toggleTools(event.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {past.length ? (
        <section className="dashboard-data-section">
          <div className="section-heading dashboard-heading">
            <div>
              <p className="eyebrow">PAST</p>
              <h2>Past events</h2>
            </div>
          </div>
          <div className="team-list">
            {past.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                toolsOpen={Boolean(openTools[event.id])}
                onToggleTools={() => toggleTools(event.id)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
