"""The global-search tables agree with the model layer — pure, no DB.

`/search` iterates `SEARCH_FIELDS` and looks each type up in `TYPE_TO_MODEL`, so
the two go stale in opposite, differently-visible ways. A type left in
`SEARCH_FIELDS` after its model retires raises `KeyError` and 500s *every*
unscoped query — which is what `event` and `note` did from the moments cut-over
until this test. A stale *column* fails silently instead: the endpoint filters to
the columns a model actually has, so the field just stops being searched and
nothing says so.
"""

from typing import get_args

from wild_life.query import SEARCH_FIELDS, TYPE_TO_MODEL
from wild_life.schemas.common import EntityType


def test_every_searched_type_has_a_model() -> None:
    """The 500: `/search` builds its type list from `SEARCH_FIELDS` keys."""
    assert set(SEARCH_FIELDS) <= set(TYPE_TO_MODEL)


def test_search_spans_exactly_entity_type() -> None:
    """Both directions, so a *new* type can't quietly be unsearchable either."""
    assert set(TYPE_TO_MODEL) == set(get_args(EntityType))
    assert set(SEARCH_FIELDS) == set(get_args(EntityType))


def test_every_searched_column_exists() -> None:
    """The silent half — a renamed column narrows search without erroring."""
    stale = {
        t: [c for c in cols if c not in TYPE_TO_MODEL[t].__table__.columns]
        for t, (_, cols) in SEARCH_FIELDS.items()
    }
    assert {t: bad for t, bad in stale.items() if bad} == {}


def test_every_label_column_exists() -> None:
    """The label is what a hit renders as; a missing one labels every row `(type)`.

    Deliberately not asserting the label is itself *searched*: `review` ranks by
    `review_type`, which is curated out of its text columns so that searching
    "weekly" doesn't return every weekly review.
    """
    missing = [
        t
        for t, (label, _) in SEARCH_FIELDS.items()
        if label not in TYPE_TO_MODEL[t].__table__.columns
    ]
    assert missing == []
