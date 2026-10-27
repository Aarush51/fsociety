// Skill-based team formation, computed in the browser from the public team
// directory. A registrant's skills are compared with each team that still has
// open spots; teams are ranked by how much the person adds, what they share,
// and how much they would learn.

function normalizeSkill(skill) {
  return String(skill || "").trim().toLowerCase();
}

function uniqueSkills(list) {
  const seen = new Set();
  const out = [];
  for (const skill of list || []) {
    const key = normalizeSkill(skill);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(skill.trim());
  }
  return out;
}

// Union of every member's skills, normalised for comparison.
export function teamSkillSet(team) {
  const skills = new Set();
  for (const member of team?.members || []) {
    for (const skill of member.skills || []) {
      const key = normalizeSkill(skill);
      if (key) skills.add(key);
    }
  }
  return skills;
}

// Explainable fit between one person and one team.
export function skillFit(mySkills, team) {
  const mine = uniqueSkills(mySkills);
  const mineKeys = new Set(mine.map(normalizeSkill));
  const theirs = teamSkillSet(team);

  const adds = mine.filter((skill) => !theirs.has(normalizeSkill(skill)));
  const shared = mine.filter((skill) => theirs.has(normalizeSkill(skill)));
  const teachesMe = [...theirs].filter((skill) => !mineKeys.has(skill));

  const score = adds.length * 12 + shared.length * 4 + Math.min(teachesMe.length, 4) * 2;

  const reasons = [];
  if (adds.length) {
    reasons.push(`You bring ${adds.slice(0, 3).join(", ")}${adds.length > 3 ? "…" : ""}`);
  }
  if (shared.length) {
    reasons.push(`Shared: ${shared.slice(0, 3).join(", ")}${shared.length > 3 ? "…" : ""}`);
  }
  if (teachesMe.length) {
    reasons.push(`You'd pick up ${teachesMe.slice(0, 3).join(", ")}${teachesMe.length > 3 ? "…" : ""}`);
  }
  if (!reasons.length) reasons.push("No skills listed yet — add skills to improve matches");

  return { score, adds, shared, teachesMe, reasons };
}

// Teams the person could still join, best fit first.
export function rankTeamsForMe(mySkills, teams, { openOnly = true } = {}) {
  const pool = (teams || []).filter((team) => (openOnly ? (team.members?.length || 0) < (Number(team.max_members ?? team.size) || 0) : true));
  return pool
    .map((team) => ({ team, fit: skillFit(mySkills, team) }))
    .sort((a, b) => {
      if (b.fit.score !== a.fit.score) return b.fit.score - a.fit.score;
      // Prefer the shorter queue for the last spot, then older teams first.
      const aOpen = (Number(a.team.max_members ?? a.team.size) || 0) - (a.team.members?.length || 0);
      const bOpen = (Number(b.team.max_members ?? b.team.size) || 0) - (b.team.members?.length || 0);
      if (aOpen !== bOpen) return bOpen - aOpen;
      return String(a.team.created_at || "").localeCompare(String(b.team.created_at || ""));
    });
}
