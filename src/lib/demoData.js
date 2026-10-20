// Sample content used whenever Supabase has no live rows (or is unreachable).
// Mirrors the data from the original vanilla-JS site.

export const events = [
  {
    id: "next-billion",
    category: "AI & MACHINE LEARNING",
    title: "Build for the next billion",
    organizer: "Hack the Future",
    date: "Oct 24–26",
    location: "Online",
    prize: "$12,000",
    accent: "lime",
    icon: "✳",
    tag: "POPULAR",
    deadline: "October 22, 2026",
    description:
      "Build thoughtful, accessible technology for the people who are too often left out of the conversation. Bring an idea, find your collaborators, and make something useful.",
    tracks: ["Accessible AI", "Digital inclusion", "Open innovation"],
  },
  {
    id: "climate-impact",
    category: "CLIMATE TECH",
    title: "Small ideas, big impact",
    organizer: "Greenhouse Labs",
    date: "Nov 01–03",
    location: "Austin, TX",
    prize: "$8,500",
    accent: "blue",
    icon: "↗",
    tag: "2 DAYS LEFT",
    deadline: "October 30, 2026",
    description:
      "Turn local climate challenges into practical, community-powered solutions. From cleaner campuses to greener neighborhoods, the next small idea could make a big difference.",
    tracks: ["Clean energy", "Circular campus", "Climate data"],
  },
  {
    id: "open-innovation",
    category: "OPEN INNOVATION",
    title: "Make the unthinkable",
    organizer: "Create / Connect",
    date: "Nov 08–10",
    location: "Online",
    prize: "$5,000",
    accent: "peach",
    icon: "⌘",
    tag: "NEW",
    deadline: "November 6, 2026",
    description:
      "A weekend for curious minds to experiment without a rulebook. Find a challenge you care about, build with a team, and share a prototype with the community.",
    tracks: ["Student life", "Creative tools", "Wildcard"],
  },
];

export const teammates = [
  {
    initials: "JK",
    name: "Jamie Kim",
    school: "UC Berkeley · Junior",
    role: "Full-stack developer",
    skills: ["React", "Python", "Figma"],
    color: "lime",
  },
  {
    initials: "AM",
    name: "Alex Morgan",
    school: "NYU · Sophomore",
    role: "Product designer",
    skills: ["UI/UX", "Figma", "Brand"],
    color: "blue",
  },
  {
    initials: "SR",
    name: "Sam Rivera",
    school: "Georgia Tech · Senior",
    role: "ML engineer",
    skills: ["Python", "PyTorch", "AI"],
    color: "peach",
  },
];

export const leaderboard = [
  { rank: "01", initials: "MP", name: "Maya Patel", school: "University of Michigan", points: "2,840", color: "lime", isDemo: true },
  { rank: "02", initials: "LC", name: "Leo Chen", school: "Stanford University", points: "2,610", color: "blue", isDemo: true },
  { rank: "03", initials: "AK", name: "Ava Kim", school: "Georgia Institute of Technology", points: "2,395", color: "peach", isDemo: true },
  { rank: "04", initials: "ON", name: "Omar Nasser", school: "UT Austin", points: "2,120", color: "lavender", isDemo: true },
];

export const leaderboardTiers = [
  { name: "Bronze", className: "bronze", minPoints: 0 },
  { name: "Silver", className: "silver", minPoints: 1500 },
  { name: "Gold", className: "gold", minPoints: 2500 },
  { name: "Platinum", className: "platinum", minPoints: 4000 },
  { name: "Diamond", className: "diamond", minPoints: 6000 },
  { name: "Elite", className: "elite", minPoints: 8500 },
  { name: "Champion", className: "champion", minPoints: 12000 },
  { name: "Unreal", className: "unreal", minPoints: 20000 },
];

// Canonical category labels, matching the rows in Supabase.
const demoCategories = {
  "next-billion": "AI & Machine Learning",
  "climate-impact": "Climate Tech",
  "open-innovation": "Open Innovation",
};

export const demoHackathons = events.map((event, index) => ({
  id: event.id,
  slug: event.id,
  title: event.title,
  organizer: event.organizer,
  description: event.description,
  category: demoCategories[event.id],
  location: event.location,
  prize: event.prize,
  registration_deadline: new Date(event.deadline).toISOString(),
  starts_at: new Date(
    `2026-${index === 0 ? "10-24" : index === 1 ? "11-01" : "11-08"}T09:00:00Z`,
  ).toISOString(),
  ends_at: new Date(
    `2026-${index === 0 ? "10-26" : index === 1 ? "11-03" : "11-10"}T18:00:00Z`,
  ).toISOString(),
  status: "upcoming",
}));

export const demoTeams = [
  {
    id: "demo-team-campus-climate",
    name: "Campus Climate Crew",
    description: "Building practical tools to make campus life more sustainable.",
    max_members: 4,
    members: [
      { id: "demo-jamie", full_name: "Jamie Kim", username: "jamiekim", role: "leader", skills: ["React", "Python", "Figma"], reputation: 4.8, review_count: 12 },
      { id: "demo-alex", full_name: "Alex Morgan", username: "alexmorgan", role: "member", skills: ["UI/UX", "Figma", "Brand"], reputation: 4.6, review_count: 8 },
    ],
  },
  {
    id: "demo-team-accessible-ai",
    name: "Open Door AI",
    description: "Exploring accessible AI ideas for the next billion people.",
    max_members: 5,
    members: [
      { id: "demo-sam", full_name: "Sam Rivera", username: "samrivera", role: "leader", skills: ["Python", "PyTorch", "AI"], reputation: 4.9, review_count: 15 },
      { id: "demo-maya", full_name: "Maya Patel", username: "mayapatel", role: "member", skills: ["Research", "Product", "Python"], reputation: 4.7, review_count: 11 },
      { id: "demo-leo", full_name: "Leo Chen", username: "leochen", role: "member", skills: ["JavaScript", "Prototyping"], reputation: 4.5, review_count: 6 },
    ],
  },
];
