import { Link, useNavigate } from "react-router-dom";
import { useAdmin } from "../context/AdminContext";
import { useAuth } from "../context/AuthContext";
import { useOrganization } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";
import { headerLinks } from "../lib/access";
import { Arrow, ThemeIcon } from "./Icons";

export default function Header() {
  const { session, mode, signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const { organization } = useOrganization();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const nextTheme = theme === "dark" ? "light" : "dark";
  const signedIn = Boolean(session);
  // Organizers are only shown the organizer links when they signed in on the
  // Organization side and actually own an organization they can manage.
  const links = headerLinks({
    signedIn,
    mode,
    hasOrganization: Boolean(organization),
    isAdmin,
  });

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
          {links.map((link) => (
            <Link to={link.to} key={link.label}>
              {link.label}
            </Link>
          ))}
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
