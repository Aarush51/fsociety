import { Link } from "react-router-dom";
import { Arrow } from "./Icons";

export default function EventCard({ event }) {
  return (
    <article className="event-card">
      <div className={`event-art ${event.accent || ""}`}>
        <span className="event-category">{event.category}</span>
        <span className="event-decoration" aria-hidden="true">
          {event.icon}
        </span>
        <span className="event-title">{event.title}</span>
        <span className="event-tag">{event.tag}</span>
      </div>
      <div className="event-info">
        <p className="muted small">{event.organizer}</p>
        <div className="event-meta">
          <div className="event-facts">
            <span>{event.date}</span>
            <span>{event.location}</span>
            {event.deadline ? <span>Deadline: {event.deadline}</span> : null}
          </div>
          <div className="prize">
            <span className="muted tiny">PRIZE POOL</span>
            <strong>{event.prize}</strong>
          </div>
        </div>
        <Link
          className="button button-outline button-full"
          to={`/hackathons/${encodeURIComponent(event.id)}`}
        >
          Explore hackathon <Arrow diagonal />
        </Link>
      </div>
    </article>
  );
}
