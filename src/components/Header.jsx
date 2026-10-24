import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { Arrow, ThemeIcon } from "./Icons";

export default function Header() {
  const { session, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const nextTheme = theme === "dark" ? "light" : "dark";
  const signedIn = Boolean(session);

  const handleLogout = async (event) => {
    event.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      window.alert(`Could not log out: ${error.message}`);
    }
  };

  return (
    <header className="site-header">
      <nav className="nav wrap" aria-label="Main navigation">
        <Link to="/" className="brand" aria-label="HackMate home">
          <span className="brand-mark">H</span>
          <span>
            hackmate<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="nav-links">
          <Link to="/hackathons">Hackathons</Link>
          <Link to="/ideas">Idea generator</Link>
          <Link to="/teams">Find a team</Link>
          <Link to="/leaderboard">Leaderboard</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/profile">Profile</Link>
          {signedIn ? (
            <a href="#" onClick={handleLogout}>
              Log out
            </a>
          ) : (
            <Link to="/login">Log in</Link>
          )}
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${nextTheme} mode`}
            title={`Switch to ${nextTheme} mode`}
            aria-pressed={theme === "dark"}
          >
            <ThemeIcon theme={theme} />
          </button>
        </div>
        {signedIn ? null : (
          <Link to="/signup" className="button button-dark nav-cta">
            Join the community <Arrow diagonal />
          </Link>
        )}
      </nav>
    </header>
  );
}
