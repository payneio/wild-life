import { useState } from "react"
import { NavLink, Outlet } from "react-router-dom"
import {
  Activity,
  Bookmark,
  Briefcase,
  Building2,
  Calendar,
  ClipboardCheck,
  FolderKanban,
  GitMerge,
  HeartHandshake,
  HeartPulse,
  History,
  Home,
  Hourglass,
  Layers,
  LineChart,
  ListChecks,
  LogOut,
  MapPin,
  Menu,
  NotebookPen,
  Pill,
  Repeat,
  Rocket,
  Scale,
  Send,
  ShieldPlus,
  StickyNote,
  Stethoscope,
  Tag as TagIcon,
  Target,
  TriangleAlert,
  Users,
  X,
} from "lucide-react"
import type { ComponentType } from "react"
import { useAuth } from "@/auth/context"
import { cn } from "@/lib/utils"

type Item = { to: string; label: string; icon: ComponentType<{ size?: number }> }

const PLAN: Item[] = [
  { to: "/today", label: "Today", icon: Home },
  { to: "/whiteboard", label: "Whiteboard", icon: StickyNote },
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

const HEALTH: Item[] = [
  { to: "/conditions", label: "Conditions", icon: Activity },
  { to: "/medications", label: "Medications", icon: Pill },
  { to: "/protocols", label: "Protocols", icon: HeartPulse },
  { to: "/health-events", label: "Health events", icon: Stethoscope },
  { to: "/insurance", label: "Insurance", icon: ShieldPlus },
  { to: "/allergies", label: "Allergies", icon: TriangleAlert },
]

const REFERENCE: Item[] = [
  { to: "/people", label: "People", icon: Users },
  { to: "/organizations", label: "Organizations", icon: Building2 },
  { to: "/locations", label: "Locations", icon: MapPin },
  { to: "/metrics", label: "Metrics", icon: LineChart },
  { to: "/notes", label: "Journal", icon: NotebookPen },
  { to: "/work-journal", label: "Work Journal", icon: Briefcase },
  { to: "/events", label: "Events", icon: Calendar },
  { to: "/commitments", label: "Commitments", icon: HeartHandshake },
  { to: "/decisions", label: "Decisions", icon: Scale },
  { to: "/resources", label: "Resources", icon: Bookmark },
  { to: "/tags", label: "Tags", icon: TagIcon },
  { to: "/history", label: "History", icon: History },
  { to: "/duplicates", label: "Duplicates", icon: GitMerge },
]

function NavItem({ item, onNavigate }: { item: Item; onNavigate?: () => void }) {
  const { icon: Icon, label, to } = item
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
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

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </div>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { logout } = useAuth()
  return (
    <div className="flex h-full flex-col px-3 py-4">
      <div className="px-3 pb-3 text-sm font-semibold text-slate-900">Personal</div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        {PLAN.map((i) => (
          <NavItem key={i.to} item={i} onNavigate={onNavigate} />
        ))}
        <GroupLabel>Health</GroupLabel>
        {HEALTH.map((i) => (
          <NavItem key={i.to} item={i} onNavigate={onNavigate} />
        ))}
        <GroupLabel>Reference</GroupLabel>
        {REFERENCE.map((i) => (
          <NavItem key={i.to} item={i} onNavigate={onNavigate} />
        ))}
      </nav>
      <button
        onClick={logout}
        className="mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        <LogOut size={16} />
        Sign out
      </button>
    </div>
  )
}

export function Layout() {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-52 shrink-0 border-r border-slate-200 bg-white md:block">
        <Sidebar />
      </aside>

      {/* Mobile off-canvas drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-slate-200 bg-white shadow-xl">
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-md p-1 text-slate-600 hover:bg-slate-100"
            aria-label="Menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="text-sm font-semibold text-slate-900">Personal</span>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <div className="w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
