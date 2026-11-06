import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { formatEventDate, formatNumber } from "../lib/format";
import { HACKATHON_TIERS, tierLabel } from "../lib/organizations";
import { supabase } from "../lib/supabase";

function Fact({ label, children }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function HackathonReviewCard({ hackathon, busy, onReview }) {
  const claimedTier = Number(hackathon.claimed_tier) || null;
  const [tier, setTier] = useState(claimedTier || 3);
  const [tierNote, setTierNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const status = hackathon.approval_status || "pending";
  const badgeClass =
    status === "approved"
      ? "admin-badge-approved"
      : status === "rejected"
        ? "admin-badge-rejected"
        : "admin-badge-pending";

  const submitReject = async (event) => {
    event.preventDefault();
    await onReview(hackathon, "rejected", tier, tierNote, reviewNote);
    setRejecting(false);
  };

  return (
    <article className="admin-card">
      <header className="admin-card-head">
        <div>
          <p className="eyebrow">
            {[hackathon.organizations?.org_name, hackathon.city].filter(Boolean).join(" · ") ||
              "Hackathon"}
          </p>
          <h2>{hackathon.title}</h2>
        </div>
        <span className={`admin-badge ${badgeClass}`}>{status}</span>
      </header>

      <dl className="admin-facts">
        <Fact label="Dates">
          {formatEventDate(hackathon.starts_at)} - {formatEventDate(hackathon.ends_at)}
        </Fact>
        <Fact label="City">{hackathon.city || "—"}</Fact>
        <Fact label="Category">{hackathon.category || "—"}</Fact>
        <Fact label="Claimed tier">{tierLabel(claimedTier) || "Not claimed"}</Fact>
        <Fact label="Expected participants">{hackathon.expected_participants ?? "—"}</Fact>
        <Fact label="Prize pool">
          {hackathon.prize_pool === null || hackathon.prize_pool === undefined
            ? "—"
            : `₹${formatNumber(hackathon.prize_pool)}`}
        </Fact>
      </dl>

      <div className="filter-list" role="group" aria-label={`Approve ${hackathon.title} as`}>
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

      <label htmlFor={`tier-note-${hackathon.id}`}>Tier note (optional)</label>
      <textarea
        id={`tier-note-${hackathon.id}`}
        rows="2"
        maxLength="1000"
        value={tierNote}
        disabled={busy}
        onChange={(event) => setTierNote(event.target.value)}
      />

      {hackathon.review_note ? (
        <p className="admin-review-note">
          <strong>Review note:</strong> {hackathon.review_note}
        </p>
      ) : null}

      <div className="admin-actions">
        {status !== "approved" ? (
          <button
            className="button button-dark"
            type="button"
            disabled={busy}
            onClick={() => onReview(hackathon, "approved", tier, tierNote, "")}
          >
            {busy ? "Saving…" : `Approve as ${tierLabel(tier)}`}
          </button>
        ) : null}
        {status !== "rejected" ? (
          <button
            className="button button-outline"
            type="button"
            disabled={busy}
            onClick={() => setRejecting((open) => !open)}
          >
            {rejecting ? "Cancel reject" : "Reject"}
          </button>
        ) : null}
      </div>

      {rejecting ? (
        <form className="admin-reject" onSubmit={submitReject} noValidate>
          <label htmlFor={`reject-hackathon-${hackathon.id}`}>Review note (optional)</label>
          <textarea
            id={`reject-hackathon-${hackathon.id}`}
            rows="3"
            maxLength="1000"
            value={reviewNote}
            disabled={busy}
            onChange={(event) => setReviewNote(event.target.value)}
          />
          <div className="admin-actions">
            <button className="button button-dark" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Reject hackathon"}
            </button>
            <button className="text-link" type="button" onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

export default function AdminHackathons() {
  const { user } = useAuth();
  const [hackathons, setHackathons] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState({ text: "", error: false });

  const load = useCallback(async () => {
    if (!supabase) {
      setError(new Error("Supabase is not configured."));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: requestError } = await supabase
      .from("hackathons")
      .select(
        "id, title, organization_id, organizations(org_name), starts_at, ends_at, city, category, claimed_tier, approved_tier, expected_participants, prize_pool, approval_status, reviewed_by, reviewed_at, review_note, tier_note",
      )
      .order("created_at", { ascending: false });
    if (requestError) {
      setError(requestError);
      setHackathons([]);
    } else {
      const rows = Array.isArray(data) ? data : [];
      rows.sort((first, second) => {
        const rank = (row) => (row.approval_status === "pending" ? 0 : 1);
        return rank(first) - rank(second);
      });
      setHackathons(rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (hackathon, decision, tier, tierNote, reviewNote) => {
    if (!user?.id) {
      setMessage({ text: "Your admin session could not be verified. Please sign in again.", error: true });
      return;
    }
    setBusyId(hackathon.id);
    setMessage({ text: "", error: false });
    const update = {
      approval_status: decision,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      approved_tier: decision === "approved" ? Number(tier) : null,
      tier_note: tierNote.trim() || null,
      review_note: decision === "rejected" ? reviewNote.trim() || null : null,
    };
    const { data, error: updateError } = await supabase
      .from("hackathons")
      .update(update)
      .eq("id", hackathon.id)
      .select("id");
    if (updateError || !data?.length) {
      setMessage({
        text: updateError?.message || "The review was not saved.",
        error: true,
      });
    } else {
      await load();
      setMessage({
        text:
          decision === "approved"
            ? `${hackathon.title} was approved as ${tierLabel(tier)}.`
            : `${hackathon.title} was rejected.`,
        error: false,
      });
    }
    setBusyId(null);
  };

  return (
    <>
      <p className="registration-status" role="status" aria-live="polite" data-error={message.error}>
        {loading
          ? "Loading hackathons…"
          : error
            ? error.message || "Hackathons could not be loaded."
            : message.text}
      </p>
      <div className="admin-list" aria-busy={loading}>
        {!loading && hackathons?.length ? (
          hackathons.map((hackathon) => (
            <HackathonReviewCard
              key={hackathon.id}
              hackathon={hackathon}
              busy={busyId === hackathon.id}
              onReview={review}
            />
          ))
        ) : !loading ? (
          <p className="dashboard-empty">No hackathons to review.</p>
        ) : null}
      </div>
    </>
  );
}
