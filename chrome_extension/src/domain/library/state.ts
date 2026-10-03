import type { PersistedVault } from "./types";

export type LibraryState = PersistedVault;

/** A field update within one library group. */
type GroupUpdate<Group extends "library" | "preferences"> = {
  [Key in keyof LibraryState[Group]]-?: {
    type: "update";
    group: Group;
    key: Key;
    value:
      | LibraryState[Group][Key]
      | ((current: LibraryState[Group][Key]) => LibraryState[Group][Key]);
  };
}[keyof LibraryState[Group]];

export type LibraryAction =
  | { type: "replace"; vault: PersistedVault }
  | { type: "mutate"; update: (vault: PersistedVault) => PersistedVault }
  | GroupUpdate<"library">
  | GroupUpdate<"preferences">;

/**
 * Apply one atomic replacement or update within a library group.
 * @param {LibraryState} state - Current schema-v5 library state.
 * @param {LibraryAction} action - Replacement or typed group-field update.
 * @returns {LibraryState} The next immutable library state.
 */
export function libraryReducer(
  state: LibraryState,
  action: LibraryAction
): LibraryState {
  if (action.type === "replace") return action.vault;
  if (action.type === "mutate") return action.update(state);
  const current =
    state[action.group][
      action.key as keyof (typeof state)[typeof action.group]
    ];
  const value =
    typeof action.value === "function"
      ? (action.value as (item: unknown) => unknown)(current)
      : action.value;
  return {
    ...state,
    [action.group]: { ...state[action.group], [action.key]: value },
  };
}
