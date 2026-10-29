import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Arrow } from "../components/Icons";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import StarRating from "../components/StarRating";
import { useAdmin } from "../context/AdminContext";
import {
  loadEventReviewsForModeration,
  loadOrganizationsForReview,
  reviewOrganization,
  setEventReviewHidden,
} from "../lib/admin";
import { formatEventDate } from "../lib/format";
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

  const counts = useMemo(() => {
    const totals = { pending: 0, approved: 0, rejected: 0, reviews: 0 };
    (organizations || []).forEach((organization) => {
      if (totals[organization.status] !== undefined) totals[organization.status] += 1;
    });
    totals.reviews = (eventReviews || []).length;
    return totals;
  }, [organizations, eventReviews]);

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

  const visible = (organizations || []).filter((organization) => organization.status === tab);
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
