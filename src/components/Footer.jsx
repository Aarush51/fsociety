import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-inner">
        <Link to="/" className="brand">
          <span className="brand-mark brand-mark-small">H</span>
          <span>
            hackmate<span className="brand-dot">.</span>
          </span>
        </Link>
        <p>Built for the curious, the ambitious, and the still-figuring-it-out.</p>
        <div className="footer-links">
          <Link to="/hackathons">Hackathons</Link>
          <Link to="/teams">Find a team</Link>
          <Link to="/leaderboard">Leaderboard</Link>
        </div>
      </div>
    </footer>
  );
}
