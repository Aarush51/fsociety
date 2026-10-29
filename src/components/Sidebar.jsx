import { NavLink } from "react-router-dom";
import { useAdmin } from "../context/AdminContext";
import { useAuth } from "../context/AuthContext";
import { useOrganization } from "../context/OrganizationContext";
import { headerLinks } from "../lib/access";
import { Sidebar as SidebarPrimitive } from "../ui";

export default function Sidebar() {
  const { session, mode } = useAuth();
  const { isAdmin } = useAdmin();
  const { organization } = useOrganization();
  const links = headerLinks({
    signedIn: Boolean(session),
    mode,
    hasOrganization: Boolean(organization),
    isAdmin,
  });

  return (
    <SidebarPrimitive>
      <p className="hm-sidebar-label">Workspace</p>
      <nav aria-label="Workspace navigation">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => isActive ? "is-active" : ""}>
            {link.label}
          </NavLink>
        ))}
      </nav>
    </SidebarPrimitive>
  );
}
