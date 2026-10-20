import { Link } from "react-router-dom";
import { Arrow } from "./Icons";

export default function SectionHeading({ eyebrow, title, description, action, href }) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="muted section-description">{description}</p>
      </div>
      <Link className="text-link" to={href}>
        {action} <Arrow />
      </Link>
    </div>
  );
}
