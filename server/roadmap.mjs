// POST /api/roadmap
//
// Turns one selected idea into a seven-phase hackathon roadmap. The prompt and
// the time budget are built on the server, the AI key never leaves this
// process, and the response is validated before it is returned. Nothing is
// persisted.

const MAX_BODY_BYTES = 24_000;
const MAX_SKILLS = 12;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 8;
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 30_000;

const PHASES = [
  "Planning",
  "Setup",
  "Core development",
  "Integration",
  "Testing",
  "Demo preparation",
  "Final submission",
];

// Working-hour budgets for the labels the form offers. Wall-clock time until
// the deadline is context for the model, not extra working hours.
const TIME_BUDGETS = [
  [/few hours/i, 4],
  [/one day/i, 8],
  [/weekend/i, 30],
  [/more than a week/i, 60],
  [/week/i, 35],
];

const SYSTEM_PROMPT = `You are HackMate's hackathon roadmap planner for student teams.

Return ONLY a JSON object in this exact shape:
{"phases":[{"name":"Planning","objective":"","tasks":["",""],"estimated_minutes":60,"estimated_time":"1h","team_role":"","priority":"High"}]}

Rules:
- Exactly 7 phases, in this order and with these exact names: Planning, Setup, Core development, Integration, Testing, Demo preparation, Final submission.
- The total of every estimated_minutes must not exceed the hard budget given by the user. Keep a realistic buffer and use most of the budget.
- Compress tasks when the budget is short; never drop a phase, never exceed the budget.
- Base every phase on this specific idea, the hackathon deadline, the team's skills and the available development time. No generic advice.
- objective: max 25 words, what must be true at the end of the phase.
- tasks: 2-4 concrete actions, each max 14 words, each something the team can start immediately.
- estimated_minutes: whole number, minimum 5.
- estimated_time: a short human label matching estimated_minutes (for example "1h 30m").
- team_role: max 5 words, one role from the team's skills or a role the team is missing.
- priority: exactly one of "High", "Medium", "Low".
- Plain text only inside strings: no markdown, no bullet characters, no extra keys, no commentary outside the JSON.`;

const rateBuckets = new Map();

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(body);
}

function asText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asSkills(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const skills = [];
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

function asStringList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  const list = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const item = entry.trim().slice(0, maxLength);
    if (!item) continue;
    list.push(item);
    if (list.length >= maxItems) break;
  }
  return list;
}

function timeBudgetMinutes(time) {
  const match = TIME_BUDGETS.find(([pattern]) => pattern.test(time));
  return match ? match[1] * 60 : null;
}

function normalizeIdea(payload) {
  const idea = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  return {
    title: asText(idea.title, 160),
    problem: asText(idea.problem, 500),
    solution: asText(idea.solution, 700),
    key_features: asStringList(idea.key_features ?? idea.keyFeatures, 5, 140),
    target_users: asText(idea.target_users ?? idea.targetUsers, 300),
    tech_stack: asStringList(idea.tech_stack ?? idea.techStack, 6, 80),
    required_team_roles: asStringList(
      idea.required_team_roles ?? idea.requiredTeamRoles,
      4,
      80,
    ),
    difficulty: asText(idea.difficulty, 30),
    estimated_time: asText(idea.estimated_time ?? idea.estimatedTime, 200),
  };
}

function normalizeBrief(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: "Send a JSON brief." };
  }

  const idea = normalizeIdea(payload.idea);
  const hackathon =
    payload.hackathon && typeof payload.hackathon === "object" && !Array.isArray(payload.hackathon)
      ? payload.hackathon
      : {};

  const brief = {
    idea,
    hackathon: {
      title: asText(hackathon.title, 160),
      deadline: asText(hackathon.deadline, 120),
    },
    skills: asSkills(payload.skills),
    teamSkills: asSkills(payload.teamSkills),
    time: asText(payload.time, 80),
  };

  if (!brief.idea.title) return { error: "Choose a project idea first." };
  if (!brief.idea.solution) return { error: "This idea has no solution to plan." };
  if (!brief.hackathon.title) return { error: "Choose a hackathon first." };
  if (!brief.skills.length) return { error: "Add at least one of your skills." };

  const budgetMinutes = timeBudgetMinutes(brief.time);
  if (!budgetMinutes) return { error: "Pick how much development time you have." };

  return { brief, budgetMinutes };
}

function buildMessages(brief, budgetMinutes) {
  const lines = [
    `Project idea: ${brief.idea.title}`,
    brief.idea.problem ? `Problem: ${brief.idea.problem}` : null,
    `Solution: ${brief.idea.solution}`,
    brief.idea.key_features.length
      ? `Key features: ${brief.idea.key_features.join("; ")}`
      : null,
    brief.idea.target_users ? `Target users: ${brief.idea.target_users}` : null,
    brief.idea.tech_stack.length ? `Tech stack: ${brief.idea.tech_stack.join(", ")}` : null,
    brief.idea.required_team_roles.length
      ? `Roles the idea needs: ${brief.idea.required_team_roles.join(", ")}`
      : null,
    brief.idea.difficulty ? `Idea difficulty: ${brief.idea.difficulty}` : null,
    brief.idea.estimated_time ? `Idea build estimate: ${brief.idea.estimated_time}` : null,
    `Hackathon: ${brief.hackathon.title}`,
    brief.hackathon.deadline ? `Deadline: ${brief.hackathon.deadline}` : "Deadline: not published",
    `Builder's skills: ${brief.skills.join(", ")}`,
    brief.teamSkills.length
      ? `Teammates' skills: ${brief.teamSkills.join(", ")}`
      : "Teammates' skills: none listed yet.",
    `Available development time: ${brief.time}`,
    `Hard budget: ${budgetMinutes} minutes of team work across all seven phases.`,
    "Do not exceed this budget, and keep the final phase short enough to submit on time.",
  ].filter(Boolean);

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ];
}

function readProviderConfig() {
  const apiKey = (process.env.AI_API_KEY || "").trim();
  const configuredBase = (process.env.AI_API_BASE_URL || DEFAULT_BASE_URL).trim();
  const model = (process.env.AI_MODEL || DEFAULT_MODEL).trim();

  let baseUrl = null;
  try {
    const parsed = new URL(configuredBase);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      baseUrl = configuredBase.replace(/\/+$/, "");
    }
  } catch {
    baseUrl = null;
  }

  return { apiKey, baseUrl, model };
}

function contentToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : typeof part?.text === "string" ? part.text : ""))
      .join("");
  }
  return "";
}

function parseRoadmap(text, budgetMinutes) {
  const raw = String(text || "").trim();
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

  let parsed = null;
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
      // try the next candidate
    }
  }
  if (!parsed || !Array.isArray(parsed.phases) || parsed.phases.length !== PHASES.length) {
    return null;
  }

  const phases = [];
  for (let index = 0; index < PHASES.length; index += 1) {
    const row = parsed.phases[index];
    if (!row || typeof row !== "object") return null;

    const expected = PHASES[index];
    const name = asText(row.name, 40);
    if (name.toLocaleLowerCase() !== expected.toLocaleLowerCase()) return null;

    const objective = asText(row.objective, 220);
    const tasks = asStringList(row.tasks, 4, 160);
    const minutes = Number(row.estimated_minutes);
    const estimatedTime = asText(row.estimated_time ?? row.estimatedTime, 40);
    const teamRole = asText(row.team_role ?? row.teamRole, 80);
    const priority = asText(row.priority, 20);

    if (!objective || tasks.length < 2 || !estimatedTime || !teamRole) return null;
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > budgetMinutes) return null;
    if (!/^(high|medium|low)$/i.test(priority)) return null;

    phases.push({
      name: expected,
      objective,
      tasks,
      estimated_minutes: Math.round(minutes),
      estimated_time: estimatedTime,
      team_role: teamRole,
      priority: priority[0].toLocaleUpperCase() + priority.slice(1).toLocaleLowerCase(),
    });
  }

  const totalMinutes = phases.reduce((sum, phase) => sum + phase.estimated_minutes, 0);
  if (totalMinutes > budgetMinutes) return null;

  return { phases, total_minutes: totalMinutes, budget_minutes: budgetMinutes };
}

async function requestRoadmapFromProvider(brief, budgetMinutes) {
  const { apiKey, baseUrl, model } = readProviderConfig();

  if (!apiKey || !baseUrl) {
    console.warn("[roadmap] AI provider is not configured (AI_API_KEY / AI_API_BASE_URL).");
    return { status: 503, error: "The roadmap generator isn't configured on the server yet." };
  }

  const timeoutMs = Number.parseInt(process.env.AI_TIMEOUT_MS ?? "", 10) || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model,
        messages: buildMessages(brief, budgetMinutes),
        temperature: 0.4,
        max_tokens: 2_200,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[roadmap] AI provider returned HTTP ${response.status}.`);
      return { status: 502, error: "The roadmap service is unavailable right now. Try again." };
    }

    const data = await response.json().catch(() => null);
    const roadmap = parseRoadmap(contentToText(data?.choices?.[0]?.message?.content), budgetMinutes);
    if (!roadmap) {
      console.error("[roadmap] AI provider returned a roadmap that did not fit the budget or schema.");
      return { status: 502, error: "The roadmap service returned an unusable plan. Try again." };
    }

    return roadmap;
  } catch (error) {
    if (error?.name === "AbortError") {
      console.error(`[roadmap] AI provider timed out after ${timeoutMs}ms.`);
      return { status: 504, error: "The roadmap service took too long. Try again." };
    }
    // Never surface provider errors, URLs, or credentials to the client.
    console.error(`[roadmap] AI provider request failed (${error?.name || "error"}).`);
    return { status: 502, error: "The roadmap service is unavailable right now. Try again." };
  } finally {
    clearTimeout(timer);
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (status, message) => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error(message), { status }));
    };

    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail(413, "The brief is too large.");
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      if (!size) {
        reject(Object.assign(new Error("Send a JSON brief."), { status: 400 }));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("The brief must be valid JSON."), { status: 400 }));
      }
    });
    req.on("error", () => fail(400, "The request could not be read."));
  });
}

function allowRequest(req) {
  const key = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (rateBuckets.get(key) || []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_REQUESTS) {
    rateBuckets.set(key, recent);
    return false;
  }
  recent.push(now);
  rateBuckets.set(key, recent);

  if (rateBuckets.size > 500) {
    for (const [bucketKey, stamps] of rateBuckets) {
      if (!stamps.some((stamp) => now - stamp < RATE_WINDOW_MS)) rateBuckets.delete(bucketKey);
    }
  }
  return true;
}

export async function handleRoadmapRequest(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST for this endpoint." }, { Allow: "POST" });
    return;
  }

  const contentType = String(req.headers["content-type"] || "");
  if (!/^application\/json\b/i.test(contentType)) {
    sendJson(res, 415, { error: "Send the brief as application/json." });
    return;
  }

  if (!allowRequest(req)) {
    sendJson(
      res,
      429,
      { error: "Too many roadmap requests. Wait a minute and try again." },
      { "Retry-After": String(Math.ceil(RATE_WINDOW_MS / 1000)) },
    );
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.status || 400, {
      error: typeof error.message === "string" ? error.message : "The brief could not be read.",
    });
    return;
  }

  const { brief, budgetMinutes, error: validationError } = normalizeBrief(payload);
  if (validationError) {
    sendJson(res, 400, { error: validationError });
    return;
  }

  const result = await requestRoadmapFromProvider(brief, budgetMinutes);
  if (result.error) {
    sendJson(res, result.status, { error: result.error });
    return;
  }

  sendJson(res, 200, result);
}
