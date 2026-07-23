import { useEffect, useState } from "react"
import { NavLink, Outlet } from "react-router-dom"
import {
  Activity,
  Bell,
  BellOff,
  Bookmark,
  CalendarDays,
  Building2,
  ClipboardCheck,
  FolderKanban,
  GitMerge,
  HeartHandshake,
  HeartPulse,
  History,
  Home,
  Hourglass,
  Inbox,
  Layers,
  Bot,
  LayoutGrid,
  LineChart,
  ListChecks,
  LogOut,
  MapPin,
  Moon,
  NotebookPen,
  Pill,
  Repeat,
  Rocket,
  Scale,
  Send,
  ShieldPlus,
  StickyNote,
  Sun,
  Settings as SettingsIcon,
  Tag as TagIcon,
  Target,
  TriangleAlert,
  Users,
  X,
} from "lucide-react"
import type { ComponentType } from "react"
import { useAuth } from "@/auth/context"
import { GlobalSearch } from "@/components/GlobalSearch"
import { OverflowDebug } from "@/components/OverflowDebug"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { FloatingNoteWindow } from "@/notes/FloatingNoteWindow"
import { useFloatingNote } from "@/notes/floatingNoteContext"
import { useReviewDashboard } from "@/services/api/hooks"
import {
  disablePush,
  enablePush,
  getPushState,
  sendTestPush,
  type PushState,
} from "@/services/push"

type Item = { to: string; label: string; icon: ComponentType<{ size?: number }> }

const PLAN: Item[] = [
  { to: "/today", label: "Today", icon: Home },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/whiteboard", label: "Whiteboard", icon: StickyNote },
  { to: "/areas", label: "Areas", icon: Layers },
  { to: "/programs", label: "Programs", icon: Rocket },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/routines", label: "Routines", icon: Repeat },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/delegations", label: "Delegations", icon: Send },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/requests", label: "Requests", icon: Hourglass },
  { to: "/reviews", label: "Review", icon: ClipboardCheck },
]

const HEALTH: Item[] = [
  { to: "/conditions", label: "Conditions", icon: Activity },
  { to: "/medications", label: "Medications", icon: Pill },
  { to: "/protocols", label: "Protocols", icon: HeartPulse },
  { to: "/insurance", label: "Insurance", icon: ShieldPlus },
  { to: "/allergies", label: "Allergies", icon: TriangleAlert },
]

const REFERENCE: Item[] = [
  { to: "/people", label: "People", icon: Users },
  { to: "/organizations", label: "Organizations", icon: Building2 },
  { to: "/locations", label: "Locations", icon: MapPin },
  { to: "/metrics", label: "Metrics", icon: LineChart },
  { to: "/notes", label: "Journal", icon: NotebookPen },
  { to: "/commitments", label: "Commitments", icon: HeartHandshake },
  { to: "/decisions", label: "Decisions", icon: Scale },
  { to: "/resources", label: "Resources", icon: Bookmark },
  { to: "/tags", label: "Tags", icon: TagIcon },
  { to: "/history", label: "History", icon: History },
  { to: "/duplicates", label: "Duplicates", icon: GitMerge },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
]

/** Bottom-bar destinations on mobile (last opens the full-nav sheet). */
const MOBILE_TABS: Item[] = [
  { to: "/today", label: "Today", icon: Home },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/notes", label: "Journal", icon: NotebookPen },
  { to: "/people", label: "People", icon: Users },
]

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-indigo-500 to-indigo-700 text-on-accent shadow-sm">
        <LayoutGrid size={17} />
      </span>
      <span className="hidden text-[15px] font-semibold tracking-tight text-slate-900 sm:inline">
        Wild Life
      </span>
    </div>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      title={theme === "dark" ? "Switch to light" : "Switch to dark"}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}

function ReminderToggle() {
  const [state, setState] = useState<PushState>("default")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getPushState().then(setState)
  }, [])

  if (state === "unsupported") return null

  const on = state === "subscribed"
  const title =
    state === "denied"
      ? "Notifications blocked in browser settings"
      : on
        ? "Reminders on — click to turn off"
        : "Enable reminder notifications"

  const onClick = async () => {
    if (busy || state === "denied") return
    setBusy(true)
    try {
      setState(on ? await disablePush() : await enablePush())
    } catch {
      setState(await getPushState())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center">
      <button
        onClick={onClick}
        disabled={busy || state === "denied"}
        aria-label="Toggle reminders"
        title={title}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg transition",
          on
            ? "text-indigo-600 hover:bg-indigo-50"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
          (busy || state === "denied") && "opacity-50",
        )}
      >
        {on ? <Bell size={18} /> : <BellOff size={18} />}
      </button>
      {on && (
        <button
          onClick={() => void sendTestPush()}
          title="Send a test notification"
          className="flex h-9 items-center rounded-lg px-2 text-xs font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          Test
        </button>
      )}
    </div>
  )
}

function NavItem({ item, onNavigate }: { item: Item; onNavigate?: () => void }) {
  const { icon: Icon, label, to } = item
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
          isActive
            ? "bg-indigo-50 text-indigo-700"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-indigo-600 transition-opacity",
              isActive ? "opacity-100" : "opacity-0",
            )}
          />
          <Icon size={17} />
          {label}
          {to === "/inbox" && <InboxBadge />}
        </>
      )}
    </NavLink>
  )
}

/** Pending-triage count on the Inbox nav item (notes + non-synced events). */
function InboxBadge() {
  const { data } = useReviewDashboard()
  const n = (data?.unrooted_notes_count ?? 0) + (data?.unrooted_events_count ?? 0)
  if (!n) return null
  return (
    <span className="ml-auto rounded-full bg-indigo-100 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">
      {n}
    </span>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
      {children}
    </div>
  )
}

function NavSections({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
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
    </>
  )
}

function Sidebar() {
  const { logout } = useAuth()
  return (
    <div className="flex h-full flex-col px-3 py-4">
      <div className="px-2 pb-4">
        <Brand />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto pr-1">
        <NavSections />
      </nav>
      <button
        onClick={logout}
        className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <LogOut size={17} />
        Sign out
      </button>
    </div>
  )
}

/** Full-screen nav sheet reached from the mobile bottom bar's "More" tab. */
function MoreSheet({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth()
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm motion-safe:animate-[fadeIn_120ms_ease-out]"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 top-16 rounded-t-3xl border-t border-slate-200 bg-surface shadow-floating motion-safe:animate-[slideUp_200ms_ease-out]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <span className="text-sm font-semibold text-slate-900">Navigate</span>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="h-[calc(100%-3.5rem)] space-y-0.5 overflow-y-auto px-3 pb-8 pt-2">
          <NavSections onNavigate={onClose} />
          <button
            onClick={() => {
              onClose()
              logout()
            }}
            className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut size={17} />
            Sign out
          </button>
        </nav>
      </div>
    </div>
  )
}

function BottomBar({ onMore }: { onMore: () => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {MOBILE_TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition",
                isActive ? "text-indigo-600" : "text-slate-400 hover:text-slate-700",
              )
            }
          >
            <Icon size={21} />
            {label}
          </NavLink>
        ))}
        <button
          onClick={onMore}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-slate-400 transition hover:text-slate-700"
        >
          <LayoutGrid size={21} />
          More
        </button>
      </div>
    </nav>
  )
}

export function Layout() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { openNote } = useFloatingNote()

  // Global quick-capture: ⌘/Ctrl+Shift+N pops out a fresh, unrooted note from
  // anywhere, so a stray thought never means losing your place.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "N" || e.key === "n")) {
        e.preventDefault()
        openNote({})
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openNote])

  return (
    <div className="flex min-h-screen bg-background text-slate-900">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-slate-200 bg-surface lg:block">
        <Sidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky top bar: brand (mobile) + global search + theme toggle */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-background/80 px-4 py-2.5 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="min-w-0 flex-1">
            <div className="max-w-xl">
              <GlobalSearch />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="New note (⌘⇧N)"
              onClick={() => openNote({})}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <NotebookPen size={17} />
              <span className="hidden sm:inline">New note</span>
            </button>
            <ReminderToggle />
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10 xl:px-10 xl:pt-8">
          <Outlet />
        </main>
      </div>

      <BottomBar onMore={() => setMoreOpen(true)} />
      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} />}
      <FloatingNoteWindow />
      <OverflowDebug />
    </div>
  )
}
