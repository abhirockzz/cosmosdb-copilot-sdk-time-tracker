import { TimeEntry } from "./cosmos";

interface TaskTemplate {
  description: string;
  project: string;
  tag: string;
  minMinutes: number;
  maxMinutes: number;
}

const PROFILES: Record<
  string,
  { tasks: TaskTemplate[]; entriesPerDay: [number, number] }
> = {
  alice: {
    entriesPerDay: [2, 5],
    tasks: [
      { description: "API endpoint refactoring", project: "engineering", tag: "backend", minMinutes: 45, maxMinutes: 180 },
      { description: "Code review for auth PR", project: "engineering", tag: "review", minMinutes: 15, maxMinutes: 45 },
      { description: "Debug payment webhook", project: "engineering", tag: "backend", minMinutes: 30, maxMinutes: 120 },
      { description: "API docs update", project: "docs", tag: "backend", minMinutes: 20, maxMinutes: 60 },
      { description: "Onboarding guide draft", project: "docs", tag: "review", minMinutes: 30, maxMinutes: 90 },
      { description: "Sprint planning", project: "meetings", tag: "planning", minMinutes: 30, maxMinutes: 60 },
      { description: "1:1 with manager", project: "meetings", tag: "planning", minMinutes: 25, maxMinutes: 30 },
      { description: "Database migration script", project: "engineering", tag: "backend", minMinutes: 60, maxMinutes: 150 },
    ],
  },
  bob: {
    entriesPerDay: [2, 4],
    tasks: [
      { description: "Wireframes for settings page", project: "design", tag: "frontend", minMinutes: 30, maxMinutes: 120 },
      { description: "Icon set audit", project: "design", tag: "frontend", minMinutes: 15, maxMinutes: 45 },
      { description: "Component library updates", project: "engineering", tag: "frontend", minMinutes: 45, maxMinutes: 120 },
      { description: "Sprint planning", project: "meetings", tag: "planning", minMinutes: 30, maxMinutes: 60 },
      { description: "Team standup", project: "meetings", tag: "planning", minMinutes: 10, maxMinutes: 15 },
      { description: "Review design system PR", project: "engineering", tag: "review", minMinutes: 20, maxMinutes: 60 },
      { description: "Responsive layout fixes", project: "engineering", tag: "frontend", minMinutes: 30, maxMinutes: 90 },
      { description: "User research synthesis", project: "design", tag: "planning", minMinutes: 40, maxMinutes: 100 },
    ],
  },
  carol: {
    entriesPerDay: [1, 3],
    tasks: [
      { description: "Deploy staging env", project: "ops", tag: "infra", minMinutes: 30, maxMinutes: 90 },
      { description: "Monitor alerting setup", project: "ops", tag: "infra", minMinutes: 45, maxMinutes: 120 },
      { description: "CI pipeline optimization", project: "ops", tag: "infra", minMinutes: 60, maxMinutes: 180 },
      { description: "Incident postmortem write-up", project: "ops", tag: "review", minMinutes: 30, maxMinutes: 60 },
      { description: "Sprint planning", project: "meetings", tag: "planning", minMinutes: 30, maxMinutes: 60 },
      { description: "1:1 with manager", project: "meetings", tag: "planning", minMinutes: 25, maxMinutes: 30 },
      { description: "Terraform module refactor", project: "engineering", tag: "infra", minMinutes: 60, maxMinutes: 150 },
      { description: "Security patch rollout", project: "ops", tag: "backend", minMinutes: 20, maxMinutes: 60 },
    ],
  },
};

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function generateSeedEntries(userId: string): TimeEntry[] {
  const profile = PROFILES[userId];
  if (!profile) {
    // Unknown user — use alice's profile as fallback
    return generateSeedEntries("alice").map((e) => ({ ...e, userId }));
  }

  const entries: TimeEntry[] = [];
  const now = new Date();

  // Generate entries for the last 30 days
  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    const day = new Date(now);
    day.setDate(day.getDate() - daysAgo);

    const [minEntries, maxEntries] = profile.entriesPerDay;
    const count = randInt(minEntries, maxEntries);

    // Start work between 8:30 and 9:30
    let currentHour = 8 + Math.random() * 1;
    let currentMinute = Math.random() * 60;

    const usedTasks = new Set<number>();

    for (let i = 0; i < count; i++) {
      // Pick a task we haven't used today
      let taskIdx: number;
      do {
        taskIdx = randInt(0, profile.tasks.length - 1);
      } while (usedTasks.has(taskIdx) && usedTasks.size < profile.tasks.length);
      usedTasks.add(taskIdx);

      const task = profile.tasks[taskIdx];
      const durationMinutes = randInt(task.minMinutes, task.maxMinutes);
      const durationSeconds = durationMinutes * 60;

      const startTime = new Date(day);
      startTime.setHours(Math.floor(currentHour), Math.floor(currentMinute), 0, 0);

      const stopTime = new Date(startTime.getTime() + durationSeconds * 1000);

      entries.push({
        userId,
        description: task.description,
        project: task.project,
        tag: task.tag,
        startTime: startTime.toISOString(),
        stopTime: stopTime.toISOString(),
        duration: durationSeconds,
      });

      // Add a 5-30 minute gap before next entry
      const gapMinutes = randInt(5, 30);
      const totalMinutes = durationMinutes + gapMinutes;
      currentHour += totalMinutes / 60;
      currentMinute = (currentMinute + totalMinutes) % 60;

      // Don't schedule past 18:00
      if (currentHour >= 18) break;
    }
  }

  return entries;
}
