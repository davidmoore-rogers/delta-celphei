import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";
import { AppShell } from "./AppShell";
import { LoginPage } from "../features/auth/LoginPage";
import { Dashboard } from "../features/dashboard/Dashboard";
import { TicketList } from "../features/tickets/TicketList";
import { TicketDetail } from "../features/tickets/TicketDetail";
import { NewTicket } from "../features/tickets/NewTicket";
import { EventsPage } from "../features/events/EventsPage";
import { MyTeamPage } from "../features/team/MyTeamPage";
import { SettingsLayout } from "../features/settings/SettingsLayout";
import { Customization } from "../features/settings/Customization";
import { ApiTokens } from "../features/settings/ApiTokens";
import { ComingSoon } from "../features/settings/ComingSoon";
import { AdminUsers } from "../features/admin/AdminUsers";
import { AdminTeams } from "../features/admin/AdminTeams";
import { AdminGroups } from "../features/admin/AdminGroups";
import { AdminApprovalRules } from "../features/admin/approvalRules/AdminApprovalRules";
import { AdminTicketTypes } from "../features/admin/AdminTicketTypes";
import { TimeNtp } from "../features/settings/TimeNtp";
import { Certificates } from "../features/settings/Certificates";
import { Maintenances } from "../features/settings/Maintenances";
import { RequireAuth, RequireRole } from "./guards";

const protectedRoutes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "tickets", element: <TicketList /> },
      { path: "tickets/new", element: <NewTicket /> },
      { path: "tickets/:id", element: <TicketDetail /> },
      { path: "team", element: <RequireRole roles={["Manager", "Admin"]}><MyTeamPage /></RequireRole> },
      { path: "events", element: <RequireRole roles={["Admin"]}><EventsPage /></RequireRole> },
      { path: "admin/users", element: <RequireRole roles={["Admin"]}><AdminUsers /></RequireRole> },
      { path: "admin/teams", element: <RequireRole roles={["Admin"]}><AdminTeams /></RequireRole> },
      { path: "admin/groups", element: <RequireRole roles={["Admin"]}><AdminGroups /></RequireRole> },
      { path: "admin/approval-rules", element: <RequireRole roles={["Admin"]}><AdminApprovalRules /></RequireRole> },
      { path: "admin/ticket-types", element: <RequireRole roles={["Admin"]}><AdminTicketTypes /></RequireRole> },
      {
        path: "settings",
        element: <RequireRole roles={["Admin"]}><SettingsLayout /></RequireRole>,
        children: [
          { index: true, element: <Navigate to="customization" replace /> },
          { path: "customization", element: <Customization /> },
          { path: "time-ntp", element: <TimeNtp /> },
          { path: "certificates", element: <Certificates /> },
          { path: "maintenances", element: <Maintenances /> },
          { path: "api-tokens", element: <ApiTokens /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: <RequireAuth>{null}</RequireAuth>,
    children: protectedRoutes,
  },
]);
