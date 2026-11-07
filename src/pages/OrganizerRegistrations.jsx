import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Arrow } from "../components/Icons";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { useOrganization } from "../context/OrganizationContext";
import { formatEventDate, formatPrice } from "../lib/format";
import { loadOrganizerEvents } from "../lib/organizations";
import { listHackathonTeams } from "../lib/teams";
import { supabase } from "../lib/supabase";

const PAGE_CONTAINER_STYLE = {
  width: "min(calc(100% - var(--space-xl)), 1120px)",
  marginInline: "auto",
};

// The organizer's roster for one hackathon: registrations enriched with
// participant and team details from the existing team-list RPC.
export default function OrganizerRegistrations() {
  const { organization, loading: organizationLoading, error: organizationError } = useOrganization();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState(null);
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const selectedId = searchParams.get("event") || "";

  // Organizer's hackathons.
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
        if (!active) return;
        console.error("Could not load your hackathons.", requestError);
        setError(requestError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [organization, reloadKey]);

  const hackathonId = selectedId || events?.[0]?.id || "";

  // Registrations + teams + capacity for the selected hackathon.
  const loadRoster = useCallback(async () => {
    if (!hackathonId) return;
    setRoster(null);
    setError(null);
    try {
      const [registrationsResult, teamRows] = await Promise.all([
        supabase
          .from("registrations")
          .select("id, user_id, paid, created_at")
          .eq("hackathon_id", hackathonId)
          .order("created_at", { ascending: true }),
        listHackathonTeams(hackathonId),
      ]);
      if (registrationsResult.error) throw registrationsResult.error;

      const peopleByUser = new Map();
      teamRows.forEach((team) => {
        (team.members || []).forEach((member) => {
          peopleByUser.set(member.id, { member, team });
        });
      });

      setRoster({
        rows: (registrationsResult.data || []).map((row) => ({
          ...row,
          person: peopleByUser.get(row.user_id) || null,
        })),
      });
    } catch (requestError) {
      console.error("Could not load registrations.", requestError);
      setError(requestError);
    }
  }, [hackathonId]);

  useEffect(() => {
    if (hackathonId) loadRoster();
  }, [loadRoster, hackathonId, reloadKey]);

  const selectedEvent = useMemo(
    () => events?.find((event) => event.id === hackathonId) || null,
    [events, hackathonId],
  );

  const selectEvent = (id) => {
    const next = new URLSearchParams(searchParams);
    next.set("event", id);
    setSearchParams(next, { replace: true });
  };

  if (organizationLoading || (loading && !events)) {
    return (
      <main className="page-main wrap" style={PAGE_CONTAINER_STYLE}>
        <PageTitle title="Registrations | HackMate" />
        <p className="hackathon-status" role="status" aria-live="polite">
          Loading your hackathons…
        </p>
      </main>
    );
  }

  if (organizationError || (!organization && !organizationError)) {
    return (
      <main className="page-main wrap" style={PAGE_CONTAINER_STYLE}>
        <PageTitle title="Registrations | HackMate" />
        <p className="hackathon-status" role="status" data-error="true">
          {organizationError
            ? "Your organization couldn’t be loaded. Please try again."
            : "Register an organization first to see registrations."}
        </p>
        <div className="org-form-actions">
          <Link className="button button-dark" to="/organization/register">
            Register an organization <Arrow />
          </Link>
        </div>
      </main>
    );
  }

  if (!events?.length) {
    return (
      <main className="page-main wrap" style={PAGE_CONTAINER_STYLE}>
        <PageTitle title="Registrations | HackMate" />
        <PageIntro
          eyebrow="ORGANIZER"
          title="Registrations"
          description="Everyone who signs up for your hackathons appears here."
        />
        <p className="team-empty">
          You haven’t hosted a hackathon yet. Create one first, then registrations will appear here.
        </p>
        <div className="org-form-actions">
          <Link className="button button-dark" to="/organizer/host">
            Host a hackathon <Arrow />
          </Link>
        </div>
      </main>
    );
  }

  const capacity = Number(selectedEvent?.capacity) || 0;
  const total = roster ? roster.rows.length : 0;

  return (
    <main className="page-main wrap" style={PAGE_CONTAINER_STYLE}>
      <PageTitle title="Registrations | HackMate" />
      <Link className="back-link" to="/organizer">
        ← Organizer dashboard
      </Link>
      <PageIntro
        eyebrow="ORGANIZER"
        title="Registrations"
        description={
          selectedEvent
            ? `${selectedEvent.title} · ${formatEventDate(selectedEvent.starts_at)}${
                selectedEvent.city ? ` · ${selectedEvent.city}` : ""
              }`
            : "Everyone who registered for your hackathons."
        }
      />

      {events.length > 1 ? (
        <div className="filter-list" role="group" aria-label="Choose a hackathon">
          {events.map((event) => (
            <button
              key={event.id}
              className={`${event.id === hackathonId ? "filter-active" : "skill"} hackathon-theme`}
              type="button"
              aria-pressed={event.id === hackathonId}
              onClick={() => selectEvent(event.id)}
            >
              {event.title}
            </button>
          ))}
        </div>
      ) : null}

      <p className="muted small">
        {roster
          ? selectedEvent
            ? `Entry ${formatPrice(selectedEvent.price) || "Free"}`
            : ""
          : "Loading registrations…"}
        {selectedEvent ? (
          <>
            {" · "}
            <Link
              className="text-link"
              to={`/hackathons/${encodeURIComponent(selectedEvent.slug)}`}
            >
              View event page
            </Link>
          </>
        ) : null}
      </p>

      {error ? (
        <p className="form-message" role="status" data-error="true">
          Registrations couldn’t be loaded. Check your connection and try again.{" "}
          <button
            className="text-link"
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Try again
          </button>
        </p>
      ) : null}

      {!roster && !error ? (
        <p className="hackathon-status" role="status" aria-live="polite">
          Loading registrations…
        </p>
      ) : null}

      {roster && roster.rows.length === 0 ? (
        <p className="team-empty">No registrations yet.</p>
      ) : null}

      {roster && roster.rows.length ? (
        <div className="team-list" aria-live="polite">
          {roster.rows.map((row, index) => {
            const person = row.person?.member || null;
            const team = row.person?.team || null;
            return (
              <article className="team-card" key={row.id}>
                <div className="team-card-heading">
                  <div>
                    <p className="eyebrow">REGISTRATION #{index + 1}</p>
                    <h2>{person?.full_name || "Participant"}</h2>
                  </div>
                  <span className="team-member-count">
                    {row.paid ? "PAID" : "UNPAID"}
                  </span>
                </div>
                <p className="team-description">
                  {team?.name || "No team yet"} · Registered {formatEventDate(row.created_at)}
                </p>
              </article>
            );
          })}
        </div>
      ) : null}

      {roster ? (
        <p className="muted tiny">
          {total} of {capacity} spots filled
        </p>
      ) : null}
    </main>
  );
}
