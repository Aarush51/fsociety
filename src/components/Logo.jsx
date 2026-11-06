import { Link } from "react-router-dom";

// Inline version of public/logo-mark.svg so the mark follows the scoreboard
// palette. The gradient and ink read logo-specific CSS variables.
export default function Logo() {
  return (
    <Link to="/" className="hm-logo" aria-label="HackMate home">
      <svg
        className="hm-logo__mark"
        viewBox="0 0 64 64"
        width="32"
        height="32"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="hm-logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--logo-from)" }} />
            <stop offset="1" style={{ stopColor: "var(--logo-to)" }} />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="6" fill="url(#hm-logo-g)" />
        <rect x="16" y="16" width="9" height="32" rx="2" fill="var(--logo-ink)" />
        <rect x="39" y="16" width="9" height="32" rx="2" fill="var(--logo-ink)" />
        <rect x="20" y="28" width="24" height="8" rx="2" fill="var(--logo-ink)" />
        <path d="M54 10l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="var(--logo-ink)" />
      </svg>
      <span className="hm-logo__text">
        <span className="hm-logo__hack">hack</span>
        <span className="hm-logo__mate">mate</span>
      </span>
    </Link>
  );
}
