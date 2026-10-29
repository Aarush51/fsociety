import { useEffect, useState } from "react";
import { formatNumber } from "../../lib/format";
import { supabase } from "../../lib/supabase";

function Counts({ title, items, empty }) {
  return (
    <article>
      <span className="eyebrow">{title}</span>
      {items.length ? (
        <div className="profile-skill-list">
          {items.map((item) => (
            <span className="skill" key={item.name}>
              {item.name} · {formatNumber(item.count)}
            </span>
          ))}
        </div>
      ) : (
        <span className="muted tiny">{empty}</span>
      )}
    </article>
  );
}

export default function ReviewSummary({ userId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase || !userId) {
      setSummary(null);
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError(null);
    supabase
      .rpc("get_review_summary", { p_user_id: userId })
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) throw requestError;
        setSummary(data || null);
      })
      .catch((requestError) => {
        if (!active) return;
        console.error("Could not load the teammate review summary.", requestError);
        setSummary(null);
        setError(requestError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const tagCounts = Array.isArray(summary?.tag_counts) ? summary.tag_counts : [];
  const skillCounts = Array.isArray(summary?.endorsed_skill_counts)
    ? summary.endorsed_skill_counts
    : [];
  const rating = Number(summary?.average_rating) || 0;
  const count = Number(summary?.review_count) || 0;

  return (
    <section className="dashboard-data-section" aria-label="Teammate review summary">
      <div className="section-heading">
        <div>
          <p className="eyebrow">TEAMMATE REVIEWS</p>
          <h2>Your collaboration summary.</h2>
        </div>
      </div>
      {loading ? (
        <p className="dashboard-empty">Loading your review summary…</p>
      ) : error ? (
        <p className="dashboard-empty">
          Your review summary couldn’t be loaded. {error.message || "Try again later."}
        </p>
      ) : summary ? (
        <div className="profile-stats">
          <article>
            <span className="eyebrow">AVERAGE RATING</span>
            <strong>{count ? rating.toFixed(1) : "—"}</strong>
            <span className="review-stars" aria-label={count ? `${rating.toFixed(1)} out of 5 average` : "No ratings yet"}>
              {count ? `${"★".repeat(Math.round(rating))}${"☆".repeat(5 - Math.round(rating))}` : "No ratings yet"}
            </span>
            <span className="muted tiny">
              {formatNumber(count)} {count === 1 ? "review" : "reviews"}
            </span>
          </article>
          <Counts title="REVIEW TAGS" items={tagCounts.map((item) => ({ name: item.tag, count: item.count }))} empty="No tags yet." />
          <Counts title="ENDORSED SKILLS" items={skillCounts.map((item) => ({ name: item.skill, count: item.count }))} empty="No skill endorsements yet." />
        </div>
      ) : (
        <p className="dashboard-empty">Your review summary is unavailable.</p>
      )}
      <p className="muted tiny">Aggregate teammate feedback only. Individual reviewers and comments are not shown here. These scores are never used for matching.</p>
    </section>
  );
}
