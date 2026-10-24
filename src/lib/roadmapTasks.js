// Turns a generated roadmap into task drafts for review.
//
// The existing `tasks` table has no columns for the roadmap's phase, suggested
// role, or estimate, so those details are folded into the task description
// (the same convention the project draft uses). `priority` is stored in the
// existing smallint column: 1 is the most urgent, 5 the least.

import { formatMinutes } from "./roadmap";

export const PRIORITY_SCORES = { High: 1, Medium: 3, Low: 5 };

export function normalizeTaskTitle(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function clipTitle(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

function splitPhaseMinutes(totalMinutes, count) {
  const total = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (!count) return [];
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_value, index) => Math.max(1, base + (index < remainder ? 1 : 0)));
}

export function buildTasksFromRoadmap(roadmap) {
  const phases = Array.isArray(roadmap?.phases) ? roadmap.phases : [];
  const usedTitles = new Set();
  const tasks = [];

  for (const phase of phases) {
    const phaseName = String(phase?.name || "").trim();
    const phaseTasks = Array.isArray(phase?.tasks) ? phase.tasks : [];
    const minutes = splitPhaseMinutes(phase?.estimated_minutes, phaseTasks.length);
    const seenInPhase = new Set();

    phaseTasks.forEach((rawTitle, index) => {
      let title = clipTitle(rawTitle);
      let key = normalizeTaskTitle(title);
      if (!title || seenInPhase.has(key)) return;
      seenInPhase.add(key);

      // A repeated action in a later phase is still that phase's work, so keep
      // it and qualify the title instead of dropping it. The saved titles stay
      // unique, which is what lets a second save skip duplicates safely.
      if (usedTitles.has(key)) {
        title = clipTitle(`${phaseName}: ${title}`);
        key = normalizeTaskTitle(title);
        if (usedTitles.has(key)) return;
      }
      usedTitles.add(key);

      const taskMinutes = minutes[index] ?? 1;
      tasks.push({
        id: `${phaseName}-${index}`,
        title,
        description: String(phase.objective || "").trim(),
        phase: phaseName,
        role: String(phase.team_role || "").trim(),
        priority: String(phase.priority || "").trim(),
        estimated_minutes: taskMinutes,
        estimated_time: formatMinutes(taskMinutes),
      });
    });
  }

  return tasks;
}

export function composeTaskDescription(task) {
  const details = [
    task.phase ? `Phase: ${task.phase}` : null,
    task.role ? `Assigned role: ${task.role}` : null,
    task.estimated_time ? `Estimated time: ${task.estimated_time}` : null,
  ].filter(Boolean);

  return [...details, "", task.description].join("\n").trim();
}

export function toTaskRow(task, { projectId, userId }) {
  return {
    project_id: projectId,
    title: task.title,
    description: composeTaskDescription(task),
    status: "todo",
    priority: PRIORITY_SCORES[task.priority] ?? 3,
    created_by: userId,
  };
}

// Re-reading the board right before inserting keeps a second save (or another
// teammate's save) from creating the same task twice.
export async function saveRoadmapTasks({ client, projectId, userId, tasks }) {
  if (!client) throw new Error("Saving tasks needs the Supabase connection.");
  if (!projectId) throw new Error("Choose a project for these tasks.");
  if (!userId) throw new Error("Log in before saving tasks.");
  if (!Array.isArray(tasks) || !tasks.length) throw new Error("There are no tasks to save.");

  const { data: existing, error: readError } = await client
    .from("tasks")
    .select("id, title")
    .eq("project_id", projectId);
  if (readError) throw readError;

  const knownTitles = new Set(
    (Array.isArray(existing) ? existing : []).map((row) => normalizeTaskTitle(row?.title)),
  );

  const rows = [];
  let skipped = 0;

  for (const task of tasks) {
    const key = normalizeTaskTitle(task?.title);
    if (!key) continue;
    if (knownTitles.has(key)) {
      skipped += 1;
      continue;
    }
    knownTitles.add(key);
    rows.push(toTaskRow(task, { projectId, userId }));
  }

  if (!rows.length) {
    return { inserted: 0, skipped, total: tasks.length };
  }

  const { data: inserted, error: insertError } = await client
    .from("tasks")
    .insert(rows)
    .select("id");
  if (insertError) throw insertError;

  return {
    inserted: Array.isArray(inserted) ? inserted.length : rows.length,
    skipped,
    total: tasks.length,
  };
}
