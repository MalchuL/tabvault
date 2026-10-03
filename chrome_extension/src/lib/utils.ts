import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combine conditional class names and resolve conflicting Tailwind utilities.
 * @param {ClassValue[]} inputs - Class strings or conditional class values.
 * @returns {string} Merged class list for a component.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
