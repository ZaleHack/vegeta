import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import { PhoneIncoming, PhoneOutgoing, MessageSquare, Loader2 } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

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

const getIcon = (type: string, direction: string) => {
  const size = 32;
  let icon: React.ReactElement;

  if (type === 'sms') {
    icon = <MessageSquare size={size} className="text-green-600" />;
  } else {
    icon =
      direction === 'outgoing' ? (
        <PhoneOutgoing size={size} className="text-blue-600" />
      ) : (
        <PhoneIncoming size={size} className="text-red-600" />
      );
  }

  return L.divIcon({
    html: renderToStaticMarkup(icon),
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};

const CdrMap: React.FC<Props> = ({ points, topContacts, topLocations, total }) => {
  if (!points || points.length === 0) return null;

  const first = points[0];
  const center: [number, number] = [parseFloat(first.latitude), parseFloat(first.longitude)];

  const [fullScreen, setFullScreen] = useState(false);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [mapLoading, setMapLoading] = useState(true);

  useEffect(() => {
    if (mapInstance) {
      setTimeout(() => {
        mapInstance.invalidateSize();
      }, 0);
    }
  }, [fullScreen, mapInstance]);

  useEffect(() => {
    setMapLoading(true);
  }, [points]);

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
        whenCreated={(map) => {
          setMapInstance(map);
          map.on('load', () => setMapLoading(false));
        }}
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
            icon={getIcon(loc.type, loc.direction)}
          >
            <Popup>
              <div className="space-y-1">
                <p className="font-semibold">{loc.nom || 'Localisation'}</p>
                {loc.number && <p>Numéro: {loc.number}</p>}
                <p>Type: {loc.type}</p>
                <p>Direction: {loc.direction}</p>
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
      {mapLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-[1000]">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        </div>
      )}
    </div>
  );
};

export default CdrMap;

