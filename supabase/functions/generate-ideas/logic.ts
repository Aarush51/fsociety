// Pure request/response logic for the generate-ideas Edge Function.
// No network or Deno APIs live here, so the prompt and validation can be
// tested without starting the function runtime.

export const MAX_BODY_BYTES = 24_000;
export const MAX_SKILLS = 12;
export const MAX_IDEAS = 3;
const MAX_CANDIDATES = 6;

export interface HackathonBrief {
  title: string;
  category: string;
  organizer: string;
}

export interface IdeaBrief {
  hackathon: HackathonBrief;
  problem: string;
  skills: string[];
  teamSkills: string[];
  interests: string;
  time: string;
}

export interface Idea {
  title: string;
  problem: string;
  solution: string;
  key_features: string[];
  target_users: string;
  tech_stack: string[];
  required_team_roles: string[];
  difficulty: string;
  estimated_time: string;
  risks: string[];
  why_it_fits: string;
}

export type NormalizeResult = { brief: IdeaBrief } | { error: string };

const TIME_HINTS: Array<[RegExp, string]> = [
  [/few hours/i, "under 6 hours: one screen, one core interaction, seeded data"],
  [/one day/i, "about 8-10 hours: a working single-user prototype"],
  [/weekend/i, "about 36-48 hours: one complete end-to-end flow plus a polished demo"],
  [/more than a week/i, "over a week: depth is possible, but still aim for a 2-minute demo"],
  [/week/i, "about 5-7 days: persistence, auth and one integration are in scope"],
];

export const SYSTEM_PROMPT = `You are HackMate's hackathon idea generator. You turn one hackathon brief into three project ideas a student team can actually build and demo before its deadline.

Return ONLY a JSON object in this exact shape:
{"ideas":[{"title":"","problem":"","solution":"","key_features":[""],"target_users":"","tech_stack":[""],"required_team_roles":[""],"difficulty":"","estimated_time":"","risks":[""],"why_it_fits":""}]}

Rules:
- Exactly 3 ideas. Every idea must directly solve the hackathon's problem/theme statement. Never pitch a generic startup, a template app, or an idea that would fit any other hackathon.
- Scope every idea to the available development time. If the time is short, remove features and narrow the target user instead of overrunning the budget; describe the reduced scope in estimated_time.
- Build on the skills already listed. Use teammates' skills for roles the builder does not cover, and only request roles that are genuinely missing.
- Every idea needs one specific user with a concrete problem and a demo that works in a 2-minute pitch.
- Keep hackathon-level technical depth: one genuinely interesting hard part (data, model, integration or interaction), and no features that exist only to look impressive.
- title: max 8 words.
- problem: max 45 words, the user's problem inside this hackathon's theme.
- solution: max 55 words, what the team builds and how it works.
- key_features: 3-5 must-have features only, each max 14 words. No stretch goals.
- target_users: max 25 words, specific (for example "first-year commuter students without a car").
- tech_stack: 3-6 technologies, preferring the listed skills, each max 4 words.
- required_team_roles: 1-4 short role names (for example "Frontend developer").
- difficulty: exactly one of "Beginner", "Intermediate", "Advanced".
- estimated_time: max 20 words, and it must fit inside the available development time.
- risks: 2-3 real risks, each max 18 words, each naming its mitigation.
- why_it_fits: max 40 words tying the idea to the hackathon problem, the team's skills and the time budget.
- Plain text inside string values only: no markdown, no code fences, no bullet characters, no extra keys, no commentary outside the JSON.`;

// Gemini's OpenAPI subset accepts the field shapes below. Length limits and
// exactly-three-ideas are enforced again after parsing.
export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    ideas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          problem: { type: "STRING" },
          solution: { type: "STRING" },
          key_features: { type: "ARRAY", items: { type: "STRING" } },
          target_users: { type: "STRING" },
          tech_stack: { type: "ARRAY", items: { type: "STRING" } },
          required_team_roles: { type: "ARRAY", items: { type: "STRING" } },
          difficulty: { type: "STRING" },
          estimated_time: { type: "STRING" },
          risks: { type: "ARRAY", items: { type: "STRING" } },
          why_it_fits: { type: "STRING" },
        },
        required: [
          "title",
          "problem",
          "solution",
          "key_features",
          "target_users",
          "tech_stack",
          "required_team_roles",
          "difficulty",
          "estimated_time",
          "risks",
          "why_it_fits",
        ],
      },
    },
  },
  required: ["ideas"],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function asSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const name = entry.trim().slice(0, 60);
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    skills.push(name);
    if (skills.length >= MAX_SKILLS) break;
  }
  return skills;
}

export function normalizeBrief(payload: unknown): NormalizeResult {
  if (!isRecord(payload)) return { error: "Send a JSON brief." };

  const hackathon = isRecord(payload.hackathon) ? payload.hackathon : {};
  const brief: IdeaBrief = {
    hackathon: {
      title: asText(hackathon.title, 160),
      category: asText(hackathon.category, 100),
      organizer: asText(hackathon.organizer, 160),
    },
    problem: asText(payload.problem, 4000),
    skills: asSkills(payload.skills),
    teamSkills: asSkills(payload.teamSkills),
    interests: asText(payload.interests, 500),
    time: asText(payload.time, 80),
  };

  if (!brief.hackathon.title) return { error: "Choose a hackathon first." };
  if (!brief.problem) return { error: "This hackathon has no problem statement yet." };
  if (!brief.skills.length) return { error: "Add at least one of your skills." };
  if (brief.interests.length < 2) {
    return { error: "Add a few interests so the ideas have a direction." };
  }
  if (!brief.time) return { error: "Pick how much development time you have." };

  return { brief };
}

export function timeBudgetHint(time: string): string {
  return TIME_HINTS.find(([pattern]) => pattern.test(time))?.[1] ?? "";
}

export function buildPrompt(brief: IdeaBrief): string {
  const hint = timeBudgetHint(brief.time);
  return [
    `Hackathon: ${brief.hackathon.title}`,
    brief.hackathon.category ? `Hackathon category: ${brief.hackathon.category}` : null,
    brief.hackathon.organizer ? `Organizer: ${brief.hackathon.organizer}` : null,
    `Problem / theme statement: ${brief.problem}`,
    `Builder's skills: ${brief.skills.join(", ")}`,
    brief.teamSkills.length
      ? `Teammates' skills: ${brief.teamSkills.join(", ")}`
      : "Teammates' skills: none listed yet.",
    `Interests: ${brief.interests}`,
    `Available development time: ${brief.time}${hint ? ` (${hint})` : ""}`,
    "Time rule: if an idea cannot fit that budget, cut its scope instead of exceeding the time.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function extractResponseText(data: unknown): string {
  if (!isRecord(data)) return "";
  const candidates = data.candidates;
  if (!Array.isArray(candidates) || !candidates.length) return "";
  const candidate = candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content)) return "";
  const parts = candidate.content.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .join("");
}

function asList(
  value: unknown,
  { max = 5, maxLength = 140, split = /\r?\n|;/ }: { max?: number; maxLength?: number; split?: RegExp } = {},
): string[] {
  const entries = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(split)
      : [];
  const list: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string") continue;
    const item = entry
      .replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, "")
      .trim()
      .slice(0, maxLength);
    if (!item) continue;
    list.push(item);
    if (list.length >= max) break;
  }
  return list;
}

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function parseIdea(row: unknown): Idea | null {
  if (!isRecord(row)) return null;
  return {
    title: asText(pick(row, "title"), 120),
    problem: asText(pick(row, "problem"), 500),
    solution: asText(pick(row, "solution"), 700),
    key_features: asList(pick(row, "key_features", "keyFeatures"), { max: 5, maxLength: 140 }),
    target_users: asText(pick(row, "target_users", "targetUsers"), 300),
    tech_stack: asList(pick(row, "tech_stack", "techStack"), {
      max: 6,
      maxLength: 80,
      split: /\r?\n|;|,/,
    }),
    required_team_roles: asList(pick(row, "required_team_roles", "requiredTeamRoles"), {
      max: 4,
      maxLength: 80,
      split: /\r?\n|;|,/,
    }),
    difficulty: asText(pick(row, "difficulty"), 30),
    estimated_time: asText(pick(row, "estimated_time", "estimatedTime"), 200),
    risks: asList(pick(row, "risks"), { max: 3, maxLength: 180 }),
    why_it_fits: asText(pick(row, "why_it_fits", "whyItFits"), 400),
  };
}

function isCompleteIdea(idea: Idea | null): idea is Idea {
  if (!idea) return false;
  const textFields = [
    idea.title,
    idea.problem,
    idea.solution,
    idea.target_users,
    idea.difficulty,
    idea.estimated_time,
    idea.why_it_fits,
  ];
  if (textFields.some((value) => !value)) return false;
  return (
    idea.key_features.length > 0 &&
    idea.tech_stack.length > 0 &&
    idea.required_team_roles.length > 0 &&
    idea.risks.length > 0
  );
}

export function parseIdeas(text: string): Idea[] | null {
  const raw = text.trim();
  if (!raw) return null;

  const withoutFence = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidates = [withoutFence];
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(withoutFence.slice(firstBrace, lastBrace + 1));
  }

  let parsed: unknown = null;
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
      // Try the next candidate.
    }
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.ideas)) return null;

  const ideas: Idea[] = [];
  const seen = new Set<string>();
  for (const row of parsed.ideas.slice(0, MAX_CANDIDATES)) {
    if (ideas.length >= MAX_IDEAS) break;
    const idea = parseIdea(row);
    if (!isCompleteIdea(idea)) continue;
    const key = idea.title.toLocaleLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    ideas.push(idea);
  }

  return ideas.length === MAX_IDEAS ? ideas : null;
}
