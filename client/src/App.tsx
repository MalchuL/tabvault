/**
 * Signal Library design reminder: TabVault favors a calm, Swiss-inspired research workspace;
 * use a warm paper base, deep ink contrast, and TabVault Orange only for meaningful actions.
 */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Router, Switch, type BaseLocationHook } from "wouter";
import { useBrowserLocation } from "wouter/use-browser-location";
import { useHashLocation } from "wouter/use-hash-location";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Home = lazy(() => import("./pages/Home"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Settings = lazy(() => import("./pages/Settings"));
const Transfer = lazy(() => import("./pages/Transfer"));

function isExtensionPage() {
  return window.location.protocol === "chrome-extension:";
}

const useNormalizedBrowserLocation: BaseLocationHook = () => {
  const [location, setLocation] = useBrowserLocation();
  const path = location.replace(/\/index\.html\/?$/, "") || "/";
  return [path, setLocation];
};

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/all-tabs" component={Home} />
      <Route path="/archive" component={Home} />
      <Route path="/collections" component={Home} />
      <Route path="/collections/:id" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/settings" component={Settings} />
      <Route path="/transfer" component={Transfer} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="bottom-right" richColors />
          <Suspense
            fallback={
              <main className="min-h-screen bg-[#f6f3ec] p-8 font-mono text-[10px] uppercase tracking-[0.12em] text-[#687067]">
                Opening library…
              </main>
            }
          >
            <Router
              hook={
                isExtensionPage()
                  ? useHashLocation
                  : useNormalizedBrowserLocation
              }
            >
              <AppRoutes />
            </Router>
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
