"""Description normalization — pure, no DB.

The bodies here are real shapes lifted from the events table: Teams plain-text
with angle-bracket links, Google `<br>` bodies, Zoom anchors split by `<wbr>`.
"""

from wild_life.richtext import looks_like_html, normalize_description

TEAMS_PLAINTEXT = (
    "________________________________________________________________________________\n"
    "Microsoft Teams meeting\n"
    "Join: https://teams.microsoft.com/meet/274404095813015?p=oXlaw0GtUoI4qU1Qck\n"
    "Meeting ID: 274 404 095 813 015\n"
    "Passcode: Si2hx32A\n"
    "Need help?<https://aka.ms/JoinTeamsMeeting>\n"
)

GOOGLE_HTML = (
    "Sync<br>-::~:~::~:~::-<br>Join with Google Meet: "
    '<a href="https://meet.google.com/abc-defg-hij">meet.google.com/abc-defg-hij</a>'
    "<br><br>Learn more<wbr>&nbsp;about Meet"
)

ZOOM_HTML = (
    '<a href="https://us06web.zoom.us/j/85230657715?pwd=yh923s2hHI7SPwEn6flg3c1MIun04c.1"'
    ' target="_blank">https://us06web.zoom.us/j/<wbr />85230657715?pwd=<wbr />'
    "yh923s2hHI7SPwEn6flg3c1MIun04c<wbr />.1</a>"
)


def test_plaintext_angle_bracket_url_is_untouched() -> None:
    """The hazard case: an HTML parser eats `<https://…>` and loses the URL."""
    assert looks_like_html(TEAMS_PLAINTEXT) is False
    assert normalize_description(TEAMS_PLAINTEXT) == TEAMS_PLAINTEXT


def test_bare_legacy_entity_in_query_string_is_not_mangled() -> None:
    # html.unescape() on the whole string would turn '&notin=' into '¬in='.
    url = "https://x.test/?a=1&notin=2&copyright=3"
    assert normalize_description(url) == url


def test_bare_ampersand_in_link_text_keeps_its_shape() -> None:
    """HTMLParser reads a raw `&action=` as an entity; it must not gain a `;`."""
    url = "https://app.acuityscheduling.com/schedule.php?owner=1774&action=appt&id%5B%5D=e50c"
    out = normalize_description(f'Change: <A HREF="{url}">{url}</A>')
    assert out is not None
    assert "&action;" not in out and "&id;" not in out
    assert out.count(url) == 2  # link text and href both intact


def test_entity_only_body_is_unescaped() -> None:
    assert (
        normalize_description("Free live shows at North Omaha Music &amp; Arts (NOMA)")
        == "Free live shows at North Omaha Music & Arts (NOMA)"
    )
    assert normalize_description("Caf&#233; &#x2014; 6pm") == "Café — 6pm"


def test_google_br_separated_body() -> None:
    out = normalize_description(GOOGLE_HTML)
    assert out is not None
    for markup in ("<br>", "<a ", "<wbr>", "&nbsp;"):
        assert markup not in out
    assert "https://meet.google.com/abc-defg-hij" in out
    assert "Sync" in out and "Learn more" in out


def test_nested_anchor_with_wbr_keeps_url_intact() -> None:
    out = normalize_description(ZOOM_HTML)
    assert out is not None
    assert (
        "https://us06web.zoom.us/j/85230657715?pwd=yh923s2hHI7SPwEn6flg3c1MIun04c.1"
        in out
    )
    assert "<wbr" not in out and "target=" not in out


def test_outlook_document_drops_css_keeps_text() -> None:
    out = normalize_description(
        "<html><head><style>p{font-family:Calibri;mso-style-priority:99}</style></head>"
        "<body><p>Agenda</p><p>Bring the deck</p></body></html>"
    )
    assert out is not None
    assert "font-family" not in out and "mso-style" not in out
    assert "Agenda" in out and "Bring the deck" in out


def test_table_cells_stay_separated() -> None:
    """A schedule is data — dropping the cell boundary glues the columns."""
    out = normalize_description(
        "<table><tbody>"
        "<tr><td>11 a.m. - 5:30 p.m.</td><td>Cooling Center</td><td>Redmond Library</td></tr>"
        "<tr><td>4 - 9 p.m.</td><td>Activity Booths</td><td>City Hall Campus</td></tr>"
        "</tbody></table>"
    )
    assert out is not None
    assert "p.m.Cooling" not in out and "CenterRedmond" not in out
    assert "Cooling Center" in out and "Activity Booths" in out


def test_no_hard_wrap_and_no_trailing_whitespace() -> None:
    out = normalize_description("<p>" + "word " * 200 + "</p>")
    assert out is not None
    assert len(out.splitlines()) == 1
    assert all(line == line.rstrip() for line in out.splitlines())


def test_idempotent() -> None:
    for body in (TEAMS_PLAINTEXT, GOOGLE_HTML, ZOOM_HTML, "Caf&#233;", "plain text"):
        once = normalize_description(body)
        assert normalize_description(once) == once


def test_non_tags_are_not_html() -> None:
    # Names that start like allow-listed tags but aren't: the boundary rule.
    for body in (
        "<https://aka.ms/x>",
        "<mailto:paul@payne.io>",
        "<b.example.com/path>",
        "<paul@payne.io>",
        "5 < 6 and 7 > 3",
        "<head-count wanted>",
    ):
        assert looks_like_html(body) is False, body
        assert normalize_description(body) == body


def test_real_tags_are_html() -> None:
    for body in ("</p>", "<br>", "<br/>", "<br />", '<a href="x">y</a>', "<td>1</td>"):
        assert looks_like_html(body) is True, body


def test_none_and_blank_pass_through() -> None:
    assert normalize_description(None) is None
    assert normalize_description("") == ""
    assert normalize_description("   ") == "   "
