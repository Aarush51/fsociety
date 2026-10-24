import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Arrow } from "../components/Icons";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { formatEventDate, formatNumber, formatReputation, initialsFromName } from "../lib/format";
import { supabase } from "../lib/supabase";

const COIN_PAGE_SIZE = 10;
const COIN_MAX_LIMIT = 200;
const TRANSACTION_LABELS = {
  earned: "Earned",
  spent: "Spent",
  refund: "Refund",
  adjustment: "Adjustment",
};

function Stars({ rating }) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  const empty = 5 - value;
  return (
    <span className="review-stars" role="img" aria-label={`${value} out of 5 stars`}>
      {"★".repeat(value)}
      {empty ? (
        <span className="review-stars-empty" aria-hidden="true">
          {"★".repeat(empty)}
        </span>
      ) : null}
    </span>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const [form, setForm] = useState({ full_name: "", username: "", bio: "" });
  const [skills, setSkills] = useState([]);
  const [stats, setStats] = useState(null);
  const [skillInput, setSkillInput] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "Loading your profile…", error: false });
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState(null);
  const [coinLimit, setCoinLimit] = useState(COIN_PAGE_SIZE);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    setMessage({ text: "Loading your profile…", error: false });
    supabase
      .rpc("get_my_profile")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        if (!data) throw new Error("Your profile could not be found.");
        setForm({
          full_name: data.full_name || "",
          username: data.username || "",
          bio: data.bio || "",
        });
        setSkills(data.skills || []);
        setStats(data);
        setReady(true);
        setMessage({ text: "", error: false });
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load the profile.", error);
        setMessage({
          text: error.message || "Could not load your profile. Try again.",
          error: true,
        });
      });

    return () => {
      active = false;
    };
  }, []);

  // Reviews the signed-in user received (team-scoped rows, so it goes through an RPC).
  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    setReviewsLoading(true);
    setReviewsError(null);
    supabase
      .rpc("get_my_received_reviews")
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) throw requestError;
        setReviews(Array.isArray(data) ? data : []);
      })
      .catch((requestError) => {
        if (!active) return;
        console.error("Could not load received reviews.", requestError);
        setReviews([]);
        setReviewsError(requestError);
      })
      .finally(() => {
        if (active) setReviewsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [historyKey]);

  // The caller's own coin ledger, newest first. The RPC caps the page at 200 rows.
  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    setLedgerLoading(true);
    setLedgerError(null);
    supabase
      .rpc("get_my_coin_transactions", { p_limit: coinLimit })
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) throw requestError;
        setLedger({
          balance: Number(data?.balance) || 0,
          transaction_count: Number(data?.transaction_count) || 0,
          transactions: Array.isArray(data?.transactions) ? data.transactions : [],
        });
      })
      .catch((requestError) => {
        if (!active) return;
        console.error("Could not load the coin ledger.", requestError);
        setLedger(null);
        setLedgerError(requestError);
      })
      .finally(() => {
        if (active) setLedgerLoading(false);
      });

    return () => {
      active = false;
    };
  }, [coinLimit, historyKey]);

  const addSkill = () => {
    const name = skillInput.trim();
    if (!name) return;
    if (name.length > 80) {
      setMessage({ text: "Skills must be 80 characters or fewer.", error: true });
      return;
    }
    if (skills.some((skill) => skill.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setMessage({ text: "That skill is already on your profile.", error: true });
      return;
    }
    if (skills.length >= 20) {
      setMessage({ text: "You can add up to 20 skills.", error: true });
      return;
    }
    setSkills([...skills, name]);
    setSkillInput("");
    setMessage({ text: "", error: false });
  };

  const removeSkill = (index) => {
    setSkills(skills.filter((_skill, skillIndex) => skillIndex !== index));
    setMessage({ text: "", error: false });
  };

  const handleSkillKeyDown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addSkill();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!supabase || !ready) return;
    setSaving(true);
    setMessage({ text: "Saving your profile…", error: false });
    try {
      const { error } = await supabase.rpc("save_my_profile", {
        p_full_name: form.full_name.trim(),
        p_username: form.username.trim(),
        p_bio: form.bio.trim(),
        p_skills: skills,
      });
      if (error) throw error;
      setForm({
        full_name: form.full_name.trim(),
        username: form.username.trim(),
        bio: form.bio.trim(),
      });
      setMessage({ text: "Your profile has been saved.", error: false });
    } catch (error) {
      console.error("Could not save the profile.", error);
      setMessage({
        text: error.message || "Could not save your profile. Try again.",
        error: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const disabled = !ready || saving;
  const displayName = ready ? form.full_name || "Your profile" : "Edit your profile";

  return (
    <>
      <PageTitle title="Profile | HackMate" />
      <main className="page-main wrap">
        <PageIntro
          eyebrow="YOUR CORNER OF THE COMMUNITY"
          title="A profile that feels like you."
          description="Share the skills you bring, what you want to learn, and the kinds of projects you'd love to build."
        />
        <div className="profile-layout">
          <section className="profile-about">
            <div className="profile-card-top">
              <span className="avatar avatar-large lime" id="profile-avatar">
                {ready ? initialsFromName(form.full_name) : "HM"}
              </span>
              <span className="status-label">YOUR PROFILE</span>
            </div>
            <h2 id="profile-heading">{displayName}</h2>
            <p className="muted small" id="profile-email">
              {user?.email || ""}
            </p>
            <form id="profile-form" onSubmit={handleSubmit}>
              <label htmlFor="profile-full-name">Full name</label>
              <input
                id="profile-full-name"
                name="full_name"
                autoComplete="name"
                maxLength="100"
                required
                disabled={disabled}
                value={form.full_name}
                onChange={(event) => setForm({ ...form, full_name: event.target.value })}
              />
              <label htmlFor="profile-username">Username</label>
              <input
                id="profile-username"
                name="username"
                autoComplete="username"
                minLength="3"
                maxLength="30"
                pattern="[A-Za-z0-9_]+"
                required
                disabled={disabled}
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
              />
              <label htmlFor="profile-bio-input">Bio</label>
              <textarea
                id="profile-bio-input"
                name="bio"
                maxLength="500"
                rows="4"
                disabled={disabled}
                value={form.bio}
                onChange={(event) => setForm({ ...form, bio: event.target.value })}
              />
              <label htmlFor="profile-skill-input">Skills</label>
              <div id="profile-skill-list" className="profile-skill-list" aria-live="polite">
                {skills.length ? (
                  skills.map((skill, index) => (
                    <span className="skill" key={`${skill}-${index}`}>
                      {skill}
                      <button
                        type="button"
                        data-remove-skill={index}
                        aria-label={`Remove ${skill}`}
                        onClick={() => removeSkill(index)}
                        disabled={disabled}
                      >
                        ×
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="muted tiny">No skills added yet.</span>
                )}
              </div>
              <div className="profile-skill-entry">
                <input
                  id="profile-skill-input"
                  type="text"
                  maxLength="80"
                  placeholder="Add a skill and press Enter"
                  disabled={disabled}
                  value={skillInput}
                  onChange={(event) => setSkillInput(event.target.value)}
                  onKeyDown={handleSkillKeyDown}
                />
                <button
                  id="profile-add-skill"
                  className="button button-outline"
                  type="button"
                  onClick={addSkill}
                  disabled={disabled}
                >
                  Add
                </button>
              </div>
              <p className="muted tiny">Add up to 20 skills. Each skill can be up to 80 characters.</p>
              <button className="button button-dark button-full" type="submit" disabled={disabled}>
                Save profile
              </button>
              <p
                id="profile-message"
                className="form-message"
                role="status"
                aria-live="polite"
                data-error={message.error}
              >
                {message.text}
              </p>
            </form>
          </section>
          <div className="profile-side">
            <section className="profile-stats" aria-label="Your HackMate stats">
              <article>
                <span className="eyebrow">COIN BALANCE</span>
                <strong id="profile-coins">{stats ? formatNumber(stats.coin_balance) : "—"}</strong>
                <span className="muted tiny">coins</span>
              </article>
              <article>
                <span className="eyebrow">REPUTATION</span>
                <strong id="profile-reputation">
                  {stats ? formatReputation(stats.reputation) : "—"}
                </strong>
                <span id="profile-review-count" className="muted tiny">
                  {stats
                    ? `${Number(stats.review_count) || 0} ${Number(stats.review_count) === 1 ? "review" : "reviews"}`
                    : "Based on reviews"}
                </span>
              </article>
            </section>
            <section className="dark-callout">
              <p className="eyebrow light-eyebrow">LOOKING TO BUILD</p>
              <h2>Tools that make student life a little easier.</h2>
              <p>
                Interested in education, climate, and creative projects. Always happy to try a new
                idea or learn a new tool.
              </p>
            </section>
            <section className="profile-activity">
              <p className="eyebrow">RECENT ACTIVITY</p>
              <strong>Ready for a first hackathon</strong>
              <p className="muted small">
                There's always a first project. Make this one yours.
              </p>
              <Link className="text-link" to="/hackathons">
                Browse hackathons <Arrow />
              </Link>
            </section>
          </div>
        </div>
        <div className="profile-history-layout">
          <section className="dashboard-data-section" aria-label="Reviews you received">
            <div className="section-heading">
              <div>
                <p className="eyebrow">RECEIVED REVIEWS</p>
                <h2>What teammates say.</h2>
              </div>
              {reviews.length ? (
                <span className="muted tiny">
                  {formatNumber(reviews.length)} {reviews.length === 1 ? "review" : "reviews"}
                </span>
              ) : null}
            </div>
            <div id="profile-reviews" className="profile-history-list" aria-live="polite">
              {reviewsLoading ? (
                <p className="dashboard-empty">Loading your reviews…</p>
              ) : reviewsError ? (
                <p className="dashboard-empty">
                  Your reviews couldn’t be loaded.{" "}
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => setHistoryKey((key) => key + 1)}
                  >
                    Try again
                  </button>
                </p>
              ) : reviews.length ? (
                reviews.map((review) => (
                  <article className="profile-review-card" key={review.id}>
                    <div className="profile-review-top">
                      <div>
                        <strong>
                          {review.reviewer_name || review.reviewer_username || "A teammate"}
                        </strong>
                        {review.reviewer_username ? (
                          <span className="muted tiny"> @{review.reviewer_username}</span>
                        ) : null}
                        <small>
                          {[review.project_title, review.team_name, formatEventDate(review.created_at)]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </div>
                      <Stars rating={review.rating} />
                    </div>
                    {review.comment ? (
                      <p className="profile-review-comment">{review.comment}</p>
                    ) : (
                      <p className="profile-review-comment muted">No comment was left.</p>
                    )}
                  </article>
                ))
              ) : (
                <p className="dashboard-empty">
                  No reviews yet. Teammates can review you after you build something together.
                </p>
              )}
            </div>
          </section>
          <section className="dashboard-data-section" aria-label="Coin history">
            <div className="section-heading">
              <div>
                <p className="eyebrow">COIN HISTORY</p>
                <h2>How you earned.</h2>
              </div>
              {ledger ? (
                <span className="muted tiny">
                  {formatNumber(ledger.transaction_count)}{" "}
                  {ledger.transaction_count === 1 ? "transaction" : "transactions"}
                </span>
              ) : null}
            </div>
            <div id="profile-coin-ledger" className="profile-history-list" aria-live="polite">
              {ledgerLoading ? (
                <p className="dashboard-empty">Loading your coin history…</p>
              ) : ledgerError ? (
                <p className="dashboard-empty">
                  Your coin history couldn’t be loaded.{" "}
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => setHistoryKey((key) => key + 1)}
                  >
                    Try again
                  </button>
                </p>
              ) : ledger?.transactions.length ? (
                ledger.transactions.map((transaction) => (
                  <article className="profile-coin-row" key={transaction.id}>
                    <div>
                      <strong>
                        {transaction.description ||
                          TRANSACTION_LABELS[transaction.transaction_type] ||
                          "Coin activity"}
                      </strong>
                      <small>
                        {TRANSACTION_LABELS[transaction.transaction_type] ||
                          transaction.transaction_type}{" "}
                        · {formatEventDate(transaction.created_at)}
                      </small>
                    </div>
                    <span
                      className={`profile-coin-amount ${Number(transaction.amount) < 0 ? "negative" : "positive"}`}
                    >
                      {Number(transaction.amount) < 0 ? "−" : "+"}
                      {formatNumber(Math.abs(Number(transaction.amount) || 0))}
                    </span>
                  </article>
                ))
              ) : (
                <p className="dashboard-empty">
                  No coin activity yet. Join a hackathon and contribute to start earning.
                </p>
              )}
            </div>
            {ledger && ledger.transactions.length < ledger.transaction_count ? (
              coinLimit < COIN_MAX_LIMIT ? (
                <button
                  className="text-link profile-history-more"
                  type="button"
                  onClick={() => setCoinLimit((limit) => Math.min(limit + 25, COIN_MAX_LIMIT))}
                  disabled={ledgerLoading}
                >
                  Show more transactions
                </button>
              ) : (
                <p className="muted tiny profile-history-note">
                  Showing the latest {formatNumber(ledger.transactions.length)} of{" "}
                  {formatNumber(ledger.transaction_count)} transactions.
                </p>
              )
            ) : null}
          </section>
        </div>
      </main>
    </>
  );
}
