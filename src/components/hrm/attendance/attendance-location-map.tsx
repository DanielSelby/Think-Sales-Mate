"use client";

import { Fragment, useEffect } from "react";
import L, { type LatLngExpression } from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type AttendanceMapLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
};

const markerIcon = L.divIcon({
  className: "",
  html: '<span style="display:block;width:18px;height:18px;border:3px solid white;border-radius:50% 50% 50% 0;background:#059669;transform:rotate(-45deg);box-shadow:0 1px 5px #475569"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 18],
});

function FitLocations({ locations }: { locations: AttendanceMapLocation[] }) {
  const map = useMap();
  const coordinatesKey = locations.map(({ latitude, longitude }) => `${latitude},${longitude}`).join("|");
  useEffect(() => {
    if (!locations.length) return;
    const bounds = L.latLngBounds(locations.map(({ latitude, longitude }) => [latitude, longitude]));
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
  }, [coordinatesKey, locations, map]);

  return null;
}

export function AttendanceLocationMap({ locations }: { locations: AttendanceMapLocation[] }) {
  const center: LatLngExpression = locations.length
    ? [locations[0].latitude, locations[0].longitude]
    : [0, 0];

  return <div className="h-72 overflow-hidden rounded-lg border border-ledger-200 dark:border-ledger-700 sm:h-80">
    <MapContainer center={center} zoom={locations.length ? 13 : 2} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {locations.map((location) => {
        const position: LatLngExpression = [location.latitude, location.longitude];
        return <Fragment key={location.id}>
          <Circle
            center={position}
            radius={location.geofenceRadiusMeters}
            pathOptions={{ color: "#059669", fillColor: "#10b981", fillOpacity: 0.18, weight: 1.5 }}
          />
          <Marker position={position} icon={markerIcon}>
            <Popup>
              <strong>{location.name}</strong>
              <br />
              Geofence radius: {location.geofenceRadiusMeters} m
            </Popup>
          </Marker>
        </Fragment>;
      })}
      <FitLocations locations={locations} />
    </MapContainer>
  </div>;
}
