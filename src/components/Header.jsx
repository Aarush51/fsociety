import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAdmin } from "../context/AdminContext";
import { useAuth } from "../context/AuthContext";
import { useFriends } from "../context/FriendsContext";
import { useOrganization } from "../context/OrganizationContext";
import { useTheme } from "../context/ThemeContext";
import { headerLinks } from "../lib/access";
import { Arrow, ThemeIcon } from "./Icons";
import Logo from "./Logo";

// The organizer role gets its own top navigation on every non-admin page. Each
// entry points at an existing route; Manage Hackathons is the organizer's
// hackathon list, and Dashboard is /dashboard only.
const organizerLinks = [
  { label: "All Hackathons", to: "/hackathons" },
  { label: "Manage Hackathons", to: "/organizer/hackathons" },
  { label: "Host Hackathon", to: "/organizer/host" },
  { label: "Idea Generator", to: "/ideas" },
  { label: "Dashboard", to: "/dashboard" },
];

export default function Header() {
  const { session, mode, signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const { organization, isOrganizer } = useOrganization();
  const { incomingCount } = useFriends();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef(null);

  // The phone menu always closes on navigation so the new page starts clear.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Escape and a click outside the navbar dismiss the open menu.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const closeOutside = (event) => {
      if (navRef.current && !navRef.current.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnKey);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnKey);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [menuOpen]);
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  // The app's organizer role check. Admins keep their previous header, and the
  // admin pages themselves always keep the role-based header.
  const showOrganizerHeader = isOrganizer && !isAdmin && !isAdminPage;
  const nextTheme = theme === "dark" ? "light" : "dark";
  const signedIn = Boolean(session);
  const links = showOrganizerHeader
    ? organizerLinks
    : headerLinks({
        signedIn,
        mode,
        hasOrganization: Boolean(organization),
        isAdmin,
      });

  const handleLogout = async (event) => {
    event.preventDefault();
    try {
      setMenuOpen(false);
      await signOut();
      navigate("/");
    } catch (error) {
      window.alert(`Could not log out: ${error.message}`);
    }
  };

  return (
    <header className="site-header">
      <nav className="nav wrap" aria-label="Main navigation" ref={navRef}>
        <Logo />
        <div
          id="primary-navigation"
          className={`nav-links${menuOpen ? " is-open" : ""}`}
        >
          {links.map((link) => {
            // The Huddle link carries a dot while friend requests are waiting.
            const waiting = link.to === "/huddle" ? incomingCount : 0;
            const content = (
              <>
                {link.label}
                {waiting ? <span className="nav-dot" aria-hidden="true" /> : null}
              </>
            );
            const className = waiting ? "nav-link-has-dot" : undefined;
            const ariaLabel = waiting
              ? `${link.label} · ${waiting} incoming friend ${waiting === 1 ? "request" : "requests"}`
              : undefined;

            // NavLink marks the active organizer link with aria-current="page",
            // which is the same hook the shared nav styles highlight.
            return showOrganizerHeader ? (
              <NavLink
                to={link.to}
                key={link.label}
                className={className}
                aria-label={ariaLabel}
              >
                {content}
              </NavLink>
            ) : (
              <Link to={link.to} key={link.label} className={className} aria-label={ariaLabel}>
                {content}
              </Link>
            );
          })}
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
        <button
          className="nav-menu-button"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      </nav>
    </header>
  );
}
