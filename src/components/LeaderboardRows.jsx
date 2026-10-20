import { leaderboard, leaderboardTiers } from "../lib/demoData";

export default function LeaderboardRows({ dark = false, people = leaderboard }) {
  return people.map((person, index) => {
    const points = Math.max(
      0,
      Number(person.score ?? String(person.points).replace(/[^\d-]/g, "")) || 0,
    );
    const tier = [...leaderboardTiers].reverse().find((item) => points >= item.minPoints);
    return (
      <li className={`rank-row ${dark ? "rank-row-dark" : ""}`} key={`${person.name}-${index}`}>
        <span className={`rank-number ${index === 0 ? "rank-first" : ""}`}>{person.rank}</span>
        <div className="rank-person">
          <span className={`avatar avatar-small ${person.color}`}>{person.initials}</span>
          <div>
            <div className="rank-person-name">
              <strong>{person.name}</strong>
              {person.isDemo ? <span className="rank-demo-label">DEMO</span> : null}
              <span
                className={`rank-badge rank-badge-${tier.className}`}
                title={`${tier.name} rank · ${tier.minPoints.toLocaleString()}+ points`}
              >
                {tier.name}
              </span>
            </div>
            <span className="muted tiny">{person.school}</span>
          </div>
        </div>
        <span className="points">
          {person.points}
          <small> pts</small>
        </span>
      </li>
    );
  });
}
