import { useCallback, useEffect, useState } from "react";
import StarRating from "./StarRating";
import { useAuth } from "../context/AuthContext";
import { formatEventDate } from "../lib/format";
import {
  fetchHackathonRating,
  fetchHackathonReviews,
  fetchMyReviewState,
  formatRatingSummary,
  hasReviews,
  saveEventReview,
} from "../lib/reviews";

const EMPTY_MESSAGE = { text: "", error: false };

function ReviewItem({ review }) {
  return (
    <article className="review-item">
      <header className="review-item-head">
        <StarRating value={review.rating} />
        <span className="muted small">{review.reviewer_first_name}</span>
      </header>
      {review.comment ? (
        <p className="review-comment">{review.comment}</p>
      ) : (
        <p className="muted small">No comment left.</p>
      )}
      <p className="muted tiny">{formatEventDate(review.created_at)}</p>
    </article>
  );
}

// The Reviews section of a hackathon page: the average and comments once the
// event has ended, the write form (or your own review with Edit) when you are
// eligible, and the reason when you are not.
export default function EventReviews({ hackathon }) {
  const { session } = useAuth();
  const signedIn = Boolean(session);
  const ended = hackathon?.ends_at ? new Date(hackathon.ends_at).getTime() <= Date.now() : false;
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [rating, setRating] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [state, setState] = useState(null);
  const [form, setForm] = useState({ rating: 0, comment: "" });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(EMPTY_MESSAGE);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!signedIn || !hackathon?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMissing(false);
    try {
      const [ratingData, reviewRows, myState] = await Promise.all([
        fetchHackathonRating(hackathon.id),
        fetchHackathonReviews(hackathon.id),
        fetchMyReviewState(hackathon.id),
      ]);
      setRating(ratingData);
      setReviews(reviewRows);
      setState(myState);
      setMissing(!myState);
    } catch (requestError) {
      console.error("Could not load reviews for this hackathon.", requestError);
      setRating(null);
      setReviews([]);
      setState(null);
      setMissing(true);
    } finally {
      setLoading(false);
    }
  }, [hackathon?.id, signedIn]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const startEdit = () => {
    if (!state?.review) return;
    setForm({
      rating: Number(state.review.rating) || 0,
      comment: state.review.comment || "",
    });
    setEditing(true);
    setMessage(EMPTY_MESSAGE);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.rating) {
      setMessage({ text: "Pick a star rating first.", error: true });
      return;
    }
    setBusy(true);
    setMessage(EMPTY_MESSAGE);
    try {
      await saveEventReview({
        hackathonId: hackathon.id,
        reviewId: editing && state?.review ? state.review.id : null,
        rating: form.rating,
        comment: form.comment,
      });
      setEditing(false);
      setForm({ rating: 0, comment: "" });
      setMessage({
        text: editing ? "Your review was updated." : "Thanks — your review is live.",
        error: false,
      });
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      setMessage({ text: requestError.message || "Your review could not be saved.", error: true });
    } finally {
      setBusy(false);
    }
  };

  const others = reviews.filter((review) => !review.mine);
  const myReview = state?.review || null;
  const blockReason = state?.block_reason || "";
  const showForm = Boolean(session) && ended && !loading && !missing && !myReview && !blockReason;

  return (
    <section className="event-reviews detail-section" id="reviews" aria-labelledby="reviews-title">
      <div className="section-heading dashboard-heading">
        <div>
          <p className="eyebrow">REVIEWS</p>
          <h2 id="reviews-title">What participants said.</h2>
        </div>
        {!loading && ended && hasReviews(rating) ? (
          <div className="event-reviews-summary">
            <StarRating value={rating.average} />
            <span className="muted small">{formatRatingSummary(rating)}</span>
          </div>
        ) : null}
      </div>

      {!ended ? (
        <p className="muted small">Reviews open when the event ends.</p>
      ) : !session ? (
        <p className="muted small">Log in to read reviews and write your own.</p>
      ) : loading ? (
        <p className="hackathon-status" role="status" aria-live="polite">
          Loading reviews…
        </p>
      ) : missing ? (
        <p className="muted small">
          Reviews are not available yet. Run the event reviews migration in Supabase first.
        </p>
      ) : (
        <>
          {!hasReviews(rating) && !myReview ? (
            <p className="muted small">No reviews yet.</p>
          ) : null}

          {myReview && !editing ? (
            <article className="review-item review-mine">
              <header className="review-item-head">
                <StarRating value={myReview.rating} />
                <span className="skill review-badge">Your review</span>
              </header>
              {myReview.comment ? (
                <p className="review-comment">{myReview.comment}</p>
              ) : (
                <p className="muted small">No comment left.</p>
              )}
              <p className="muted tiny">
                {formatEventDate(myReview.updated_at || myReview.created_at)} ·{" "}
                <button className="text-link" type="button" onClick={startEdit}>
                  Edit
                </button>
              </p>
              {myReview.hidden ? (
                <p className="muted tiny">Hidden by a moderator — only you can see it.</p>
              ) : null}
            </article>
          ) : null}

          {showForm || editing ? (
            <form className="review-form" onSubmit={submit} noValidate>
              <span className="review-form-label">Your rating</span>
              <StarRating
                value={form.rating}
                onChange={(next) => setForm((current) => ({ ...current, rating: next }))}
                label="Your rating out of 5"
              />
              <label className="review-form-label" htmlFor="review-comment">
                Your review <span className="muted">(optional, up to 1000 characters)</span>
              </label>
              <textarea
                id="review-comment"
                rows="3"
                maxLength={1000}
                value={form.comment}
                onChange={(event) =>
                  setForm((current) => ({ ...current, comment: event.target.value }))
                }
                placeholder="What worked, what did not, and what you would tell the next team."
              />
              <p className="form-message" role="status" aria-live="polite" data-error={message.error}>
                {message.text}
              </p>
              <div className="review-form-actions">
                <button className="button button-dark" type="submit" disabled={busy || !form.rating}>
                  {busy ? "Saving…" : editing ? "Save changes" : "Post review"}
                </button>
                {editing ? (
                  <button
                    className="text-link"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditing(false);
                      setForm({ rating: 0, comment: "" });
                      setMessage(EMPTY_MESSAGE);
                    }}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          {blockReason && !myReview ? (
            <p className="muted small review-block-reason">{blockReason}</p>
          ) : null}

          {others.length ? (
            <div className="review-list">
              {others.map((review) => (
                <ReviewItem review={review} key={review.id} />
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
