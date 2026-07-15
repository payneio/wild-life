import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { MentionChip } from "@/components/MentionChip"
import type { EntityType } from "@/services/api/types"

const MENTION_HREF = /^(\w+):([0-9a-fA-F-]{36})$/

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
  code: ({ children }) => (
    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-700">{children}</code>
  ),
  hr: () => <hr className="my-3 border-slate-100" />,
  a: ({ href, children }) => {
    const m = href?.match(MENTION_HREF)
    if (m) {
      const label = String(Array.isArray(children) ? children.join("") : (children ?? "")).replace(/^@/, "")
      return <MentionChip type={m[1] as EntityType} id={m[2]} label={label} />
    }
    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
        {children}
      </a>
    )
  },
}

/** Render a note body as markdown with clickable @-mention chips. */
export function MentionText({ children }: { children: string }) {
  return (
    <div className="text-sm text-slate-700">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={COMPONENTS}
        urlTransform={(url) => url}
      >
        {children}
      </Markdown>
    </div>
  )
}
