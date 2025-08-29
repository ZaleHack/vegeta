import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

interface Location {
  latitude: string;
  longitude: string;
  nom: string;
  count: number;
}

interface Props {
  locations: Location[];
}

const CdrMap: React.FC<Props> = ({ locations }) => {
  if (!locations || locations.length === 0) return null;
  const first = locations[0];
  const center: [number, number] = [parseFloat(first.latitude), parseFloat(first.longitude)];

  return (
    <MapContainer center={center} zoom={13} className="h-96 w-full z-0">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {locations.map((loc, idx) => (
        <Marker key={idx} position={[parseFloat(loc.latitude), parseFloat(loc.longitude)]}>
          <Popup>
            <div>
              <p className="font-semibold">{loc.nom || 'Localisation'}</p>
              <p>Occurrences: {loc.count}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default CdrMap;
