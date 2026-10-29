import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Arrow } from "../components/Icons";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import StarRating from "../components/StarRating";
import { useAdmin } from "../context/AdminContext";
import {
  loadEventReviewsForModeration,
  loadHackathonsForReview,
  loadOrganizationsForReview,
  loadTierSettings,
  reviewHackathon,
  reviewOrganization,
  setEventReviewHidden,
} from "../lib/admin";
import { formatEventDate, formatPrice } from "../lib/format";
import { organizationTypeLabel } from "../lib/organizations";

const TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "reviews", label: "Reviews" },
];

const EMPTY_COPY = {
  pending: "Nothing is waiting for review right now.",
  approved: "No organizations have been approved yet.",
  rejected: "No organizations have been rejected yet.",
};

// Hackathon review uses the same three states, but "approved" is shown as Live.
const HACKATHON_TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Live" },
  { value: "rejected", label: "Rejected" },
];

const EMPTY_HACKATHON_COPY = {
  pending: "No hackathons are waiting for review.",
  approved: "No hackathons are live yet.",
  rejected: "No hackathons have been rejected yet.",
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

const tierName = (tier) => `Tier ${tier}${Number(tier) === 1 ? " (highest)" : ""}`;

// One hackathon in the review queue. Collapsed until opened, then it shows every
// detail the organizer entered, the organization behind it, and the decision
// panel. Tier 1 is the highest level, so "lower than the claim" means a bigger
// number than claimed_tier.
function HackathonCard({ hackathon, organization, earlierEvents, tierSettings, busy, onReview }) {
  const [open, setOpen] = useState(false);
  const [tierChoice, setTierChoice] = useState(hackathon.tier ? String(hackathon.tier) : "");
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const claimedTier = Number(hackathon.claimed_tier) || null;
  const chosenTier = Number(tierChoice) || null;
  const differs = claimedTier !== null && chosenTier !== null && chosenTier !== claimedTier;
  const lowerThanClaim = differs && chosenTier > claimedTier;
  const prizePool = Number(hackathon.prize_pool) || 0;
  const expected = Number(hackathon.expected_participants) || null;
  const dates = `${formatEventDate(hackathon.starts_at)} – ${formatEventDate(hackathon.ends_at)}`;
  const venue =
    [hackathon.venue_name, hackathon.city].filter(Boolean).join(", ") || "Venue to be announced";

  const approve = async () => {
    if (!chosenTier) {
      setError("Pick a tier before approving.");
      return;
    }
    if (lowerThanClaim && !note.trim()) {
      setError(`${tierName(chosenTier)} is lower than the claimed ${tierName(claimedTier)}. Add a note explaining why.`);
      return;
    }
    setError("");
    const saved = await onReview(hackathon, { decision: "approve", tier: chosenTier, note });
    if (saved) {
      setNote("");
      setOpen(false);
    }
  };

  const submitReject = async (event) => {
    event.preventDefault();
    if (!reason.trim()) {
      setError("Add a reason before rejecting a hackathon.");
      return;
    }
    setError("");
    const saved = await onReview(hackathon, { decision: "reject", note: reason });
    if (saved) {
      setReason("");
      setRejecting(false);
      setOpen(false);
    }
  };

  return (
    <article className="admin-card">
      <header className="admin-card-head">
        <div>
          <p className="eyebrow">
            {organization ? organization.org_name : hackathon.organizer || "Organization"} ·{" "}
            {hackathon.city || "City to be announced"}
          </p>
          <h2>{hackathon.title}</h2>
        </div>
        <span className={`admin-badge admin-badge-${hackathon.approval_status}`}>
          {hackathon.approval_status === "approved"
            ? `Live${hackathon.tier ? ` · Tier ${hackathon.tier}` : ""}`
            : hackathon.approval_status}
        </span>
      </header>

      <dl className="admin-facts">
        <Fact label="When">{dates}</Fact>
        <Fact label="Venue">{venue}</Fact>
        <Fact label="Claimed tier">{claimedTier ? tierName(claimedTier) : "Not claimed"}</Fact>
        <Fact label="Admin tier">{hackathon.tier ? tierName(hackathon.tier) : "Not set"}</Fact>
      </dl>

      <div className="admin-actions">
        <button
          className="button button-outline"
          type="button"
          onClick={() => setOpen((value) => !value)}
          disabled={busy}
        >
          {open
            ? "Close review"
            : hackathon.approval_status === "approved"
              ? "Re-tier hackathon"
              : "Open review"}
        </button>
        {hackathon.approval_status === "approved" ? (
          <a
            className="text-link"
            href={`/hackathons/${encodeURIComponent(hackathon.slug)}`}
            target="_blank"
            rel="noreferrer"
          >
            Open event page <Arrow diagonal />
          </a>
        ) : null}
      </div>

      {open ? (
        <>
          <dl className="admin-facts">
            <Fact label="Organization">{organization ? organization.org_name : "—"}</Fact>
            <Fact label="Organization status">{organization ? organization.status : "—"}</Fact>
            <Fact label="Organization city">{organization ? organization.city : "—"}</Fact>
            <Fact label="Category">{hackathon.category || "—"}</Fact>
            <Fact label="Full address">{hackathon.address || "—"}</Fact>
            <Fact label="Maps link">
              {hackathon.maps_url ? (
                <a href={hackathon.maps_url} target="_blank" rel="noreferrer">
                  Open map
                </a>
              ) : (
                "—"
              )}
            </Fact>
            <Fact label="Poster">
              {hackathon.banner_url ? (
                <a href={hackathon.banner_url} target="_blank" rel="noreferrer">
                  Open poster
                </a>
              ) : (
                "—"
              )}
            </Fact>
            <Fact label="Registration deadline">
              {hackathon.registration_deadline
                ? formatEventDate(hackathon.registration_deadline, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—"}
            </Fact>
            <Fact label="Entry fee">
              {Number(hackathon.price) > 0 ? formatPrice(hackathon.price) : "Free"}
            </Fact>
            <Fact label="Capacity">
              {hackathon.capacity ? `${hackathon.capacity} people` : "—"}
            </Fact>
            <Fact label="Max team size">{hackathon.team_size_max || "—"}</Fact>
            <Fact label="Theme tags">
              {hackathon.theme_tags?.length ? hackathon.theme_tags.join(", ") : "—"}
            </Fact>
            <Fact label="Expected participants">
              {expected ? `${expected} people` : "—"}
            </Fact>
            <Fact label="Prize pool">
              {prizePool > 0 ? formatPrice(prizePool) : "No prize pool"}
            </Fact>
            <Fact label="Earlier hackathons">
              {earlierEvents.length
                ? `${earlierEvents.length} from this organization`
                : "First event from this organization"}
            </Fact>
          </dl>

          {earlierEvents.length ? (
            <span className="organizer-event-meta">
              {earlierEvents.map((event) => (
                <span key={event.id}>
                  {event.title} ·{" "}
                  {event.approval_status === "approved"
                    ? `Live${event.tier ? ` · Tier ${event.tier}` : ""}`
                    : event.approval_status}
                </span>
              ))}
            </span>
          ) : null}

          <p className="admin-description">{hackathon.description}</p>
          <p className="admin-description">
            <strong>Why this tier:</strong> {hackathon.claimed_tier_reason || "No reason given."}
          </p>
          {hackathon.rules ? (
            <p className="admin-description">
              <strong>Rules:</strong> {hackathon.rules}
            </p>
          ) : null}
          {hackathon.prize_details ? (
            <p className="admin-description">
              <strong>Prize details:</strong> {hackathon.prize_details}
            </p>
          ) : null}
          {hackathon.tier && hackathon.tier_note ? (
            <p className="admin-description">
              <strong>Current tier note:</strong> {hackathon.tier_note}
            </p>
          ) : null}
          {hackathon.review_note ? (
            <p className="admin-review-note">
              <strong>Review note:</strong> {hackathon.review_note}
            </p>
          ) : null}

          <div className="admin-reject">
            <label id={`tier-choice-${hackathon.id}`}>Approve as (required)</label>
            <div
              className="idea-time-options"
              role="group"
              aria-labelledby={`tier-choice-${hackathon.id}`}
            >
              {tierSettings.map((tier) => (
                <button
                  className="idea-time-option"
                  type="button"
                  key={tier.tier}
                  aria-pressed={tierChoice === String(tier.tier)}
                  onClick={() => {
                    setTierChoice(String(tier.tier));
                    setError("");
                  }}
                >
                  <strong>{tier.label}</strong>
                  <small>{(tier.examples || []).join(" · ")}</small>
                </button>
              ))}
            </div>
            <span className="org-field-hint">
              {claimedTier
                ? `The organizer claimed ${tierName(claimedTier)}${
                    hackathon.claimed_tier_reason ? `: “${hackathon.claimed_tier_reason}”` : ""
                  }${expected ? ` · ${expected} participants` : ""}${
                    prizePool > 0 ? ` · ${formatPrice(prizePool)} prize pool` : " · no prize pool"
                  }.`
                : "The organizer did not claim a tier."}
            </span>
            {differs ? (
              <p className="notice">
                You picked {tierName(chosenTier)} —{" "}
                {lowerThanClaim
                  ? `lower than the claimed ${tierName(claimedTier)}. A note is required.`
                  : `higher than the claimed ${tierName(claimedTier)}.`}
              </p>
            ) : null}
            <label htmlFor={`review-note-${hackathon.id}`}>
              Note for the organizer ({lowerThanClaim ? "required" : "optional"})
            </label>
            <textarea
              id={`review-note-${hackathon.id}`}
              rows="2"
              maxLength="1000"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                if (error) setError("");
              }}
              placeholder="For example: 400 participants and industry judges, so Tier 2."
            />
            {error ? (
              <span className="org-field-error" role="alert">
                {error}
              </span>
            ) : null}
            <div className="admin-actions">
              <button className="button button-dark" type="button" onClick={approve} disabled={busy}>
                {busy
                  ? "Saving…"
                  : hackathon.approval_status === "approved"
                    ? "Save tier"
                    : "Confirm approve"}
              </button>
              <button
                className="button button-outline"
                type="button"
                onClick={() => setRejecting((value) => !value)}
                disabled={busy}
              >
                {rejecting ? "Cancel reject" : "Reject"}
              </button>
            </div>
          </div>

          {rejecting ? (
            <form className="admin-reject" onSubmit={submitReject} noValidate>
              <label htmlFor={`reject-event-${hackathon.id}`}>Reason for rejection (required)</label>
              <textarea
                id={`reject-event-${hackathon.id}`}
                rows="3"
                maxLength="1000"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (error) setError("");
                }}
                placeholder="For example: the venue is not confirmed and the dates clash with another event."
              />
              <div className="admin-actions">
                <button className="button button-dark" type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Reject hackathon"}
                </button>
                <button
                  className="text-link"
                  type="button"
                  onClick={() => {
                    setRejecting(false);
                    setError("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </>
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
  // Hackathon review has its own queue, tabs and messages so a failure in one
  // section never blanks the other.
  const [hackathons, setHackathons] = useState(null);
  const [tierSettings, setTierSettings] = useState([]);
  const [hackathonTab, setHackathonTab] = useState("pending");
  const [hackathonError, setHackathonError] = useState(null);
  const [hackathonMessage, setHackathonMessage] = useState({ text: "", error: false });
  const [eventReviews, setEventReviews] = useState(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setHackathonError(null);
    const [orgResult, hackathonResult, tierResult] = await Promise.allSettled([
      loadOrganizationsForReview(),
      loadHackathonsForReview(),
      loadTierSettings(),
    ]);

    if (orgResult.status === "fulfilled") {
      setOrganizations(orgResult.value);
    } else {
      console.error("Could not load organizations for review.", orgResult.reason);
      setOrganizations([]);
      setLoadError(orgResult.reason);
    }

    if (hackathonResult.status === "fulfilled") {
      setHackathons(hackathonResult.value);
    } else {
      console.error("Could not load hackathons for review.", hackathonResult.reason);
      setHackathons([]);
      setHackathonError(hackathonResult.reason);
    }

    if (tierResult.status === "fulfilled") {
      setTierSettings(tierResult.value);
    } else {
      console.error("Could not load tier settings.", tierResult.reason);
      setTierSettings([]);
      if (hackathonResult.status === "fulfilled") setHackathonError(tierResult.reason);
    }

    setLoading(false);
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

  const counts = useMemo(() => {
    const totals = { pending: 0, approved: 0, rejected: 0, reviews: 0 };
    (organizations || []).forEach((organization) => {
      if (totals[organization.status] !== undefined) totals[organization.status] += 1;
    });
    totals.reviews = (eventReviews || []).length;
    return totals;
  }, [organizations, eventReviews]);

  const hackathonCounts = useMemo(() => {
    const totals = { pending: 0, approved: 0, rejected: 0 };
    (hackathons || []).forEach((hackathon) => {
      if (totals[hackathon.approval_status] !== undefined) totals[hackathon.approval_status] += 1;
    });
    return totals;
  }, [hackathons]);

  const organizationsById = useMemo(() => {
    const map = new Map();
    (organizations || []).forEach((organization) => map.set(organization.id, organization));
    return map;
  }, [organizations]);

  // Every other event from the same organization, for the review view.
  const earlierEventsFor = (hackathon) =>
    (hackathons || []).filter(
      (other) => other.organization_id === hackathon.organization_id && other.id !== hackathon.id,
    );

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

  // Approve or reject one hackathon through the database function. The rules
  // (tier required, note for a lower tier, reason for a rejection) live in SQL,
  // so whatever it rejects comes back here as the message shown to the admin.
  const reviewEvent = async (hackathon, { decision, tier = null, note = null }) => {
    setBusyId(hackathon.id);
    setHackathonMessage({ text: "", error: false });
    try {
      await reviewHackathon({ hackathonId: hackathon.id, decision, tier, note });
      await load();
      setHackathonMessage({
        text:
          decision === "approve"
            ? `${hackathon.title} is live as ${tierName(tier)}.`
            : `${hackathon.title} was rejected and the reason was saved.`,
        error: false,
      });
      return true;
    } catch (requestError) {
      setHackathonMessage({
        text: requestError.message || "The review could not be saved. Please try again.",
        error: true,
      });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const visible = (organizations || []).filter((organization) => organization.status === tab);
  const visibleHackathons = (hackathons || []).filter(
    (hackathon) => hackathon.approval_status === hackathonTab,
  );
  const showingReviews = tab === "reviews";

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

  const statusText = showingReviews
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
          eyebrow={showingReviews ? "ADMIN · EVENT REVIEWS" : "ADMIN · ORGANIZATION REVIEW"}
          title={showingReviews ? "Moderate what participants write." : "Approve organizers before they host."}
          description={
            showingReviews
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

        {showingReviews ? (
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
          <>
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

            <section className="org-form-section" aria-label="Hackathon review">
              <p className="eyebrow">HACKATHONS</p>
              <div className="organizer-toolbar admin-toolbar">
                <div className="filter-list" aria-label="Filter hackathons by status">
                  {HACKATHON_TABS.map((option) => (
                    <button
                      className={`${hackathonTab === option.value ? "filter-active" : "skill"} hackathon-theme`}
                      type="button"
                      aria-pressed={hackathonTab === option.value}
                      key={option.value}
                      onClick={() => setHackathonTab(option.value)}
                    >
                      {option.label} ({hackathonCounts[option.value]})
                    </button>
                  ))}
                </div>
              </div>

              <p
                className="registration-status"
                role="status"
                aria-live="polite"
                data-error={hackathonMessage.error}
              >
                {loading
                  ? "Loading hackathons…"
                  : hackathonError
                    ? hackathonError.message || "The hackathon queue could not be loaded."
                    : hackathonMessage.text}
              </p>

              <div className="admin-list" aria-busy={loading}>
                {loading && !hackathons ? null : visibleHackathons.length ? (
                  visibleHackathons.map((hackathon) => (
                    <HackathonCard
                      key={hackathon.id}
                      hackathon={hackathon}
                      organization={organizationsById.get(hackathon.organization_id) || null}
                      earlierEvents={earlierEventsFor(hackathon)}
                      tierSettings={tierSettings}
                      busy={busyId === hackathon.id}
                      onReview={reviewEvent}
                    />
                  ))
                ) : (
                  <p className="dashboard-empty">{EMPTY_HACKATHON_COPY[hackathonTab]}</p>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
