import { useState, type ReactNode } from "react";
import {
  Archive,
  ArrowDownToLine,
  Boxes,
  Eye,
  LayoutDashboard,
  LayoutList,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { useLocation } from "wouter";

const navigation = [
  { href: "/", label: "All Tabs", Icon: LayoutList },
  { href: "/archive", label: "Archive", Icon: Archive },
  { href: "/hidden", label: "Hidden", Icon: Eye },
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/deduplicate", label: "Advanced cleanup", Icon: Sparkles },
  { href: "/transfer", label: "Import & Export", Icon: ArrowDownToLine },
  { href: "/settings", label: "Settings", Icon: Settings2 },
] as const;

/**
 * Keeps primary workspace navigation available around non-library routes.
 *
 * @param props - Routed page content rendered beside the responsive navigation rail.
 * @returns The shared application shell.
 */
export function WorkspaceSidebar({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f6f3ec] text-[#18261f] lg:pl-[274px]">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-md border border-[#ded9cd] bg-[#fffdf8] p-2 shadow-sm lg:hidden"
        aria-label="Open navigation"
      >
        <Boxes className="h-4 w-4" />
      </button>
      <aside
        data-testid="workspace-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-[274px] flex-col border-r border-[#ded9cd] bg-[#f9f7f1]/95 px-4 py-5 backdrop-blur-xl transition-transform duration-200 lg:translate-x-0 ${open ? "translate-x-0 shadow-[16px_0_50px_rgba(24,38,31,0.14)]" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <img
              src="/icon-128.png"
              alt="TabVault"
              className="h-9 w-9 object-contain"
            />
            <div>
              <span className="block font-['DM_Sans'] text-[19px] font-bold leading-none tracking-[-0.055em]">
                tabvault
              </span>
              <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-[#83867e]">
                local link library
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-2 text-[#777b74] hover:bg-[#ebe8df] lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav
          className="mt-8 flex-1 overflow-y-auto px-1"
          aria-label="Workspace"
        >
          <p className="mb-2 px-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#8e9189]">
            Browse
          </p>
          <div className="space-y-1">
            {navigation.map(({ href, label, Icon }) => {
              const active = location === href;
              return (
                <button
                  key={href}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setLocation(href);
                  }}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-left text-[13px] font-semibold transition ${active ? "border-[#e95224] bg-[#eeece4] text-[#18261f]" : "border-transparent text-[#666c65] hover:bg-[#efede6] hover:text-[#18261f]"}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </nav>
      </aside>
      {open ? (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-[#18261f]/20 lg:hidden"
          aria-label="Close navigation overlay"
        />
      ) : null}
      <div className="min-h-screen pt-14 lg:pt-0">{children}</div>
    </div>
  );
}
