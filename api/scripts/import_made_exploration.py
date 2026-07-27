#!/usr/bin/env python3
"""One-time (idempotent) migration of Paul's Microsoft "MADE: Exploration" work
workspace into wild-life-api.

Source:  /data/projects/microsoft/made-exploration  (a markdown work workspace)
Target:  the wild-life-api CRUD endpoints (default http://localhost:9005)

What it creates
---------------
- Tag ``work:microsoft`` attached to the top-level records.
- Organization ``Microsoft`` (employer) + colleagues as People + affiliations.
- Area ``MADE: Exploration`` -> Program ``Amplifier Platform``.
- Each engagement folder -> a Project (active ones under the Program; historical
  ones ``archived`` under the Area). Forward roadmap items from work-plan.md ->
  proposed Projects.
- Resources linking to engagement folders + external URLs (ADO/GitHub/Azure) --
  we *link* to big/source material, we don't copy it.
- Journal Notes: work-journal.md entries merged per-date with the matching
  eod-summaries/ file (``## Journal`` + ``## EOD Summary`` sections).
- Meeting notes, vision/strategy, and episode post-mortems -> Notes.

Entity linking
--------------
After all entities exist, every ingested Note body is scanned against an alias
lexicon; detected references are rewritten inline as ``[@Label](type:uuid)``
tokens (the exact form the `personal` frontend renders as clickable mention
chips) and mirrored into the note's structured ``links`` array (which powers the
"Mentioned in" backlinks panel on entity detail pages).

Safety
------
- Every ingested body is scrubbed of credentials + Azure GUIDs before POST.
- The m365 hackathon test-tenant file is linked as a Resource but its body is
  never ingested.

Idempotency
-----------
Records are matched by natural key (name / (note_type, entry_date, title) /
(title, url)) and created only if missing. Pass ``--update`` to converge fields
of existing records (useful while tuning). ``--dry-run`` prints the plan without
writing (using deterministic placeholder UUIDs so linking is still shown).

Usage
-----
    uv run python scripts/import_made_exploration.py --dry-run
    uv run python scripts/import_made_exploration.py            # real run
    uv run python scripts/import_made_exploration.py --update   # converge fields
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import uuid
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import httpx

# --------------------------------------------------------------------------- #
# Config / source layout
# --------------------------------------------------------------------------- #

DEFAULT_SOURCE = Path("/data/projects/microsoft/made-exploration")
DEFAULT_BASE_URL = "http://localhost:9005"
DRY_NS = uuid.uuid5(uuid.NAMESPACE_URL, "made-exploration-import")

# Engagements -> Projects. ``active`` ones sit under the Amplifier Platform
# program; the rest are historical ``archived`` projects under the Area.
# ``aliases`` feed the entity-linking lexicon (curated for precision).
ENGAGEMENTS: list[dict[str, Any]] = [
    {
        "folder": "infrastructure",
        "name": "Infrastructure (Amplifier Online)",
        "status": "active",
        "active": True,
        "outcome": "Let the team provision Azure infra/apps without SC-ALT "
        "accounts via the 'Stacks' abstraction (ACA + Postgres).",
        "next_action": "Deployment Targets bundle: a deploy-target abstraction "
        "(local / cluster / VM / Azure).",
        "aliases": [
            "Amplifier Online",
            "Amplifier-Online",
            "Stacks",
            "provisioner",
            "AO",
        ],
    },
    {
        "folder": "amplifier",
        "name": "Amplifier (core framework)",
        "status": "active",
        "active": True,
        "outcome": "The core Amplifier LLM-agent framework — bundles, profiles, "
        "context, tools.",
        "next_action": "System Design bundle (DONE): systems-design principles / "
        "patterns, brainstorm + zen-architect review, constraint & "
        "design-modelling tools.",
        "aliases": [],  # bare "amplifier" handled as a low-priority lexicon entry
    },
    {
        "folder": "lakehouse",
        "name": "Lakehouse",
        "status": "active",
        "active": True,
        "outcome": "Personal Amplifier daemon (amplifierd) separating HOW "
        "(profile) from WHAT (working dir).",
        "aliases": ["amplifierd", "lakehouse"],
    },
    {
        "folder": "orchestration",
        "name": "Orchestration",
        "status": "archived",
        "active": False,
        "outcome": "Foreman (worker/issue orchestration) + Observer bundle patterns.",
        "aliases": ["foreman", "observer", "whisperer"],
    },
    {
        "folder": "amplifier-distro",
        "name": "Amplifier Distro",
        "status": "archived",
        "active": False,
        "outcome": "A Linux-distro-style packaging of Amplifier (with Sam).",
        "aliases": ["amplifier-distro"],
    },
    {
        "folder": "skills",
        "name": "Skills / Routine Runner",
        "status": "archived",
        "active": False,
        "outcome": "Skills/routines framework + program routine runner.",
        "aliases": ["skill library", "routine runner", "program routine runner"],
    },
    {
        "folder": "knowledge-transfer",
        "name": "Knowledge Transfer",
        "status": "archived",
        "active": False,
        "outcome": "Knowledge Transfer Assistant + curriculum generation.",
        "aliases": ["knowledge transfer", "curriculum"],
    },
    {
        "folder": "tasks",
        "name": "Task Agents",
        "status": "archived",
        "active": False,
        "outcome": "Conversational agent + domain task detection/execution agents "
        "(design).",
        "aliases": [],
    },
    {
        "folder": "long-running-agents",
        "name": "Long-Running Agents",
        "status": "archived",
        "active": False,
        "outcome": "Experiments: meta-prompting, plan generation, episodic memory.",
        "aliases": ["long-running agent", "episodic memory", "meta-prompting"],
    },
    {
        "folder": "synthetic-memory",
        "name": "Synthetic Memory",
        "status": "archived",
        "active": False,
        "outcome": "Better chatbot using synthetic memories.",
        "aliases": ["synthetic memory"],
    },
    {
        "folder": "semantic-telemetry",
        "name": "Semantic Telemetry",
        "status": "archived",
        "active": False,
        "outcome": "Prompt optimization / telemetry.",
        "aliases": ["semantic telemetry"],
    },
    {
        "folder": "infinite-chat",
        "name": "Infinite Chat",
        "status": "archived",
        "active": False,
        "outcome": "Infinite Chat experiments.",
        "aliases": ["infinite chat"],
    },
    {
        "folder": "academic-research-assistant",
        "name": "Academic Research Assistant",
        "status": "archived",
        "active": False,
        "outcome": "Academic research assistant exploration.",
        "aliases": ["academic research assistant"],
    },
    {
        "folder": "coding",
        "name": "Coding Assistants",
        "status": "archived",
        "active": False,
        "outcome": "Notes on using assistants for coding; FE frameworks review.",
        "aliases": [],
    },
]

# Forward roadmap (work-plan.md) items that are NOT already an engagement.
# (Deployment Targets folds into Infrastructure; System Design into Amplifier —
# captured as their next_action above.)
ROADMAP: list[dict[str, Any]] = [
    {
        "name": "Edge AI (amplifier-edge)",
        "status": "proposed",
        "outcome": "Discover what runs well on edge models; edge-specific bundles.",
        "aliases": ["amplifier-edge", "edge ai"],
    },
    {
        "name": "Context Management (Approaches & Stacks)",
        "status": "proposed",
        "outcome": "Approaches bundle + configurable 'stack' context bundles.",
        "aliases": ["approaches bundle", "dynamic context"],
    },
    {
        "name": "Dev-space",
        "status": "proposed",
        "outcome": "Sandboxed dev/test environments; workspace-as-remote-shell.",
        "aliases": ["dev-space", "dev space", "execution environments"],
    },
    {
        "name": "Agent & Fleet Microservices",
        "status": "proposed",
        "outcome": "Agents/bundles as swappable microservices; fleet as "
        "microservices; agent-to-agent across machines.",
        "aliases": [
            "agent microservices",
            "fleet microservices",
            "amplifier-ipc",
            "fleet management",
            "fleet manager",
        ],
    },
    {
        "name": "Agent OS",
        "status": "proposed",
        "outcome": "Provider / credentials / CRM / data services, managed reverse "
        "proxy, podman-systemd orchestration.",
        "aliases": ["agent os"],
    },
    {
        "name": "LLM Gateway & Routing",
        "status": "proposed",
        "outcome": "LiteLLM-style gateway: provider mgmt, virtual keys, auto model "
        "routing / policies / learning.",
        "aliases": ["llm gateway", "litellm", "auto-router", "intelligent routing"],
    },
    {
        "name": "Community-Standard Assistants",
        "status": "proposed",
        "outcome": "Migrate Amplifier bundles to community-standard assistant "
        "models (e.g. OpenCode).",
        "aliases": ["opencode", "community-standard"],
    },
]

# Colleagues. Surnames unknown for Alex/David (first-name refs in the journal).
PEOPLE: list[dict[str, Any]] = [
    {
        "name": "Brian Krabach",
        "relationship": "manager",
        "role": "Manager",
        "aliases": ["Brian Krabach", "Brian", "Krabach"],
    },
    {
        "name": "Sam Schillace",
        "relationship": "colleague",
        "role": "Leadership",
        "aliases": ["Sam Schillace", "Schillace", "Sam"],
    },
    {
        "name": "Salil Das",
        "relationship": "colleague",
        "aliases": ["Salil Das", "Salil"],
    },
    {"name": "Alex", "relationship": "colleague", "aliases": ["Alex"]},
    {"name": "David", "relationship": "colleague", "aliases": ["David"]},
]

ORG_NAME = "Microsoft"
AREA_NAME = "MADE: Exploration"
PROGRAM_NAME = "Amplifier Platform"
# A project's only parent is a program, so the retired engagements need one too
# rather than hanging off the area. Matches the holding program a4b5c6d7e8f9
# created for exactly these rows.
ARCHIVE_PROGRAM_NAME = "Exploration"
WORK_TAG = "work:microsoft"

# --------------------------------------------------------------------------- #
# Secret scrubbing
# --------------------------------------------------------------------------- #

_GUID = re.compile(
    r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"
)
_CRED_PATTERNS = [
    re.compile(r"(?i)\b(password|passwd|pwd)\b\s*[:=]\s*\S+"),
    re.compile(
        r"(?i)\b(client_secret|api[_-]?key|access[_-]?key|secret)\b\s*[:=]\s*['\"]?[\w\-./+=]{6,}"
    ),
    re.compile(r"AccountKey=[^;\s]+"),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9\-._~+/]{12,}=*"),
]


def scrub(text: str) -> str:
    """Redact obvious credentials and Azure GUIDs. Applied BEFORE link tokens
    are inserted, so our own inline-mention UUIDs are never touched."""
    for pat in _CRED_PATTERNS:
        text = pat.sub("<redacted>", text)
    text = _GUID.sub("<redacted-guid>", text)
    return text


# --------------------------------------------------------------------------- #
# API client with idempotent get-or-create
# --------------------------------------------------------------------------- #


class Client:
    def __init__(self, base_url: str, token: str, *, dry_run: bool, update: bool):
        self.base_url = base_url.rstrip("/")
        self.dry_run = dry_run
        self.update = update
        self.http = httpx.Client(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30.0,
        )
        self._index: dict[str, list[dict[str, Any]]] = {}
        self.created: dict[str, int] = {}
        self.skipped: dict[str, int] = {}
        self.updated: dict[str, int] = {}

    # -- low level ------------------------------------------------------- #
    def _list(self, path: str) -> list[dict[str, Any]]:
        if path not in self._index:
            r = self.http.get(path)
            r.raise_for_status()
            self._index[path] = list(r.json())
        return self._index[path]

    def _bump(self, bucket: dict[str, int], path: str) -> None:
        bucket[path] = bucket.get(path, 0) + 1

    def _dry_uuid(self, path: str, key: tuple) -> str:
        return str(uuid.uuid5(DRY_NS, f"{path}:{key}"))

    # -- get or create --------------------------------------------------- #
    def ensure(
        self,
        path: str,
        payload: dict[str, Any],
        *,
        key_fields: list[str],
        update_fields: list[str] | None = None,
    ) -> dict[str, Any]:
        """Create ``payload`` at ``path`` unless a record with the same natural
        key exists. Returns the record (with ``id``). Honors dry-run/update."""
        items = self._list(path)

        def norm(v: Any) -> Any:
            return v.lower().strip() if isinstance(v, str) else v

        key = tuple(norm(payload.get(f)) for f in key_fields)
        for existing in items:
            if tuple(norm(existing.get(f)) for f in key_fields) == key:
                if self.update and update_fields:
                    changed = {
                        f: payload[f]
                        for f in update_fields
                        if f in payload and existing.get(f) != payload[f]
                    }
                    if changed and not self.dry_run:
                        r = self.http.patch(f"{path}/{existing['id']}", json=changed)
                        r.raise_for_status()
                        existing.update(r.json())
                        self._bump(self.updated, path)
                    elif changed:
                        self._bump(self.updated, path)
                self._bump(self.skipped, path)
                return existing

        if self.dry_run:
            rec = dict(payload)
            rec["id"] = self._dry_uuid(path, key)
            items.append(rec)
            self._bump(self.created, path)
            return rec

        r = self.http.post(path, json=payload)
        if r.status_code >= 400:
            raise RuntimeError(
                f"POST {path} failed {r.status_code}: {r.text}\n{payload}"
            )
        rec = r.json()
        items.append(rec)
        self._bump(self.created, path)
        return rec

    def attach_tag(self, tag_id: str, entity_type: str, entity_id: str) -> None:
        if self.dry_run:
            return
        r = self.http.post(
            f"/tags/{tag_id}/attach",
            json={"entity_type": entity_type, "entity_id": entity_id},
        )
        r.raise_for_status()

    def ensure_note(
        self,
        *,
        title: str | None,
        body: str,
        note_type: str,
        entry_date: str | None,
        links: list[dict[str, str]],
        tags: list[str] | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
    ) -> dict[str, Any]:
        """Notes need body + links convergence, so they get a bespoke ensure."""
        items = self._list("/notes")
        key = (note_type, entry_date, (title or "").strip().lower())
        payload = {
            "title": title,
            "body": body,
            "note_type": note_type,
            "entry_date": entry_date,
            "tags": tags or [],
            "entity_type": entity_type,
            "entity_id": entity_id,
            "links": links,
        }
        for existing in items:
            ekey = (
                existing.get("note_type"),
                existing.get("entry_date"),
                (existing.get("title") or "").strip().lower(),
            )
            if ekey == key:
                if self.update:
                    body_changed = existing.get("body") != body
                    links_changed = _links_set(existing.get("links", [])) != _links_set(
                        links
                    )
                    if body_changed or links_changed:
                        if not self.dry_run:
                            r = self.http.patch(
                                f"/notes/{existing['id']}",
                                json={
                                    "body": body,
                                    "links": links,
                                    "entity_type": entity_type,
                                    "entity_id": entity_id,
                                },
                            )
                            r.raise_for_status()
                            existing.update(r.json())
                        self._bump(self.updated, "/notes")
                self._bump(self.skipped, "/notes")
                return existing

        if self.dry_run:
            rec = dict(payload)
            rec["id"] = self._dry_uuid("/notes", key)
            items.append(rec)
            self._bump(self.created, "/notes")
            return rec

        r = self.http.post("/notes", json=payload)
        if r.status_code >= 400:
            raise RuntimeError(f"POST /notes failed {r.status_code}: {r.text}")
        rec = r.json()
        items.append(rec)
        self._bump(self.created, "/notes")
        return rec


def _links_set(links: list[dict[str, str]]) -> set[tuple[str, str]]:
    return {(link["target_type"], str(link["target_id"])) for link in links}


# --------------------------------------------------------------------------- #
# Entity-linking lexicon
# --------------------------------------------------------------------------- #


@dataclass
class Lexicon:
    # (alias, entity_type, uuid, label, case_sensitive), sorted longest-first
    entries: list[tuple[str, str, str, str, bool]] = field(default_factory=list)

    def add(self, alias: str, etype: str, eid: str, label: str) -> None:
        alias = alias.strip()
        if not alias:
            return
        # short tokens (Sam) and all-caps acronyms (AO, MADE, KTA) match case-sensitively,
        # so the common word "made" doesn't link to the MADE area.
        case_sensitive = len(alias) <= 3 or alias.isupper()
        self.entries.append((alias, etype, eid, label, case_sensitive))

    def finalize(self) -> None:
        self.entries.sort(key=lambda e: len(e[0]), reverse=True)


# Segments that must not be touched when inserting mention tokens.
_MASK_PATTERNS = [
    re.compile(r"```.*?```", re.DOTALL),  # fenced code
    re.compile(r"`[^`]*`"),  # inline code
    re.compile(r"\[[^\]]*\]\([^)]*\)"),  # existing markdown links
    re.compile(r"https?://\S+"),  # bare URLs
    re.compile(r"<redacted[^>]*>"),  # redaction placeholders
]


def _mask(text: str) -> tuple[str, list[str]]:
    stash: list[str] = []

    def repl(m: re.Match) -> str:
        stash.append(m.group(0))
        return f"\x00{len(stash) - 1}\x00"

    for pat in _MASK_PATTERNS:
        text = pat.sub(repl, text)
    return text, stash


def _unmask(text: str, stash: list[str]) -> str:
    for i, seg in enumerate(stash):
        text = text.replace(f"\x00{i}\x00", seg)
    return text


def link_body(
    body: str, lex: Lexicon, *, cap: int = 6
) -> tuple[str, list[dict[str, str]]]:
    """Insert ``[@Label](type:uuid)`` at the first occurrence of each distinct
    entity alias, returning the rewritten body and the ``links`` array."""
    masked, stash = _mask(body)
    links: dict[tuple[str, str], dict[str, str]] = {}
    linked_ids: set[str] = set()

    for alias, etype, eid, _, cs in lex.entries:
        if len(links) >= cap:
            break
        if eid in linked_ids:
            continue
        flags = 0 if cs else re.IGNORECASE
        pat = re.compile(rf"(?<![\w-]){re.escape(alias)}(?![\w-])", flags)
        m = pat.search(masked)
        if not m:
            continue
        surface = m.group(0)  # preserve the surface text as the visible label
        token = f"[@{surface}]({etype}:{eid})"
        # Stash the inserted token behind a placeholder so a later (shorter)
        # alias can't match text *inside* a token we already inserted.
        stash.append(token)
        placeholder = f"\x00{len(stash) - 1}\x00"
        masked = masked[: m.start()] + placeholder + masked[m.end() :]
        links[(etype, eid)] = {"target_type": etype, "target_id": eid}
        linked_ids.add(eid)

    return _unmask(masked, stash), list(links.values())


# --------------------------------------------------------------------------- #
# Markdown source parsing
# --------------------------------------------------------------------------- #

_DATE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def parse_journal(text: str) -> tuple[str, list[dict[str, Any]]]:
    """Return (pre-heading scratch, [ {title, date, body} ]) from work-journal.md."""
    lines = text.splitlines()
    # Drop the leading "# Work Journal" H1 if present.
    entries: list[dict[str, Any]] = []
    scratch_lines: list[str] = []
    cur: dict[str, Any] | None = None
    buf: list[str] = []

    def flush() -> None:
        nonlocal cur, buf
        if cur is not None:
            cur["body"] = "\n".join(buf).strip()
            entries.append(cur)
        buf = []

    for line in lines:
        if line.startswith("## "):
            flush()
            heading = line[3:].strip()
            m = _DATE_RE.match(heading)
            d = None
            if m:
                try:
                    d = date(
                        int(m.group(1)), int(m.group(2)), int(m.group(3))
                    ).isoformat()
                except ValueError:
                    d = None
            cur = {"title": heading, "date": d, "body": ""}
        elif cur is None:
            if not line.startswith("# "):
                scratch_lines.append(line)
        else:
            buf.append(line)
    flush()
    return "\n".join(scratch_lines).strip(), entries


def parse_eod(source: Path) -> dict[str, str]:
    """date-iso -> eod body, from eod-summaries/work-summary-*.md."""
    out: dict[str, str] = {}
    d = source / "eod-summaries"
    for f in sorted(d.glob("work-summary-*.md")):
        m = _DATE_RE.search(f.name)
        if not m:
            continue
        iso = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
        out[iso] = read(f).strip()
    return out


def humanize_meeting(slug: str) -> str:
    return (
        slug.replace("-", " ").replace(":", ":").strip().title().replace("1:1", "1:1")
    )


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #


def get_token(explicit: str | None) -> str:
    if explicit:
        return explicit
    out = subprocess.run(
        ["castle", "secret", "get", "WILD_LIFE_TOKEN"],
        capture_output=True,
        text=True,
    )
    if out.returncode == 0 and out.stdout.strip():
        return out.stdout.strip()
    return "dev-token"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base-url", default=DEFAULT_BASE_URL)
    ap.add_argument("--token", default=None)
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--update",
        action="store_true",
        help="Converge fields/bodies of existing records.",
    )
    ap.add_argument(
        "--show-links", action="store_true", help="Print detected links per note."
    )
    args = ap.parse_args()

    src: Path = args.source
    if not src.exists():
        print(f"Source not found: {src}", file=sys.stderr)
        return 1

    c = Client(
        args.base_url, get_token(args.token), dry_run=args.dry_run, update=args.update
    )
    lex = Lexicon()

    def L(msg: str) -> None:
        print(msg)

    # -- 1. tag ---------------------------------------------------------- #
    tag = c.ensure("/tags", {"name": WORK_TAG, "color": "#0078d4"}, key_fields=["name"])

    # -- 2. org, people, affiliations ------------------------------------ #
    org = c.ensure(
        "/organizations",
        {
            "name": ORG_NAME,
            "org_type": "employer",
            "industry": "Software",
            "website": "https://microsoft.com",
            "description": "Employer — MADE: Exploration research team.",
        },
        key_fields=["name"],
        update_fields=["org_type", "industry", "website", "description"],
    )
    lex.add(ORG_NAME, "organization", org["id"], ORG_NAME)

    people_ids: dict[str, str] = {}
    for p in PEOPLE:
        rec = c.ensure(
            "/people",
            {
                "name": p["name"],
                "relationship": p.get("relationship"),
                "role": p.get("role"),
                "notes": "MADE: Exploration teammate.",
            },
            key_fields=["name"],
            update_fields=["relationship", "role"],
        )
        people_ids[p["name"]] = rec["id"]
        for alias in p["aliases"]:
            lex.add(alias, "person", rec["id"], alias)
        c.ensure(
            "/affiliations",
            {
                "person_id": rec["id"],
                "organization_id": org["id"],
                "role": p.get("role") or "Team member",
                "is_primary": True,
            },
            key_fields=["person_id", "organization_id"],
        )

    # -- 3. area + program ---------------------------------------------- #
    area = c.ensure(
        "/areas",
        {
            "name": AREA_NAME,
            "status": "active",
            "description": "Microsoft work — the MADE: Exploration research team "
            "(Amplifier, an LLM agent framework).",
            "accountable_owner_id": None,
        },
        key_fields=["name"],
        update_fields=["description", "status"],
    )
    lex.add(AREA_NAME, "area", area["id"], AREA_NAME)
    lex.add("MADE", "area", area["id"], "MADE")

    program = c.ensure(
        "/programs",
        {
            "name": PROGRAM_NAME,
            "area_id": area["id"],
            "status": "active",
            "intended_outcome": "Outcome-driven agent workflows + context management: "
            "recipes/bundles, orchestration, and the platform to run them.",
            "accountable_owner_id": people_ids.get("Brian Krabach"),
        },
        key_fields=["name"],
        update_fields=["intended_outcome", "status", "area_id"],
    )
    lex.add(PROGRAM_NAME, "program", program["id"], PROGRAM_NAME)
    lex.add("Amplifier Platform", "program", program["id"], "Amplifier Platform")

    archive = c.ensure(
        "/programs",
        {
            "name": ARCHIVE_PROGRAM_NAME,
            "area_id": area["id"],
            "status": "resolved",
            "description": "Holds projects that predate this area's programs.",
        },
        key_fields=["name"],
        update_fields=["status", "area_id"],
    )

    # -- 4. engagement projects ----------------------------------------- #
    project_ids: dict[str, str] = {}  # folder/name -> id
    for eng in ENGAGEMENTS:
        payload = {
            "name": eng["name"],
            "status": eng["status"],
            "program_id": program["id"] if eng["active"] else archive["id"],
            "intended_outcome": eng["outcome"],
            "priority": "high" if eng["active"] else "low",
        }
        if eng.get("next_action"):
            payload["next_action"] = eng["next_action"]
        rec = c.ensure(
            "/projects",
            payload,
            key_fields=["name"],
            update_fields=[
                "status",
                "program_id",
                "intended_outcome",
                "next_action",
                "priority",
            ],
        )
        project_ids[eng["folder"]] = rec["id"]
        lex.add(eng["name"], "project", rec["id"], eng["name"])
        for alias in eng["aliases"]:
            lex.add(alias, "project", rec["id"], alias)

    # bare "amplifier" -> core project, added last so longer aliases win.
    lex.add("amplifier", "project", project_ids["amplifier"], "Amplifier")

    # -- roadmap projects ----------------------------------------------- #
    for rm in ROADMAP:
        rec = c.ensure(
            "/projects",
            {
                "name": rm["name"],
                "status": rm["status"],
                "program_id": program["id"],
                "intended_outcome": rm["outcome"],
                "priority": "medium",
            },
            key_fields=["name"],
            update_fields=["status", "program_id", "intended_outcome"],
        )
        project_ids[rm["name"]] = rec["id"]
        lex.add(rm["name"], "project", rec["id"], rm["name"])
        for alias in rm["aliases"]:
            lex.add(alias, "project", rec["id"], alias)

    lex.finalize()

    # -- 5. resources (links, not copies) -------------------------------- #
    def resource(
        title: str, url: str, rtype: str, etype: str, eid: str, desc: str | None = None
    ) -> None:
        c.ensure(
            "/resources",
            {
                "title": title,
                "url": url,
                "resource_type": rtype,
                "description": desc,
                "entity_type": etype,
                "entity_id": eid,
                "tags": [WORK_TAG],
            },
            key_fields=["title", "url"],
            update_fields=["resource_type", "description", "entity_type", "entity_id"],
        )

    # external links
    resource(
        "MADE: Exploration — ADO board",
        "https://dev.azure.com/msctoproj/MADE%20Exploration/_sprints/taskboard/",
        "board",
        "area",
        area["id"],
    )
    resource(
        "Azure portal",
        "https://ms.portal.azure.com/#home",
        "portal",
        "program",
        program["id"],
    )
    resource(
        "Amplifier repos (microsoft/amplifier-*)",
        "https://github.com/orgs/microsoft/repositories?q=amplifier",
        "repo-index",
        "program",
        program["id"],
        "Full list mirrored in repos.md",
    )
    resource(
        "Amplifier (GitHub)",
        "https://github.com/microsoft/amplifier",
        "repo",
        "project",
        project_ids["amplifier"],
    )
    resource(
        "amplifier-core (GitHub)",
        "https://github.com/microsoft/amplifier-core",
        "repo",
        "project",
        project_ids["amplifier"],
    )
    resource(
        "amplifier-distro (GitHub)",
        "https://github.com/microsoft/amplifier-distro",
        "repo",
        "project",
        project_ids["amplifier-distro"],
    )
    resource(
        "Semantic Workbench (GitHub)",
        "https://github.com/microsoft/semanticworkbench/",
        "repo",
        "program",
        program["id"],
    )

    # per-engagement folder + a couple key docs
    for eng in ENGAGEMENTS:
        folder = src / "engagements" / eng["folder"]
        resource(
            f"{eng['name']} — workspace files",
            str(folder),
            "folder",
            "project",
            project_ids[eng["folder"]],
            "Source notes/docs on disk (not copied into the app).",
        )
    resource(
        "Stacks design proposal (draft)",
        str(
            src
            / "engagements"
            / "infrastructure"
            / "planning"
            / "design-proposal-stacks.md"
        ),
        "doc",
        "project",
        project_ids["infrastructure"],
    )
    resource(
        "Amplifier guides",
        str(src / "engagements" / "amplifier" / "guides"),
        "folder",
        "project",
        project_ids["amplifier"],
    )
    # sensitive file: linked, body NEVER ingested
    resource(
        "M365 hackathon test tenant (setup — sensitive)",
        str(src / "engagements" / "amplifier" / "m365-hackathon.md"),
        "doc",
        "project",
        project_ids["amplifier"],
        "Contains live credentials; open on disk only.",
    )

    # attach the work tag to top-level records
    for etype, eid in (
        [("area", area["id"]), ("program", program["id"]), ("organization", org["id"])]
        + [("project", pid) for pid in project_ids.values()]
        + [("person", pid) for pid in people_ids.values()]
    ):
        c.attach_tag(tag["id"], etype, eid)

    # ------------------------------------------------------------------ #
    # Notes
    # ------------------------------------------------------------------ #
    note_count = 0

    def make_note(**kw: Any) -> None:
        nonlocal note_count
        raw = kw.pop("body")
        clean = scrub(raw)
        linked_body, links = link_body(clean, lex)
        if args.show_links and links:
            labels = ", ".join(f"{link['target_type']}" for link in links)
            L(f"    · {kw.get('title')!r}  ->  {len(links)} links [{labels}]")
        c.ensure_note(body=linked_body, links=links, **kw)
        note_count += 1

    # -- 6. journal (merged with eod) ----------------------------------- #
    scratch, journal_entries = parse_journal(read(src / "work-journal.md"))
    eod = parse_eod(src)
    by_date: dict[str, dict[str, Any]] = {}
    undated: list[dict[str, Any]] = []
    for e in journal_entries:
        if e["date"]:
            by_date.setdefault(e["date"], {"title": e["title"], "journal": []})
            by_date[e["date"]]["journal"].append(e["body"])
        else:
            undated.append(e)

    all_dates = sorted(set(by_date) | set(eod), reverse=True)
    for d in all_dates:
        j = by_date.get(d)
        e_body = eod.get(d)
        title = j["title"] if j else d
        parts = []
        if j and any(b.strip() for b in j["journal"]):
            jb = "\n\n".join(b for b in j["journal"] if b.strip())
            parts.append(f"## Journal\n\n{jb}" if e_body else jb)
        if e_body:
            parts.append(f"## EOD Summary\n\n{e_body}")
        body = "\n\n".join(parts).strip()
        if not body:
            continue
        make_note(
            title=title, body=body, note_type="journal", entry_date=d, tags=[WORK_TAG]
        )

    for e in undated:
        if not e["body"].strip():
            continue
        make_note(
            title=e["title"],
            body=e["body"],
            note_type="journal",
            entry_date=None,
            tags=[WORK_TAG],
        )

    # journal scratch/inbox -> note linked to Infrastructure
    if scratch.strip():
        make_note(
            title="Journal inbox / scratch",
            body=scratch,
            note_type="note",
            entry_date=None,
            tags=[WORK_TAG],
            entity_type="project",
            entity_id=project_ids["infrastructure"],
        )

    # -- 7. meeting notes ------------------------------------------------ #
    mdir = src / "meeting-notes"
    if mdir.exists():
        for folder in sorted(mdir.iterdir()):
            if not folder.is_dir():
                continue
            notes_file = next(
                (
                    folder / n
                    for n in ("notes.md", "notes.txt")
                    if (folder / n).exists()
                ),
                None,
            )
            if notes_file is None:
                continue
            m = _DATE_RE.match(folder.name)
            d = f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None
            slug = folder.name[len(m.group(0)) + 1 :] if m else folder.name
            title = f"Meeting: {slug.replace('-', ' ')}"
            # primary link: a named person in the slug, else the program
            ent_type, ent_id = "program", program["id"]
            for pname, pid in people_ids.items():
                first = pname.split()[0].lower()
                if first in slug.lower():
                    ent_type, ent_id = "person", pid
                    break
            make_note(
                title=title,
                body=read(notes_file),
                note_type="meeting",
                entry_date=d,
                tags=[WORK_TAG],
                entity_type=ent_type,
                entity_id=ent_id,
            )

    # -- 8. vision / strategy + episodes -> reference notes -------------- #
    for fname, title in [
        ("vision/the-what.md", "MADE: Exploration — Strategy (the what)"),
        ("vision/made-problems.md", "MADE Problems"),
    ]:
        f = src / fname
        if f.exists():
            make_note(
                title=title,
                body=read(f),
                note_type="reference",
                entry_date=None,
                tags=[WORK_TAG],
                entity_type="program",
                entity_id=program["id"],
            )

    edir = src / "episodes"
    if edir.exists():
        for f in sorted(edir.glob("*.md")):
            if f.name.lower() == "readme.md":
                continue
            title = f"Episode: {f.stem.replace('-', ' ').title()}"
            make_note(
                title=title,
                body=read(f),
                note_type="reference",
                entry_date=None,
                tags=[WORK_TAG],
                entity_type="program",
                entity_id=program["id"],
            )

    # -- 9. work-plan strategic directives -> reference note ------------- #
    plan = read(src / "work-plan.md")
    strategic = plan.split("## Proposed")[0]
    strategic = re.sub(r"^#\s*Work Plan\s*", "", strategic).strip()
    if strategic:
        make_note(
            title="Work Plan — Strategic Directives",
            body=strategic,
            note_type="reference",
            entry_date=None,
            tags=[WORK_TAG],
            entity_type="area",
            entity_id=area["id"],
        )

    # -- 10. brian-relationship (sensitive; private) --------------------- #
    br = src / "brian-relationship.md"
    if br.exists():
        make_note(
            title="Brian — relationship notes (private)",
            body=read(br),
            note_type="note",
            entry_date=None,
            tags=[WORK_TAG, "private"],
            entity_type="person",
            entity_id=people_ids["Brian Krabach"],
        )

    # ------------------------------------------------------------------ #
    # Summary
    # ------------------------------------------------------------------ #
    L("")
    L(f"{'DRY RUN — ' if args.dry_run else ''}Import summary ({args.base_url}):")
    for bucket, label in [
        (c.created, "created"),
        (c.updated, "updated"),
        (c.skipped, "skipped (exists)"),
    ]:
        if any(bucket.values()):
            L(f"  {label}:")
            for path, n in sorted(bucket.items()):
                L(f"    {path:16} {n}")
    L(f"  notes processed: {note_count}")
    L(f"  lexicon entries: {len(lex.entries)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
