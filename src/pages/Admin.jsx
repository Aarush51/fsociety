import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Arrow } from "../components/Icons";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import StarRating from "../components/StarRating";
import { useAdmin } from "../context/AdminContext";
import {
  loadEventReviewsForModeration,
  loadFlaggedUsers,
  loadHackathonsForTierReview,
  loadOrganizationsForReview,
  reviewHackathon,
  reviewOrganization,
  setEventReviewHidden,
} from "../lib/admin";
import { formatEventDate, formatNumber } from "../lib/format";
import { HACKATHON_TIERS, organizationTypeLabel, tierLabel } from "../lib/organizations";

const TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "tiers", label: "Tiers" },
  { value: "reviews", label: "Reviews" },
  { value: "flagged", label: "Flagged users" },
];

const EMPTY_COPY = {
  pending: "Nothing is waiting for review right now.",
  approved: "No organizations have been approved yet.",
  rejected: "No organizations have been rejected yet.",
  tiers: "No hackathon has claimed a tier yet.",
};

function Fact({ label, children }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ReviewCard({ review, busy, onToggle }) {
  return (
    <article className="admin-card">
      <header className="admin-card-head">
        <div>
          <p className="eyebrow">{review.hackathon_title}</p>
          <h2>{review.reviewer_first_name}</h2>
        </div>
        <span className={`admin-badge ${review.hidden ? "admin-badge-rejected" : "admin-badge-approved"}`}>
          {review.hidden ? "hidden" : "visible"}
        </span>
      </header>

      <div className="event-rating">
        <StarRating value={review.rating} />
        <span className="muted tiny">
          {formatEventDate(review.created_at)}
          {review.updated_at && review.updated_at !== review.created_at
            ? ` · edited ${formatEventDate(review.updated_at)}`
            : ""}
        </span>
      </div>

      <p className="admin-description">{review.comment || "No comment left."}</p>

      <div className="admin-actions">
        <button className="button button-dark" type="button" disabled={busy} onClick={() => onToggle(review)}>
          {busy ? "Saving…" : review.hidden ? "Unhide" : "Hide"}
        </button>
        <Link
          className="text-link"
          to={`/hackathons/${encodeURIComponent(review.hackathon_slug)}#reviews`}
        >
          Open reviews <Arrow diagonal />
        </Link>
      </div>
    </article>
  );
}

function TierCard({ event, busy, onDecide }) {
  const approved = Number(event.approved_tier) || null;
  const claimed = Number(event.claimed_tier) || null;
  // The picker starts on the organizer's claim; the admin can move it.
  const [tier, setTier] = useState(claimed || 3);
  const prizePool =
    event.prize_pool === null || event.prize_pool === undefined
      ? "—"
      : `₹${formatNumber(event.prize_pool)}`;
  const status = event.approval_status || "pending";
  const badgeClass =
    status === "approved"
      ? "admin-badge-approved"
      : status === "rejected"
        ? "admin-badge-rejected"
        : "admin-badge-pending";
  return (
    <article className="admin-card">
      <header className="admin-card-head">
        <div>
          <p className="eyebrow">
            {[event.organizer, event.city].filter(Boolean).join(" · ") || "Hackathon"} · starts{" "}
            {formatEventDate(event.starts_at)}
          </p>
          <h2>{event.title}</h2>
        </div>
        <span className={`admin-badge ${badgeClass}`}>{
          approved ? `${status} · ${tierLabel(approved)}` : status
        }</span>
      </header>

      <dl className="admin-facts">
        <Fact label="Claimed tier">{tierLabel(claimed) || "Not claimed"}</Fact>
        <Fact label="Approved tier">{approved ? tierLabel(approved) : "—"}</Fact>
        <Fact label="Expected participants">{event.expected_participants ?? "—"}</Fact>
        <Fact label="Prize pool">{prizePool}</Fact>
      </dl>

      <p className="admin-description">
        <strong>Reason for claimed tier:</strong> {event.tier_reason || "No reason given."}
      </p>

      <div className="filter-list" role="group" aria-label={`Approve ${event.title} as`}>
        {HACKATHON_TIERS.map((option) => (
          <button
            className={tier === option.value ? "filter-active" : "skill"}
            type="button"
            disabled={busy}
            aria-pressed={tier === option.value}
            key={option.value}
            onClick={() => setTier(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <span className="org-field-hint">
        {claimed
          ? `Defaults to the organizer's claim (${tierLabel(claimed)}). Pick the tier you are approving.`
          : "The organizer claimed no tier. Pick the tier you are approving."}
      </span>

      <div className="admin-actions">
        <button
          className="button button-dark"
          type="button"
          disabled={busy}
          onClick={() => onDecide(event, "approved", tier)}
        >
          {busy ? "Saving…" : `Approve as ${tierLabel(tier)}`}
        </button>
        <button
          className="button button-outline"
          type="button"
          disabled={busy}
          onClick={() => onDecide(event, "rejected", null)}
        >
          Reject
        </button>
      </div>
    </article>
  );
}

// One member reported by two or more different people: the count, every reason,
// and who filed each report (with their short context and the date).
function FlaggedCard({ flagged }) {
  const reporters = Array.isArray(flagged.reporters) ? flagged.reporters : [];
  const reasons = Array.isArray(flagged.reasons) ? flagged.reasons : [];
  const reporterCount = Number(flagged.reporter_count) || 0;
  const reportCount = Number(flagged.report_count) || 0;

  return (
    <article className="admin-card">
      <header className="admin-card-head">
        <div>
          <p className="eyebrow">
            REPORTED BY {reporterCount} {reporterCount === 1 ? "PERSON" : "PEOPLE"} · ID{" "}
            {flagged.friend_code || "—"}
          </p>
          <h2>{flagged.full_name || "A HackMate member"}</h2>
        </div>
        <span className="admin-badge admin-badge-rejected">
          {reportCount} {reportCount === 1 ? "report" : "reports"}
        </span>
      </header>

      <p className="admin-description">
        <strong>Reasons:</strong> {reasons.length ? reasons.join(" · ") : "No reason recorded."}
      </p>

      <dl className="admin-facts">
        {reporters.map((entry, index) => (
          <Fact
            key={`${entry.reporter_id}-${index}`}
            label={`${entry.reporter_name} · ${formatEventDate(entry.created_at, {
              dateStyle: "medium",
              timeStyle: "short",
            })}`}
          >
            {entry.reason}
            {entry.context ? <span className="muted tiny"> — {entry.context}</span> : null}
          </Fact>
        ))}
      </dl>
    </article>
  );
}

function OrganizationCard({ organization, busy, onApprove, onReject }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  const signedAt = organization.agreed_at
    ? formatEventDate(organization.agreed_at, { dateStyle: "medium", timeStyle: "short" })
    : "—";

  const submitReject = async (event) => {
    event.preventDefault();
    if (!reason.trim()) {
      setReasonError("Add a reason so the organizer knows what to fix.");
      return;
    }
    setReasonError("");
    const saved = await onReject(organization, reason);
    if (saved) {
      setRejecting(false);
      setReason("");
    }
  };

  return (
    <article className="admin-card">
      <header className="admin-card-head">
        <div>
          <p className="eyebrow">
            {organizationTypeLabel(organization.org_type)} · {organization.city}
          </p>
          <h2>{organization.org_name}</h2>
        </div>
        <span className={`admin-badge admin-badge-${organization.status}`}>{organization.status}</span>
      </header>

      <dl className="admin-facts">
        <Fact label="Official email">
          <a href={`mailto:${organization.contact_email}`}>{organization.contact_email}</a>
        </Fact>
        <Fact label="Phone">
          <a href={`tel:${String(organization.phone).replace(/[^\d+]/g, "")}`}>{organization.phone}</a>
        </Fact>
        <Fact label="City">{organization.city}</Fact>
        <Fact label="Address">{organization.address}</Fact>
        {organization.website ? (
          <Fact label="Website">
            <a href={organization.website} target="_blank" rel="noreferrer">
              {organization.website}
            </a>
          </Fact>
        ) : null}
        {organization.coordinator_name ? (
          <Fact label="Faculty coordinator">{organization.coordinator_name}</Fact>
        ) : null}
        {organization.coordinator_email ? (
          <Fact label="Coordinator email">
            <a href={`mailto:${organization.coordinator_email}`}>{organization.coordinator_email}</a>
          </Fact>
        ) : null}
        <Fact label="Signed name">{organization.signed_name}</Fact>
        <Fact label="Signed on">{signedAt}</Fact>
      </dl>

      <p className="admin-description">{organization.description}</p>

      <div className="admin-proof">
        <a className="text-link" href={organization.proof_url} target="_blank" rel="noreferrer">
          Open proof <Arrow diagonal />
        </a>
      </div>

      {organization.status === "rejected" && organization.review_note ? (
        <p className="admin-review-note">
          <strong>Review note:</strong> {organization.review_note}
        </p>
      ) : null}

      <div className="admin-actions">
        {organization.status !== "approved" ? (
          <button
            className="button button-dark"
            type="button"
            onClick={() => onApprove(organization)}
            disabled={busy}
          >
            {busy ? "Saving…" : "Approve"}
          </button>
        ) : null}
        {organization.status !== "rejected" ? (
          <button
            className="button button-outline"
            type="button"
            onClick={() => setRejecting((open) => !open)}
            disabled={busy}
          >
            {rejecting ? "Cancel reject" : "Reject"}
          </button>
        ) : null}
      </div>

      {rejecting ? (
        <form className="admin-reject" onSubmit={submitReject} noValidate>
          <label htmlFor={`reject-${organization.id}`}>Reason for rejection (required)</label>
          <textarea
            id={`reject-${organization.id}`}
            rows="3"
            maxLength="1000"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (reasonError) setReasonError("");
            }}
            placeholder="For example: the proof link does not show a registration certificate."
          />
          {reasonError ? (
            <span className="org-field-error" role="alert">
              {reasonError}
            </span>
          ) : null}
          <div className="admin-actions">
            <button className="button button-dark" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Reject organization"}
            </button>
            <button
              className="text-link"
              type="button"
              onClick={() => {
                setRejecting(false);
                setReasonError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

export default function Admin() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [organizations, setOrganizations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState("pending");
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState({ text: "", error: false });
  const [eventReviews, setEventReviews] = useState(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [tierEvents, setTierEvents] = useState(null);
  const [tiersLoading, setTiersLoading] = useState(false);
  const [tiersError, setTiersError] = useState(null);
  const [tierBusyId, setTierBusyId] = useState(null);
  const [flaggedUsers, setFlaggedUsers] = useState(null);
  const [flaggedLoading, setFlaggedLoading] = useState(false);
  const [flaggedError, setFlaggedError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setOrganizations(await loadOrganizationsForReview());
    } catch (requestError) {
      console.error("Could not load organizations for review.", requestError);
      setOrganizations([]);
      setLoadError(requestError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin, load]);

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true);
    setReviewsError(null);
    try {
      setEventReviews(await loadEventReviewsForModeration());
    } catch (requestError) {
      console.error("Could not load event reviews for moderation.", requestError);
      setEventReviews([]);
      setReviewsError(requestError);
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  // The Reviews tab loads on first open and after every hide/unhide.
  useEffect(() => {
    if (!isAdmin || tab !== "reviews" || eventReviews !== null) return;
    loadReviews();
  }, [isAdmin, tab, eventReviews, loadReviews]);

  const loadTiers = useCallback(async () => {
    setTiersLoading(true);
    setTiersError(null);
    try {
      setTierEvents(await loadHackathonsForTierReview());
    } catch (requestError) {
      console.error("Could not load hackathons for tier review.", requestError);
      setTierEvents([]);
      setTiersError(requestError);
    } finally {
      setTiersLoading(false);
    }
  }, []);

  // The Tiers tab loads on first open and after every approval.
  useEffect(() => {
    if (!isAdmin || tab !== "tiers" || tierEvents !== null) return;
    loadTiers();
  }, [isAdmin, tab, tierEvents, loadTiers]);

  const loadFlagged = useCallback(async () => {
    setFlaggedLoading(true);
    setFlaggedError(null);
    try {
      setFlaggedUsers(await loadFlaggedUsers());
    } catch (requestError) {
      console.error("Could not load flagged users.", requestError);
      setFlaggedUsers([]);
      setFlaggedError(requestError);
    } finally {
      setFlaggedLoading(false);
    }
  }, []);

  // Flagged users load on first open, so the tab count stays cheap.
  useEffect(() => {
    if (!isAdmin || tab !== "flagged" || flaggedUsers !== null) return;
    loadFlagged();
  }, [isAdmin, tab, flaggedUsers, loadFlagged]);

  const counts = useMemo(() => {
    const totals = { pending: 0, approved: 0, rejected: 0, reviews: 0, tiers: 0, flagged: 0 };
    (organizations || []).forEach((organization) => {
      if (totals[organization.status] !== undefined) totals[organization.status] += 1;
    });
    totals.reviews = (eventReviews || []).length;
    totals.tiers = (tierEvents || []).length;
    totals.flagged = (flaggedUsers || []).length;
    return totals;
  }, [organizations, eventReviews, tierEvents, flaggedUsers]);

  if (adminLoading) {
    return (
      <>
        <PageTitle title="Admin | HackMate" />
        <main className="page-main wrap">
          <p className="hackathon-status" role="status" aria-live="polite">
            Checking admin access…
          </p>
        </main>
      </>
    );
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  const review = async (organization, status, reviewNote = null) => {
    setBusyId(organization.id);
    setMessage({ text: "", error: false });
    try {
      await reviewOrganization(organization.id, { status, reviewNote });
      await load();
      setMessage({
        text:
          status === "approved"
            ? `${organization.org_name} is approved and can host hackathons.`
            : `${organization.org_name} was rejected and the reason was saved.`,
        error: false,
      });
      return true;
    } catch (requestError) {
      setMessage({
        text: requestError.message || "The review could not be saved. Please try again.",
        error: true,
      });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  // Approve with a tier, or reject. review_hackathon writes approval_status and
  // approved_tier together and is admin-only, so a failure is reported, not assumed.
  const decideHackathon = async (event, decision, tier) => {
    setTierBusyId(event.id);
    setMessage({ text: "", error: false });
    try {
      await reviewHackathon(event.id, decision, tier);
      await loadTiers();
      setMessage({
        text:
          decision === "approved"
            ? `${event.title} is approved as ${tierLabel(tier)}.`
            : `${event.title} was rejected and its approved tier was cleared.`,
        error: false,
      });
    } catch (requestError) {
      setMessage({
        text: requestError.message || "The tier could not be saved. Please try again.",
        error: true,
      });
    } finally {
      setTierBusyId(null);
    }
  };

  const visible = (organizations || []).filter((organization) => organization.status === tab);
  const showingReviews = tab === "reviews";
  const showingTiers = tab === "tiers";
  const showingFlagged = tab === "flagged";

  const toggleReview = async (reviewRow) => {
    setTogglingId(reviewRow.id);
    setMessage({ text: "", error: false });
    try {
      await setEventReviewHidden(reviewRow.id, !reviewRow.hidden);
      await loadReviews();
      setMessage({
        text: reviewRow.hidden
          ? `${reviewRow.reviewer_first_name}'s review is visible again.`
          : `${reviewRow.reviewer_first_name}'s review is hidden from the public page.`,
        error: false,
      });
    } catch (requestError) {
      setMessage({
        text: requestError.message || "The change could not be saved. Please try again.",
        error: true,
      });
    } finally {
      setTogglingId(null);
    }
  };

  const statusText = showingFlagged
    ? flaggedLoading
      ? "Loading flagged users…"
      : flaggedError
        ? flaggedError.message || "Flagged users could not be loaded."
        : message.text
    : showingTiers
      ? tiersLoading
        ? "Loading tier claims…"
        : tiersError
          ? tiersError.message || "The tier claims could not be loaded."
          : message.text
      : showingReviews
        ? reviewsLoading
          ? "Loading reviews…"
          : reviewsError
            ? reviewsError.message || "The reviews could not be loaded."
            : message.text
        : loading
          ? "Loading organizations…"
          : loadError
            ? loadError.message || "The review queue could not be loaded."
            : message.text;

  return (
    <>
      <PageTitle title="Admin · Organization review | HackMate" />
      <main className="page-main wrap">
        <PageIntro
          eyebrow={
            showingFlagged
              ? "ADMIN · FLAGGED USERS"
              : showingTiers
                ? "ADMIN · HACKATHON TIERS"
                : showingReviews
                  ? "ADMIN · EVENT REVIEWS"
                  : "ADMIN · ORGANIZATION REVIEW"
          }
          title={
            showingFlagged
              ? "Members more than one person reported."
              : showingTiers
                ? "Approve the tier an organizer claimed."
                : showingReviews
                  ? "Moderate what participants write."
                  : "Approve organizers before they host."
          }
          description={
            showingFlagged
              ? "A member appears here only when two or more different people reported them, so a single report never flags anyone. Every reason and reporter is listed."
              : showingTiers
                ? "Organizers claim a tier on the host form. Only the tier you approve here is shown on the event."
                : showingReviews
                  ? "Hidden reviews disappear from every public page while their author and the admins can still see them."
                  : "Check the proof, the details and the signature. Approving unlocks hosting straight away; rejecting saves your reason for the organizer."
          }
        />

        <div className="organizer-toolbar admin-toolbar">
          <div className="filter-list" aria-label="Filter the admin queue">
            {TABS.map((option) => (
              <button
                className={`${tab === option.value ? "filter-active" : "skill"} hackathon-theme`}
                type="button"
                aria-pressed={tab === option.value}
                key={option.value}
                onClick={() => setTab(option.value)}
              >
                {option.label} ({counts[option.value]})
              </button>
            ))}
          </div>
        </div>

        <p
          className="registration-status"
          role="status"
          aria-live="polite"
          data-error={message.error}
        >
          {statusText}
        </p>

        {showingFlagged ? (
          <div className="admin-list" aria-busy={flaggedLoading}>
            {flaggedLoading && !flaggedUsers ? null : (flaggedUsers || []).length ? (
              flaggedUsers.map((flaggedUser) => (
                <FlaggedCard key={flaggedUser.user_id} flagged={flaggedUser} />
              ))
            ) : (
              <p className="dashboard-empty">
                No one has been reported by two different people yet. A member is only flagged once
                two different reporters have filed a report.
              </p>
            )}
          </div>
        ) : showingTiers ? (
          <div className="admin-list" aria-busy={tiersLoading}>
            {tiersLoading && !tierEvents ? null : (tierEvents || []).length ? (
              tierEvents.map((event) => (
                <TierCard
                  event={event}
                  busy={tierBusyId === event.id}
                  onDecide={decideHackathon}
                  key={event.id}
                />
              ))
            ) : (
              <p className="dashboard-empty">{EMPTY_COPY.tiers}</p>
            )}
          </div>
        ) : showingReviews ? (
          <div className="admin-list" aria-busy={reviewsLoading}>
            {reviewsLoading && !eventReviews ? null : (eventReviews || []).length ? (
              eventReviews.map((reviewRow) => (
                <ReviewCard
                  review={reviewRow}
                  busy={togglingId === reviewRow.id}
                  onToggle={toggleReview}
                  key={reviewRow.id}
                />
              ))
            ) : (
              <p className="dashboard-empty">No event reviews yet.</p>
            )}
          </div>
        ) : (
          <div className="admin-list" aria-busy={loading}>
          {loading && !organizations ? null : visible.length ? (
            visible.map((organization) => (
              <OrganizationCard
                key={organization.id}
                organization={organization}
                busy={busyId === organization.id}
                onApprove={(target) => review(target, "approved")}
                onReject={(target, reason) => review(target, "rejected", reason)}
              />
            ))
          ) : (
            <p className="dashboard-empty">{EMPTY_COPY[tab]}</p>
          )}
          </div>
        )}
      </main>
    </>
  );
}