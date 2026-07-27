import "leaflet/dist/leaflet.css"
import { useMemo } from "react"
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer } from "react-leaflet"
import type { Location, TrackPoint } from "@/services/api/types"

/**
 * A day's movement: the line you walked, and the fences you were inside.
 *
 * Lazy-loaded by its caller so Leaflet stays out of the main bundle. As in
 * `LocationMap`, no `L.Marker` — its default icon resolves images by relative
 * URL and 404s under Vite. Everything here is SVG.
 */

const FALLBACK: [number, number] = [47.6062, -122.3321]

export function TrackMap({
  points,
  fences,
  height = 420,
}: {
  points: TrackPoint[]
  fences: Location[]
  height?: number
}) {
  const line = useMemo(
    () => points.map((p) => [p.latitude, p.longitude] as [number, number]),
    [points],
  )

  // Centre on the day, not on the world. Midpoint of the track beats its first
  // point when the day ends somewhere else entirely.
  const center = useMemo<[number, number]>(() => {
    if (line.length === 0) return FALLBACK
    const lats = line.map((p) => p[0])
    const lons = line.map((p) => p[1])
    return [
      (Math.min(...lats) + Math.max(...lats)) / 2,
      (Math.min(...lons) + Math.max(...lons)) / 2,
    ]
  }, [line])

  // A day spent in one building and a day spent crossing a state need very
  // different zooms; derive it from how far the track actually spreads.
  const zoom = useMemo(() => {
    if (line.length < 2) return 15
    const lats = line.map((p) => p[0])
    const lons = line.map((p) => p[1])
    const spread = Math.max(
      Math.max(...lats) - Math.min(...lats),
      Math.max(...lons) - Math.min(...lons),
    )
    if (spread > 2) return 7
    if (spread > 0.5) return 9
    if (spread > 0.1) return 11
    if (spread > 0.02) return 13
    return 15
  }, [line])

  return (
    <div className="overflow-hidden rounded-lg border border-stone-300 dark:border-stone-700">
      <MapContainer
        key={`${center[0]},${center[1]},${zoom}`}
        center={center}
        zoom={zoom}
        scrollWheelZoom={false}
        style={{ height, width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {fences.map((f) =>
          f.latitude != null && f.longitude != null ? (
            <Circle
              key={f.id}
              center={[f.latitude, f.longitude]}
              radius={f.radius_m}
              pathOptions={{ color: "#0d9488", fillOpacity: 0.08, weight: 1 }}
            />
          ) : null,
        )}
        {line.length > 1 && (
          <Polyline positions={line} pathOptions={{ color: "#4f46e5", weight: 3, opacity: 0.75 }} />
        )}
        {line.length > 0 && (
          <>
            <CircleMarker
              center={line[0]}
              radius={5}
              pathOptions={{ color: "#059669", fillColor: "#059669", fillOpacity: 1 }}
            />
            <CircleMarker
              center={line[line.length - 1]}
              radius={5}
              pathOptions={{ color: "#dc2626", fillColor: "#dc2626", fillOpacity: 1 }}
            />
          </>
        )}
      </MapContainer>
    </div>
  )
}
