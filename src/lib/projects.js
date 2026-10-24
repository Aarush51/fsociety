// Helpers for turning a generated idea into a project draft.
//
// The existing `projects` table stores a title and a free-text description.
// Generated content that has no column of its own (features, stack, users) is
// folded into the description so no schema change is needed.

export function normalizeProjectTitle(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function findDuplicateProject(projects, teamId, title) {
  const needle = normalizeProjectTitle(title);
  if (!needle) return null;
  return (
    (projects || []).find(
      (project) =>
        project?.team_id === teamId && normalizeProjectTitle(project.title) === needle,
    ) || null
  );
}

export function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function splitCommas(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function composeProjectDescription({ description, features, techStack, targetUsers }) {
  const blocks = [];
  const summary = String(description || "").trim();
  if (summary) blocks.push(summary);

  const featureList = Array.isArray(features) ? features : [];
  if (featureList.length) {
    blocks.push(`Key features:\n${featureList.map((feature) => `- ${feature}`).join("\n")}`);
  }

  const stackList = Array.isArray(techStack) ? techStack : [];
  if (stackList.length) blocks.push(`Tech stack: ${stackList.join(", ")}`);

  const users = String(targetUsers || "").trim();
  if (users) blocks.push(`Target users: ${users}`);

  return blocks.join("\n\n");
}
