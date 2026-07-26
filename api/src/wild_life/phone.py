"""Canonical phone storage, via Google's libphonenumber (the `phonenumbers` port).

Numbers arrive in every shape a human might type — `(800) 562-2582`,
`+1 415-812-7553`, `402-216-1420` and `1-877-888-9265` are all real stored values.
Storing them as typed means the same number never compares equal to itself, which
breaks dedupe, merge, and "who is calling me".

So the API canonicalises on write, the same way dates are stored ISO and formatted
on render: one stored form (E.164), one display form (the web app's `lib/phone.ts`,
which uses the same library's JS port so the two cannot disagree).

The parsing is libphonenumber's, not ours — it knows the numbering plans, and a
hand-rolled regex would quietly mangle the cases it doesn't. `DEFAULT_REGION` only
supplies a country for numbers typed without one; anything already carrying a `+`
is parsed on its own terms.
"""

import phonenumbers

# The region assumed for a bare national number ("2063996403"). Numbers written
# with a country code are unaffected.
DEFAULT_REGION = "US"


def normalize_phone(value: str | None) -> str | None:
    """E.164 (`+12063996403`) when the input parses to a valid number; unchanged otherwise.

    Never mangles: an unparseable or invalid number — a vanity number with letters,
    free text, a partial — is stored exactly as given. Silently corrupting an
    unusual number is far worse than leaving it alone. Idempotent.
    """
    if value is None:
        return None
    text = value.strip()
    if not text:
        return text

    try:
        parsed = phonenumbers.parse(text, DEFAULT_REGION)
    except phonenumbers.NumberParseException:
        return text
    if not phonenumbers.is_valid_number(parsed):
        return text

    e164 = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    # libphonenumber keeps the extension on the object, not in E164 output.
    return f"{e164} ext. {parsed.extension}" if parsed.extension else e164


def normalize_methods(methods: list[dict] | None) -> list[dict] | None:
    """Normalise the `value` of each contact method in a phones list."""
    if methods is None:
        return None
    return [
        {**m, "value": normalize_phone(m["value"])}
        if isinstance(m, dict) and isinstance(m.get("value"), str)
        else m
        for m in methods
    ]
