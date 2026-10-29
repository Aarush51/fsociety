import { useEffect, useState } from "react";
import { shortName } from "../../lib/format";
import { supabase } from "../../lib/supabase";

const REVIEW_TAGS = [
  "Collaborative",
  "Reliable",
  "Creative",
  "Helpful",
  "Communicative",
  "Problem-solving",
];

function Stars({ value, onChange, disabled, label }) {
  return (
    <div className="filter-list" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          className="skill hackathon-theme"
          type="button"
          role="radio"
          aria-checked={value === rating}
          aria-label={`${rating} ${rating === 1 ? "star" : "stars"}`}
          key={rating}
          onClick={() => onChange(rating)}
          disabled={disabled}
        >
          <span className="review-stars" aria-hidden="true">
            {rating <= value ? "★" : <span className="review-stars-empty">★</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

function ReadReview({ member, review, heading }) {
  return (
    <article className="profile-review-card">
      <div className="profile-review-top">
        <div>
          <strong>{shortName(member.full_name)}</strong>
          <small>{heading}</small>
        </div>
        <span className="review-stars" role="img" aria-label={`${review.rating} out of 5 stars`}>
          {"★".repeat(Number(review.rating) || 0)}
          <span className="review-stars-empty">
            {"★".repeat(5 - (Number(review.rating) || 0))}
          </span>
        </span>
      </div>
      {review.tags?.length ? (
        <div className="filter-list">
          {review.tags.map((tag) => (
            <span className="skill" key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
      {review.endorsed?.length ? (
        <div className="profile-skill-list">
          {review.endorsed.map((skill) => (
            <span className="skill" key={skill}>{skill}</span>
          ))}
        </div>
      ) : null}
      {review.comment ? <p className="profile-review-comment">{review.comment}</p> : null}
    </article>
  );
}

function ReviewCard({ member, sentReview, receivedReview, onSaved }) {
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState([]);
  const [endorsed, setEndorsed] = useState([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: "", error: false });

  const toggle = (list, setter, value) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!rating) {
      setMessage({ text: "Choose a star rating first.", error: true });
      return;
    }
    setBusy(true);
    setMessage({ text: "", error: false });
    try {
      const { error } = await supabase.rpc("submit_team_review", {
        p_team_id: member.team_id,
        p_hackathon_id: member.hackathon_id,
        p_to_user: member.id,
        p_rating: rating,
        p_tags: tags,
        p_endorsed: endorsed,
        p_comment: comment.trim() || null,
      });
      if (error) throw error;
      setMessage({ text: `Your review for ${shortName(member.full_name)} was saved.`, error: false });
      onSaved();
    } catch (error) {
      setMessage({ text: error.message || "Your review could not be saved.", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-history-list">
      {receivedReview ? (
        <ReadReview member={member} review={receivedReview} heading="Review received from this teammate" />
      ) : null}
      {sentReview ? (
        <ReadReview member={member} review={sentReview} heading="Your review" />
      ) : (
        <article className="profile-review-card">
          <form className="profile-history-list" onSubmit={submit}>
            <div className="profile-review-top">
              <div>
                <strong>Review {shortName(member.full_name)}</strong>
                <small>Only you and this teammate can read this review.</small>
              </div>
            </div>
            <div className="idea-field">
              <span className="idea-label">Rating (required)</span>
              <Stars value={rating} onChange={setRating} disabled={busy} label={`Rating for ${member.full_name}`} />
            </div>
            <div className="idea-field">
              <span className="idea-label">Tags</span>
              <div className="filter-list" aria-label={`Review tags for ${member.full_name}`}>
                {REVIEW_TAGS.map((tag) => (
                  <button
                    className={`${tags.includes(tag) ? "filter-active" : "skill"} hackathon-theme`}
                    type="button"
                    aria-pressed={tags.includes(tag)}
                    key={tag}
                    onClick={() => toggle(tags, setTags, tag)}
                    disabled={busy}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            {member.skills.length ? (
              <div className="idea-field">
                <span className="idea-label">Endorse skills</span>
                <div className="profile-skill-list" aria-label={`Skills to endorse for ${member.full_name}`}>
                  {member.skills.map((skill) => (
                    <button
                      className={`${endorsed.includes(skill) ? "filter-active" : "skill"} hackathon-theme`}
                      type="button"
                      aria-pressed={endorsed.includes(skill)}
                      key={skill}
                      onClick={() => toggle(endorsed, setEndorsed, skill)}
                      disabled={busy}
                    >
                      {skill}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <label className="idea-field">
              Comment <span className="muted tiny">Optional</span>
              <textarea
                rows="3"
                maxLength="2000"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Share a constructive note about working together."
                disabled={busy}
              />
            </label>
            <div className="admin-actions">
              <button className="button button-dark" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Submit review"}
              </button>
            </div>
            <p className="form-message" role="status" aria-live="polite" data-error={message.error}>
              {message.text}
            </p>
          </form>
        </article>
      )}
    </div>
  );
}

export default function Reviews({ hackathonSlug, userId }) {
  const [reviews, setReviews] = useState([]);
  const [members, setMembers] = useState([]);
  const [hackathon, setHackathon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!hackathonSlug || !supabase) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setHackathon(null);
    supabase
      .rpc("get_my_team_reviews_by_slug", { p_hackathon_slug: hackathonSlug })
      .then(({ data, error: requestError }) => {
        if (requestError) throw requestError;
        if (!active) return;
        setReviews(Array.isArray(data?.reviews) ? data.reviews : []);
        setMembers(Array.isArray(data?.members) ? data.members : []);
        setHackathon(data?.hackathon || null);
      })
      .catch((requestError) => {
        if (!active) return;
        setReviews([]);
        setMembers([]);
        setHackathon(null);
        setError(requestError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hackathonSlug, reloadKey]);

  const ended = Boolean(hackathon?.ends_at && new Date(hackathon.ends_at).getTime() <= now);
  if (loading || !ended || (!error && !members.length)) return null;

  const teammates = members.filter((member) => member.id !== userId);
  const sentReviewFor = (targetUser) => reviews.find((review) => review.from_user === userId && review.to_user === targetUser);
  const receivedReviewFor = (targetUser) => reviews.find((review) => review.from_user === targetUser && review.to_user === userId);

  return (
    <section className="dashboard-data-section" aria-label="Teammate reviews">
      <div className="section-heading">
        <div>
          <p className="eyebrow">TEAM REVIEWS</p>
          <h2>Recognize your teammates.</h2>
          <p className="muted section-description">
            The hackathon has ended. Rate each teammate out of five stars, add tags or skill
            endorsements, and leave an optional comment.
          </p>
        </div>
      </div>
      <div className="profile-history-list">
        {error ? (
          <p className="dashboard-empty">
            Team reviews couldn’t be loaded. {error.message || "Try again."}{" "}
            <button className="text-link" type="button" onClick={() => setReloadKey((key) => key + 1)}>
              Try again
            </button>
          </p>
        ) : teammates.length ? (
          teammates.map((member) => (
            <ReviewCard
              key={member.id}
              member={member}
              sentReview={sentReviewFor(member.id)}
              receivedReview={receivedReviewFor(member.id)}
              onSaved={() => setReloadKey((key) => key + 1)}
            />
          ))
        ) : (
          <p className="dashboard-empty">There are no other teammates to review.</p>
        )}
      </div>
    </section>
  );
}
