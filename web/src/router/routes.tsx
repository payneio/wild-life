import { createBrowserRouter, Navigate } from "react-router-dom"
import { Layout } from "@/router/Layout"
import { TodayPage } from "@/pages/TodayPage"
import { AreasPage } from "@/pages/AreasPage"
import { ProjectsPage } from "@/pages/ProjectsPage"
import { TasksPage } from "@/pages/TasksPage"
import { RoutinesPage } from "@/pages/RoutinesPage"
import { GoalsPage } from "@/pages/GoalsPage"
import { DelegationsPage } from "@/pages/DelegationsPage"
import { ReviewsPage } from "@/pages/ReviewsPage"
import { PeoplePage } from "@/pages/PeoplePage"
import { MetricsPage } from "@/pages/MetricsPage"
import {
  CommitmentsPage,
  DecisionsPage,
  EventsPage,
  NotesPage,
  ProgramsPage,
  ResourcesPage,
  TagsPage,
  WaitingPage,
} from "@/pages/simple"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: "today", element: <TodayPage /> },
      { path: "areas", element: <AreasPage /> },
      { path: "programs", element: <ProgramsPage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "routines", element: <RoutinesPage /> },
      { path: "goals", element: <GoalsPage /> },
      { path: "delegations", element: <DelegationsPage /> },
      { path: "waiting", element: <WaitingPage /> },
      { path: "reviews", element: <ReviewsPage /> },
      { path: "people", element: <PeoplePage /> },
      { path: "metrics", element: <MetricsPage /> },
      { path: "notes", element: <NotesPage /> },
      { path: "events", element: <EventsPage /> },
      { path: "commitments", element: <CommitmentsPage /> },
      { path: "decisions", element: <DecisionsPage /> },
      { path: "resources", element: <ResourcesPage /> },
      { path: "tags", element: <TagsPage /> },
    ],
  },
])
