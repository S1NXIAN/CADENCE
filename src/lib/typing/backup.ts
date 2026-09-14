import type { LearningData, Settings, StatsData } from "@/lib/typing/types";
import { exportData } from "@/lib/typing/storage";

/**
 * Serialize the full local state (settings + learning profile + stats) and
 * hand it to the browser as a dated JSON download.
 */
export function downloadBackup(settings: Settings, learning: LearningData, stats: StatsData): void {
  const json = exportData(settings, learning, stats);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cadence-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
