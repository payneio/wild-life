import { createBrowserRouter, Navigate } from "react-router-dom"
import { Layout } from "@/router/Layout"
import { EntityDetailRoute } from "@/components/EntityDetailRoute"
import { CalendarEventRoute, EventsRedirect } from "@/components/CalendarEventRoute"
import { RecordPage } from "@/components/RecordPage"
import { TodayPage } from "@/pages/TodayPage"
import { InboxPage } from "@/pages/InboxPage"
import { CalendarPage } from "@/pages/CalendarPage"
import { AreasPage } from "@/pages/AreasPage"
import { ProjectsPage } from "@/pages/ProjectsPage"
import { TasksPage } from "@/pages/TasksPage"
import { RoutinesPage } from "@/pages/RoutinesPage"
import { GoalsPage } from "@/pages/GoalsPage"
import { DelegationsPage } from "@/pages/DelegationsPage"
import { ReviewsPage } from "@/pages/ReviewsPage"
import { PeoplePage } from "@/pages/PeoplePage"
import { OrganizationsPage } from "@/pages/OrganizationsPage"
import { LocationsPage } from "@/pages/LocationsPage"
import { MetricsPage } from "@/pages/MetricsPage"
import { HistoryPage } from "@/pages/HistoryPage"
import { NotesPage } from "@/pages/NotesPage"
import { DuplicatesPage } from "@/pages/DuplicatesPage"
import { AgentsPage } from "@/pages/AgentsPage"
import {
  CommitmentsPage,
  DecisionsPage,
  ProgramsPage,
  ResourcesPage,
  TagsPage,
  RequestsPage,
} from "@/pages/simple"
import {
  AllergiesPage,
  ConditionsPage,
  InsurancePage,
  MedicationsPage,
  ProtocolsPage,
} from "@/pages/health"

/** A list route with a deep-linkable `/:id` detail child. */
function withDetail(path: string, element: React.ReactNode, entityKey: string) {
  return {
    path,
    element,
    children: [{ path: ":id", element: <EntityDetailRoute entityKey={entityKey} /> }],
  }
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: "today", element: <TodayPage /> },
      { path: "inbox", element: <InboxPage /> },
      // Areas & Programs are containers you operate → full-page workspaces,
      // like Projects/Goals/Tasks below (Workbench, not a cramped pane).
      { path: "areas", element: <AreasPage /> },
      { path: "areas/:id", element: <RecordPage entityKey="area" backTo="/areas" backLabel="Areas" /> },
      { path: "programs", element: <ProgramsPage /> },
      { path: "programs/:id", element: <RecordPage entityKey="program" backTo="/programs" backLabel="Programs" /> },
      // Projects, Goals, Tasks are Workbenches: a full-width launcher list whose
      // rows open a full-page editable record, not a cramped side pane.
      { path: "projects", element: <ProjectsPage /> },
      { path: "projects/:id", element: <RecordPage entityKey="project" backTo="/projects" backLabel="Projects" /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "tasks/:id", element: <RecordPage entityKey="task" backTo="/tasks" backLabel="Tasks" /> },
      { path: "agents", element: <AgentsPage /> },
      withDetail("routines", <RoutinesPage />, "routine"),
      { path: "goals", element: <GoalsPage /> },
      { path: "goals/:id", element: <RecordPage entityKey="goal" backTo="/goals" backLabel="Goals" /> },
      withDetail("delegations", <DelegationsPage />, "delegation"),
      withDetail("requests", <RequestsPage />, "request"),
      // Review is a Workbench (you work in a review) — deep-linkable full-page record.
      { path: "reviews", element: <ReviewsPage /> },
      { path: "reviews/:id", element: <RecordPage entityKey="review" backTo="/reviews" backLabel="Review" /> },
      // People self-renders its detail from the :id param (keeps list state on
      // navigate); the empty child only makes /people/:id match + expose the param.
      { path: "people", element: <PeoplePage />, children: [{ path: ":id", element: <></> }] },
      withDetail("organizations", <OrganizationsPage />, "organization"),
      withDetail("locations", <LocationsPage />, "location"),
      withDetail("metrics", <MetricsPage />, "metric"),
      // Condition is the health hub (it contains meds/protocols/labs/goals) →
      // full-page workbench with related panels, like Area/Project.
      { path: "conditions", element: <ConditionsPage /> },
      { path: "conditions/:id", element: <RecordPage entityKey="condition" backTo="/conditions" backLabel="Conditions" /> },
      withDetail("medications", <MedicationsPage />, "medication"),
      withDetail("protocols", <ProtocolsPage />, "protocol"),
      withDetail("insurance", <InsurancePage />, "insurancePlan"),
      withDetail("allergies", <AllergiesPage />, "allergy"),
      // Notes is a bespoke page (markdown + @-mentions); it self-renders its
      // detail from the :id param like People. The same component backs the
      // personal Journal and the Microsoft Work Journal, scoped by the work tag.
      { path: "notes", element: <NotesPage scope="personal" />, children: [{ path: ":id", element: <></> }] },
      { path: "whiteboard", element: <NotesPage scope="whiteboard" />, children: [{ path: ":id", element: <></> }] },
      {
        path: "calendar",
        element: <CalendarPage />,
        children: [{ path: ":id", element: <CalendarEventRoute /> }],
      },
      // Events lost its standalone page (Calendar replaced it); keep old deep
      // links (Today, Coming-up, push notifications, bookmarks) alive.
      { path: "events", element: <EventsRedirect /> },
      { path: "events/:id", element: <EventsRedirect /> },
      withDetail("commitments", <CommitmentsPage />, "commitment"),
      withDetail("decisions", <DecisionsPage />, "decision"),
      withDetail("resources", <ResourcesPage />, "resource"),
      withDetail("tags", <TagsPage />, "tag"),
      { path: "history", element: <HistoryPage /> },
      { path: "duplicates", element: <DuplicatesPage /> },
    ],
  },
])
