import type { PersistedVault } from "./types";

export type LibraryState = PersistedVault;

type LibraryUpdate = {
  [Key in keyof LibraryState]-?: {
    type: "update";
    key: Key;
    value:
      | LibraryState[Key]
      | ((current: LibraryState[Key]) => LibraryState[Key]);
  };
}[keyof LibraryState];

export type LibraryAction =
  | { type: "replace"; vault: PersistedVault }
  | { type: "mutate"; update: (vault: PersistedVault) => PersistedVault }
  | LibraryUpdate;

/**
 * Apply one atomic vault replacement or field update.
 *
 * @param state - Current schema-v3 library state.
 * @param action - Replacement or typed field update.
 * @returns The next immutable library state.
 */
export function libraryReducer(
  state: LibraryState,
  action: LibraryAction
): LibraryState {
  if (action.type === "replace") return action.vault;
  if (action.type === "mutate") return action.update(state);
  const current = state[action.key];
  const value =
    typeof action.value === "function"
      ? (action.value as (item: typeof current) => typeof current)(current)
      : action.value;
  return { ...state, [action.key]: value };
}
