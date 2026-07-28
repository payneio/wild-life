import { memo } from "react"
import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { AuthImage } from "@/components/AuthImage"
import { MentionChip } from "@/components/MentionChip"
import type { EntityType } from "@/services/api/types"

const MENTION_HREF = /^(\w+):([0-9a-fA-F-]{36})$/
const MOMENT_IMAGE = /^moment-image:([0-9a-fA-F-]{36})$/
const IMG_CLS = "my-2 max-h-96 max-w-full rounded-lg border border-slate-200"

const SAFE_SCHEME = /^(https?|mailto|tel):/i

/**
 * Which hrefs survive to the DOM.
 *
 * react-markdown's default transform drops any scheme it doesn't know, which
 * would take our `person:<uuid>` mentions and `moment-image:<uuid>` with it — so
 * this used to be a passthrough. A passthrough is fine for text you wrote, and
 * not fine here: event descriptions are authored by whoever emailed you the
 * invite, and `[Join](javascript:…)` would render as a clickable link. So
 * allow-list instead: the two internal forms, ordinary web/mail/phone links,
 * and anything relative. Everything else renders as inert text.
 */
function safeUrl(url: string): string {
  if (MENTION_HREF.test(url) || MOMENT_IMAGE.test(url)) return url
  if (url.startsWith("moment-image:pending")) return url
  if (SAFE_SCHEME.test(url)) return url
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? "" : url // bare scheme → drop; relative → keep
}

// Minimal markdown styling (no @tailwindcss/typography in this app).
const COMPONENTS: Components = {
  h1: ({ children }) => <h1 className="mt-3 mb-1 text-lg font-semibold text-slate-900">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-1 text-base font-semibold text-slate-900">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2 mb-1 text-sm font-semibold text-slate-800">{children}</h3>,
  p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-slate-200 pl-3 text-slate-500 italic">{children}</blockquote>
  ),
  // Block code (fenced) lives inside <pre> and scrolls horizontally — never wraps,
  // so formatting/long tokens stay intact. Inline code keeps its pill and *may*
  // wrap a long token (it can't scroll within a line).
  code: ({ className, children }) => {
    const text = Array.isArray(children) ? children.join("") : String(children ?? "")
    const isBlock = /language-/.test(className ?? "") || text.includes("\n")
    if (isBlock) return <code className="font-mono text-[0.85em] text-slate-800">{children}</code>
    return (
      <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-700 [overflow-wrap:anywhere]">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-2 max-w-full overflow-x-auto whitespace-pre rounded-lg border border-slate-200 bg-slate-50 p-3">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-3 border-slate-100" />,
  // Invite bodies carry real schedules (a Derby Days day-by-day, a rental-car
  // confirmation), so the grid has to survive. Scrolls rather than squeezing —
  // these arrive with columns sized for an email client, not a side pane.
  table: ({ children }) => (
    <div className="my-2 max-w-full overflow-x-auto">
      <table className="w-full border-collapse text-left text-[0.9em]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-slate-200">{children}</thead>,
  tr: ({ children }) => <tr className="border-b border-slate-100 last:border-0">{children}</tr>,
  th: ({ children }) => (
    <th className="px-2 py-1 font-semibold text-slate-900 [overflow-wrap:anywhere]">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-2 py-1 align-top text-slate-700 [overflow-wrap:anywhere]">{children}</td>
  ),
  img: ({ src, alt }) => {
    const s = typeof src === "string" ? src : ""
    const m = s.match(MOMENT_IMAGE)
    if (m) return <AuthImage imageId={m[1]} alt={typeof alt === "string" ? alt : undefined} />
    if (s.startsWith("moment-image:pending"))
      return <span className="my-2 inline-block rounded bg-slate-100 px-2 py-1 text-xs text-slate-400">🖼 image (uploads on save)</span>
    return <img src={s} alt={alt ?? ""} className={IMG_CLS} />
  },
  a: ({ href, children }) => {
    const m = href?.match(MENTION_HREF)
    if (m) {
      const label = String(Array.isArray(children) ? children.join("") : (children ?? "")).replace(/^@/, "")
      return <MentionChip type={m[1] as EntityType} id={m[2]} label={label} />
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-indigo-600 hover:underline [overflow-wrap:anywhere]"
      >
        {children}
      </a>
    )
  },
}

/**
 * Render a note body as markdown with clickable @-mention chips.
 *
 * Memoized on `children`: markdown parsing is expensive and a journal renders
 * many bodies at once, so skip the re-parse when a note's text is unchanged
 * (e.g. when a sibling note updates). `COMPONENTS` is a module constant, so the
 * only meaningful prop is the body string.
 */
export const MentionText = memo(function MentionText({ children }: { children: string }) {
  return (
    <div className="text-sm text-slate-700 [overflow-wrap:anywhere]">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={COMPONENTS}
        urlTransform={safeUrl}
      >
        {children}
      </Markdown>
    </div>
  )
})
