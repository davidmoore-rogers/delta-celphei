import { useEffect } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { hasRole, useMe } from "../lib/auth";
import { useUIStore } from "../stores/uiStore";
import { queryClient } from "../lib/queryClient";
import { CommandPalette } from "../features/search/CommandPalette";

export function AppShell() {
  const { data: me } = useMe();
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const navigate = useNavigate();

  const logout = useMutation({
    mutationFn: () => api("/api/v1/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      navigate("/login");
    },
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setPaletteOpen]);

  const isAdmin = hasRole(me?.user.roles, "Admin");
  const isManagerOrAdmin = hasRole(me?.user.roles, "Manager", "Admin");

  return (
    <div className="h-screen flex flex-col bg-surface-1">
      <header className="h-14 bg-surface-2 border-b border-edge flex items-center px-4 gap-4">
        <Link to="/" className="flex items-center gap-2 font-semibold text-ink-1">
          <span className="text-brand">◆</span>
          <span>Celphei</span>
        </Link>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex-1 max-w-xl mx-auto flex items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-surface-3 border border-edge text-ink-3 hover:text-ink-2 hover:border-ink-3"
        >
          <span className="flex items-center gap-2 text-sm">
            <SearchIcon />
            Search tickets, tasks, users, assets…
          </span>
          <kbd className="text-xs px-1.5 py-0.5 rounded border border-edge bg-surface-2">⌘K</kbd>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-2 hidden md:inline">
            {me?.user.displayName ?? ""}
          </span>
          <button
            type="button"
            onClick={() => logout.mutate()}
            className="text-sm text-ink-3 hover:text-ink-1"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <nav className="w-56 shrink-0 bg-surface-2 border-r border-edge p-3 flex flex-col gap-1 text-sm">
          <SidebarLink to="/" label="Dashboard" />
          <SidebarLink to="/tickets" label="Tickets" />
          {isManagerOrAdmin && <SidebarLink to="/team" label="My Team" />}
          {isAdmin && <SidebarLink to="/events" label="Events" />}
          {isAdmin && (
            <>
              <div className="border-t border-edge my-2" />
              <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-ink-3">Admin</div>
              <SidebarLink to="/admin/users" label="Users" />
              <SidebarLink to="/admin/teams" label="Teams" />
              <SidebarLink to="/settings" label="Settings" />
            </>
          )}
        </nav>
        <main className="flex-1 overflow-auto scrollbar-thin">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}

function SidebarLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `px-3 py-2 rounded-md transition-colors ${
          isActive
            ? "bg-brand text-brand-fg font-medium"
            : "text-ink-2 hover:bg-surface-3 hover:text-ink-1"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
