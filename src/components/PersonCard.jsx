import { Link } from "react-router-dom";
import { Arrow } from "./Icons";

export default function PersonCard({ person }) {
  return (
    <article className="person-card">
      <div className={`avatar ${person.color}`}>{person.initials}</div>
      <div className="person-main">
        <div className="person-heading">
          <strong>{person.name}</strong>
          <span className="online-dot" />
          <span className="muted tiny">Looking for a team</span>
        </div>
        <p className="muted tiny">
          {person.role} · {person.school}
        </p>
        <div className="skill-list">
          {person.skills.map((skill) => (
            <span className="skill" key={skill}>
              {skill}
            </span>
          ))}
        </div>
      </div>
      <Link className="round-link" to="/signup" aria-label={`Connect with ${person.name}`}>
        <Arrow diagonal />
      </Link>
    </article>
  );
}
