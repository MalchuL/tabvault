import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { libraryReducer } from "./state";
import { vaultStorage } from "./storage";
import type { PersistedVault } from "./types";
import { LibraryContext } from "./library-context";

/**
 * Own the hydrated vault and persist every committed reducer transition.
 *
 * @param props - Initial compatible vault and routed descendants.
 * @returns Shared library state provider.
 */
export function LibraryProvider({
  initialVault,
  children,
}: {
  initialVault: PersistedVault;
  children: ReactNode;
}) {
  const [vault, dispatch] = useReducer(libraryReducer, initialVault);
  const [persistenceStatus, setPersistenceStatus] = useState<
    "saved" | "saving" | "error"
  >("saved");
  const writes = useRef(Promise.resolve());
  const revision = useRef(0);

  useEffect(() => {
    const currentRevision = ++revision.current;
    writes.current = writes.current
      .catch(() => undefined)
      .then(() => {
        setPersistenceStatus("saving");
        return vaultStorage.save(vault);
      })
      .then(() => {
        if (revision.current === currentRevision) setPersistenceStatus("saved");
      })
      .catch(() => {
        if (revision.current === currentRevision) setPersistenceStatus("error");
        toast.error("Could not write the local library");
      });
  }, [vault]);

  const value = useMemo(
    () => ({ vault, dispatch, persistenceStatus }),
    [vault, persistenceStatus]
  );
  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}
