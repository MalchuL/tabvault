import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { libraryReducer, type LibraryAction } from "./state";
import { LibraryContext } from "./library-context";
import { commitLibrary, LIBRARY_CHANGED } from "./store";
import {
  readBrowserVault,
  readStorageMode,
  readSyncStatus,
  readLibraryRefreshInterval,
  type SyncStatus,
} from "@/domain/server/browserStorage";
import { requestLibrarySync } from "@/domain/server/sync";
import type { PersistedVault } from "./types";
/** Subscribe React to committed library data; persistence and network work live outside rendering. @param {{initialVault:PersistedVault;children:ReactNode}} props - Hydrated library and consumers. @returns {React.ReactElement} Library context. */
export function LibraryProvider({
  initialVault,
  children,
}: {
  initialVault: PersistedVault;
  children: ReactNode;
}) {
  const [vault, setVault] = useState(initialVault);
  const [persistenceStatus, setPersistenceStatus] = useState<
    "saved" | "saving" | "error"
  >("saved");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>();
  const synchronize = useCallback(async () => {
    try {
      await requestLibrarySync();
    } finally {
      setSyncStatus(await readSyncStatus());
    }
  }, []);
  const mutate = useCallback(
    async (update: (vault: PersistedVault) => PersistedVault) => {
      setPersistenceStatus("saving");
      try {
        const result = await commitLibrary(update);
        setVault(result);
        setPersistenceStatus("saved");
        void synchronize().catch(error =>
          toast.error(
            error instanceof Error ? error.message : "Synchronization failed"
          )
        );
        return result;
      } catch (error) {
        setPersistenceStatus("error");
        toast.error("Could not save the local library");
        throw error;
      }
    },
    [synchronize]
  );
  const dispatch = useCallback(
    (action: LibraryAction) => {
      void mutate(current => libraryReducer(current, action)).catch(
        () => undefined
      );
    },
    [mutate]
  );
  useEffect(() => {
    let active = true;
    const reload = () => {
      void Promise.all([readBrowserVault(), readSyncStatus()]).then(
        ([next, status]) => {
          if (active) {
            if (next) setVault(next);
            setSyncStatus(status);
          }
        }
      );
    };
    const changed = (changes: Record<string, unknown>) => {
      if ("tabvault-v3" in changes || "tabvault-sync-status" in changes)
        reload();
    };
    globalThis.addEventListener(LIBRARY_CHANGED, reload);
    window.addEventListener("storage", reload);
    globalThis.chrome?.storage?.onChanged?.addListener(changed);
    return () => {
      active = false;
      globalThis.removeEventListener(LIBRARY_CHANGED, reload);
      window.removeEventListener("storage", reload);
      globalThis.chrome?.storage?.onChanged?.removeListener(changed);
    };
  }, []);
  useEffect(() => {
    void synchronize().catch(() => undefined);
    const online = () => void synchronize().catch(() => undefined);
    window.addEventListener("online", online);
    const timer = window.setInterval(() => {
      void (async () => {
        if (
          globalThis.chrome?.runtime?.id ||
          (await readStorageMode()) !== "backend"
        )
          return;
        const current = await readBrowserVault();
        const status = await readSyncStatus();
        const interval = await readLibraryRefreshInterval();
        if (
          Object.keys(current?.sync.pending ?? {}).length ||
          (interval > 0 &&
            Date.now() - (status?.serverSyncedAt ?? 0) >= interval * 1000)
        )
          await synchronize();
      })().catch(() => undefined);
    }, 30_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", online);
    };
  }, [synchronize]);
  const value = useMemo(
    () => ({
      vault,
      dispatch,
      mutate,
      persistenceStatus,
      syncStatus,
      synchronize,
    }),
    [vault, dispatch, mutate, persistenceStatus, syncStatus, synchronize]
  );
  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}
