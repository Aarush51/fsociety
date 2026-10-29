import { NavLink } from "react-router-dom";

const organizerLinks = [
  { label: "My Events", to: "/organizer" },
  { label: "Host New Hackathon", to: "/organizer/host" },
  { label: "Organizer Profile", to: "/profile" },
  { label: "Registrations", to: "/organizer/registrations" },
];

export default function Sidebar() {
  return (
    <aside className="hm-sidebar">
      <p className="hm-sidebar-label">Organizer</p>
      <nav aria-label="Organizer workspace navigation">
        {organizerLinks.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.to === "/organizer"} className={({ isActive }) => isActive ? "is-active" : ""}>
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
