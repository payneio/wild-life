"""Phone canonicalisation (no database)."""

import pytest

from wild_life.phone import normalize_methods, normalize_phone


class TestNormalizePhone:
    @pytest.mark.parametrize(
        "raw",
        [
            "2063996403",
            "(206) 399-6403",
            "206-399-6403",
            "206.399.6403",
            "+1 206-399-6403",
            "1-206-399-6403",
            " (206)3996403 ",
        ],
        ids=lambda r: r.strip(),
    )
    def test_one_number_one_stored_form(self, raw: str) -> None:
        """The whole point: every way of typing it compares equal."""
        assert normalize_phone(raw) == "+12063996403"

    def test_normalises_the_shapes_already_in_the_data(self) -> None:
        assert normalize_phone("(800) 562-2582") == "+18005622582"
        assert normalize_phone("1-877-888-9265") == "+18778889265"
        assert normalize_phone("+1 415-812-7553") == "+14158127553"

    def test_keeps_international_numbers_as_their_own_country(self) -> None:
        assert normalize_phone("+44 20 7946 0958") == "+442079460958"
        assert normalize_phone("+61 2 9374 4000") == "+61293744000"

    def test_keeps_an_extension(self) -> None:
        assert normalize_phone("206-399-6403 x89") == "+12063996403 ext. 89"

    def test_never_mangles_what_it_cannot_parse(self) -> None:
        # Corrupting an unusual number is worse than not normalising it.
        for raw in ["call the desk", "206-399", "555-0134", "x1234"]:
            assert normalize_phone(raw) == raw

    def test_resolves_a_vanity_number_to_the_digits_it_dials(self) -> None:
        """libphonenumber maps alpha keypad letters, so this is the *same*
        number, canonically written. Deferring to the library here rather than
        special-casing it is the reason for using it."""
        assert normalize_phone("1-800-FLOWERS") == "+18003569377"

    def test_is_idempotent(self) -> None:
        for raw in ["2063996403", "+44 20 7946 0958", "1-800-FLOWERS"]:
            once = normalize_phone(raw)
            assert normalize_phone(once) == once

    def test_handles_empty_and_none(self) -> None:
        assert normalize_phone(None) is None
        assert normalize_phone("") == ""
        assert normalize_phone("   ") == ""


class TestNormalizeMethods:
    def test_normalises_each_value_and_keeps_labels(self) -> None:
        assert normalize_methods([{"value": "(206) 399-6403", "label": "mobile"}]) == [
            {"value": "+12063996403", "label": "mobile"}
        ]

    def test_passes_through_none_and_odd_rows(self) -> None:
        assert normalize_methods(None) is None
        assert normalize_methods([{"label": "no value"}]) == [{"label": "no value"}]
