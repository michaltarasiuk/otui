import { isDefined } from "#utils/is-defined.ts";

const SEVERITY_LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

const SEVERITY_NUMBERS_PER_LEVEL = 4;

export function severityLevel(severityNumber: number | null) {
  if (!isDefined(severityNumber)) {
    return null;
  }
  return SEVERITY_LEVELS[Math.floor((severityNumber - 1) / SEVERITY_NUMBERS_PER_LEVEL)] ?? null;
}

export function lowestSeverityNumber(level: SeverityLevel) {
  const levelIndex = SEVERITY_LEVELS.indexOf(level);
  return levelIndex * SEVERITY_NUMBERS_PER_LEVEL + 1;
}

export function isErrorLevel(level: SeverityLevel | null) {
  return level === "ERROR" || level === "FATAL";
}
