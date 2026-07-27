"""Distance on a sphere, and how well a position fix fits a place.

Pure functions, no database. There is no PostGIS on this box, and there does not
need to be: with a few dozen geofenced locations the whole question is a Python
loop over a short list, and keeping it here makes it trivially testable and
identical between the live path and a replay.

The fit is a **score, not a test**, and that is the important choice. A phone
reports `accuracy` as the radius of 68% confidence — one standard deviation of a
normal error distribution — so a fix is not a point but a distribution. Asking
"is this point inside the circle" throws that away, and forces fences to be
larger than the measurement error to work at all. Scoring by how many standard
deviations a fix sits outside a fence keeps the uncertainty in the arithmetic,
which is what lets a small fence stay useful.
"""

import math

EARTH_RADIUS_M = 6_371_008.8
_M_PER_DEG_LAT = 111_320.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = phi2 - phi1
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def beyond_latitude_band(lat1: float, lat2: float, limit_m: float) -> bool:
    """Cheap reject: is the latitude difference alone already past ``limit_m``?

    Latitude degrees are a constant length, so this costs two subtractions and
    lets a 15 km city fence and a 75 m office fence both fall out early without a
    trig call. Longitude has no such constant, so it is left to the real distance.
    """
    return abs(lat1 - lat2) * _M_PER_DEG_LAT > limit_m


def fit_score(
    distance_m: float,
    radius_m: float,
    accuracy_m: float,
    *,
    sigma_floor_m: float,
    max_slack_sigma: float,
    max_slack_m: float,
) -> float:
    """How well a fix fits a fence, from 0 (not here) to 1 (comfortably inside).

    Inside the fence scores 1. Outside, the score falls off as a Gaussian in the
    distance past the edge, measured in standard deviations of the fix's own
    error — so the same 30 m overshoot is convincing from a 100 m fix and
    damning from a 5 m one.

    Two independent cutoffs, because there are two different ways to be "not
    close enough" and neither guard covers the other:

    - ``max_slack_sigma`` stops a *precise* fix from claiming a fence it is
      plainly outside.
    - ``max_slack_m`` stops a *vague* fix from claiming anything at all. Without
      it the slack scales with uncertainty, so the less we knew the more
      confidently we would place you — exactly backwards.

    ``sigma_floor_m`` keeps an optimistic accuracy report from making the curve
    absurdly sharp; no consumer GPS is really good to a metre.
    """
    sigma = max(accuracy_m, sigma_floor_m)
    outside = max(0.0, distance_m - radius_m)
    if outside > max_slack_sigma * sigma or outside > max_slack_m:
        return 0.0
    z = outside / sigma
    return math.exp(-(z * z) / 2)


def encloses(
    outer_lat: float,
    outer_lon: float,
    outer_radius_m: float,
    inner_lat: float,
    inner_lon: float,
    inner_radius_m: float,
) -> bool:
    """Whether one fence wholly contains another.

    This is what separates *nesting* from *rivalry*. A bar inside a neighbourhood
    inside a city are not competing answers to "where are you" — you are in all
    three. Two bars thirty metres apart are competing, and only one of them can
    be right. Geometry already knows the difference, so nothing has to be
    declared: a fence that contains another never suppresses it.
    """
    centre_gap = haversine_m(outer_lat, outer_lon, inner_lat, inner_lon)
    return centre_gap + inner_radius_m <= outer_radius_m
