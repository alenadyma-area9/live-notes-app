export function generateNoteId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function getRandomColor(): string {
  const colors = [
    "#F56565", // red
    "#ED8936", // orange
    "#ECC94B", // yellow
    "#48BB78", // green
    "#38B2AC", // teal
    "#4299E1", // blue
    "#667EEA", // indigo
    "#9F7AEA", // purple
    "#ED64A6", // pink
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function getRandomName(): string {
  const adjectives = ["Happy", "Clever", "Swift", "Bright", "Calm", "Bold", "Kind", "Wise"];
  const animals = ["Panda", "Fox", "Owl", "Tiger", "Eagle", "Dolphin", "Wolf", "Bear"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adj} ${animal}`;
}
