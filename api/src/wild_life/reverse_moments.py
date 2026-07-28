"""Write moments back into `notes` and `events` — the way out of the cut-over.

The backfill (`backfill_moments`) runs one way: old tables → spine. After the
surfaces move, writing lands only in the spine, and reverting the frontend would
make that afternoon's work invisible even though every row is still there. This
is the other direction, so a revert is two commands rather than an improvisation:

    uv run wild-life-reverse-moments --check
    uv run wild-life-reverse-moments
    # then: git revert the frontend commit

It only touches moments with **no `source_ref`** — the ones authored after the
cut-over, which have no old-world row. Anything backfilled already has its
original and is left alone.

The note or event it writes **takes the moment's own id**, which makes this
idempotent and keeps the two rows recognisably the same thing. It then stamps the
moment's `source_ref`, so a later backfill run sees a row it already knows and
updates in place instead of creating a second copy.

**It cannot round-trip everything, and says so.** A `work` intention, a
`withdrawal`, a `completion` — these have no representation in the old schema at
all. They are reported by kind and left as moments; a revert would hide them until
the surfaces come back.
"""

from __future__ import annotations

import argparse
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

from wild_life.config import settings

# What the old schema can express. Everything else exists only as a moment.
_AS_NOTE = {"reflection", "observation", "capture"}
_AS_EVENT = {"occasion"}


class Reverse:
    def __init__(self, conn: Connection, *, dry_run: bool) -> None:
        self.conn = conn
        self.dry_run = dry_run
        self.tally: dict[str, int] = {}

    def count(self, key: str, n: int = 1) -> None:
        self.tally[key] = self.tally.get(key, 0) + n

    def _links(self, moment_id: Any) -> list[Any]:
        return list(
            self.conn.execute(
                text(
                    "SELECT role, entity_type, entity_id FROM wild_life.moment_links "
                    "WHERE moment_id = :m"
                ),
                {"m": moment_id},
            )
        )

    def _stamp(self, moment_id: Any, source_ref: str) -> None:
        self.conn.execute(
            text("UPDATE wild_life.moments SET source_ref = :ref WHERE id = :m"),
            {"ref": source_ref, "m": moment_id},
        )

    def run(self) -> None:
        for m in self.conn.execute(
            text("""
                SELECT id, kind, title, body, started_at, ended_at, all_day,
                       window_start
                FROM wild_life.moments
                WHERE source_ref IS NULL
                ORDER BY created_at
            """)
        ):
            if m.kind in _AS_NOTE:
                self._note(m)
            elif m.kind in _AS_EVENT:
                self._event(m)
            else:
                # Named rather than silently skipped: knowing a revert would hide
                # 12 work intentions is the difference between an informed
                # decision and a surprise.
                self.count(f"no old-world form: {m.kind}")

    def _note(self, m: Any) -> None:
        links = self._links(m.id)
        subject = next((link for link in links if link.role == "subject"), None)
        if m.kind == "reflection":
            # The journal was "notes rooted at the self person" before the
            # inversion; going back means re-rooting there.
            entity_type, entity_id = "person", settings.self_person_id
        elif subject is not None:
            entity_type, entity_id = subject.entity_type, subject.entity_id
        else:
            entity_type, entity_id = None, None

        self.count(f"{m.kind}→note")
        if self.dry_run:
            return
        self.conn.execute(
            text("""
                INSERT INTO wild_life.notes
                    (id, title, body, entry_date, entity_type, entity_id)
                VALUES (:id, :title, :body, :entry_date, :entity_type, :entity_id)
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    body = EXCLUDED.body,
                    entry_date = EXCLUDED.entry_date,
                    entity_type = EXCLUDED.entity_type,
                    entity_id = EXCLUDED.entity_id
            """),
            {
                "id": m.id,
                "title": m.title,
                "body": m.body or "",
                "entry_date": m.started_at.date() if m.started_at else None,
                "entity_type": entity_type,
                "entity_id": entity_id,
            },
        )
        self.conn.execute(
            text("DELETE FROM wild_life.note_mentions WHERE note_id = :n"),
            {"n": m.id},
        )
        for link in links:
            if link.role != "mention":
                continue
            self.conn.execute(
                text("""
                    INSERT INTO wild_life.note_mentions (note_id, target_type, target_id)
                    VALUES (:n, :t, :i) ON CONFLICT DO NOTHING
                """),
                {"n": m.id, "t": link.entity_type, "i": link.entity_id},
            )
            self.count("mentions")
        self._stamp(m.id, f"note:{m.id}")

    def _event(self, m: Any) -> None:
        start = m.started_at or m.window_start
        if start is None:
            # `events.start_at` is NOT NULL, so an occasion with neither an
            # occurrence nor a window has nowhere to go.
            self.count("occasion with no time: left as a moment")
            return
        links = self._links(m.id)
        subject = next((link for link in links if link.role == "subject"), None)
        place = next((link for link in links if link.role == "place"), None)
        cal = self.conn.execute(
            text("""
                SELECT external_ref, attendees, organizer, sequence, rsvp_status,
                       rsvp_sent_status, invites_enabled, recurrence,
                       recurrence_exdates, recurrence_id, cancelled_at
                FROM wild_life.calendar_records WHERE moment_id = :m
            """),
            {"m": m.id},
        ).one_or_none()

        self.count("occasion→event")
        if self.dry_run:
            return
        self.conn.execute(
            text("""
                INSERT INTO wild_life.events (
                    id, title, description, start_at, end_at, all_day,
                    entity_type, entity_id, location_id,
                    external_ref, attendees, organizer, sequence, rsvp_status,
                    rsvp_sent_status, invites_enabled, recurrence,
                    recurrence_exdates, recurrence_id, cancelled_at
                ) VALUES (
                    :id, :title, :description, :start_at, :end_at, :all_day,
                    :entity_type, :entity_id, :location_id,
                    :external_ref, :attendees, :organizer, :sequence, :rsvp_status,
                    :rsvp_sent_status, :invites_enabled, :recurrence,
                    :recurrence_exdates, :recurrence_id, :cancelled_at
                )
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    start_at = EXCLUDED.start_at,
                    end_at = EXCLUDED.end_at,
                    all_day = EXCLUDED.all_day,
                    entity_type = EXCLUDED.entity_type,
                    entity_id = EXCLUDED.entity_id,
                    location_id = EXCLUDED.location_id
            """),
            {
                "id": m.id,
                "title": m.title or "(untitled)",
                "description": m.body or None,
                "start_at": start,
                "end_at": m.ended_at,
                "all_day": m.all_day,
                "entity_type": subject.entity_type if subject else None,
                "entity_id": subject.entity_id if subject else None,
                "location_id": place.entity_id if place else None,
                "external_ref": cal.external_ref if cal else None,
                "attendees": list(cal.attendees) if cal else [],
                "organizer": cal.organizer if cal else None,
                "sequence": cal.sequence if cal else None,
                "rsvp_status": cal.rsvp_status if cal else None,
                "rsvp_sent_status": cal.rsvp_sent_status if cal else None,
                "invites_enabled": cal.invites_enabled if cal else False,
                "recurrence": cal.recurrence if cal else None,
                "recurrence_exdates": list(cal.recurrence_exdates) if cal else [],
                "recurrence_id": cal.recurrence_id if cal else None,
                "cancelled_at": cal.cancelled_at if cal else None,
            },
        )
        for link in links:
            if link.role != "participant":
                continue
            self.conn.execute(
                text("""
                    INSERT INTO wild_life.entity_links
                        (source_type, source_id, target_type, target_id, relation)
                    VALUES ('event', :s, :t, :i, 'attendee')
                    ON CONFLICT DO NOTHING
                """),
                {"s": m.id, "t": link.entity_type, "i": link.entity_id},
            )
            self.count("attendee links")
        self._stamp(m.id, f"event:{m.id}")


def run(dry_run: bool) -> dict[str, int]:
    engine = create_engine(settings.sync_database_url, future=True)
    with engine.begin() as conn:
        rev = Reverse(conn, dry_run=dry_run)
        rev.run()
        if dry_run:
            conn.rollback()
        return rev.tally


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="tally without writing")
    args = parser.parse_args()
    tally = run(dry_run=args.check)
    if not tally:
        print("nothing to reverse — every moment already has an original")
        return
    width = max(len(k) for k in tally)
    for key in sorted(tally):
        print(f"{key.ljust(width)}  {tally[key]:>6}")
    print("(check only — nothing written)" if args.check else "(written)")


if __name__ == "__main__":
    main()
