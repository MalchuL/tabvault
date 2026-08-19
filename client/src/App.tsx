/**
 * Signal Library design reminder: TabVault favors a calm, Swiss-inspired research workspace;
 * use a warm paper base, deep ink contrast, and TabVault Orange only for meaningful actions.
 */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router, Switch, type BaseLocationHook } from "wouter";
import { useBrowserLocation } from "wouter/use-browser-location";
import { useHashLocation } from "wouter/use-hash-location";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Transfer from "./pages/Transfer";

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
          <Router
            hook={
              isExtensionPage() ? useHashLocation : useNormalizedBrowserLocation
            }
          >
            <AppRoutes />
          </Router>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
