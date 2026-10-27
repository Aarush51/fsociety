import { useState } from "react";
import "./teams-feature.css";

// ---------------------------------------------------------------------------
// Shared options for the skills, interests and hobbies fields.
// ---------------------------------------------------------------------------
// The datalists below are suggestions only: any skill or interest can still be
// typed by hand, and a value that is not in the list is saved like any other.

export const COMMON_SKILLS = [
  "React",
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C++",
  "Go",
  "Node.js",
  "Express",
  "Django",
  "SQL",
  "Firebase",
  "Supabase",
  "AWS",
  "Docker",
  "Git",
  "HTML/CSS",
  "Tailwind CSS",
  "React Native",
  "Flutter",
  "Figma",
  "UI/UX",
  "Data analysis",
  "Machine learning",
  "Product",
  "Pitching",
];

export const COMMON_INTERESTS = [
  "education",
  "climate",
  "health",
  "accessibility",
  "sustainability",
  "social impact",
  "fintech",
  "developer tools",
  "open source",
  "AI",
  "robotics",
  "gaming",
  "civic tech",
  "mobility",
  "agriculture",
  "wellbeing",
  "media",
  "space",
  "sports",
  "e-commerce",
];

export const SKILL_LEVELS = [
  { value: 1, label: "1 · Learning" },
  { value: 2, label: "2 · Comfortable" },
  { value: 3, label: "3 · Confident" },
];

export const MAX_SKILLS = 20;
export const MAX_INTERESTS = 15;
export const MAX_SKILL_NAME = 40;
export const MAX_INTEREST_NAME = 40;
export const MAX_HOBBIES = 500;

const LEVEL_VALUES = SKILL_LEVELS.map((level) => level.value);

export function normalizeSkillName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_SKILL_NAME);
}

export function normalizeInterest(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_INTEREST_NAME);
}

function levelFrom(value) {
  const level = Number(value);
  return LEVEL_VALUES.includes(level) ? level : null;
}

// Same rules as public.clean_skill_levels() in the database: an object of
// { skillName: level } with levels 1..3, at most MAX_SKILLS entries, and no two
// names that differ only by case. Anything else — null, an array, a string,
// junk levels — reads as empty instead of throwing, so a profile saved before
// these columns existed can never break the form.
export function cleanSkillLevels(value) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;

  const seen = new Set();
  for (const key of Object.keys(value)) {
    if (Object.keys(result).length >= MAX_SKILLS) break;
    // A name that is blank or longer than the limit is dropped, not trimmed, so
    // this matches public.clean_skill_levels() exactly.
    const raw = String(key ?? "").trim();
    const level = levelFrom(value[key]);
    if (!raw || raw.length > MAX_SKILL_NAME || level === null) continue;
    const name = raw.replace(/\s+/g, " ");
    if (seen.has(name.toLocaleLowerCase())) continue;
    seen.add(name.toLocaleLowerCase());
    result[name] = level;
  }
  return result;
}

// Same rules as public.clean_interests() in the database.
export function cleanInterests(value) {
  const result = [];
  const seen = new Set();
  for (const item of Array.isArray(value) ? value : []) {
    if (result.length >= MAX_INTERESTS) break;
    // Same rule as the database: blank or over-long entries are dropped.
    const raw = String(item ?? "").trim();
    if (!raw || raw.length > MAX_INTEREST_NAME) continue;
    const name = raw.replace(/\s+/g, " ");
    if (seen.has(name.toLocaleLowerCase())) continue;
    seen.add(name.toLocaleLowerCase());
    result.push(name);
  }
  return result;
}

export function cleanHobbies(value) {
  return typeof value === "string" ? value.slice(0, MAX_HOBBIES) : "";
}

/**
 * Skills with levels, interests and hobbies — one reusable block for the signup
 * form and the profile editor.
 *
 * `skillLevels` is the { skillName: level } map stored in profiles.skills,
 * `interests` is profiles.interests and `hobbies` is profiles.hobbies. Every
 * prop defaults to empty, so a caller can render this before anything loads.
 * The parent owns the state; this component only reports changes back.
 */
export default function SkillsFields({
  skillLevels = {},
  interests = [],
  hobbies = "",
  onSkillLevelsChange,
  onInterestsChange,
  onHobbiesChange,
  disabled = false,
  id = "skills-fields",
  skillSuggestions = COMMON_SKILLS,
  interestSuggestions = COMMON_INTERESTS,
}) {
  const [skillDraft, setSkillDraft] = useState("");
  const [levelDraft, setLevelDraft] = useState(2);
  const [interestDraft, setInterestDraft] = useState("");
  const [note, setNote] = useState({ text: "", error: false });

  const levels = cleanSkillLevels(skillLevels);
  const entries = Object.entries(levels);
  const interestsList = cleanInterests(interests);

  const addSkill = (rawValue = skillDraft) => {
    const name = normalizeSkillName(rawValue);
    if (!name) return;
    if (entries.length >= MAX_SKILLS) {
      setNote({ text: `You can add up to ${MAX_SKILLS} skills.`, error: true });
      return;
    }
    const existing = entries.find(([key]) => key.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) {
      setNote({ text: `${existing[0]} is already listed — change its level instead.`, error: true });
      return;
    }
    onSkillLevelsChange?.({ ...levels, [name]: levelDraft });
    setSkillDraft("");
    setNote({ text: "", error: false });
  };

  const setSkillLevel = (name, level) => {
    const next = levelFrom(level);
    if (next === null) return;
    onSkillLevelsChange?.({ ...levels, [name]: next });
  };

  const removeSkill = (name) => {
    const next = { ...levels };
    delete next[name];
    onSkillLevelsChange?.(next);
    setNote({ text: "", error: false });
  };

  const addInterest = (rawValue = interestDraft) => {
    const name = normalizeInterest(rawValue);
    if (!name) return;
    if (interestsList.length >= MAX_INTERESTS) {
      setNote({ text: `You can add up to ${MAX_INTERESTS} interests.`, error: true });
      return;
    }
    if (interestsList.some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setNote({ text: `${name} is already listed.`, error: true });
      return;
    }
    onInterestsChange?.([...interestsList, name]);
    setInterestDraft("");
    setNote({ text: "", error: false });
  };

  const removeInterest = (name) => {
    onInterestsChange?.(interestsList.filter((item) => item !== name));
    setNote({ text: "", error: false });
  };

  const handleSkillKeyDown = (event) => {
    if (event.key !== "Enter") return;
    // Inside a form, Enter would submit it — add the skill instead.
    event.preventDefault();
    addSkill();
  };

  const handleInterestKeyDown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addInterest();
  };

  return (
    <div className="tf-fields">
      <div className="tf-block">
        <label htmlFor={`${id}-skill`}>
          Skills and levels{" "}
          <span className="muted tiny">Optional · pick a suggestion or type your own</span>
        </label>
        <div className="profile-skill-list" id={`${id}-skill-list`} aria-live="polite">
          {entries.length ? (
            entries.map(([name, level]) => (
              <span className="skill tf-skill" key={name}>
                <span className="tf-skill-name">{name}</span>
                <select
                  className="tf-level"
                  value={level}
                  aria-label={`Level for ${name}`}
                  disabled={disabled}
                  onChange={(event) => setSkillLevel(name, event.target.value)}
                >
                  {SKILL_LEVELS.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.value}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  disabled={disabled}
                  onClick={() => removeSkill(name)}
                >
                  ×
                </button>
              </span>
            ))
          ) : (
            <span className="muted tiny">Nothing added yet.</span>
          )}
        </div>
        <div className="profile-skill-entry">
          <input
            id={`${id}-skill`}
            name="skill_name"
            type="text"
            list={`${id}-skill-options`}
            autoComplete="off"
            maxLength={MAX_SKILL_NAME}
            placeholder="React, or type your own"
            disabled={disabled}
            value={skillDraft}
            onChange={(event) => setSkillDraft(event.target.value)}
            onKeyDown={handleSkillKeyDown}
          />
          <datalist id={`${id}-skill-options`}>
            {skillSuggestions.map((suggestion) => (
              <option value={suggestion} key={suggestion} />
            ))}
          </datalist>
          <select
            className="tf-level-picker"
            value={levelDraft}
            aria-label="Level for the skill you are adding"
            disabled={disabled}
            onChange={(event) => setLevelDraft(Number(event.target.value))}
          >
            {SKILL_LEVELS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            className="button button-outline"
            type="button"
            disabled={disabled}
            onClick={() => addSkill()}
          >
            Add
          </button>
        </div>
        <p className="muted tiny tf-hint">
          Level 1 learning · level 2 comfortable · level 3 confident. Up to {MAX_SKILLS} skills.
        </p>
      </div>

      <div className="tf-block">
        <label htmlFor={`${id}-interest`}>
          Interests <span className="muted tiny">Optional · what you want to build for</span>
        </label>
        <div className="profile-skill-list" id={`${id}-interest-list`} aria-live="polite">
          {interestsList.length ? (
            interestsList.map((interest) => (
              <span className="skill tf-skill" key={interest}>
                <span className="tf-skill-name">{interest}</span>
                <button
                  type="button"
                  aria-label={`Remove ${interest}`}
                  disabled={disabled}
                  onClick={() => removeInterest(interest)}
                >
                  ×
                </button>
              </span>
            ))
          ) : (
            <span className="muted tiny">Nothing added yet.</span>
          )}
        </div>
        <div className="profile-skill-entry">
          <input
            id={`${id}-interest`}
            name="interest_name"
            type="text"
            list={`${id}-interest-options`}
            autoComplete="off"
            maxLength={MAX_INTEREST_NAME}
            placeholder="climate, or type your own"
            disabled={disabled}
            value={interestDraft}
            onChange={(event) => setInterestDraft(event.target.value)}
            onKeyDown={handleInterestKeyDown}
          />
          <datalist id={`${id}-interest-options`}>
            {interestSuggestions.map((suggestion) => (
              <option value={suggestion} key={suggestion} />
            ))}
          </datalist>
          <button
            className="button button-outline"
            type="button"
            disabled={disabled}
            onClick={() => addInterest()}
          >
            Add
          </button>
        </div>
        <p className="muted tiny tf-hint">Up to {MAX_INTERESTS} interests.</p>
      </div>

      <div className="tf-block">
        <label htmlFor={`${id}-hobbies`}>
          Hobbies <span className="muted tiny">Optional</span>
        </label>
        <textarea
          id={`${id}-hobbies`}
          name="hobbies"
          rows="3"
          maxLength={MAX_HOBBIES}
          placeholder="Bouldering, chess, film photography…"
          disabled={disabled}
          value={cleanHobbies(hobbies)}
          onChange={(event) => onHobbiesChange?.(cleanHobbies(event.target.value))}
        />
      </div>

      <p
        className="form-message tf-note"
        role="status"
        aria-live="polite"
        data-error={note.error}
      >
        {note.text}
      </p>
    </div>
  );
}
