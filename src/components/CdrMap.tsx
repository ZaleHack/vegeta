import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { PhoneIncoming, PhoneOutgoing, MessageSquare } from 'lucide-react';
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
  onIdentifyNumber?: (num: string) => void;
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
        <PhoneIncoming size={size} className="text-green-600" />
      );
  }

  return L.divIcon({
    html: renderToStaticMarkup(icon),
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};

const CdrMap: React.FC<Props> = ({ points, onIdentifyNumber }) => {
  if (!points || points.length === 0) return null;

  const first = points[0];
  const center: [number, number] = [parseFloat(first.latitude), parseFloat(first.longitude)];

  const { topContacts, topLocations, total } = useMemo(() => {
    const contactMap = new Map<string, { callCount: number; smsCount: number }>();
    const locationMap = new Map<string, LocationStat>();

    points.forEach((p) => {
      if (p.number) {
        const entry = contactMap.get(p.number) || { callCount: 0, smsCount: 0 };
        if (p.type === 'sms') entry.smsCount += 1; else entry.callCount += 1;
        contactMap.set(p.number, entry);
      }

      const key = `${p.latitude},${p.longitude},${p.nom || ''}`;
      const loc = locationMap.get(key) || { latitude: p.latitude, longitude: p.longitude, nom: p.nom, count: 0 };
      loc.count += 1;
      locationMap.set(key, loc);
    });

    const contacts: Contact[] = Array.from(contactMap.entries()).map(([number, c]) => ({
      number,
      callCount: c.callCount,
      smsCount: c.smsCount,
      total: c.callCount + c.smsCount
    })).sort((a, b) => b.total - a.total).slice(0, 10);

    const locations: LocationStat[] = Array.from(locationMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { topContacts: contacts, topLocations: locations, total: points.length };
  }, [points]);

  return (
    <div className="relative rounded-lg overflow-hidden shadow-lg">
      <MapContainer
        center={center}
        zoom={13}
        className="w-full h-[70vh]"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((loc, idx) => (
          <Marker
            key={idx}
            position={[parseFloat(loc.latitude), parseFloat(loc.longitude)]}
            icon={getIcon(loc.type, loc.direction)}
          >
            <Popup>
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-blue-600">{loc.nom || 'Localisation'}</p>
                {loc.number && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Numéro: {loc.number}</span>
                    <button
                      className="ml-2 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                      onClick={() => {
                        const cleaned = loc.number.startsWith('221') ? loc.number.slice(3) : loc.number;
                        navigator.clipboard.writeText(cleaned);
                        if (onIdentifyNumber) onIdentifyNumber(cleaned);
                      }}
                    >
                      Identifier numéro
                    </button>
                  </div>
                )}
                <p>Type: {loc.type === 'sms' ? 'SMS' : 'Appel'}</p>
                <p>Direction: {loc.direction === 'outgoing' ? 'Sortant' : 'Entrant'}</p>
                <p>Date: {loc.callDate}</p>
                <p>Début: {loc.startTime}</p>
                <p>Fin: {loc.endTime}</p>
                <p>Durée: {loc.duration || 'N/A'}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="absolute top-2 left-2 bg-white/90 backdrop-blur rounded-lg shadow-md p-4 text-sm space-y-4 z-[1000]">
        <p className="font-semibold">Total : {total}</p>
        {topContacts && topContacts.length > 0 && (
          <div>
            <p className="font-semibold mb-2">Top contacts</p>
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="pr-4">Numéro</th>
                  <th className="pr-4">Appels</th>
                  <th className="pr-4">SMS</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {topContacts.map((c, i) => (
                  <tr
                    key={c.number}
                    className={`${i === 0 ? 'font-bold text-blue-600' : ''} border-t`}
                  >
                    <td className="pr-4">{c.number}</td>
                    <td className="pr-4">{c.callCount}</td>
                    <td className="pr-4">{c.smsCount}</td>
                    <td>{c.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {topLocations && topLocations.length > 0 && (
          <div>
            <p className="font-semibold mb-2">Top lieux</p>
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="pr-4">Lieu</th>
                  <th>Occurrences</th>
                </tr>
              </thead>
              <tbody>
                {topLocations.map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="pr-4">{l.nom || `${l.latitude},${l.longitude}`}</td>
                    <td>{l.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CdrMap;

