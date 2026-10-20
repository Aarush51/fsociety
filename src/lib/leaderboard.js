import { initialsFromName } from "./format";

export function mapLeaderboard(data) {
  return (data || []).map((person, index) => ({
    rank: String(index + 1).padStart(2, "0"),
    initials: initialsFromName(person.full_name),
    name: person.full_name,
    school: `${person.institution || person.username}${person.reputation ? ` · ${Number(person.reputation).toFixed(1)} ★` : ""}`,
    points: new Intl.NumberFormat().format(Number(person.coins) || 0),
    score: Number(person.coins) || 0,
    isDemo: Boolean(person.is_demo),
    color: ["lime", "blue", "peach", "lavender"][index % 4],
  }));
}

export function leaderboardStatusText(people) {
  if (!people.length) return "No leaderboard entries yet. Earn coins by building with HackMate.";
  return people.every((person) => person.isDemo)
    ? "Demo leaderboard data. Real member rankings will appear after users join."
    : `${people.length} builders ranked by earned coins.`;
}
