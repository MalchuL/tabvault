/**
 * Signal Library design reminder: TabVault favors a calm, Swiss-inspired research workspace;
 * use a warm paper base, deep ink contrast, and TabVault Orange only for meaningful actions.
 */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Route, Router, Switch, type BaseLocationHook } from "wouter";
import { useBrowserLocation } from "wouter/use-browser-location";
import { useHashLocation } from "wouter/use-hash-location";
import ErrorBoundary from "@/components/shell/ErrorBoundary";
import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar";
import { ThemeProvider } from "./contexts/ThemeContext";
import {
  clearBrowserLibrary,
  inspectBrowserVault,
  type BrowserVaultInspection,
} from "@/domain/server/browserStorage";
import { StorageRecovery } from "./pages/StorageRecovery";
import { LibraryProvider } from "./domain/library/LibraryProvider";
import { emptyBrowserVault } from "@/domain/library/codec";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Deduplicator = lazy(() => import("./pages/Deduplicator"));
const Home = lazy(() => import("./pages/Home"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Settings = lazy(() => import("./pages/Settings"));
const CustomProperties = lazy(() => import("./pages/CustomProperties"));
const Transfer = lazy(() => import("./pages/Transfer"));

/**
 * Detect the extension page, which needs hash routes under its fixed URL.
 * @returns {boolean} Whether the current page uses the extension protocol.
 */
function isExtensionPage() {
  return window.location.protocol === "chrome-extension:";
}

/**
 * Keep the web route stable when a static host exposes `/index.html`.
 *
 * @returns {[string, <S = any>(to: string | URL, options?: { replace?: boolean; state?: S; }) => void]} Normalized location and navigation callback.
 */
const useNormalizedBrowserLocation: BaseLocationHook = () => {
  const [location, setLocation] = useBrowserLocation();
  const path = location.replace(/\/index\.html\/?$/, "") || "/";
  return [path, setLocation];
};

/**
 * Map workspace paths to lazily loaded pages.
 * @returns {JSX.Element} The route switch, including the fallback page.
 */
function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/all-tabs" component={Home} />
      <Route path="/archive" component={Home} />
      <Route path="/hidden" component={Home} />
      <Route path="/collections" component={Home} />
      <Route path="/collections/:id" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/deduplicate" component={Deduplicator} />
      <Route path="/settings" component={Settings} />
      <Route path="/custom-properties" component={CustomProperties} />
      <Route path="/transfer" component={Transfer} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * Keep the shared sidebar visible while a route bundle loads.
 * @returns {JSX.Element} Workspace shell and current route.
 */
function AppWorkspace() {
  return (
    <WorkspaceSidebar>
      <Suspense
        fallback={
          <div
            role="status"
            aria-label="Loading page"
            className="mx-auto max-w-6xl space-y-5 p-6 sm:p-8"
          >
            <div className="h-8 w-40 rounded bg-muted motion-safe:animate-pulse" />
            <div className="h-10 rounded bg-muted motion-safe:animate-pulse" />
            <div className="h-48 rounded bg-muted motion-safe:animate-pulse" />
            <span className="sr-only">Loading page…</span>
          </div>
        }
      >
        <AppRoutes />
      </Suspense>
    </WorkspaceSidebar>
  );
}

/**
 * Inspect browser storage before allowing the library provider to start.
 * Incompatible data stays untouched until the user downloads or clears it.
 * @param {{ children: ReactNode }} props - Workspace rendered after inspection.
 * @returns {JSX.Element} Loading, recovery, or initialized library UI.
 */
function BrowserSchemaGate({ children }: { children: ReactNode }) {
  const [inspection, setInspection] = useState<BrowserVaultInspection>();
  useEffect(() => {
    void inspectBrowserVault().then(setInspection);
  }, []);
  if (!inspection)
    return (
      <main className="min-h-screen bg-[#f6f3ec] p-8">
        Checking browser library…
      </main>
    );
  if (inspection.status === "incompatible")
    return (
      <StorageRecovery
        raw={inspection.raw}
        storageKey={inspection.storageKey}
        onClear={async () => {
          await clearBrowserLibrary();
          setInspection(await inspectBrowserVault());
        }}
      />
    );
  return (
    <LibraryProvider
      initialVault={
        inspection.status === "compatible"
          ? inspection.vault
          : emptyBrowserVault()
      }
    >
      {children}
    </LibraryProvider>
  );
}

/**
 * Mount application providers and choose routing for web or extension pages.
 * @returns {JSX.Element} Root application UI.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="bottom-right" richColors />
          <BrowserSchemaGate>
            <Router
              hook={
                isExtensionPage()
                  ? useHashLocation
                  : useNormalizedBrowserLocation
              }
            >
              <AppWorkspace />
            </Router>
          </BrowserSchemaGate>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
