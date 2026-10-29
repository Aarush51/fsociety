// Helpers for turning a generated idea into a project draft.
//
// The `projects` table stores a title and a free-text description. The complete
// generated idea (problem, features, stack, roles, risks, why it fits, the
// brief) is written to `projects.idea_data` as one JSON object, so the
// Dashboard can reopen it exactly as the generator showed it. The description
// keeps a readable summary for anything that only reads that column.

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

// A compact copy of the generator brief. The full hackathon row is not kept:
// only what the brief panel displays.
export function briefSnapshot(brief) {
  if (!brief || typeof brief !== "object") return null;
  const skills = Array.isArray(brief.skills) ? brief.skills : [];
  const teamSkills = Array.isArray(brief.teamSkills) ? brief.teamSkills : [];
  const time = brief.time && typeof brief.time === "object" ? brief.time.label : brief.time;
  return {
    hackathon: {
      title: String(brief.hackathon?.title || ""),
      category: String(brief.hackathon?.category || ""),
    },
    skills: skills.map((skill) => String(skill || "")).filter(Boolean),
    teamSkills: teamSkills.map((skill) => String(skill || "")).filter(Boolean),
    interests: String(brief.interests || ""),
    time: String(time || ""),
  };
}

// The JSON stored with a project, merged with the values the user reviewed in
// the dialog so an edited title or description is what the Dashboard shows.
export function composeIdeaData({ idea, brief, title, description, features, techStack, targetUsers }) {
  return {
    ...(idea && typeof idea === "object" ? idea : {}),
    title: String(title || "").trim(),
    solution: String(description || "").trim(),
    key_features: Array.isArray(features) ? features : [],
    tech_stack: Array.isArray(techStack) ? techStack : [],
    target_users: String(targetUsers || "").trim(),
    brief: briefSnapshot(brief),
  };
}

// Old projects describe the idea only as composed text, e.g.
//   <summary>
//
//   Key features:
//   - one
//   - two
//
//   Tech stack: React, Vite
//
//   Target users: students
// Split that back into the sections the detail view renders.
function parseLegacyDescription(raw) {
  const parsed = { solution: [], features: [], techStack: [], targetUsers: "" };
  const blocks = String(raw || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) continue;

    const [first, ...rest] = lines;
    if (/^key features:/i.test(first)) {
      const inline = first.replace(/^key features:/i, "").trim();
      const items = [inline, ...rest.map((line) => line.replace(/^[-*\u2022]\s*/, "").trim())]
        .filter(Boolean);
      parsed.features.push(...items);
      continue;
    }
    if (/^tech stack:/i.test(first)) {
      parsed.techStack.push(...splitCommas(first.replace(/^tech stack:/i, "")));
      continue;
    }
    if (/^target users:/i.test(first)) {
      const value = first.replace(/^target users:/i, "").trim();
      parsed.targetUsers = [parsed.targetUsers, value, ...rest].filter(Boolean).join(" ");
      continue;
    }
    parsed.solution.push(block);
  }

  return {
    solution: parsed.solution.join("\n\n"),
    features: parsed.features,
    techStack: parsed.techStack,
    targetUsers: parsed.targetUsers,
  };
}

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Turn a Dashboard project row (plus its `idea_data` and description) into the
// shape the idea detail view renders. Projects saved before `idea_data` existed
// keep their title and description and are flagged as incomplete.
export function ideaFromProject(project, details) {
  if (!project) return null;
  const stored = isPlainObject(details?.idea_data) ? details.idea_data : null;
  const title = String(project.title || "").trim();

  if (stored) {
    const { brief, ...idea } = stored;
    return {
      idea: { ...idea, title: title || String(stored.title || "") },
      brief: isPlainObject(brief) ? brief : null,
      incomplete: false,
    };
  }

  const legacy = parseLegacyDescription(details?.description || "");
  return {
    idea: {
      title,
      problem: "",
      solution: legacy.solution,
      key_features: legacy.features,
      tech_stack: legacy.techStack,
      required_team_roles: [],
      target_users: legacy.targetUsers,
      difficulty: "",
      estimated_time: "",
      risks: [],
      why_it_fits: "",
    },
    brief: null,
    incomplete: true,
  };
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
