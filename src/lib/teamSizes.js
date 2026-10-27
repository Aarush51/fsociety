// Team size names used by the registration flow and its messages.
export const TEAM_SIZE_OPTIONS = [
  { size: 1, name: "Solo" },
  { size: 2, name: "Duo" },
  { size: 3, name: "Trio" },
  { size: 4, name: "Squad" },
  { size: 5, name: "Crew" },
  { size: 6, name: "Pack" },
];

export function teamSizeName(size) {
  return TEAM_SIZE_OPTIONS.find((option) => option.size === Number(size))?.name || `${size}`;
}

// Only offer sizes the hackathon allows; Solo is always available.
export function teamSizeChoices(max) {
  const limit = Math.min(Math.max(Number(max) || 4, 1), 6);
  return TEAM_SIZE_OPTIONS.filter((option) => option.size <= limit);
}

// The exact style of message asked for when friends + matching cannot fill the
// chosen size.
export function sizeRuleMessage(size, friendCount) {
  const people = 1 + friendCount;
  return `You picked ${teamSizeName(size)} (${size}) but only have ${people} ${
    people === 1 ? "person" : "people"
  }. Choose ${teamSizeName(people)}, add more friends by ID, or choose skill-based matching to fill the remaining spots.`;
}
