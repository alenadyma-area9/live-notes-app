export function generateNoteId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// Predefined color palette - vibrant colors with good contrast
const USER_COLORS = [
  "#F56565", // red
  "#ED8936", // orange
  "#ECC94B", // yellow
  "#48BB78", // green
  "#38B2AC", // teal
  "#4299E1", // blue
  "#667EEA", // indigo
  "#9F7AEA", // purple
  "#ED64A6", // pink
  "#FC8181", // light red
  "#F6AD55", // light orange
  "#68D391", // light green
  "#63B3ED", // light blue
  "#B794F4", // light purple
  "#F687B3", // light pink
  "#76E4F7", // cyan
];

// Generate a simple hash from a string
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Get color based on userId - deterministic and consistent
export function getColorForUser(userId: string): string {
  const hash = hashString(userId);
  return USER_COLORS[hash % USER_COLORS.length];
}

// Random color for initial assignment (legacy, still used for first-time users)
export function getRandomColor(): string {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

export function getRandomName(): string {
  const adjectives = ["Happy", "Clever", "Swift", "Bright", "Calm", "Bold", "Kind", "Wise", "Brave", "Quick"];
  const animals = ["Panda", "Fox", "Owl", "Tiger", "Eagle", "Dolphin", "Wolf", "Bear", "Hawk", "Lion"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adj} ${animal}`;
}
