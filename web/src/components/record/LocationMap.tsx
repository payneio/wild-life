import "leaflet/dist/leaflet.css"
import { useCallback, useMemo, useState } from "react"
import { Circle, CircleMarker, MapContainer, TileLayer, useMapEvents } from "react-leaflet"
import { useFields } from "@/components/record/context"

/**
 * The fence, drawn and dragged.
 *
 * Binds all three geo fields through one `useFields`/`saveMany` rather than three
 * separate controls, because they are one fact. Moving the pin writes a
 * coordinate pair; three independent single-field PATCHes could interleave and
 * leave a location at half of one position.
 *
 * Deliberately no `L.Marker`: Leaflet's default icon resolves its images by
 * relative URL, which 404s under Vite's bundler — the classic first bug of every
 * Leaflet-in-Vite integration. `Circle` and `CircleMarker` are plain SVG, need no
 * assets, and are what a radius editor wants to draw anyway.
 *
 * The whole module (and Leaflet itself, ~52 KB gzipped) is lazy-loaded by its
 * only callers, so it never reaches the main bundle.
 */

const FIELDS = ["latitude", "longitude", "radius_m"] as const

/** Sensible starting view when a location has no coordinates yet. */
const FALLBACK: [number, number] = [47.6062, -122.3321]

function ClickToPlace({ onPlace }: { onPlace: (lat: number, lon: number) => void }) {
  useMapEvents({
    click: (e) => onPlace(e.latlng.lat, e.latlng.lng),
  })
  return null
}

export function LocationMap() {
  const { row, save } = useFields(FIELDS)
  const lat = row.latitude as number | null
  const lon = row.longitude as number | null
  const radius = (row.radius_m as number) ?? 150

  // Only used for the initial view: re-centring on every save would fight the
  // user for control of the viewport while they pan.
  const [initial] = useState<[number, number]>(
    lat != null && lon != null ? [lat, lon] : FALLBACK,
  )
  const placed = lat != null && lon != null

  const place = useCallback(
    (nextLat: number, nextLon: number) => {
      save({
        latitude: Number(nextLat.toFixed(6)),
        longitude: Number(nextLon.toFixed(6)),
      })
    },
    [save],
  )

  const zoom = useMemo(() => {
    if (radius >= 20_000) return 9
    if (radius >= 5_000) return 11
    if (radius >= 1_000) return 13
    if (radius >= 300) return 15
    return 16
  }, [radius])

  return (
    <div className="sm:col-span-2">
      <div className="overflow-hidden rounded-lg border border-stone-300 dark:border-stone-700">
        <MapContainer
          center={initial}
          zoom={zoom}
          scrollWheelZoom={false}
          style={{ height: 260, width: "100%" }}
        >
          <TileLayer
            // Required by the OSM tile usage policy, along with not prefetching.
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPlace onPlace={place} />
          {placed && (
            <>
              <Circle
                center={[lat, lon]}
                radius={radius}
                pathOptions={{ color: "#4f46e5", fillOpacity: 0.12, weight: 1.5 }}
              />
              <CircleMarker
                center={[lat, lon]}
                radius={6}
                pathOptions={{ color: "#4f46e5", fillColor: "#4f46e5", fillOpacity: 1 }}
              />
            </>
          )}
        </MapContainer>
      </div>
      <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
        {placed
          ? "Click the map to move the fence. You're counted as here whenever a reading falls inside the circle."
          : "Click the map to set a position. Without one, this place has no fence and never matches a reading."}
      </p>
    </div>
  )
}
