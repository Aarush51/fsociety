import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { formatEventDate, formatNumber, shortName } from "../lib/format";
import { fetchTeammateReviews, saveTeammateReview } from "../lib/teammateReviews";
import StarRating from "./StarRating";

// The review screen behind The Huddle → Reviews.
//
// After a hackathon ends, every teammate owes a review to every other teammate.
// This lists what is still pending, lets the member rate + comment each person,
// and then shows the reviews they wrote and received. The database decides who
// may be reviewed (see public.can_review_teammate), so this screen never has to
// police eligibility itself.

function itemKey(item) {
  return `${item.hackathon_id}:${item.reviewee_id}`;
}

function domId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "");
}

export default function TeammateReviews({ onReviewed = null }) {
  const { user } = useAuth();
  const [rows, setRows] = useState({ pending: [], written: [], received: [] });
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState({ text: "Loading your teammate reviews…", error: false });
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setStatus({ text: "Loading your teammate reviews…", error: false });
    try {
      const data = await fetchTeammateReviews();
      setRows(data);
      setStatus({ text: "", error: false });
    } catch (error) {
      setStatus({ text: error.message || "Your teammate reviews could not be loaded.", error: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const draftFor = (key) => drafts[key] || { rating: 0, comment: "" };

  const setDraft = (key, patch) =>
    setDrafts((current) => ({
      ...current,
      [key]: { rating: 0, comment: "", ...current[key], ...patch },
    }));

  const submit = async (event, item) => {
    event.preventDefault();
    const key = itemKey(item);
    const draft = draftFor(key);
    if (!draft.rating) {
      setStatus({
        text: `Pick a star rating for ${shortName(item.reviewee_name)} before submitting.`,
        error: true,
      });
      return;
    }

    setBusyKey(key);
    setStatus({ text: "", error: false });
    try {
      await saveTeammateReview({
        hackathonId: item.hackathon_id,
        revieweeId: item.reviewee_id,
        reviewerId: user?.id,
        rating: draft.rating,
        comment: draft.comment,
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      await load();
      setStatus({ text: `Review saved for ${shortName(item.reviewee_name)}.`, error: false });
      if (onReviewed) onReviewed();
    } catch (error) {
      setStatus({ text: error.message || "That review could not be saved.", error: true });
    } finally {
      setBusyKey("");
    }
  };

  const pending = rows.pending || [];

  return (
    <>
      <div className="dashboard-data-section">
        <div className="section-heading dashboard-heading">
          <div>
            <p className="eyebrow">TEAMMATE REVIEWS</p>
            <h2>Close the loop on your last team.</h2>
          </div>
          <span className="muted tiny">
            {formatNumber(pending.length)} pending
          </span>
        </div>

        <p
          className="hackathon-status"
          role="status"
          aria-live="polite"
          data-error={status.error}
        >
          {status.text}
          {status.error ? (
            <>
              {" "}
              <button className="text-link hackathon-retry" type="button" onClick={load}>
                Try again
              </button>
            </>
          ) : null}
        </p>

        {pending.length ? (
          pending.map((item) => {
            const key = itemKey(item);
            const draft = draftFor(key);
            return (
              <article className="profile-review-card" key={key}>
                <div className="profile-review-top">
                  <div>
                    <strong>{item.reviewee_name}</strong>
                    <small>
                      ID {item.reviewee_friend_code} · {item.hackathon_title} · {item.team_name}
                    </small>
                  </div>
                </div>
                <form className="report-form" onSubmit={(event) => submit(event, item)}>
                  <StarRating
                    value={draft.rating}
                    onChange={(value) => setDraft(key, { rating: value })}
                    label={`Rating for ${item.reviewee_name}`}
                  />
                  <label htmlFor={`comment-${domId(key)}`}>
                    What did they do well? <span className="muted tiny">Optional</span>
                  </label>
                  <textarea
                    id={`comment-${domId(key)}`}
                    name="comment"
                    rows={2}
                    maxLength={1000}
                    placeholder="A sentence about working with them."
                    value={draft.comment}
                    onChange={(event) => setDraft(key, { comment: event.target.value })}
                    disabled={busyKey === key}
                  />
                  <div className="filter-list">
                    <button
                      className="button button-dark"
                      type="submit"
                      disabled={busyKey === key}
                    >
                      {busyKey === key ? "Saving…" : "Submit review"}
                    </button>
                  </div>
                </form>
              </article>
            );
          })
        ) : loading ? null : (
          <p className="dashboard-empty">
            Nothing is waiting. Every teammate from your finished hackathons has been reviewed.
          </p>
        )}
      </div>

      {rows.written?.length ? (
        <div className="dashboard-data-section">
          <div className="section-heading dashboard-heading">
            <div>
              <p className="eyebrow">REVIEWS YOU WROTE</p>
              <h2>Your feedback.</h2>
            </div>
          </div>
          <div className="profile-history-list">
            {rows.written.map((review) => (
              <article className="profile-review-card" key={review.id}>
                <div className="profile-review-top">
                  <div>
                    <strong>{review.reviewee_name}</strong>
                    <small>
                      {review.hackathon_title} · {formatEventDate(review.created_at)}
                    </small>
                  </div>
                  <StarRating value={review.rating} />
                </div>
                <p className="profile-review-comment">
                  {review.comment || "No comment was left."}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {rows.received?.length ? (
        <div className="dashboard-data-section">
          <div className="section-heading dashboard-heading">
            <div>
              <p className="eyebrow">REVIEWS YOU RECEIVED</p>
              <h2>What teammates said about you.</h2>
            </div>
          </div>
          <div className="profile-history-list">
            {rows.received.map((review) => (
              <article className="profile-review-card" key={review.id}>
                <div className="profile-review-top">
                  <div>
                    <strong>{review.reviewer_name}</strong>
                    <small>
                      {review.hackathon_title} · {formatEventDate(review.created_at)}
                    </small>
                  </div>
                  <StarRating value={review.rating} />
                </div>
                <p className="profile-review-comment">
                  {review.comment || "No comment was left."}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
