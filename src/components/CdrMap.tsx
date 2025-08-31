import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';

interface Point {
  latitude: string;
  longitude: string;
  nom: string;
  type: string;
  direction: string;
  number?: string;
  callDate: string;
  startTime: string;
  endTime: string;
  duration?: string;
}

interface Contact {
  number: string;
  callCount: number;
  smsCount: number;
  total: number;
}

interface LocationStat {
  latitude: string;
  longitude: string;
  nom: string;
  count: number;
}

interface Props {
  points: Point[];
  topContacts: Contact[];
  topLocations: LocationStat[];
  total: number;
}

const getIcon = (type: string) =>
  L.divIcon({
    html: `<div style="background-color:${type === 'sms' ? '#16a34a' : '#2563eb'};width:12px;height:12px;border-radius:50%;"></div>`,
    className: ''
  });

const CdrMap: React.FC<Props> = ({ points, topContacts, topLocations, total }) => {
  if (!points || points.length === 0) return null;

  const first = points[0];
  const center: [number, number] = [parseFloat(first.latitude), parseFloat(first.longitude)];

  const [fullScreen, setFullScreen] = useState(false);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  useEffect(() => {
    if (mapInstance) {
      setTimeout(() => {
        mapInstance.invalidateSize();
      }, 0);
    }
  }, [fullScreen, mapInstance]);

  return (
    <div
      className={`relative ${
        fullScreen ? 'fixed inset-0 z-50' : 'rounded-lg overflow-hidden shadow-lg'
      }`}
    >
      <MapContainer
        center={center}
        zoom={13}
        className="w-full h-[70vh]"
        style={{ height: fullScreen ? '100vh' : undefined }}
        whenCreated={setMapInstance}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {topLocations && topLocations.length > 0 && (
          <Circle
            center={[
              parseFloat(topLocations[0].latitude),
              parseFloat(topLocations[0].longitude)
            ]}
            radius={200}
            pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.2 }}
          />
        )}
        {points.map((loc, idx) => (
          <Marker
            key={idx}
            position={[parseFloat(loc.latitude), parseFloat(loc.longitude)]}
            icon={getIcon(loc.type)}
          >
            <Popup>
              <div className="space-y-1">
                <p className="font-semibold">{loc.nom || 'Localisation'}</p>
                {loc.number && <p>Numéro: {loc.number}</p>}
                <p>Type: {loc.type}</p>
                <p>Date: {loc.callDate}</p>
                <p>Début: {loc.startTime}</p>
                <p>Fin: {loc.endTime}</p>
                <p>Durée: {loc.duration || 'N/A'}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <button
        className="absolute top-2 right-2 bg-white px-2 py-1 rounded shadow z-[1000]"
        onClick={() => setFullScreen(!fullScreen)}
      >
        {fullScreen ? 'Fermer' : 'Plein écran'}
      </button>

      <div className="absolute top-2 left-2 bg-white bg-opacity-90 rounded shadow p-2 text-xs max-h-60 overflow-y-auto z-[1000]">
        <p className="font-semibold mb-1">Total: {total}</p>
        {topContacts && topContacts.length > 0 && (
          <div className="mb-2">
            <p className="font-semibold">Top contacts</p>
            <ul>
              {topContacts.map((c, i) => (
                <li key={c.number} className={i === 0 ? 'font-bold text-blue-600' : ''}>
                  {i === 0 && '★ '} {c.number}: {c.total}
                </li>
              ))}
            </ul>
          </div>
        )}
        {topLocations && topLocations.length > 0 && (
          <div>
            <p className="font-semibold">Top lieux</p>
            <ul>
              {topLocations.map((l, i) => (
                <li key={i}>
                  {l.nom || `${l.latitude},${l.longitude}`}: {l.count}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default CdrMap;

