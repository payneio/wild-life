import { useEffect, useState } from "react"
import { NavLink, Outlet } from "react-router-dom"
import {
  Bell,
  BellOff,
  Bookmark,
  CalendarDays,
  Building2,
  ClipboardCheck,
  FolderKanban,
  GitMerge,
  HeartHandshake,
  Repeat,
  GalleryVerticalEnd,
  History,
  Home,
  Hourglass,
  Inbox,
  Layers,
  LayoutList,
  Bot,
  LayoutGrid,
  LineChart,
  ListChecks,
  LogOut,
  MapPin,
  MapPinned,
  Moon,
  NotebookPen,
  Pill,
  Rocket,
  Scale,
  Send,
  ShieldPlus,
  StickyNote,
  Sun,
  Settings as SettingsIcon,
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

/** The daily surfaces — where you land and what's in front of you. The Journal
 *  belongs here rather than in Reference: it is a practice you do, not material
 *  you look things up in. */
const DAILY: Item[] = [
  { to: "/today", label: "Today", icon: Home },
  { to: "/notes", label: "Journal", icon: NotebookPen },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/timeline", label: "Timeline", icon: GalleryVerticalEnd },
  { to: "/whiteboard", label: "Whiteboard", icon: StickyNote },
]

/** The work hierarchy, in containment order, then the recurring mode of work. A program's
 *  effort is either finite (projects → tasks) or repeating (protocols →
 *  routines); protocols sit after the chain rather than beside projects because
 *  Area → Program → Project → Task is the sequence you already think in. */
const WORK: Item[] = [
  { to: "/areas", label: "Areas", icon: Layers },
  { to: "/programs", label: "Programs", icon: Rocket },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/protocols", label: "Protocols", icon: Repeat },
]

/** What must be true, how it's read, and the periodic look at both. */
const MEASURE: Item[] = [
  { to: "/outcomes", label: "Outcomes", icon: Target },
  { to: "/metrics", label: "Metrics", icon: LineChart },
  { to: "/metric-groups", label: "Metric groups", icon: LayoutList },
  { to: "/reviews", label: "Review", icon: ClipboardCheck },
]

/** Work that leaves your hands. */
const OTHERS: Item[] = [
  { to: "/delegations", label: "Delegations", icon: Send },
  { to: "/requests", label: "Requests", icon: Hourglass },
  { to: "/agents", label: "Agents", icon: Bot },
]

/** What's left once conditions became programs and protocols became generic:
 *  the genuinely clinical records. */
const HEALTH: Item[] = [
  { to: "/medications", label: "Medications", icon: Pill },
  { to: "/allergies", label: "Allergies", icon: TriangleAlert },
  { to: "/insurance", label: "Insurance", icon: ShieldPlus },
]

const REFERENCE: Item[] = [
  { to: "/people", label: "People", icon: Users },
  { to: "/organizations", label: "Organizations", icon: Building2 },
  { to: "/locations", label: "Locations", icon: MapPin },
  { to: "/places", label: "Places", icon: MapPinned },
  { to: "/commitments", label: "Commitments", icon: HeartHandshake },
  { to: "/decisions", label: "Decisions", icon: Scale },
  { to: "/resources", label: "Resources", icon: Bookmark },
  { to: "/history", label: "History", icon: History },
  { to: "/duplicates", label: "Duplicates", icon: GitMerge },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
]

/** Bottom-bar destinations on mobile (last opens the full-nav sheet). */
const MOBILE_TABS: Item[] = [
  { to: "/today", label: "Today", icon: Home },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/timeline", label: "Timeline", icon: GalleryVerticalEnd },
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

/** Pending-triage count on the Inbox nav item (captures + non-synced events). */
function InboxBadge() {
  const { data } = useReviewDashboard()
  const n = (data?.unresolved_captures_count ?? 0) + (data?.unrooted_events_count ?? 0)
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
      {DAILY.map((i) => (
        <NavItem key={i.to} item={i} onNavigate={onNavigate} />
      ))}
      <GroupLabel>Work</GroupLabel>
      {WORK.map((i) => (
        <NavItem key={i.to} item={i} onNavigate={onNavigate} />
      ))}
      <GroupLabel>Measure</GroupLabel>
      {MEASURE.map((i) => (
        <NavItem key={i.to} item={i} onNavigate={onNavigate} />
      ))}
      <GroupLabel>With others</GroupLabel>
      {OTHERS.map((i) => (
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

  // Global quick-capture: ⌘/Ctrl+Shift+N pops out a fresh, unrooted capture
  // from anywhere, so a stray thought never means losing your place. Writing
  // *about* something is a different act with a different home — the Log band
  // on that thing's record — so nothing here roots itself to the current page.
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
          {/* Mobile: the brand logo doubles as the menu button — tapping it opens
              the full-nav sheet (the desktop sidebar makes this unneeded at lg+). */}
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMoreOpen(true)}
            className="rounded-lg lg:hidden"
          >
            <Brand />
          </button>
          <div className="min-w-0 flex-1">
            <div className="max-w-xl">
              <GlobalSearch />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Capture (⌘⇧N)"
              onClick={() => openNote({})}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <NotebookPen size={17} />
              <span className="hidden sm:inline">Capture</span>
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
