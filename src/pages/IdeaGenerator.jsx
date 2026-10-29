import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Arrow } from "../components/Icons";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import ProjectCreateDialog from "../components/ProjectCreateDialog";
import RoadmapPanel from "../components/RoadmapPanel";
import RoadmapTasksPanel from "../components/RoadmapTasksPanel";
import { useAuth } from "../context/AuthContext";
import { demoHackathons } from "../lib/demoData";
import { formatEventDate } from "../lib/format";
import { requestIdeas } from "../lib/ideas";
import { normalizeProjectTitle } from "../lib/projects";
import { requestRoadmap } from "../lib/roadmap";
import { buildTasksFromRoadmap, saveRoadmapTasks } from "../lib/roadmapTasks";
import { supabase } from "../lib/supabase";

const HACKATHON_FIELDS =
  "id, slug, title, organizer, description, category, location, prize, registration_deadline, starts_at, ends_at, status, venue_name, city, capacity, price";
const APPROVED_STATUSES = ["upcoming", "active"];
const MAX_SKILLS = 12;
const EMPTY_TASK_STATUS = { text: "", error: false, done: false, skipped: 0, savedCount: 0 };

function taskErrorMessage(error) {
  const raw = String(error?.message || "");
  if (/row-level security|permission denied|policy/i.test(raw)) {
    return "Only members of this project's team can add tasks to it.";
  }
  if (/jwt|not authenticated|session/i.test(raw)) {
    return "Your session expired. Log in again to save these tasks.";
  }
  return raw || "Could not save the tasks. Try again.";
}

const SKILL_SUGGESTIONS = [
  "React",
  "TypeScript",
  "Python",
  "Node.js",
  "SQL",
  "Figma",
  "UI/UX",
  "Data visualisation",
  "Machine learning",
  "Flutter",
  "Product",
  "Pitching",
];

const TEAMMATE_SUGGESTIONS = [
  "Frontend",
  "Backend",
  "Design",
  "Data",
  "Mobile",
  "DevOps",
  "Research",
  "QA",
];

const TIME_OPTIONS = [
  { value: "few-hours", label: "A few hours", hint: "One tight prototype" },
  { value: "one-day", label: "One day", hint: "A focused build" },
  { value: "weekend", label: "A weekend", hint: "48 hours, one demo" },
  { value: "week", label: "About a week", hint: "Room to iterate" },
  { value: "longer", label: "More than a week", hint: "Time for polish" },
];

// Merge profile skills with anything already typed, keeping the first spelling.
function mergeSkills(primary, extra) {
  const merged = primary.slice(0, MAX_SKILLS);
  for (const skill of extra) {
    if (merged.length >= MAX_SKILLS) break;
    if (!merged.some((item) => item.toLocaleLowerCase() === skill.toLocaleLowerCase())) {
      merged.push(skill);
    }
  }
  return merged;
}

function BriefDetails({ brief }) {
  return (
    <dl className="idea-brief">
      <div>
        <dt>Hackathon</dt>
        <dd>{brief.hackathon.title}</dd>
      </div>
      <div>
        <dt>Theme</dt>
        <dd>{brief.hackathon.category || "Open innovation"}</dd>
      </div>
      <div>
        <dt>Your skills</dt>
        <dd>{brief.skills.join(", ")}</dd>
      </div>
      <div>
        <dt>Teammate skills</dt>
        <dd>{brief.teamSkills.length ? brief.teamSkills.join(", ") : "No teammates added yet"}</dd>
      </div>
      <div>
        <dt>Interests</dt>
        <dd>{brief.interests}</dd>
      </div>
      <div>
        <dt>Available time</dt>
        <dd>{brief.time?.label || "Not set"}</dd>
      </div>
    </dl>
  );
}

function IdeaTags({ idea }) {
  return (
    <div className="idea-card-tags">
      <span className="idea-tag">{idea.difficulty}</span>
      <span className="idea-tag idea-tag-time">{idea.estimated_time}</span>
    </div>
  );
}

function IdeaDetailBlocks({ idea }) {
  return (
    <>
      <dl className="idea-card-summary">
        <div>
          <dt>Problem</dt>
          <dd className="idea-problem">{idea.problem}</dd>
        </div>
        <div>
          <dt>Solution</dt>
          <dd className="idea-solution">{idea.solution}</dd>
        </div>
        <div>
          <dt>Target users</dt>
          <dd className="idea-users">{idea.target_users}</dd>
        </div>
      </dl>

      <div className="idea-card-columns">
        <section>
          <p className="eyebrow">KEY FEATURES</p>
          <ul className="idea-list idea-features">
            {idea.key_features.map((feature, featureIndex) => (
              <li key={`${feature}-${featureIndex}`}>{feature}</li>
            ))}
          </ul>
        </section>
        <section>
          <p className="eyebrow">TECH STACK</p>
          <div className="idea-chips idea-tech">
            {idea.tech_stack.map((item, itemIndex) => (
              <span className="idea-chip" key={`${item}-${itemIndex}`}>
                {item}
              </span>
            ))}
          </div>
          <p className="eyebrow">TEAM ROLES</p>
          <div className="idea-chips idea-roles">
            {idea.required_team_roles.map((role, roleIndex) => (
              <span className="idea-chip" key={`${role}-${roleIndex}`}>
                {role}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section>
        <p className="eyebrow">RISKS</p>
        <ul className="idea-list idea-risks">
          {idea.risks.map((risk, riskIndex) => (
            <li key={`${risk}-${riskIndex}`}>{risk}</li>
          ))}
        </ul>
      </section>

      <p className="idea-why">
        <strong>Why it fits:</strong> {idea.why_it_fits}
      </p>
    </>
  );
}

function IdeaCard({ idea, index, selected, onViewDetails, onUse }) {
  return (
    <article className={`idea-card${selected ? " idea-card-selected" : ""}`}>
      <div className="idea-card-top">
        <span className="idea-card-index" aria-hidden="true">
          0{index + 1}
        </span>
        <div className="idea-card-heading">
          <h3>{idea.title}</h3>
          <IdeaTags idea={idea} />
        </div>
      </div>

      <IdeaDetailBlocks idea={idea} />

      <footer className="idea-card-actions">
        <button
          className="button button-outline idea-details-button"
          type="button"
          onClick={(event) => onViewDetails(event.currentTarget)}
        >
          View Details
        </button>
        <button
          className="button button-lime idea-use-button"
          type="button"
          aria-pressed={selected}
          onClick={() => onUse(idea)}
        >
          {selected ? "Using This Idea ✓" : "Use This Idea"}
        </button>
      </footer>
    </article>
  );
}

function IdeaDetailsDialog({ idea, selected, containerRef, onClose, onUse }) {
  return (
    <div
      className="idea-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="idea-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="idea-detail-title"
        ref={containerRef}
      >
        <div className="idea-modal-top">
          <div className="idea-modal-heading">
            <p className="eyebrow">PROJECT IDEA</p>
            <h2 id="idea-detail-title">{idea.title}</h2>
            <IdeaTags idea={idea} />
          </div>
          <button className="idea-modal-close" type="button" aria-label="Close details" onClick={onClose}>
            ×
          </button>
        </div>

        <IdeaDetailBlocks idea={idea} />

        <footer className="idea-modal-actions">
          <button className="button button-outline" type="button" onClick={onClose}>
            Close
          </button>
          <button className="button button-lime" type="button" aria-pressed={selected} onClick={() => onUse(idea)}>
            {selected ? "Using This Idea ✓" : "Use This Idea"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function SkillField({
  id,
  label,
  hint,
  placeholder,
  skills,
  draft,
  onDraftChange,
  onAdd,
  onRemove,
  suggestions,
  profileKeys,
}) {
  const added = new Set(skills.map((skill) => skill.toLocaleLowerCase()));

  const handleKeyDown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onAdd(draft);
  };

  return (
    <div className="idea-field">
      <label htmlFor={id}>
        {label} <span className="muted tiny">{hint}</span>
      </label>
      <div className="profile-skill-list" aria-live="polite">
        {skills.length ? (
          skills.map((skill, index) => {
            const fromProfile = Boolean(profileKeys?.has(skill.toLocaleLowerCase()));
            return (
              <span className={`skill${fromProfile ? " skill-saved" : ""}`} key={`${skill}-${index}`}>
                {skill}
                {fromProfile ? (
                  <span className="skill-origin" title="Saved on your profile">
                    profile
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={`Remove ${skill}`}
                  onClick={() => onRemove(index)}
                >
                  ×
                </button>
              </span>
            );
          })
        ) : (
          <span className="muted tiny">Nothing added yet.</span>
        )}
      </div>
      <div className="profile-skill-entry">
        <input
          id={id}
          type="text"
          maxLength="40"
          placeholder={placeholder}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="button button-outline" type="button" onClick={() => onAdd(draft)}>
          Add
        </button>
      </div>
      <div className="idea-suggestions" aria-label={`${label} suggestions`}>
        {suggestions.map((suggestion) => {
          const isAdded = added.has(suggestion.toLocaleLowerCase());
          return (
            <button
              className="skill idea-suggestion"
              type="button"
              key={suggestion}
              onClick={() => onAdd(suggestion)}
              disabled={isAdded}
              aria-pressed={isAdded}
            >
              {suggestion} {isAdded ? "✓" : "+"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function IdeaGenerator() {
  const { user } = useAuth();
  const [hackathons, setHackathons] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading approved hackathons…");
  const [statusError, setStatusError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [skills, setSkills] = useState([]);
  const [profileSkills, setProfileSkills] = useState([]);
  const [profileSnapshot, setProfileSnapshot] = useState(null);
  const [savingSkills, setSavingSkills] = useState(false);
  const [skillsMessage, setSkillsMessage] = useState({ text: "", error: false });
  const [teamSkills, setTeamSkills] = useState([]);
  const [myDraft, setMyDraft] = useState("");
  const [teamDraft, setTeamDraft] = useState("");
  const [interests, setInterests] = useState("");
  const [time, setTime] = useState("");
  const [message, setMessage] = useState({ text: "", error: false });
  const [brief, setBrief] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [detailIdea, setDetailIdea] = useState(null);
  const [projectIdea, setProjectIdea] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [roadmapError, setRoadmapError] = useState("");
  const [roadmapTasks, setRoadmapTasks] = useState([]);
  const [taskStatus, setTaskStatus] = useState(EMPTY_TASK_STATUS);
  const [taskProjects, setTaskProjects] = useState([]);
  const [taskProjectsLoading, setTaskProjectsLoading] = useState(false);
  const [taskProjectsError, setTaskProjectsError] = useState("");
  const [taskProjectsReloadKey, setTaskProjectsReloadKey] = useState(0);
  const [taskProjectId, setTaskProjectId] = useState("");
  const [savingTasks, setSavingTasks] = useState(false);
  const previewRef = useRef(null);
  const taskPanelRef = useRef(null);
  const prefilledFor = useRef(null);
  const detailRef = useRef(null);
  const detailTrigger = useRef(null);
  const projectReturnFocus = useRef(false);
  const roadmapRequest = useRef(0);
  const roadmapActive = useRef(0);
  const generatingRef = useRef(false);
  const savingTasksRef = useRef(false);

  useEffect(() => {
    if (!supabase) {
      setHackathons(demoHackathons);
      setSelectedId(demoHackathons[0]?.id ?? "");
      setLoading(false);
      setStatus("Showing sample hackathons. Configure Supabase to use live approved events.");
      return undefined;
    }

    let active = true;
    setLoading(true);
    setStatusError(false);
    setStatus("Loading approved hackathons…");
    supabase
      .from("hackathons")
      .select(HACKATHON_FIELDS)
      .eq("approval_status", "approved")
      .in("status", APPROVED_STATUSES)
      .order("starts_at", { ascending: true })
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) throw requestError;
        const rows = data || [];
        setHackathons(rows);
        setSelectedId((current) =>
          rows.some((row) => row.id === current) ? current : rows[0]?.id ?? "",
        );
        setStatus(
          rows.length
            ? `${rows.length} approved ${rows.length === 1 ? "hackathon" : "hackathons"} ready for ideas.`
            : "No approved hackathons are open right now. Check back soon.",
        );
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load approved hackathons.", error);
        setHackathons(demoHackathons);
        setSelectedId(demoHackathons[0]?.id ?? "");
        setStatus("Live hackathons are unavailable; showing sample events.");
        setStatusError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  // Copy the signed-in user's skills (profiles + user_skills via get_my_profile)
  // into the form. This only reads: nothing is written back until the user
  // explicitly presses "Save skills to profile".
  useEffect(() => {
    if (!supabase || !user) return undefined;
    if (prefilledFor.current === user.id) return undefined;

    let active = true;
    supabase
      .rpc("get_my_profile")
      .then(({ data, error: requestError }) => {
        if (!active || requestError || !data) return;
        const saved = Array.isArray(data.skills)
          ? data.skills.filter(Boolean).slice(0, MAX_SKILLS)
          : [];
        prefilledFor.current = user.id;
        setProfileSkills(saved);
        setProfileSnapshot({
          full_name: data.full_name || "",
          username: data.username || "",
          bio: data.bio || "",
        });
        if (saved.length) {
          // Keep anything typed before the profile arrived.
          setSkills((current) => mergeSkills(saved, current));
        }
      })
      .catch(() => {
        // Prefill is optional; typing skills by hand still works.
      });

    return () => {
      active = false;
    };
  }, [user]);

  // The project dialog was opened from a card action; once it is gone, put
  // focus back on the selected card's action instead of dropping it on body.
  useEffect(() => {
    if (projectIdea || !projectReturnFocus.current) return;
    projectReturnFocus.current = false;
    document.querySelector('.idea-use-button[aria-pressed="true"]')?.focus?.();
  }, [projectIdea]);

  // Keep the details dialog keyboard-friendly: Escape closes it, Tab stays
  // inside, background scrolling is paused, and focus returns to the trigger.
  useEffect(() => {
    if (!detailIdea) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    detailRef.current?.querySelector("button, a[href]")?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDetailIdea(null);
        return;
      }
      if (event.key !== "Tab" || !detailRef.current) return;
      const focusables = [
        ...detailRef.current.querySelectorAll('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'),
      ];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      detailTrigger.current?.focus?.();
    };
  }, [detailIdea]);

  const selectedHackathon = hackathons.find((hackathon) => hackathon.id === selectedId) || null;
  const selectedIdea = ideas.find((idea) => idea.title === selectedTitle) || null;

  // Bring the reviewed tasks into view once they are converted from the roadmap.
  useEffect(() => {
    if (!roadmapTasks.length) return;
    taskPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [roadmapTasks]);

  // Load the projects the user can add tasks to. The project created for this
  // idea is preselected when its title matches; otherwise the user chooses.
  useEffect(() => {
    if (!roadmapTasks.length) return undefined;
    if (!supabase || !user) {
      setTaskProjects([]);
      setTaskProjectsLoading(false);
      setTaskProjectsError("");
      return undefined;
    }

    let active = true;
    setTaskProjectsLoading(true);
    setTaskProjectsError("");

    supabase
      .from("projects")
      .select("id, title, team_id")
      .order("created_at", { ascending: false })
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) throw requestError;
        const rows = Array.isArray(data) ? data : [];
        setTaskProjects(rows);
        setTaskProjectId((current) => {
          if (rows.some((project) => project.id === current)) return current;
          const titleKey = normalizeProjectTitle(selectedIdea?.title);
          return rows.find((project) => normalizeProjectTitle(project.title) === titleKey)?.id || "";
        });
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load projects for saving tasks.", error);
        setTaskProjects([]);
        setTaskProjectsError(error?.message || "Could not load your projects.");
      })
      .finally(() => {
        if (active) setTaskProjectsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [roadmapTasks.length, user, selectedIdea?.title, taskProjectsReloadKey]);

  const resetTasks = () => {
    setRoadmapTasks([]);
    setTaskStatus(EMPTY_TASK_STATUS);
    setTaskProjectId("");
  };

  // Any selection change or new brief cancels an in-flight roadmap request so
  // a late response can never attach to the wrong idea.
  const resetRoadmap = () => {
    roadmapRequest.current += 1;
    roadmapActive.current = 0;
    setRoadmap(null);
    setRoadmapError("");
    setRoadmapLoading(false);
    resetTasks();
  };
  const profileSkillKeys = new Set(profileSkills.map((skill) => skill.toLocaleLowerCase()));
  const hasProfileSkills = profileSkills.length > 0;
  const skillsChanged =
    skills.length !== profileSkills.length ||
    skills.some((skill) => !profileSkillKeys.has(skill.toLocaleLowerCase()));

  const addSkill = (list, setList, raw) => {
    const name = String(raw || "").trim();
    if (!name) return;
    if (list.length >= MAX_SKILLS) {
      setMessage({ text: `You can list up to ${MAX_SKILLS} skills per field.`, error: true });
      return;
    }
    if (list.some((skill) => skill.toLocaleLowerCase() === name.toLocaleLowerCase())) return;
    setList([...list, name]);
    setMessage({ text: "", error: false });
  };

  const handleAddMySkill = (value = myDraft) => {
    addSkill(skills, setSkills, value);
    setMyDraft("");
  };

  const handleAddTeamSkill = (value = teamDraft) => {
    addSkill(teamSkills, setTeamSkills, value);
    setTeamDraft("");
  };

  const removeFrom = (setList, index) => {
    setList((current) => current.filter((_skill, skillIndex) => skillIndex !== index));
  };

  const handleSaveSkills = async () => {
    if (!supabase || !profileSnapshot) return;
    if (!skills.length) {
      setSkillsMessage({ text: "Add at least one skill before saving.", error: true });
      return;
    }

    setSavingSkills(true);
    setSkillsMessage({ text: "Saving your skills…", error: false });
    try {
      const { error: requestError } = await supabase.rpc("save_my_profile", {
        p_full_name: profileSnapshot.full_name,
        p_username: profileSnapshot.username,
        p_bio: profileSnapshot.bio || "",
        p_skills: skills,
      });
      if (requestError) throw requestError;
      setProfileSkills(skills);
      setSkillsMessage({ text: "Skills saved to your profile.", error: false });
    } catch (error) {
      console.error("Could not save skills to the profile.", error);
      setSkillsMessage({
        text: error.message || "Could not save your skills. Try again.",
        error: true,
      });
    } finally {
      setSavingSkills(false);
    }
  };

  const handleResetSkills = () => {
    setSkills(profileSkills);
    setSkillsMessage({ text: "Profile skills restored.", error: false });
  };

  const handleHackathonChange = (event) => {
    setSelectedId(event.target.value);
    setBrief(null);
    setIdeas([]);
    setSelectedTitle(null);
    setDetailIdea(null);
    setProjectIdea(null);
    resetRoadmap();
    setMessage({ text: "", error: false });
  };

  const openDetails = (idea, trigger) => {
    detailTrigger.current = trigger;
    setDetailIdea(idea);
  };

  const handleUseIdea = (idea) => {
    if (idea.title !== selectedTitle) resetRoadmap();
    setSelectedTitle(idea.title);
    setDetailIdea(null);
    setProjectIdea(idea);
    setMessage({ text: "", error: false });
  };

  const handleGenerateRoadmap = async () => {
    if (!selectedIdea || !selectedHackathon) {
      setMessage({ text: "Choose an idea before generating a roadmap.", error: true });
      return;
    }
    const timeOption = TIME_OPTIONS.find((option) => option.value === time) || null;
    if (!timeOption) {
      setMessage({ text: "Pick how much development time you have.", error: true });
      return;
    }
    if (!skills.length) {
      setMessage({ text: "Add at least one of your own skills.", error: true });
      return;
    }

    // Two clicks can land before the disabled button re-renders.
    if (roadmapActive.current) return;
    const requestId = roadmapRequest.current + 1;
    roadmapRequest.current = requestId;
    roadmapActive.current = requestId;
    resetTasks();
    setRoadmapLoading(true);
    setRoadmapError("");
    setRoadmap(null);

    try {
      const result = await requestRoadmap({
        idea: {
          title: selectedIdea.title,
          problem: selectedIdea.problem,
          solution: selectedIdea.solution,
          key_features: selectedIdea.key_features,
          target_users: selectedIdea.target_users,
          tech_stack: selectedIdea.tech_stack,
          required_team_roles: selectedIdea.required_team_roles,
          difficulty: selectedIdea.difficulty,
          estimated_time: selectedIdea.estimated_time,
        },
        hackathon: {
          title: selectedHackathon.title,
          deadline: selectedHackathon.ends_at ? formatEventDate(selectedHackathon.ends_at) : "",
        },
        skills,
        teamSkills,
        time: timeOption.label,
      });
      if (roadmapRequest.current !== requestId) return;
      setRoadmap(result);
    } catch (error) {
      if (roadmapRequest.current !== requestId) return;
      console.error("Could not generate a roadmap.", error?.message || error);
      setRoadmap(null);
      setRoadmapError(error.message || "Could not generate a roadmap. Try again.");
    } finally {
      if (roadmapActive.current === requestId) {
        roadmapActive.current = 0;
        setRoadmapLoading(false);
      }
    }
  };

  const handleGenerateTasks = () => {
    if (!roadmap) return;
    const tasks = buildTasksFromRoadmap(roadmap);
    if (!tasks.length) {
      setTaskStatus({
        ...EMPTY_TASK_STATUS,
        text: "This roadmap has no tasks to convert. Regenerate it and try again.",
        error: true,
      });
      return;
    }
    setRoadmapTasks(tasks);
    setTaskStatus(EMPTY_TASK_STATUS);
  };

  const handleTaskProjectChange = (projectId) => {
    setTaskProjectId(projectId);
    setTaskStatus((current) => ({ ...current, text: "", error: false }));
  };

  const handleConfirmSaveTasks = async () => {
    if (!roadmapTasks.length || taskStatus.done || savingTasks || savingTasksRef.current) return;
    if (!supabase || !user) {
      setTaskStatus((current) => ({
        ...current,
        text: "Log in before saving these tasks.",
        error: true,
      }));
      return;
    }
    if (!taskProjectId) {
      setTaskStatus((current) => ({
        ...current,
        text: "Choose a project for these tasks first.",
        error: true,
      }));
      return;
    }

    savingTasksRef.current = true;
    setSavingTasks(true);
    setTaskStatus({ ...EMPTY_TASK_STATUS, text: "Checking the project for existing tasks…" });

    try {
      const result = await saveRoadmapTasks({
        client: supabase,
        projectId: taskProjectId,
        userId: user.id,
        tasks: roadmapTasks,
      });
      const project = taskProjects.find((row) => row.id === taskProjectId) || null;
      const where = project ? ` to ${project.title}` : "";
      const duplicateNote = result.skipped
        ? ` Skipped ${result.skipped} already-saved ${result.skipped === 1 ? "task" : "tasks"}.`
        : "";
      setTaskStatus({
        text: result.inserted
          ? `Saved ${result.inserted} ${result.inserted === 1 ? "task" : "tasks"}${where}.${duplicateNote}`
          : `All ${roadmapTasks.length} tasks are already${project ? ` on ${project.title}` : " saved"}. Nothing new was inserted.`,
        error: false,
        done: true,
        skipped: result.skipped,
        savedCount: result.inserted,
      });
    } catch (error) {
      console.error("Could not save roadmap tasks.", error);
      setTaskStatus({
        ...EMPTY_TASK_STATUS,
        text: taskErrorMessage(error),
        error: true,
      });
    } finally {
      savingTasksRef.current = false;
      setSavingTasks(false);
    }
  };

  const handleProjectCreated = (project) => {
    setMessage({ text: `Project draft created: ${project.title}.`, error: false });
    setTaskProjects((current) => [project, ...current.filter((row) => row.id !== project.id)]);
    if (roadmapTasks.length) {
      setTaskProjectId(project.id);
      setTaskStatus({
        ...EMPTY_TASK_STATUS,
        text: "Project created. Review the tasks, then press Confirm & Save Tasks.",
      });
    }
  };

  const openTaskProjectDialog = () => {
    if (selectedIdea) setProjectIdea(selectedIdea);
  };

  const closeProjectDialog = () => {
    projectReturnFocus.current = true;
    setProjectIdea(null);
  };

  const handleGenerate = async () => {
    const trimmedInterests = interests.trim();

    if (!selectedHackathon) {
      setMessage({ text: "Choose an approved hackathon to build for.", error: true });
      return;
    }
    if (!skills.length) {
      setMessage({ text: "Add at least one of your own skills.", error: true });
      return;
    }
    if (!trimmedInterests) {
      setMessage({ text: "Add a few interests so the ideas have a direction.", error: true });
      return;
    }
    if (!time) {
      setMessage({ text: "Pick how much development time you have.", error: true });
      return;
    }

    if (generatingRef.current) return;
    generatingRef.current = true;

    const timeOption = TIME_OPTIONS.find((option) => option.value === time) || null;
    setBrief({
      hackathon: selectedHackathon,
      skills,
      teamSkills,
      interests: trimmedInterests,
      time: timeOption,
    });
    setIdeas([]);
    setSelectedTitle(null);
    setDetailIdea(null);
    setProjectIdea(null);
    resetRoadmap();
    setGenerating(true);
    setMessage({ text: "Generating three ideas…", error: false });
    window.requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    try {
      const generated = await requestIdeas({
        hackathon: {
          title: selectedHackathon.title,
          category: selectedHackathon.category || "",
          organizer: selectedHackathon.organizer || "",
        },
        problem: selectedHackathon.description || "",
        skills,
        interests: trimmedInterests,
        teamSkills,
        time: timeOption?.label || "",
      });
      setIdeas(generated);
      setMessage({ text: "", error: false });
    } catch (error) {
      console.error("Could not generate ideas.", error?.message || error);
      setIdeas([]);
      setMessage({
        text: error.message || "Could not generate ideas. Try again.",
        error: true,
      });
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  };

  return (
    <>
      <PageTitle title="Idea generator | HackMate" />
      <main className="page-main wrap idea-generator-page">
        <PageIntro
          eyebrow="AI HACKATHON IDEA GENERATOR"
          title="Start with a theme. Leave with a direction."
          description="Choose an event, share what you and your team can build, and set your time budget. The Supabase Edge Function turns your brief into three scoped ideas."
        />
        <div className="idea-layout">
          <section className="idea-builder" aria-labelledby="idea-builder-heading">
            <div className="idea-builder-heading">
              <span className="status-label">YOUR BRIEF</span>
              <h2 id="idea-builder-heading">Tell the generator what it's working with.</h2>
              <p className="muted small">
                Five quick steps. Your brief is sent to the Edge Function only when you press Generate Ideas.
              </p>
            </div>

            <div className="idea-step">
              <span className="idea-step-number" aria-hidden="true">
                01
              </span>
              <div className="idea-step-body">
                <div className="idea-field">
                  <label htmlFor="idea-hackathon">
                    Hackathon <span className="muted tiny">Approved events only</span>
                  </label>
                  <select
                    id="idea-hackathon"
                    value={selectedId}
                    onChange={handleHackathonChange}
                    disabled={loading || !hackathons.length}
                  >
                    {hackathons.length ? (
                      hackathons.map((hackathon) => (
                        <option value={hackathon.id} key={hackathon.id}>
                          {hackathon.title}
                        </option>
                      ))
                    ) : (
                      <option value="">
                        {loading ? "Loading hackathons…" : "No approved hackathons yet"}
                      </option>
                    )}
                  </select>
                </div>
                <p
                  id="idea-hackathon-status"
                  className="idea-status"
                  role="status"
                  aria-live="polite"
                  data-error={statusError}
                >
                  {status}
                  {statusError ? (
                    <>
                      {" "}
                      <button
                        className="text-link hackathon-retry"
                        type="button"
                        onClick={() => setReloadKey((key) => key + 1)}
                      >
                        Try again
                      </button>
                    </>
                  ) : null}
                </p>
                {selectedHackathon ? (
                  <article className="idea-theme" aria-label="Selected hackathon problem and theme">
                    <div className="idea-theme-top">
                      <p className="eyebrow">PROBLEM / THEME</p>
                      {selectedHackathon.category ? (
                        <span className="status-label">
                          {selectedHackathon.category.toLocaleUpperCase()}
                        </span>
                      ) : null}
                    </div>
                    <h3>{selectedHackathon.title}</h3>
                    <p>
                      {selectedHackathon.description ||
                        "The organizers haven't published a problem statement for this event yet. Use the theme as your starting point."}
                    </p>
                    <ul className="idea-facts">
                      {[
                        selectedHackathon.organizer,
                        formatEventDate(selectedHackathon.starts_at),
                        selectedHackathon.location,
                        selectedHackathon.prize ? `${selectedHackathon.prize} prize pool` : null,
                      ]
                        .filter(Boolean)
                        .map((fact) => (
                          <li key={fact}>{fact}</li>
                        ))}
                    </ul>
                  </article>
                ) : null}
              </div>
            </div>

            <div className="idea-step">
              <span className="idea-step-number" aria-hidden="true">
                02
              </span>
              <div className="idea-step-body">
                <SkillField
                  id="idea-my-skills"
                  label="Your skills"
                  hint={hasProfileSkills ? "Saved on your profile" : "Add your own or pick a suggestion"}
                  placeholder="Add a skill and press Enter"
                  skills={skills}
                  draft={myDraft}
                  onDraftChange={setMyDraft}
                  onAdd={handleAddMySkill}
                  onRemove={(index) => removeFrom(setSkills, index)}
                  suggestions={SKILL_SUGGESTIONS}
                  profileKeys={profileSkillKeys}
                />
                <div className="idea-skill-meta">
                  <p className="muted tiny">
                    {user ? (
                      "Skills from your profile load automatically. Changes here stay temporary until you save them."
                    ) : (
                      <>
                        <Link to="/login">Log in</Link> to reuse the skills already on your profile.
                      </>
                    )}
                  </p>
                  {user && profileSnapshot ? (
                    <div className="idea-skill-actions">
                      <button
                        className="button button-outline idea-save-skills"
                        type="button"
                        onClick={handleSaveSkills}
                        disabled={savingSkills || !skillsChanged}
                      >
                        {savingSkills ? "Saving…" : "Save skills to profile"}
                      </button>
                      {skillsChanged ? (
                        <button
                          className="text-link"
                          type="button"
                          onClick={handleResetSkills}
                          disabled={savingSkills}
                        >
                          Reset to profile
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <p
                    className="form-message idea-skill-message"
                    role="status"
                    aria-live="polite"
                    data-error={skillsMessage.error}
                  >
                    {skillsMessage.text}
                  </p>
                </div>
              </div>
            </div>

            <div className="idea-step">
              <span className="idea-step-number" aria-hidden="true">
                03
              </span>
              <div className="idea-step-body">
                <div className="idea-field">
                  <label htmlFor="idea-interests">
                    Interests <span className="muted tiny">Causes, problems, or themes you enjoy</span>
                  </label>
                  <textarea
                    id="idea-interests"
                    rows="3"
                    maxLength="300"
                    placeholder="Climate data, accessible learning, campus life…"
                    value={interests}
                    onChange={(event) => {
                      setInterests(event.target.value);
                      setMessage({ text: "", error: false });
                    }}
                  />
                  <p className="muted tiny">{interests.trim().length}/300 characters</p>
                </div>
              </div>
            </div>

            <div className="idea-step">
              <span className="idea-step-number" aria-hidden="true">
                04
              </span>
              <div className="idea-step-body">
                <SkillField
                  id="idea-team-skills"
                  label="Teammates' skills"
                  hint="Optional — what the rest of your team brings"
                  placeholder="Add a teammate skill and press Enter"
                  skills={teamSkills}
                  draft={teamDraft}
                  onDraftChange={setTeamDraft}
                  onAdd={handleAddTeamSkill}
                  onRemove={(index) => removeFrom(setTeamSkills, index)}
                  suggestions={TEAMMATE_SUGGESTIONS}
                />
              </div>
            </div>

            <div className="idea-step">
              <span className="idea-step-number" aria-hidden="true">
                05
              </span>
              <div className="idea-step-body">
                <div className="idea-field">
                  <span className="idea-label" id="idea-time-label">
                    Available development time
                  </span>
                  <div className="idea-time-options" role="group" aria-labelledby="idea-time-label">
                    {TIME_OPTIONS.map((option) => (
                      <button
                        className="idea-time-option"
                        type="button"
                        key={option.value}
                        aria-pressed={time === option.value}
                        onClick={() => {
                          setTime(option.value);
                          setMessage({ text: "", error: false });
                        }}
                      >
                        <strong>{option.label}</strong>
                        <small>{option.hint}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="idea-actions">
              <button
                className="button button-dark idea-generate"
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                aria-busy={generating}
              >
                {generating ? (
                  "Generating ideas…"
                ) : (
                  <>
                    <span aria-hidden="true">✳</span> Generate Ideas <Arrow diagonal />
                  </>
                )}
              </button>
              <p
                id="idea-message"
                className="form-message"
                role="status"
                aria-live="polite"
                data-error={message.error}
              >
                {message.text}
              </p>
            </div>
          </section>

          <aside className="idea-side" aria-label="About the idea generator">
            <section className="dark-callout">
              <p className="eyebrow light-eyebrow">SUPABASE EDGE FUNCTION</p>
              <h2>Your key stays on the server.</h2>
              <p>
                Ideas come from a Gemini call inside a Supabase Edge Function. The Gemini key is a
                function secret, never sent to this page, and your brief is only used for this
                request.
              </p>
            </section>
            <section className="idea-tips">
              <p className="eyebrow">A BETTER BRIEF</p>
              <ul>
                <li>Choose the event you're actually attending.</li>
                <li>List real skills; your team can cover the rest.</li>
                <li>Be honest about time — scoped ideas win.</li>
              </ul>
              <Link className="text-link" to="/hackathons">
                Browse hackathons <Arrow />
              </Link>
            </section>
          </aside>
        </div>

        <section
          id="idea-preview"
          className="idea-preview"
          aria-live="polite"
          aria-labelledby="idea-preview-heading"
          ref={previewRef}
        >
          {ideas.length ? (
            <>
              <div className="idea-preview-top">
                <span className="status-label">IDEAS READY</span>
                <span className="muted tiny">
                  {ideas.length} ideas · scoped to your time
                </span>
              </div>
              <h2 id="idea-preview-heading">Ideas for {brief?.hackathon?.title || "your hackathon"}.</h2>
              <div className="idea-results" aria-label="Generated hackathon ideas">
                {ideas.map((idea, index) => (
                  <IdeaCard
                    idea={idea}
                    index={index}
                    key={idea.title}
                    selected={selectedTitle === idea.title}
                    onViewDetails={(trigger) => openDetails(idea, trigger)}
                    onUse={handleUseIdea}
                  />
                ))}
              </div>
              {selectedIdea ? (
                <div className="idea-selected">
                  <p role="status">
                    <strong>You're using “{selectedIdea.title}”.</strong> Plan the build, then find
                    teammates who cover the roles above.
                  </p>
                  <div className="idea-selected-actions">
                    <button
                      className="button button-dark idea-roadmap-button"
                      type="button"
                      onClick={handleGenerateRoadmap}
                      disabled={roadmapLoading}
                      aria-busy={roadmapLoading}
                    >
                      {roadmapLoading
                        ? "Building roadmap…"
                        : roadmap
                          ? "Regenerate Roadmap"
                          : "Generate Roadmap"}
                    </button>
                    <Link className="text-link" to="/teams">
                      My teams <Arrow />
                    </Link>
                  </div>
                </div>
              ) : null}
              <RoadmapPanel
                roadmap={roadmap}
                loading={roadmapLoading}
                error={roadmapError}
                deadline={
                  selectedHackathon?.ends_at ? formatEventDate(selectedHackathon.ends_at) : ""
                }
                tasksGenerated={roadmapTasks.length > 0}
                onRetry={handleGenerateRoadmap}
                onGenerateTasks={handleGenerateTasks}
              />
              <RoadmapTasksPanel
                tasks={roadmapTasks}
                status={taskStatus}
                projectId={taskProjectId}
                projects={taskProjects}
                projectsLoading={taskProjectsLoading}
                projectsError={taskProjectsError}
                signedIn={Boolean(user)}
                saving={savingTasks}
                containerRef={taskPanelRef}
                onProjectChange={handleTaskProjectChange}
                onConfirm={handleConfirmSaveTasks}
                onCreateProject={openTaskProjectDialog}
                onRetryProjects={() => setTaskProjectsReloadKey((key) => key + 1)}
              />
              {brief ? (
                <details className="idea-sent">
                  <summary>Brief sent to the AI</summary>
                  <BriefDetails brief={brief} />
                </details>
              ) : null}
            </>
          ) : generating ? (
            <>
              <div className="idea-preview-top">
                <span className="status-label">GENERATING</span>
                <span className="muted tiny">Usually a few seconds</span>
              </div>
              <h2 id="idea-preview-heading">Working on three ideas…</h2>
              <p className="muted small">Your brief is with the Edge Function. Nothing is saved.</p>
              <div className="idea-skeleton" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </>
          ) : brief ? (
            <>
              <div className="idea-preview-top">
                <span className="status-label">BRIEF READY</span>
                <span className="muted tiny">Press Generate Ideas to try again</span>
              </div>
              <h2 id="idea-preview-heading">That didn't come through.</h2>
              <p className="muted small">
                Nothing you entered was lost. Check your connection and try again with the same brief.
              </p>
              <button
                className="button button-dark idea-retry"
                type="button"
                onClick={handleGenerate}
                disabled={generating}
              >
                Try again <Arrow diagonal />
              </button>
              <BriefDetails brief={brief} />
            </>
          ) : (
            <>
              <div className="idea-preview-top">
                <span className="status-label">WAITING FOR A BRIEF</span>
                <span className="muted tiny">Steps 01–05, then generate</span>
              </div>
              <h2 id="idea-preview-heading">Your ideas will appear here.</h2>
              <p className="muted small">
                Pick an approved hackathon, tell the generator about your skills, team, and time, then
                press <strong>Generate Ideas</strong>.
              </p>
            </>
          )}
        </section>
      </main>
      {detailIdea ? (
        <IdeaDetailsDialog
          idea={detailIdea}
          selected={selectedTitle === detailIdea.title}
          containerRef={detailRef}
          onClose={() => setDetailIdea(null)}
          onUse={handleUseIdea}
        />
      ) : null}
      {projectIdea ? (
        <ProjectCreateDialog
          idea={projectIdea}
          onClose={closeProjectDialog}
          onCreated={handleProjectCreated}
        />
      ) : null}
    </>
  );
}
