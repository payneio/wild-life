import { NavLink, Outlet } from "react-router-dom"
import {
  Bookmark,
  Calendar,
  ClipboardCheck,
  FolderKanban,
  HeartHandshake,
  Home,
  Hourglass,
  Layers,
  LineChart,
  ListChecks,
  LogOut,
  NotebookPen,
  Repeat,
  Rocket,
  Scale,
  Send,
  Tag as TagIcon,
  Target,
  Users,
} from "lucide-react"
import type { ComponentType } from "react"
import { useAuth } from "@/auth/context"
import { cn } from "@/lib/utils"

type Item = { to: string; label: string; icon: ComponentType<{ size?: number }> }

const PLAN: Item[] = [
  { to: "/today", label: "Today", icon: Home },
  { to: "/areas", label: "Areas", icon: Layers },
  { to: "/programs", label: "Programs", icon: Rocket },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/routines", label: "Routines", icon: Repeat },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/delegations", label: "Delegations", icon: Send },
  { to: "/waiting", label: "Waiting", icon: Hourglass },
  { to: "/reviews", label: "Review", icon: ClipboardCheck },
]

const REFERENCE: Item[] = [
  { to: "/people", label: "People", icon: Users },
  { to: "/metrics", label: "Metrics", icon: LineChart },
  { to: "/notes", label: "Notes", icon: NotebookPen },
  { to: "/events", label: "Events", icon: Calendar },
  { to: "/commitments", label: "Commitments", icon: HeartHandshake },
  { to: "/decisions", label: "Decisions", icon: Scale },
  { to: "/resources", label: "Resources", icon: Bookmark },
  { to: "/tags", label: "Tags", icon: TagIcon },
]

function NavItem({ item }: { item: Item }) {
  const { icon: Icon, label, to } = item
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
          isActive
            ? "bg-indigo-50 text-indigo-700"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
        )
      }
    >
      <Icon size={16} />
      {label}
    </NavLink>
  )
}

export function Layout() {
  const { logout } = useAuth()
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4">
        <div className="px-3 pb-3 text-sm font-semibold text-slate-900">Personal</div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto">
          {PLAN.map((i) => (
            <NavItem key={i.to} item={i} />
          ))}
          <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Reference
          </div>
          {REFERENCE.map((i) => (
            <NavItem key={i.to} item={i} />
          ))}
        </nav>
        <button
          onClick={logout}
          className="mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </aside>
      <main className="min-w-0 flex-1 px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
