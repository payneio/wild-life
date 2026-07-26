"""Canonical plain-text storage for externally-authored rich text.

Calendar invites from Google, Outlook and Teams put an HTML body in the VEVENT
`DESCRIPTION`. We store one copy of that text and edit it in a plain textarea, so
the markup shows up as literal source — `<a href="…">`, `<br>`, `<wbr>`, `&amp;`.
It is not only a display problem: the column is a full-text search field, and it is
echoed back out into any invite we send, so the markup leaks to guests too.

So the API canonicalises on ingest, the same way phone numbers are stored E.164 and
dates ISO: one stored form (markdown-ish plain text, links intact), converted once
at the boundary where external text enters.

The hard constraint is `phone.normalize_phone`'s: never mangle input that isn't
what we think it is. Plain-text Outlook bodies routinely carry RFC-2822
angle-bracket links — `Need help?<https://aka.ms/JoinTeamsMeeting>` — and an HTML
parser eats those as unknown tags, destroying the URL. That is why the detector is
an allow-list of real tag names rather than a generic `<\\w+>`: `https` is not a
tag, so such a body is returned untouched.
"""

from __future__ import annotations

import html
import re

# Every tag name that actually turns up in mail-authored HTML. An allow-list is
# the whole point — `<https://…>`, `<mailto:…>` and `<paul@payne.io>` must not
# read as markup.
_TAG_NAMES = (
    "a|abbr|address|article|aside|b|big|blockquote|body|br|caption|center|cite|code"
    "|col|colgroup|dd|div|dl|dt|em|figcaption|figure|font|footer|h1|h2|h3|h4|h5|h6"
    "|head|header|hr|html|i|img|label|li|meta|nav|nobr|ol|p|pre|q|s|section|small"
    "|span|strike|strong|style|sub|sup|table|tbody|td|tfoot|th|thead|title|tr|tt|u"
    "|ul|wbr"
)

# A tag is '<' or '</', an allow-listed name, then *immediately* one of:
#   '>'            (<br>, </p>)
#   '/>'           (<br/>)
#   whitespace ... '>'   (<a href="…">)
# That "immediately" is what rejects `<https://…>` — after the non-matching name
# comes ':', not whitespace/'/'/'>'. It also rejects `<b.example.com/x>`, which a
# plain word-boundary pattern would happily call a <b> tag.
_TAG_RE = re.compile(
    rf"</?(?:{_TAG_NAMES})(?:\s[^<>]*)?/?>|<!--|<!\[CDATA\[|<!doctype\b",
    re.IGNORECASE,
)

# Only well-formed references — '&name;', '&#160;', '&#x2019;'. The semicolon is
# required on purpose: html.unescape() also resolves *bare* legacy names, so a
# plain URL '…?a=1&notin=2' would come back as '…?a=1¬in=2'. We never unescape a
# whole string, only individually matched references.
_ENTITY_RE = re.compile(
    r"&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});"
)


# A '&' that does not begin a well-formed reference. Real bodies carry raw query
# strings in link text ('?owner=1&action=appt'), and HTMLParser reads that bare
# '&action' as an entity reference — html2text then helpfully writes it back as
# '&action;'. Escaping first means the parser sees a literal ampersand and
# renders it as one.
_BARE_AMP_RE = re.compile(
    r"&(?!#\d{1,7};|#[xX][0-9a-fA-F]{1,6};|[A-Za-z][A-Za-z0-9]{1,31};)"
)


def looks_like_html(text: str | None) -> bool:
    """True only when ``text`` contains a real HTML tag (allow-listed name)."""
    return bool(text) and _TAG_RE.search(text) is not None


def _unescape_entities(text: str) -> str:
    return _ENTITY_RE.sub(lambda m: html.unescape(m.group(0)), text)


def _tidy(text: str) -> str:
    """No trailing whitespace, at most one blank line between blocks."""
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def html_to_markdown(text: str) -> str:
    """Render an HTML fragment as markdown-ish plain text."""
    import html2text

    # HTML2Text is stateful and handle() is not re-entrant — build a fresh one.
    h = html2text.HTML2Text(bodywidth=0)
    h.body_width = 0  # never hard-wrap: it breaks long join URLs mid-token
    h.unicode_snob = True  # keep ’ – → as themselves
    h.ignore_images = True  # tracking pixels and spacer GIFs, every time
    h.ignore_links = False  # the join URL is the point of most of these bodies
    h.inline_links = True  # [text](url), not a trailing footnote block
    h.protect_links = False  # True re-emits <url>, which breaks idempotence
    h.wrap_links = False
    h.wrap_list_items = False
    # Keep tables as markdown pipe rows. Some senders do use them for layout,
    # where the cost is a stray '---' line; but others carry real schedules, and
    # dropping the cell boundaries there runs "5:30 p.m." into "Cooling Center".
    h.ignore_tables = False
    h.single_line_break = True  # <br>-heavy Google bodies otherwise double-space
    h.escape_snob = False
    h.skip_internal_links = True
    h.ul_item_mark = "-"
    h.default_image_alt = ""
    return _tidy(h.handle(_BARE_AMP_RE.sub("&amp;", text)))


def normalize_description(text: str | None) -> str | None:
    """HTML → markdown; entity-only text → unescaped; anything else unchanged.

    Idempotent and ``None``-preserving. A no-op for plain text, including the
    Outlook bodies that use ``<https://…>`` angle-bracket link syntax — silently
    corrupting an unusual description is far worse than leaving it alone.
    """
    if text is None:
        return None
    if not text.strip():
        return text
    if looks_like_html(text):
        return html_to_markdown(text)
    if _ENTITY_RE.search(text):
        return _unescape_entities(text)
    return text
