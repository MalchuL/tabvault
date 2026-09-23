import type { VaultGroup } from "./types";

/**
 * Name a captured session using the browser's local date and time.
 *
 * @param {Date} date - Local date used to name and timestamp the session.
 * @returns {string} Local date and time formatted as a session label.
 */
export function sessionName(date = new Date()): string {
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(
    date
  );
  /**
   * Pad a date component to two digits.
   *
   * Use zero padding in generated session names.
   * @param {number} value - Numeric date component.
   * @returns {string} Two-character date component.
   */
  const pad = (value: number) => String(value).padStart(2, "0");
  return `Session ${month} ${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Create the collection used by a browser capture at one consistent instant.
 *
 * @param {Date} date - Local date used to name and timestamp the session.
 * @returns {VaultGroup} New session collection with one consistent timestamp.
 */
export function createSessionGroup(date = new Date()): VaultGroup {
  const timestamp = date.toISOString();
  return {
    id: crypto.randomUUID(),
    name: sessionName(date),
    description: "Captured from the browser",
    category: "session",
    accent: "#829b65",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
