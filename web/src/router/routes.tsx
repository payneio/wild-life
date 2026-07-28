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
import { WhiteboardPage } from "@/pages/WhiteboardPage"
import { DuplicatesPage } from "@/pages/DuplicatesPage"
import { AgentsPage } from "@/pages/AgentsPage"
import { SettingsPage } from "@/pages/SettingsPage"
import {
  CommitmentsPage,
  DecisionsPage,
  ResourcesPage,
  TagsPage,
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
      { path: "metrics/:id", element: <RecordPage entityKey="metric" backTo="/metrics" backLabel="Metrics" /> },
      { path: "medications", element: <MedicationsPage /> },
      { path: "medications/:id", element: <RecordPage entityKey="medication" backTo="/medications" backLabel="Medications" /> },
      { path: "protocols", element: <ProtocolsPage /> },
      { path: "protocols/:id", element: <RecordPage entityKey="protocol" backTo="/protocols" backLabel="Protocols" /> },
      { path: "insurance", element: <InsurancePage /> },
      { path: "insurance/:id", element: <RecordPage entityKey="insurancePlan" backTo="/insurance" backLabel="Insurance" /> },
      { path: "allergies", element: <AllergiesPage /> },
      { path: "allergies/:id", element: <RecordPage entityKey="allergy" backTo="/allergies" backLabel="Allergies" /> },
      // The Journal is a log like any other — the self Person's. It self-renders
      // its detail from the :id param like People, and `/notes/:id` stays the
      // permalink space for *any* note whatever its subject, since mention chips
      // and Backlinks route here.
      { path: "notes", element: <JournalRoute />, children: [{ path: ":id", element: <></> }] },
      // The whiteboard is one buffer, not a collection — no list, no detail, no id.
      { path: "whiteboard", element: <WhiteboardPage /> },
      {
        path: "calendar",
        element: <CalendarPage />,
        children: [{ path: ":id", element: <CalendarEventRoute /> }],
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
      { path: "tags", element: <TagsPage /> },
      { path: "tags/:id", element: <RecordPage entityKey="tag" backTo="/tags" backLabel="Tags" /> },
      { path: "history", element: <HistoryPage /> },
      { path: "duplicates", element: <DuplicatesPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
])
