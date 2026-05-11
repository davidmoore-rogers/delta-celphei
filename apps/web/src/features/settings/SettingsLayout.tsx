import { NavLink, Outlet } from "react-router-dom";

const TABS: { to: string; label: string }[] = [
  { to: "customization", label: "Customization" },
  { to: "time-ntp", label: "Time & NTP" },
  { to: "certificates", label: "Certificates" },
  { to: "maintenances", label: "Maintenances" },
  { to: "api-tokens", label: "API Tokens" },
];

export function SettingsLayout() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <div className="flex gap-1 border-b border-edge">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `px-4 py-2 text-sm border-b-2 -mb-px ${
                isActive
                  ? "border-brand text-ink-1"
                  : "border-transparent text-ink-3 hover:text-ink-1"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <div className="bg-surface-2 border border-edge rounded-lg p-6">
        <Outlet />
      </div>
    </div>
  );
}
