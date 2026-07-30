import { createBrowserRouter, Navigate } from "react-router-dom"
import { Layout } from "@/router/Layout"
import { CalendarEventRoute, EventsRedirect } from "@/components/CalendarEventRoute"
import { RecordPage } from "@/components/RecordPage"
import { TodayPage } from "@/pages/TodayPage"
import { InboxPage } from "@/pages/InboxPage"
import { CalendarPage } from "@/pages/CalendarPage"
import { AreasPage } from "@/pages/AreasPage"
import { ProgramsPage } from "@/pages/ProgramsPage"
import { ProjectsPage } from "@/pages/ProjectsPage"
import { TasksPage } from "@/pages/TasksPage"
import { OutcomesPage } from "@/pages/OutcomesPage"
import { DelegationsPage } from "@/pages/DelegationsPage"
import { ReviewsPage } from "@/pages/ReviewsPage"
import { PeoplePage } from "@/pages/PeoplePage"
import { OrganizationsPage } from "@/pages/OrganizationsPage"
import { LocationsPage } from "@/pages/LocationsPage"
import { PlacesPage } from "@/pages/PlacesPage"
import { MetricsPage } from "@/pages/MetricsPage"
import { HistoryPage } from "@/pages/HistoryPage"
import { JournalRoute } from "@/pages/JournalRoute"
import { CalendarSlotRoute } from "@/components/CalendarSlotRoute"
import { TimelinePage } from "@/pages/TimelinePage"
import { WhiteboardPage } from "@/pages/WhiteboardPage"
import { DuplicatesPage } from "@/pages/DuplicatesPage"
import { AgentsPage } from "@/pages/AgentsPage"
import { SettingsPage } from "@/pages/SettingsPage"
import {
  CommitmentsPage,
  DecisionsPage,
  MetricGroupsPage,
  ResourcesPage,
  RequestsPage,
} from "@/pages/simple"
import {
  AllergiesPage,
  InsurancePage,
  MedicationsPage,
  ProtocolsPage,
} from "@/pages/health"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      // One framing: every object opens full-page. A detail is a place you work,
      // and now that each carries a Log, a side pane is too narrow to write in.
      { index: true, element: <Navigate to="/today" replace /> },
      { path: "today", element: <TodayPage /> },
      { path: "inbox", element: <InboxPage /> },
      // Areas & Programs are containers you operate → full-page workspaces,
      // like Projects/Tasks below (Workbench, not a cramped pane).
      { path: "areas", element: <AreasPage /> },
      { path: "areas/:id", element: <RecordPage entityKey="area" backTo="/areas" backLabel="Areas" /> },
      { path: "programs", element: <ProgramsPage /> },
      { path: "programs/:id", element: <RecordPage entityKey="program" backTo="/programs" backLabel="Programs" /> },
      // Projects, Outcomes, Tasks are Workbenches: a full-width launcher list whose
      // rows open a full-page editable record, not a cramped side pane.
      { path: "projects", element: <ProjectsPage /> },
      { path: "projects/:id", element: <RecordPage entityKey="project" backTo="/projects" backLabel="Projects" /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "tasks/:id", element: <RecordPage entityKey="task" backTo="/tasks" backLabel="Tasks" /> },
      { path: "agents", element: <AgentsPage /> },
      // Routines have no standalone list/nav (they're protocol steps), but a routine
      // stays viewable when referenced (from a protocol, an area, or the review).
      { path: "routines/:id", element: <RecordPage entityKey="routine" backTo="/protocols" backLabel="Protocols" /> },
      { path: "outcomes", element: <OutcomesPage /> },
      { path: "outcomes/:id", element: <RecordPage entityKey="outcome" backTo="/outcomes" backLabel="Outcomes" /> },
      { path: "delegations", element: <DelegationsPage /> },
      { path: "delegations/:id", element: <RecordPage entityKey="delegation" backTo="/delegations" backLabel="Delegations" /> },
      { path: "requests", element: <RequestsPage /> },
      { path: "requests/:id", element: <RecordPage entityKey="request" backTo="/requests" backLabel="Requests" /> },
      // Review is a Workbench (you work in a review) — deep-linkable full-page record.
      { path: "reviews", element: <ReviewsPage /> },
      { path: "reviews/:id", element: <RecordPage entityKey="review" backTo="/reviews" backLabel="Review" /> },
      // People self-renders its detail from the :id param (keeps list state on
      // navigate); the empty child only makes /people/:id match + expose the param.
      { path: "people", element: <PeoplePage />, children: [{ path: ":id", element: <></> }] },
      { path: "organizations", element: <OrganizationsPage /> },
      { path: "organizations/:id", element: <RecordPage entityKey="organization" backTo="/organizations" backLabel="Organizations" /> },
      { path: "locations", element: <LocationsPage /> },
      { path: "places", element: <PlacesPage /> },
      { path: "locations/:id", element: <RecordPage entityKey="location" backTo="/locations" backLabel="Locations" /> },
      { path: "metrics", element: <MetricsPage /> },
      { path: "metric-groups", element: <MetricGroupsPage /> },
      { path: "metric-groups/:id", element: <RecordPage entityKey="metricGroup" backTo="/metric-groups" backLabel="Metric groups" /> },
      { path: "metrics/:id", element: <RecordPage entityKey="metric" backTo="/metrics" backLabel="Metrics" /> },
      { path: "medications", element: <MedicationsPage /> },
      { path: "medications/:id", element: <RecordPage entityKey="medication" backTo="/medications" backLabel="Medications" /> },
      { path: "protocols", element: <ProtocolsPage /> },
      { path: "protocols/:id", element: <RecordPage entityKey="protocol" backTo="/protocols" backLabel="Protocols" /> },
      { path: "insurance", element: <InsurancePage /> },
      { path: "insurance/:id", element: <RecordPage entityKey="insurancePlan" backTo="/insurance" backLabel="Insurance" /> },
      { path: "allergies", element: <AllergiesPage /> },
      { path: "allergies/:id", element: <RecordPage entityKey="allergy" backTo="/allergies" backLabel="Allergies" /> },
      // The Journal is a log like any other, scoped to `reflection`. It
      // self-renders its focused entry from the :id param like People, so
      // `/notes/:id` stays a live permalink for anything already written down
      // (bookmarks, push notifications, older mention chips).
      { path: "notes", element: <JournalRoute />, children: [{ path: ":id", element: <></> }] },
      // A moment is addressable wherever it appears — Backlinks, mention chips
      // and a record's Log all route here, whatever act the moment is.
      { path: "moments/:id", element: <RecordPage entityKey="moment" backTo="/notes" backLabel="Journal" /> },
      // Everything recorded, read downward like a core sample. The payoff of the
      // inversion: one query answers thirty years, because there is one spine.
      { path: "timeline", element: <TimelinePage /> },
      // The whiteboard is one buffer, not a collection — no list, no detail, no id.
      { path: "whiteboard", element: <WhiteboardPage /> },
      {
        path: "calendar",
        element: <CalendarPage />,
        children: [
          // A projected slot is addressed by (rule, occurrence_at) because it
          // has no id of its own; `slot` sits before `:id` so it is not read
          // as a moment id.
          { path: "slot/:ruleId", element: <CalendarSlotRoute /> },
          { path: ":id", element: <CalendarEventRoute /> },
        ],
      },
      // Events lost its standalone page (Calendar replaced it); keep old deep
      // links (Today, Coming-up, push notifications, bookmarks) alive.
      { path: "events", element: <EventsRedirect /> },
      { path: "events/:id", element: <EventsRedirect /> },
      { path: "commitments", element: <CommitmentsPage /> },
      { path: "commitments/:id", element: <RecordPage entityKey="commitment" backTo="/commitments" backLabel="Commitments" /> },
      { path: "decisions", element: <DecisionsPage /> },
      { path: "decisions/:id", element: <RecordPage entityKey="decision" backTo="/decisions" backLabel="Decisions" /> },
      { path: "resources", element: <ResourcesPage /> },
      { path: "resources/:id", element: <RecordPage entityKey="resource" backTo="/resources" backLabel="Resources" /> },
      { path: "history", element: <HistoryPage /> },
      { path: "duplicates", element: <DuplicatesPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
])
