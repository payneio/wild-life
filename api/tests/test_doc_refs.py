"""Every documentation path this repository names must resolve.

`api/docs/model.md` and `api/docs/moments.md` were deleted on 2026-08-02. Three
days later a skill was committed whose first question was "read `model.md`", and
`AGENTS.md`, four source modules and the ERD all still pointed at them. Nothing
failed, because a reference to a missing document is invisible until someone
follows it — and the someone is usually an agent, mid-task, with no way to tell a
dead path from a path it lacks permission to read.

Pure filesystem; needs no database, so it runs in any environment.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]

# Where a doc path may be written: prose, source comments, skill definitions.
SEARCH_GLOBS = ("*.md", "*.py", "*.ts", "*.tsx")
# Row counts, in the formats erd.md used before they were removed. Deliberately
# narrow: a citation year and a vocabulary's cardinality are also numbers in
# brackets, and a check that cries wolf gets deleted.
COUNT_SHAPE = re.compile(
    r"\d,\d{3}"  # 2,838 — comma-grouped thousands
    r"|\bholds \d+"  # "rule_links holds 17"
    r"|\b\d+ rows\b"  # "with its 402 rows"
    r"|^#+ .*\(\d"  # "## 2. Rules … (92)" — a count in a section heading
    r"|^`\w+` \d+ ·",  # "`allergies` 1 · `insurance_plans` 3"
    re.M,
)

SKIP_DIRS = {
    ".git",
    ".venv",
    "node_modules",
    "dist",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    "versions",  # Alembic revisions are history: accurate when written, frozen since.
}

# `docs/foo.md`, `api/docs/foo.md`, `web/docs/foo.md` — with or without a leading
# `@` (the CLAUDE.md import form) or surrounding backticks.
DOC_REF = re.compile(r"(?<![\w/.])((?:api/|web/)?docs/[A-Za-z0-9_-]+\.md)")


def _iter_files() -> list[Path]:
    """Every file that could name a doc — except this one, which names dead paths
    on purpose (in its own docstring, and as fixtures for the test below)."""
    me = Path(__file__).resolve()
    out: list[Path] = []
    for pattern in SEARCH_GLOBS:
        for path in REPO.rglob(pattern):
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            if path.resolve() == me:
                continue
            out.append(path)
    return out


def _resolve(ref: str, source: Path) -> bool:
    """A doc path resolves if it is valid from the repo root or from its own package."""
    candidates = [REPO / ref]
    # `docs/domain.md` written inside api/ means api/docs/domain.md.
    for package in ("api", "web"):
        if package in source.relative_to(REPO).parts:
            candidates.append(REPO / package / ref)
    return any(c.is_file() for c in candidates)


def test_every_referenced_doc_exists() -> None:
    broken: list[str] = []
    for path in _iter_files():
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:  # pragma: no cover - unreadable file
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            for ref in set(DOC_REF.findall(line)):
                if not _resolve(ref, path):
                    rel = path.relative_to(REPO)
                    broken.append(f"{rel}:{lineno} -> {ref}")

    assert not broken, "Documentation paths that do not resolve:\n" + "\n".join(
        f"  {b}" for b in sorted(broken)
    )


def test_the_check_can_actually_fail() -> None:
    """A check that cannot fail is a comment. Pin the regex and the resolver."""
    assert DOC_REF.findall("see `api/docs/domain.md` for the definitions") == [
        "api/docs/domain.md"
    ]
    assert DOC_REF.findall("- **@api/docs/domain.md** — the model") == [
        "api/docs/domain.md"
    ]
    assert DOC_REF.findall("`docs/erd.md` §4") == ["docs/erd.md"]
    # A path that does not exist must not resolve, from anywhere in the tree.
    assert not _resolve("docs/no_such_file.md", REPO / "api" / "src" / "x.py")
    # And one that does, from a module inside api/ naming it package-relatively.
    assert _resolve("docs/domain.md", REPO / "api" / "src" / "wild_life" / "models.py")


@pytest.mark.parametrize("doc", ["domain.md", "erd.md"])
def test_the_two_documents_have_distinct_jobs(doc: str) -> None:
    """`domain.md` holds definitions; `erd.md` holds shape. Neither holds counts.

    They rotted as one file because status claims and definitions have different
    half-lives and discredited each other. Keep them apart mechanically.
    """
    text = (REPO / "api" / "docs" / doc).read_text(encoding="utf-8")
    if doc == "domain.md":
        for banned in ("not yet implemented", "phase 2", "phase 3", "roadmap"):
            assert banned not in text.lower(), (
                f"domain.md holds definitions, not status — found {banned!r}. "
                "Implementation status belongs in erd.md, which is regenerated."
            )
    else:
        # Skip the header, which explains *why* there are no counts.
        body = text.split("## How to read the diagrams", 1)[-1]
        found = sorted({m.group(0).strip() for m in COUNT_SHAPE.finditer(body)})
        assert not found, (
            f"erd.md carries no row counts; found {found}. How many rows a table "
            "holds is evidence about past guesses, not about the model's shape, "
            "and it is the surface that invites 'empty, therefore droppable'."
        )
