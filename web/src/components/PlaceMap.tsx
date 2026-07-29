import "leaflet/dist/leaflet.css"
import { Circle, CircleMarker, MapContainer, TileLayer } from "react-leaflet"

/**
 * A read-only look at one spot.
 *
 * Exists because the review queue used to show a latitude and a longitude and
 * ask you to name the place — a question nothing on the card could answer. You
 * recognise your own street instantly and a coordinate pair never; this is the
 * cheapest possible way to say *where*, and unlike an address lookup it costs
 * nothing but map tiles.
 *
 * No `L.Marker`: its default icon resolves images by relative URL and 404s under
 * Vite. `Circle` and `CircleMarker` are plain SVG.
 */
export function PlaceMap({
  latitude,
  longitude,
  radiusM,
  height = 130,
}: {
  latitude: number
  longitude: number
  radiusM: number
  height?: number
}) {
  // Frame the spot with room around it, so you can see what it is next to —
  // which is usually how you recognise it.
  const zoom = radiusM > 400 ? 14 : radiusM > 150 ? 15 : 16
  return (
    <div className="overflow-hidden rounded border border-stone-300 dark:border-stone-700">
      <MapContainer
        center={[latitude, longitude]}
        zoom={zoom}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        zoomControl={false}
        attributionControl={false}
        style={{ height, width: "100%" }}
      >
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Circle
          center={[latitude, longitude]}
          radius={radiusM}
          pathOptions={{ color: "#0d9488", fillOpacity: 0.15, weight: 1.5 }}
        />
        <CircleMarker
          center={[latitude, longitude]}
          radius={5}
          pathOptions={{ color: "#0d9488", fillColor: "#0d9488", fillOpacity: 1 }}
        />
      </MapContainer>
    </div>
  )
}
