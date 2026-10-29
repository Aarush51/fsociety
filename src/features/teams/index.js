// Public surface of the team formation feature.
//
// Only the skills/interests/hobbies fields live here today; teamLogic.js,
// TeamFormation.jsx and Reviews.jsx do not exist in this repository, so nothing
// is exported (or faked) for them. Add them here once they land.

export { default as SkillsFields } from "./SkillsFields";
export {
  COMMON_INTERESTS,
  COMMON_SKILLS,
  MAX_HOBBIES,
  MAX_INTERESTS,
  MAX_SKILLS,
  MAX_SKILL_NAME,
  MAX_INTEREST_NAME,
  SKILL_LEVELS,
  cleanHobbies,
  cleanInterests,
  cleanSkillLevels,
  normalizeInterest,
  normalizeSkillName,
} from "./SkillsFields";
