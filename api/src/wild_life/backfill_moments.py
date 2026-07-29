"""Backfill the moment spine from the tables that will retire into it.

Phase 3 of the moment inversion (`api/docs/moments.md`). Reads the existing
tables and writes `moments`, `moment_links`, their payload rows and
`calendar_records`. Nothing is dropped and nothing yet *reads* from the spine, so
this can be run, checked, corrected and run again.

Three properties are deliberate:

- **Idempotent.** Every backfilled moment carries a `source_ref` naming the row
  it came from, and inserts conflict on it. Re-running updates in place; it never
  duplicates. Links are rewritten wholesale per moment, which is simpler than
  reconciling them and costs nothing at this size.
- **Silent.** Every write is a Core statement, which the audit listener never
  sees (`db/audit.py` says so explicitly: it hooks the unit of work). Through the
  ORM this backfill would write ~8,000 `change_log` rows and `pg_notify` every
  open SSE stream once per row.
- **Checked.** Each source reports what it read and what it wrote, and `--check`
  runs the comparison without writing anything.

Run it against the Wild PC Postgres with `WILD_LIFE_DATABASE_URL` set:

    uv run wild-life-backfill-moments --check
    uv run wild-life-backfill-moments
"""

from __future__ import annotations

import argparse
import uuid
from collections.abc import Iterable
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

from wild_life.config import settings
from wild_life.recurrence import translate


def _zone_of(tzid: str | None) -> timezone | ZoneInfo:
    """The zone a series is expressed in; UTC when it never told us."""
    if tzid:
        try:
            return ZoneInfo(tzid)
        except (ZoneInfoNotFoundError, ValueError):
            pass
    return timezone.utc


# A day-precision moment needs *some* instant. Noon UTC keeps a date from
# sliding across the date line in either direction when rendered locally, which
# midnight does not.
_DAY_ANCHOR = time(12, 0, tzinfo=timezone.utc)


def _instant(d: date | datetime | None) -> datetime | None:
    if d is None:
        return None
    if isinstance(d, datetime):
        return d
    return datetime.combine(d, _DAY_ANCHOR)


class Backfill:
    """One transaction's worth of work, with a tally per source."""

    def __init__(
        self, conn: Connection, *, dry_run: bool, since: datetime | None = None
    ) -> None:
        self.conn = conn
        self.dry_run = dry_run
        # Incremental watermark. The tick passes a generous overlap rather than
        # an exact high-water mark: re-upserting a handful of rows is free, and
        # a watermark that has to be stored is a watermark that can be wrong.
        self.since = since
        self.tally: dict[str, int] = {}

    # --- primitives ---------------------------------------------------------

    def moment(
        self,
        source_ref: str,
        *,
        kind: str,
        started_at: datetime | None = None,
        ended_at: datetime | None = None,
        all_day: bool = False,
        window_start: datetime | None = None,
        window_end: datetime | None = None,
        expected_minutes: int | None = None,
        title: str | None = None,
        body: str = "",
        source: str = "authored",
        changed_at: datetime | None = None,
    ) -> uuid.UUID | None:
        """Upsert one moment, returning its id (None on a dry run).

        ``changed_at`` is when the *source row* last changed. When given, an
        existing moment is only overwritten if it has not been edited since —
        which matters now that the surfaces write moments directly. Before the
        cut-over the mirror was the only writer and could always win; now a
        title corrected on the calendar would be silently reverted by the next
        full run, and reverting someone\'s edit is worse than a stale mirror.
        """
        if self.dry_run:
            return None
        row = self.conn.execute(
            text("""
                INSERT INTO wild_life.moments (
                    kind, started_at, ended_at, all_day,
                    window_start, window_end, expected_minutes,
                    title, body, source, source_ref
                ) VALUES (
                    :kind, :started_at, :ended_at, :all_day,
                    :window_start, :window_end, :expected_minutes,
                    :title, :body, :source, :source_ref
                )
                ON CONFLICT (source_ref) DO UPDATE SET
                    kind = EXCLUDED.kind,
                    started_at = EXCLUDED.started_at,
                    ended_at = EXCLUDED.ended_at,
                    all_day = EXCLUDED.all_day,
                    window_start = EXCLUDED.window_start,
                    window_end = EXCLUDED.window_end,
                    expected_minutes = EXCLUDED.expected_minutes,
                    title = EXCLUDED.title,
                    body = EXCLUDED.body,
                    source = EXCLUDED.source
                -- Cast required: compared only against NULL, Postgres cannot
                -- infer the parameter's type and refuses the statement outright.
                WHERE CAST(:changed_at AS timestamptz) IS NULL
                   OR wild_life.moments.updated_at <= CAST(:changed_at AS timestamptz)
                RETURNING id
            """),
            {
                "kind": kind,
                "started_at": started_at,
                "ended_at": ended_at,
                "all_day": all_day,
                "window_start": window_start,
                "window_end": window_end,
                "expected_minutes": expected_minutes,
                "title": title,
                "body": body,
                "source": source,
                "source_ref": source_ref,
                "changed_at": changed_at,
            },
        ).first()
        if row is not None:
            return row[0]
        # The conflict was declined: the moment has been edited since the source
        # row last changed, so it keeps what it has.
        return self.conn.execute(
            text("SELECT id FROM wild_life.moments WHERE source_ref = :ref"),
            {"ref": source_ref},
        ).scalar()

    def links(
        self,
        moment_id: uuid.UUID | None,
        edges: Iterable[tuple[str, str, uuid.UUID]],
    ) -> list[uuid.UUID]:
        """Replace a moment's links with `edges` of (role, entity_type, entity_id)."""
        if self.dry_run or moment_id is None:
            return []
        self.conn.execute(
            text("DELETE FROM wild_life.moment_links WHERE moment_id = :m"),
            {"m": moment_id},
        )
        ids: list[uuid.UUID] = []
        for role, entity_type, entity_id in edges:
            if entity_id is None:
                continue
            got = self.conn.execute(
                text("""
                    INSERT INTO wild_life.moment_links
                        (moment_id, role, entity_type, entity_id)
                    VALUES (:m, :role, :et, :eid)
                    ON CONFLICT ON CONSTRAINT uq_moment_links_edge DO UPDATE
                        SET role = EXCLUDED.role
                    RETURNING id
                """),
                {"m": moment_id, "role": role, "et": entity_type, "eid": entity_id},
            ).one()
            ids.append(got[0])
        return ids

    def rule(self, source_ref: str, **cols: Any) -> uuid.UUID | None:
        """Upsert one rule, returning its id (None on a dry run).

        The same shape as :meth:`moment`, and idempotent for the same reason: the
        row it was built from names it, so a re-run corrects in place rather than
        duplicating.
        """
        if self.dry_run:
            return None
        names = list(cols)
        assigns = ", ".join(f"{n} = EXCLUDED.{n}" for n in names)
        row = self.conn.execute(
            text(f"""
                INSERT INTO wild_life.routines ({", ".join(names)}, source_ref)
                VALUES ({", ".join(f":{n}" for n in names)}, :source_ref)
                ON CONFLICT (source_ref) DO UPDATE SET {assigns}
                RETURNING id
            """),
            {**cols, "source_ref": source_ref},
        ).one()
        return row[0]

    def rule_links(
        self,
        rule_id: uuid.UUID | None,
        edges: Iterable[tuple[str, str, uuid.UUID]],
    ) -> None:
        """Replace a rule's links with `edges` of (role, entity_type, entity_id)."""
        if self.dry_run or rule_id is None:
            return
        self.conn.execute(
            text("DELETE FROM wild_life.rule_links WHERE rule_id = :r"),
            {"r": rule_id},
        )
        for role, entity_type, entity_id in edges:
            if entity_id is None:
                continue
            self.conn.execute(
                text("""
                    INSERT INTO wild_life.rule_links
                        (rule_id, role, entity_type, entity_id)
                    VALUES (:r, :role, :et, :eid)
                    ON CONFLICT ON CONSTRAINT uq_rule_links_edge DO NOTHING
                """),
                {"r": rule_id, "role": role, "et": entity_type, "eid": entity_id},
            )

    def count(self, key: str, n: int = 1) -> None:
        self.tally[key] = self.tally.get(key, 0) + n

    def rows(self, sql: str, **params: Any) -> list[Any]:
        if self.since is not None and ":since" in sql:
            params["since"] = self.since
        return list(self.conn.execute(text(sql), params))

    def _changed(self, alias: str = "") -> str:
        """`AND <alias>updated_at > :since`, or nothing on a full run."""
        if self.since is None:
            return ""
        return f" AND {alias}updated_at > :since"

    def _is_self(self, entity_type: str, entity_id: uuid.UUID) -> bool:
        """Whether a link points at the frame rather than at something in it."""
        return entity_type == "person" and entity_id == settings.self_person_id

    # --- sources ------------------------------------------------------------

    def notes(self) -> None:
        """Notes become reflections, observations, or a capture.

        Rooted at the self person → `reflection`: the journal, defined positively
        by what it *is* rather than by having no home, which is the mistake that
        once put a 29-year archive in a triage queue. Rooted elsewhere →
        `observation`. Rooted nowhere → `capture`, which is the inbox.
        """
        mentions: dict[uuid.UUID, list[tuple[str, uuid.UUID]]] = {}
        for m in self.rows(
            "SELECT note_id, target_type, target_id FROM wild_life.note_mentions"
        ):
            mentions.setdefault(m.note_id, []).append((m.target_type, m.target_id))

        for n in self.rows(f"""
            SELECT id, title, body, entry_date, entity_type, entity_id, created_at,
                   updated_at
            FROM wild_life.notes WHERE true {self._changed()}
        """):
            rooted_at_self = self._is_self(n.entity_type, n.entity_id)
            if rooted_at_self:
                kind = "reflection"
            elif n.entity_type is not None:
                kind = "observation"
            else:
                kind = "capture"
            # entry_date is nullable on 14 rows; created_at is when it entered
            # the system, which is the only honest fallback.
            occurred = _instant(n.entry_date) or n.created_at
            mid = self.moment(
                f"note:{n.id}",
                kind=kind,
                started_at=occurred,
                all_day=True,
                title=n.title,
                body=n.body or "",
                changed_at=n.updated_at,
            )
            edges: list[tuple[str, str, uuid.UUID]] = []
            # The self link is dropped, not migrated: you are the frame, and
            # "Paul was present" on every row destroys the informative link.
            if n.entity_type and not rooted_at_self:
                edges.append(("subject", n.entity_type, n.entity_id))
            # Self-*mentions* go too, and for the same reason — 15 journal
            # entries mention their own author, which is the diary noting that it
            # was written by whoever writes it. When Phase 4 rewires the composer,
            # the mention reconciler needs this rule or they come back on save.
            edges += [
                ("mention", t, i)
                for t, i in mentions.get(n.id, [])
                if not self._is_self(t, i)
            ]
            self.links(mid, edges)
            self._images(n.id, mid)
            self.count(f"note→{kind}")
            self.count("links", len(edges))

    def _images(self, note_id: uuid.UUID, moment_id: uuid.UUID | None) -> None:
        """Carry a note's attached pictures over, bytes and all.

        The moment gets a fresh id, so the files move to a directory named for it
        rather than being reached through a note that is going away. The body's
        inline `![alt](note-image:<id>)` references are rewritten to
        `moment-image:` in the same pass — a picture that is attached but no
        longer referenced is invisible, which is the same silence as not
        migrating it.
        """
        if self.dry_run or moment_id is None:
            return
        rows = self.rows(
            "SELECT id, filename, content_type, sort_order FROM wild_life.note_images "
            "WHERE note_id = :n ORDER BY sort_order, created_at",
            n=note_id,
        )
        if not rows:
            return
        for img in rows:
            self.conn.execute(
                text("""
                    INSERT INTO wild_life.moment_images
                        (id, moment_id, filename, content_type, sort_order)
                    VALUES (:id, :m, :f, :c, :s)
                    ON CONFLICT (id) DO UPDATE SET
                        moment_id = EXCLUDED.moment_id,
                        filename = EXCLUDED.filename,
                        content_type = EXCLUDED.content_type,
                        sort_order = EXCLUDED.sort_order
                """),
                {
                    "id": img.id,
                    "m": moment_id,
                    "f": img.filename,
                    "c": img.content_type,
                    "s": img.sort_order,
                },
            )
            src = settings.data_dir / "note_images" / str(note_id) / str(img.id)
            dst = settings.data_dir / "moment_images" / str(moment_id) / str(img.id)
            if dst.exists():
                self.count("images already carried")
            elif src.exists():
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.write_bytes(src.read_bytes())
                self.count("images carried")
            else:
                # Loud, because the row without its bytes is a picture that
                # renders as a broken box. The first run of this wrote 13 rows
                # and copied nothing, because WILD_LIFE_DATA_DIR was not set and
                # `data_dir` fell back to a relative path that did not exist.
                self.count(f"IMAGE BYTES MISSING under {settings.data_dir}")
        self.conn.execute(
            text(
                "UPDATE wild_life.moments "
                "SET body = replace(body, 'note-image:', 'moment-image:') "
                "WHERE id = :m"
            ),
            {"m": moment_id},
        )

    def events(self) -> None:
        """Events become occasions, and their sharing becomes a calendar record.

        `event_type` in (note, symptom, injury) is prose about something rather
        than somewhere you had to be, so those become observations.
        """
        attendee_links: dict[uuid.UUID, list[uuid.UUID]] = {}
        self_edges: dict[uuid.UUID, int] = {}
        for a in self.rows("""
            SELECT source_id, target_id FROM wild_life.entity_links
            WHERE source_type = 'event' AND target_type = 'person'
              AND relation = 'attendee'
        """):
            if self._is_self("person", a.target_id):
                # Counted against the event that carries it, so an incremental
                # run reports the edges it actually dropped rather than every
                # edge in the table.
                self_edges[a.source_id] = self_edges.get(a.source_id, 0) + 1
                continue
            attendee_links.setdefault(a.source_id, []).append(a.target_id)

        for e in self.rows(
            """
            SELECT id, title, event_type, description, location, location_id,
                   start_at, end_at, all_day, attendees, recurrence,
                   recurrence_exdates, recurrence_parent_id, recurrence_id,
                   entity_type, entity_id, external_ref, organizer, sequence,
                   rsvp_status, rsvp_sent_status, invites_enabled, cancelled_at,
                   updated_at
            FROM wild_life.events WHERE true {changed}
        """.format(changed=self._changed())
        ):
            kind = (
                "observation"
                if e.event_type in ("note", "symptom", "injury")
                else "occasion"
            )
            mid = self.moment(
                f"event:{e.id}",
                kind=kind,
                started_at=e.start_at,
                ended_at=e.end_at,
                all_day=e.all_day,
                title=e.title,
                body=e.description or "",
                source="imported" if e.external_ref else "authored",
                changed_at=e.updated_at,
            )
            edges = []
            if e.entity_type:
                edges.append(("subject", e.entity_type, e.entity_id))
            if e.location_id:
                edges.append(("place", "location", e.location_id))
            edges += [
                ("participant", "person", p) for p in attendee_links.get(e.id, [])
            ]
            self.links(mid, edges)
            self.count(f"event→{kind}")
            self.count("links", len(edges))
            if self_edges.get(e.id):
                self.count("self-participant edges dropped", self_edges[e.id])

            # The projection: only what has to round-trip. A moment with no
            # calendar record has nothing that can leave the system.
            shares = bool(
                e.external_ref
                or e.attendees
                or e.organizer
                or e.recurrence
                or e.invites_enabled
            )
            if shares and not self.dry_run:
                self.conn.execute(
                    text("""
                        INSERT INTO wild_life.calendar_records (
                            moment_id, external_ref, attendees, organizer, sequence,
                            rsvp_status, rsvp_sent_status, invites_enabled,
                            recurrence, recurrence_exdates, recurrence_id, cancelled_at
                        ) VALUES (
                            :moment_id, :external_ref, :attendees, :organizer, :sequence,
                            :rsvp_status, :rsvp_sent_status, :invites_enabled,
                            :recurrence, :recurrence_exdates, :recurrence_id, :cancelled_at
                        )
                        ON CONFLICT (moment_id) DO UPDATE SET
                            external_ref = EXCLUDED.external_ref,
                            attendees = EXCLUDED.attendees,
                            organizer = EXCLUDED.organizer,
                            sequence = EXCLUDED.sequence,
                            rsvp_status = EXCLUDED.rsvp_status,
                            rsvp_sent_status = EXCLUDED.rsvp_sent_status,
                            invites_enabled = EXCLUDED.invites_enabled,
                            recurrence = EXCLUDED.recurrence,
                            recurrence_exdates = EXCLUDED.recurrence_exdates,
                            recurrence_id = EXCLUDED.recurrence_id,
                            cancelled_at = EXCLUDED.cancelled_at
                    """),
                    {
                        "moment_id": mid,
                        "external_ref": e.external_ref,
                        "attendees": list(e.attendees or []),
                        "organizer": e.organizer,
                        "sequence": e.sequence,
                        "rsvp_status": e.rsvp_status,
                        "rsvp_sent_status": e.rsvp_sent_status,
                        "invites_enabled": e.invites_enabled,
                        "recurrence": e.recurrence,
                        "recurrence_exdates": list(e.recurrence_exdates or []),
                        "recurrence_id": e.recurrence_id,
                        "cancelled_at": e.cancelled_at,
                    },
                )
            if shares:
                self.count("calendar records")

    def occasion_rules(self) -> None:
        """Recurring events become **rules**, alongside the moments they already are.

        Additive on purpose. The calendar still reads `events` and the existing
        occasion moments still mirror them, so nothing changes shape here — this
        proves the model against real data before anything depends on it, the way
        the moment spine was proved first.

        Two paths, and which one a series takes is decided by
        ``recurrence.translate`` (decision 8):

        - **translated** — the wire rule maps onto our cadence, so the series
          becomes one rule and its occurrences are *computed*. 58 of 74.
        - **materialised** — it does not (YEARLY, MONTHLY-by-weekday, COUNT), so
          the occurrences we were given stand as they are and no rule is written.
          16 of 74. Nothing is lost: the wire form is on the calendar record
          verbatim, which is what an export replays.

        A note on the slot. ``timing`` holds the series' time of day as "HH:MM" —
        a clock time where a dose rule holds a named slot, which is the same idea
        ("when in the day") resolved one step further. It is read in the series'
        own ``timezone`` when one was captured, so a 9am meeting stays 9am across
        a daylight-saving boundary. Series imported before TZID was captured have
        none, and keep the historical behaviour of expanding in UTC; re-running
        ``scripts/import_ics.py`` over the source calendar is what fills them in.
        """
        attendees: dict[uuid.UUID, list[uuid.UUID]] = {}
        for a in self.rows("""
            SELECT source_id, target_id FROM wild_life.entity_links
            WHERE source_type = 'event' AND target_type = 'person'
              AND relation = 'attendee'
        """):
            if self._is_self("person", a.target_id):
                continue
            attendees.setdefault(a.source_id, []).append(a.target_id)

        for e in self.rows(f"""
            SELECT id, title, description, start_at, end_at, recurrence,
                   entity_type, entity_id, location_id, timezone
            FROM wild_life.events
            WHERE recurrence IS NOT NULL {self._changed()}
        """):
            # Everything about a series is expressed in its own zone: the
            # weekday a BYDAY-less rule recurs on, the day UNTIL admits, and the
            # day the series starts. Reading any of them off the stored UTC
            # instant is a day out for an evening series — `Poetry Class` runs
            # 18:30 Wednesday Pacific, which is 02:30 *Thursday* UTC, so a
            # UTC-derived start date began the series after its first meeting.
            zone = _zone_of(e.timezone)
            local_start = e.start_at.astimezone(zone)
            cadence = translate(e.recurrence, local_start)
            if cadence is None:
                self.count("recurring events materialised as given")
                continue
            minutes = (
                int((e.end_at - e.start_at).total_seconds() // 60)
                if e.end_at and e.start_at
                else None
            )
            rid = self.rule(
                f"event:{e.id}:rule",
                kind="occasion",
                activity=e.title,
                rationale=e.description,
                # The slot is a wall time in the series' own zone, so it has to
                # be read there — taking it off a UTC instant would bake in
                # whichever offset happened to apply on the start date.
                timing=[local_start.strftime("%H:%M")],
                timezone=e.timezone,
                days_of_week=cadence.days_of_week,
                interval_days=cadence.interval_days,
                months=cadence.months,
                day_of_month=cadence.day_of_month,
                week_of_month=cadence.week_of_month,
                start_date=local_start.date(),
                end_date=cadence.end_date,
                expected_minutes=minutes,
                status="active",
            )
            edges: list[tuple[str, str, uuid.UUID]] = []
            if e.entity_type and not self._is_self(e.entity_type, e.entity_id):
                edges.append(("subject", e.entity_type, e.entity_id))
            if e.location_id:
                edges.append(("place", "location", e.location_id))
            edges += [("participant", "person", p) for p in attendees.get(e.id, [])]
            self.rule_links(rid, edges)
            # Tie the series' anchor moment to the rule, so the read path knows
            # to expand our cadence rather than the wire form it also carries.
            # `occurrence_at` stays null: the anchor is the series, not one of
            # its occurrences.
            if not self.dry_run:
                self.conn.execute(
                    text("""
                        UPDATE wild_life.moments SET rule_id = :rid
                        WHERE source_ref = :ref AND occurrence_at IS NULL
                    """),
                    {"rid": rid, "ref": f"event:{e.id}"},
                )
            self.count("event→occasion rule")
            self.count("rule links", len(edges))

    def routine_instances(self) -> None:
        """A logged protocol step: a dose if it names a medication, else activity.

        The one subsystem already built on this model — intention
        (`scheduled_date`) and occurrence (`completed_at`) on one row, with
        `skipped` for the intention that had no occurrence.
        """
        for i in self.rows(
            """
            SELECT ri.id, ri.routine_id, ri.medication_id, ri.scheduled_date,
                   ri.completed_at, ri.status, ri.amount, ri.unit, ri.slot,
                   r.medication_id AS routine_medication_id, r.activity
            FROM wild_life.routine_instances ri
            LEFT JOIN wild_life.routines r ON r.id = ri.routine_id
            WHERE true {changed}
        """.format(changed=self._changed("ri."))
        ):
            med = i.medication_id or i.routine_medication_id
            kind = "dose" if med else "activity"
            window = _instant(i.scheduled_date)
            mid = self.moment(
                f"routine_instance:{i.id}",
                kind=kind,
                started_at=i.completed_at,
                all_day=i.completed_at is None,
                window_start=window,
                window_end=window,
                title=i.activity,
            )
            edges = []
            if med:
                edges.append(("subject", "medication", med))
            elif i.routine_id:
                edges.append(("subject", "routine", i.routine_id))
            link_ids = self.links(mid, edges)
            if med and link_ids and not self.dry_run:
                self.conn.execute(
                    text("""
                        INSERT INTO wild_life.moment_doses (link_id, amount, unit)
                        VALUES (:l, :a, :u)
                        ON CONFLICT (link_id) DO UPDATE
                            SET amount = EXCLUDED.amount, unit = EXCLUDED.unit
                    """),
                    {"l": link_ids[0], "a": i.amount, "u": i.unit},
                )
            self.count(f"routine_instance→{kind}")
            self.count("links", len(edges))

    def readings(self) -> None:
        """Metric entries become measurements; a group reading is one act.

        `GroupReading` retires here rather than migrating: the moment *is* the
        occasion its entries share, which is what `MetricGroup`'s docstring says
        it always was. A standalone entry is its own act.
        """
        # An incremental run must load *every* entry of any panel it touches, not
        # just the changed one: `links()` rewrites a moment's links wholesale, so
        # a lipid panel where one value was corrected would otherwise come out
        # with one metric linked and four dropped.
        affected = """
            SELECT id, recorded_at, context FROM wild_life.group_readings gr
            WHERE true {changed}
               OR EXISTS (
                   SELECT 1 FROM wild_life.metric_entries e
                   WHERE e.group_reading_id = gr.id {entry_changed}
               )
        """.format(changed=self._changed("gr."), entry_changed=self._changed("e."))
        readings = self.rows(affected)
        group_ids = [gr.id for gr in readings]

        grouped: dict[uuid.UUID, list[Any]] = {}
        if group_ids:
            for m in self.rows(
                "SELECT id, metric_id, recorded_at, value, context, group_reading_id "
                "FROM wild_life.metric_entries WHERE group_reading_id = ANY(:ids)",
                ids=group_ids,
            ):
                grouped.setdefault(m.group_reading_id, []).append(m)

        loose = self.rows(
            """
            SELECT id, metric_id, recorded_at, value, context, group_reading_id
            FROM wild_life.metric_entries
            WHERE group_reading_id IS NULL {changed}
        """.format(changed=self._changed())
        )

        for gr in readings:
            entries = grouped.get(gr.id, [])
            mid = self.moment(
                f"group_reading:{gr.id}",
                kind="measurement",
                started_at=gr.recorded_at,
                body=getattr(gr, "context", None) or "",
            )
            link_ids = self.links(
                mid, [("subject", "metric", e.metric_id) for e in entries]
            )
            for link_id, entry in zip(link_ids, entries, strict=False):
                self._reading(link_id, entry)
            self.count("group_reading→measurement")
            self.count("links", len(entries))

        for m in loose:
            mid = self.moment(
                f"metric_entry:{m.id}",
                kind="measurement",
                started_at=m.recorded_at,
            )
            link_ids = self.links(mid, [("subject", "metric", m.metric_id)])
            for link_id in link_ids:
                self._reading(link_id, m)
            self.count("metric_entry→measurement")
            self.count("links", 1)

    def _reading(self, link_id: uuid.UUID, entry: Any) -> None:
        if self.dry_run:
            return
        self.conn.execute(
            text("""
                INSERT INTO wild_life.moment_readings (link_id, value, context)
                VALUES (:l, :v, :c)
                ON CONFLICT (link_id) DO UPDATE
                    SET value = EXCLUDED.value, context = EXCLUDED.context
            """),
            {"l": link_id, "v": entry.value, "c": entry.context},
        )

    def visits(self) -> None:
        """A stretch inside a place — machine-derived, and rebuildable.

        `source: derived` is the flag a rebuild must respect: hand-entered visits
        ("I was at Mom's, no phone") are authored and must survive one.
        """
        for v in self.rows(
            """
            SELECT id, location_id, entered_at, exited_at, source
            FROM wild_life.location_visits WHERE true {changed}
        """.format(changed=self._changed())
        ):
            mid = self.moment(
                f"location_visit:{v.id}",
                kind="visit",
                started_at=v.entered_at,
                ended_at=v.exited_at,
                source="derived" if v.source == "derived" else "authored",
            )
            self.links(mid, [("place", "location", v.location_id)])
            self.count("location_visit→visit")
            self.count("links", 1)

    def task_moments(self) -> None:
        """A task's completion, and its intention to work on it.

        Two moments, not one: finishing is an occurrence, and being scheduled for
        Tuesday is an intention with a window. `estimated_minutes` becomes the
        expected duration, so the delta against what happened is recoverable.
        """
        for t in self.rows(
            """
            SELECT id, title, completed_at, scheduled_date, scheduled_time,
                   estimated_minutes
            FROM wild_life.tasks
            WHERE (completed_at IS NOT NULL OR scheduled_date IS NOT NULL)
            {changed}
        """.format(changed=self._changed())
        ):
            if t.completed_at is not None:
                mid = self.moment(
                    f"task:{t.id}:completion",
                    kind="completion",
                    started_at=t.completed_at,
                    title=t.title,
                )
                self.links(mid, [("subject", "task", t.id)])
                self.count("task→completion")
                self.count("links", 1)
            if t.scheduled_date is not None:
                if t.scheduled_time is not None:
                    start = datetime.combine(
                        t.scheduled_date, t.scheduled_time, tzinfo=timezone.utc
                    )
                    minutes = t.estimated_minutes or 60
                    end = start
                else:
                    start = _instant(t.scheduled_date)
                    minutes = t.estimated_minutes
                    end = start
                mid = self.moment(
                    f"task:{t.id}:work",
                    kind="work",
                    all_day=t.scheduled_time is None,
                    window_start=start,
                    window_end=end,
                    expected_minutes=minutes,
                    title=t.title,
                )
                self.links(mid, [("subject", "task", t.id)])
                self.count("task→work intention")
                self.count("links", 1)

    def exchanges(self) -> None:
        """The dates on a delegation are things one of two parties did.

        Each becomes an `exchange` — a communication about the ask — rather than
        a column. What was actually said can then be written on it, which a date
        column has never been able to hold.
        """
        stages = (
            ("date_delegated", "asked"),
            ("accepted_date", "accepted"),
            ("delivered_date", "delivered"),
            ("last_contact_date", "contacted"),
        )
        for d in self.rows(
            """
            SELECT id, requested_outcome, delegator_id, responsible_id,
                   date_delegated, accepted_date, delivered_date, last_contact_date,
                   latest_update
            FROM wild_life.delegations WHERE true {changed}
        """.format(changed=self._changed())
        ):
            for column, stage in stages:
                when = getattr(d, column)
                if when is None:
                    continue
                mid = self.moment(
                    f"delegation:{d.id}:{stage}",
                    kind="exchange",
                    started_at=_instant(when),
                    all_day=True,
                    title=f"{stage.capitalize()} — {d.requested_outcome}"[:200],
                    body=d.latest_update or "" if stage == "contacted" else "",
                )
                edges = [("subject", "delegation", d.id)]
                if d.responsible_id:
                    edges.append(("participant", "person", d.responsible_id))
                self.links(mid, edges)
                self.count(f"delegation→exchange:{stage}")
                self.count("links", len(edges))

    def finishes(self) -> None:
        """The remaining names for "the moment this finished", plus decisions."""
        sources = (
            ("request", "requests", "resolved_at", "subject", "completion"),
            ("commitment", "commitments", "date_made", "description", "exchange"),
            ("outcome", "outcomes", "satisfied_at", "statement", "completion"),
            ("review", "reviews", "completed_at", "review_type", "completion"),
            ("decision", "decisions", "decided_on", "question", "decision"),
            ("allergy", "allergies", "noted_on", "substance", "observation"),
        )
        for entity, table, column, label, kind in sources:
            for r in self.rows(
                f"SELECT id, {column} AS when_, {label} AS label "  # noqa: S608
                f"FROM wild_life.{table} WHERE {column} IS NOT NULL" + self._changed()
            ):
                mid = self.moment(
                    f"{entity}:{r.id}:{kind}",
                    kind=kind,
                    started_at=_instant(r.when_),
                    all_day=not isinstance(r.when_, datetime),
                    title=str(r.label)[:200] if r.label else None,
                )
                self.links(mid, [("subject", entity, r.id)])
                self.count(f"{entity}→{kind}")
                self.count("links", 1)


def run(dry_run: bool, since: datetime | None = None) -> dict[str, int]:
    # Refuse rather than proceed: without the self person, every journal entry
    # becomes an `observation` subject-linked to Paul — 253 reflections misfiled,
    # and 253 links asserting "I was present" that the model says must not exist.
    # The failure is silent and the result looks plausible, which is the worst
    # combination, and the dry run produced exactly it before this check existed.
    if settings.self_person_id is None:
        raise SystemExit(
            "WILD_LIFE_SELF_PERSON_ID is unset. The journal is defined by it — "
            "without it every reflection would migrate as an observation about "
            "yourself. Set it and re-run."
        )
    engine = create_engine(settings.sync_database_url, future=True)
    try:
        with engine.begin() as conn:
            b = Backfill(conn, dry_run=dry_run, since=since)
            b.notes()
            b.events()
            b.occasion_rules()
            b.routine_instances()
            b.readings()
            b.visits()
            b.task_moments()
            b.exchanges()
            b.finishes()
            if dry_run:
                conn.rollback()
            return b.tally
    finally:
        engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="read and tally without writing anything",
    )
    parser.add_argument(
        "--since-hours",
        type=float,
        default=None,
        help="only rows touched in the last N hours (default: everything)",
    )
    args = parser.parse_args()
    since = (
        datetime.now(timezone.utc) - timedelta(hours=args.since_hours)
        if args.since_hours is not None
        else None
    )
    tally = run(dry_run=args.check, since=since)
    width = max(len(k) for k in tally) if tally else 0
    for key in sorted(tally):
        print(f"{key.ljust(width)}  {tally[key]:>6}")
    print(f"{'(check only — nothing written)' if args.check else '(written)'}")


if __name__ == "__main__":
    main()
