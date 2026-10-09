/**
 * Options for the code panel's "while it builds" screen: a mini-game to play and little
 * buddies that wander the panel and walk toward the cursor. Picked in Settings → General,
 * stored on LofinSettings (buildGame / buildBuddy / buildBuddyCount).
 */

export type BuildGameId = "snake" | "breakout" | "flappy" | "none";
export type BuildBuddyId = "cat" | "dog" | "penguin" | "dino" | "ghost" | "frog" | "duck" | "none";

export const BUILD_GAME_OPTIONS: { id: BuildGameId; label: string; note: string }[] = [
  { id: "snake", label: "Snake", note: "Arrows / WASD, or tap where to turn" },
  { id: "breakout", label: "Breakout", note: "Move the mouse to steer the paddle" },
  { id: "flappy", label: "Flappy", note: "Click or Space to flap" },
  { id: "none", label: "No game", note: "Just a calm progress screen" },
];

export const BUILD_BUDDY_OPTIONS: { id: BuildBuddyId; label: string; emoji: string }[] = [
  { id: "cat", label: "Cat", emoji: "🐈" },
  { id: "dog", label: "Dog", emoji: "🐕" },
  { id: "penguin", label: "Penguin", emoji: "🐧" },
  { id: "dino", label: "Dino", emoji: "🦖" },
  { id: "ghost", label: "Ghost", emoji: "👻" },
  { id: "frog", label: "Frog", emoji: "🐸" },
  { id: "duck", label: "Duck", emoji: "🦆" },
  { id: "none", label: "None", emoji: "🚫" },
];

export function buddyEmoji(id: BuildBuddyId): string | null {
  if (id === "none") return null;
  return BUILD_BUDDY_OPTIONS.find((b) => b.id === id)?.emoji ?? "🐈";
}
