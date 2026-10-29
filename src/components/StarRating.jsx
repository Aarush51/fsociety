// Five whole stars. Read-only by default; pass onChange to make them clickable.
// The interactive version is a radiogroup with roving tabindex, so it works with
// Tab to enter, Arrow keys / Home / End to pick, and Enter or Space to confirm.
const STARS = [1, 2, 3, 4, 5];

export default function StarRating({
  value = 0,
  onChange = null,
  label = "Rating out of 5",
  className = "",
}) {
  const rounded = Math.min(5, Math.max(0, Math.round(Number(value) || 0)));

  if (!onChange) {
    return (
      <span
        className={`star-rating ${className}`.trim()}
        role="img"
        aria-label={rounded ? `${rounded} out of 5 stars` : "No rating yet"}
      >
        {STARS.map((star) => (
          <span
            className={`star${star <= rounded ? " star-on" : ""}`}
            aria-hidden="true"
            key={star}
          >
            ★
          </span>
        ))}
      </span>
    );
  }

  const current = Math.min(5, Math.max(0, Number(value) || 0));

  const handleKeyDown = (event) => {
    let next = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = Math.min(5, (current || 0) + 1) || 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = Math.max(1, current - 1);
    } else if (event.key === "Home") {
      next = 1;
    } else if (event.key === "End") {
      next = 5;
    }
    if (next === null) return;
    event.preventDefault();
    onChange(next);
    const star = event.currentTarget.querySelector(`[data-star="${next}"]`);
    if (star) star.focus();
  };

  return (
    <div
      className={`star-rating star-rating-input ${className}`.trim()}
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
    >
      {STARS.map((star) => {
        const selected = star === current;
        return (
          <button
            className={`star star-button${star <= current ? " star-on" : ""}`}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
            data-star={star}
            key={star}
            tabIndex={selected || (!current && star === 1) ? 0 : -1}
            onClick={() => onChange(star)}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}
