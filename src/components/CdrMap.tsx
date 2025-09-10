import React, { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import {
  PhoneIncoming,
  PhoneOutgoing,
  MessageSquare,
  MapPin,
  Navigation,
  Car,
  XCircle
} from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

interface Point {
  latitude: string;
  longitude: string;
  nom: string;
  type: string;
  direction?: string;
  number?: string;
  caller?: string;
  callee?: string;
  callDate: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  duration?: string;
  imeiCaller?: string;
  imeiCalled?: string;
  source?: string;
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

interface MeetingPoint {
  lat: number;
  lng: number;
  nom: string;
  numbers: string[];
  events: Point[];
  start: string;
  end: string;
  duration: string;
  perNumber: { number: string; start: string; end: string; duration: string }[];
}

interface Props {
  points: Point[];
  showRoute?: boolean;
  showMeetingPoints?: boolean;
}
const getIcon = (type: string, direction: string | undefined, color: string) => {
  const size = 32;
  let icon: React.ReactElement;

  if (type === 'web') {
    icon = <MapPin size={size} style={{ color }} />;
  } else if (type === 'sms') {
    icon = <MessageSquare size={size} style={{ color }} />;
  } else {
    icon =
      direction === 'outgoing' ? (
        <PhoneOutgoing size={size} style={{ color }} />
      ) : (
        <PhoneIncoming size={size} style={{ color }} />
      );
  }

  return L.divIcon({
    html: renderToStaticMarkup(icon),
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};

const getArrowIcon = (angle: number) => {
  const size = 16;
  const icon = (
    <div style={{ transform: `rotate(${angle}deg)` }}>
      <Navigation size={size} className="text-red-600" />
    </div>
  );
  return L.divIcon({
    html: renderToStaticMarkup(icon),
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};

const createLabelIcon = (text: string, bgColor: string) => {
  const icon = (
    <div
      style={{
        backgroundColor: bgColor,
        color: 'white',
        borderRadius: '9999px',
        padding: '2px 6px',
        fontSize: '12px',
        fontWeight: 'bold',
        textAlign: 'center'
      }}
    >
      {text}
    </div>
  );

  return L.divIcon({
    html: renderToStaticMarkup(icon),
    className: '',
    iconSize: [60, 24],
    iconAnchor: [30, 12]
  });
};

const formatDate = (d: string) => {
  const [year, month, day] = d.split('-');
  return `${day}/${month}/${year}`;
};

const formatDateTime = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleString('fr-FR');
};

const MeetingPointMarker: React.FC<{
  mp: MeetingPoint;
}> = React.memo(({ mp }) => {
  const durationDetail = mp.perNumber
    .map((d) => d.duration)
    .join(' + ');
  return (
    <Marker
      position={[mp.lat, mp.lng]}
      icon={L.divIcon({
        html: renderToStaticMarkup(
          <XCircle size={32} className="text-red-600" />
        ),
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      })}
    >
      <Popup>
        <div className="space-y-2 text-sm">
          <p className="font-semibold">{mp.nom || 'Point de rencontre'}</p>
          <table className="min-w-full text-xs border border-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-2 py-1 text-left">Numéro</th>
                <th className="px-2 py-1 text-left">Début</th>
                <th className="px-2 py-1 text-left">Fin</th>
                <th className="px-2 py-1 text-left">Durée</th>
              </tr>
            </thead>
            <tbody>
              {mp.perNumber.map((d, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-2 py-1">{d.number}</td>
                  <td className="px-2 py-1">{formatDateTime(d.start)}</td>
                  <td className="px-2 py-1">{formatDateTime(d.end)}</td>
                  <td className="px-2 py-1">{d.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs font-bold text-black">
            Durée totale : {durationDetail} = {mp.duration}
          </p>
        </div>
      </Popup>
    </Marker>
  );
});

const CdrMap: React.FC<Props> = ({ points, showRoute, showMeetingPoints }) => {
  if (!points || points.length === 0) return null;

  const first = points[0];
  const center: [number, number] = [parseFloat(first.latitude), parseFloat(first.longitude)];

  const colorPalette = ['#f97316', '#3b82f6', '#a855f7', '#10b981', '#e11d48', '#14b8a6', '#4b5563'];

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    points.forEach((p) => {
      if (p.source && !map.has(p.source)) {
        map.set(p.source, colorPalette[idx % colorPalette.length]);
        idx += 1;
      }
    });
    return map;
  }, [points]);

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

  const routePositions = useMemo(() => {
    if (!showRoute) return [];
    const sorted = [...points].sort((a, b) => {
      const dateA = new Date(`${a.callDate}T${a.startTime}`);
      const dateB = new Date(`${b.callDate}T${b.startTime}`);
      return dateA.getTime() - dateB.getTime();
    });
    return sorted.map((p) => [parseFloat(p.latitude), parseFloat(p.longitude)] as [number, number]);
  }, [points, showRoute]);

  const interpolatedRoute = useMemo(() => {
    if (!showRoute || routePositions.length < 2) return [] as [number, number][];
    const result: [number, number][] = [];
    for (let i = 1; i < routePositions.length; i++) {
      const [lat1, lng1] = routePositions[i - 1];
      const [lat2, lng2] = routePositions[i];
      const steps = 20;
      if (i === 1) result.push([lat1, lng1]);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        result.push([lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t]);
      }
    }
    return result;
  }, [routePositions, showRoute]);

  const arrowMarkers = useMemo(() => {
    if (!showRoute || routePositions.length < 2) return [];
    const markers: { position: [number, number]; angle: number }[] = [];
    for (let i = 1; i < routePositions.length; i++) {
      const [lat1, lng1] = routePositions[i - 1];
      const [lat2, lng2] = routePositions[i];
      const angle = (Math.atan2(lat1 - lat2, lng2 - lng1) * 180) / Math.PI;
      markers.push({
        position: [(lat1 + lat2) / 2, (lng1 + lng2) / 2] as [number, number],
        angle
      });
    }
    return markers;
  }, [routePositions, showRoute]);

  const [carIndex, setCarIndex] = useState(0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!showRoute || interpolatedRoute.length < 2) return;
    setCarIndex(0);
    let current = 0;
    const id = setInterval(() => {
      current += 1;
      if (current >= interpolatedRoute.length) {
        clearInterval(id);
      } else {
        setCarIndex(current);
      }
    }, 100 / speed);
    return () => clearInterval(id);
  }, [showRoute, interpolatedRoute, speed]);

  const carAngle = useMemo(() => {
    if (carIndex >= interpolatedRoute.length - 1) return 0;
    const [lat1, lng1] = interpolatedRoute[carIndex];
    const [lat2, lng2] = interpolatedRoute[carIndex + 1];
    return (Math.atan2(lat2 - lat1, lng2 - lng1) * 180) / Math.PI;
  }, [carIndex, interpolatedRoute]);

  const carPosition = interpolatedRoute[carIndex] || interpolatedRoute[0];

  const carIcon = useMemo(() => {
    const size = 32;
    const icon = (
      <div style={{ transform: `rotate(${carAngle}deg)` }}>
        <Car size={size} className="text-blue-600" />
      </div>
    );
    return L.divIcon({
      html: renderToStaticMarkup(icon),
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }, [carAngle]);

  const meetingPoints = useMemo<MeetingPoint[]>(() => {
    const map = new Map<string, { lat: number; lng: number; nom: string; events: Point[] }>();
    points.forEach((p) => {
      if (!p.source) return;
      const key = `${p.latitude},${p.longitude}`;
      if (!map.has(key)) {
        map.set(key, {
          lat: parseFloat(p.latitude),
          lng: parseFloat(p.longitude),
          nom: p.nom,
          events: []
        });
      }
      map.get(key)!.events.push(p);
    });
    return Array.from(map.values())
      .filter((m) => new Set(m.events.map((e) => e.source)).size > 1)
      .map((m) => {
        const numbers = Array.from(new Set(m.events.map((e) => e.source!).filter(Boolean)));
        const starts = m.events.map((e) => new Date(`${e.callDate}T${e.startTime}`));
        const ends = m.events.map((e) => new Date(`${e.endDate || e.callDate}T${e.endTime}`));
        const start = new Date(Math.min(...starts.map((d) => d.getTime()))).toISOString();
        const end = new Date(Math.max(...ends.map((d) => d.getTime()))).toISOString();
        const durationSeconds = Math.max(
          0,
          (new Date(end).getTime() - new Date(start).getTime()) / 1000
        );
        const duration = new Date(durationSeconds * 1000).toISOString().substr(11, 8);
        const perNumber = numbers.map((num) => {
          const evts = m.events.filter((e) => e.source === num);
          const s = evts.map((e) => new Date(`${e.callDate}T${e.startTime}`));
          const e = evts.map((e) => new Date(`${e.endDate || e.callDate}T${e.endTime}`));
          const startN = new Date(Math.min(...s.map((d) => d.getTime()))).toISOString();
          const endN = new Date(Math.max(...e.map((d) => d.getTime()))).toISOString();
          const durSec = Math.max(
            0,
            (new Date(endN).getTime() - new Date(startN).getTime()) / 1000
          );
          const dur = new Date(durSec * 1000).toISOString().substr(11, 8);
          return { number: num, start: startN, end: endN, duration: dur };
        });
        return { ...m, numbers, start, end, duration, perNumber };
      });
  }, [points]);

  const startIcon = useMemo(() => createLabelIcon('Départ', '#16a34a'), []);
  const endIcon = useMemo(() => createLabelIcon('Arrivée', '#dc2626'), []);
  const locationCounts = new Map<string, number>();
  return (
    <>
      <div className="relative w-full h-full">
        <MapContainer
          center={center}
          zoom={13}
          className="w-full h-full"
        >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((loc, idx) => {
          const key = `${loc.latitude},${loc.longitude}`;
          const count = locationCounts.get(key) || 0;
          locationCounts.set(key, count + 1);
          const offset = 0.00005;
          const position: [number, number] = [
            parseFloat(loc.latitude) + count * offset,
            parseFloat(loc.longitude) + count * offset
          ];
          return (
            <Marker
              key={idx}
              position={position}
              icon={getIcon(
                loc.type,
                loc.direction,
                colorMap.get(loc.source || '') || '#4b5563'
              )}
            >
              <Popup>
                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-blue-600">{loc.nom || 'Localisation'}</p>
                  <div className="flex items-center space-x-1">
                    <PhoneOutgoing size={16} className="text-gray-700" />
                    <span>Appelant: {loc.caller || 'N/A'}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <PhoneIncoming size={16} className="text-gray-700" />
                    <span>Appelé: {loc.callee || 'N/A'}</span>
                  </div>
                  {loc.type === 'web' ? (
                    <>
                      <p>Type: Position</p>
                      {loc.callDate === loc.endDate ? (
                        <p>Date: {formatDate(loc.callDate)}</p>
                      ) : (
                        <>
                          <p>Date début: {formatDate(loc.callDate)}</p>
                          <p>Date fin: {loc.endDate && formatDate(loc.endDate)}</p>
                        </>
                      )}
                      <p>Début: {loc.startTime}</p>
                      <p>Fin: {loc.endTime}</p>
                      <p>Durée: {loc.duration || 'N/A'}</p>
                    </>
                  ) : (
                    <>
                      <p>Type: {loc.type === 'sms' ? 'SMS' : 'Appel'}</p>
                      <p>Direction: {loc.direction === 'outgoing' ? 'Sortant' : 'Entrant'}</p>
                      <p>Date: {formatDate(loc.callDate)}</p>
                      <p>Début: {loc.startTime}</p>
                      <p>Fin: {loc.endTime}</p>
                      <p>Durée: {loc.duration || 'N/A'}</p>
                      <p>IMEI appelant: {loc.imeiCaller || 'N/A'}</p>
                      <p>IMEI appelé: {loc.imeiCalled || 'N/A'}</p>
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
        {showMeetingPoints &&
          meetingPoints.map((mp, idx) => (
            <MeetingPointMarker
              key={`meeting-${idx}`}
              mp={mp}
            />
          ))}
        {showRoute && routePositions.length > 1 && (
          <Polyline positions={routePositions} color="black" />
        )}
        {showRoute && routePositions.length > 0 && (
          <Marker position={routePositions[0]} icon={startIcon} />
        )}
        {showRoute && routePositions.length > 1 && (
          <Marker
            position={routePositions[routePositions.length - 1]}
            icon={endIcon}
          />
        )}
        {showRoute && interpolatedRoute.length > 0 && (
          <Marker position={carPosition} icon={carIcon} />
        )}
        {showRoute &&
          arrowMarkers.map((a, idx) => (
            <Marker
              key={`arrow-${idx}`}
              position={a.position}
              icon={getArrowIcon(a.angle)}
              interactive={false}
            />
          ))}
        </MapContainer>

        {colorMap.size > 1 && (
          <div className="absolute left-2 top-24 bg-white/90 backdrop-blur rounded-lg shadow-md p-2 text-sm z-[1000] space-y-1">
            <p className="font-semibold">Légende</p>
            {[...colorMap.entries()].map(([num, color]) => (
              <div key={num} className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></span>
                <span>{num}</span>
              </div>
            ))}
          </div>
        )}

        {showRoute && (
          <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur rounded-lg shadow-md p-2 text-sm z-[1000]">
            <label htmlFor="speed" className="block font-semibold mb-1">
              Vitesse : {speed}x
            </label>
            <input
            id="speed"
            type="range"
            min={1}
            max={10}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
          </div>
        )}

        {showMeetingPoints && meetingPoints.length > 0 && (
          <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur rounded-lg shadow-md p-2 text-sm z-[1000] max-h-48 overflow-y-auto">
            <p className="font-semibold mb-1">Points de rencontre</p>
            <table className="text-xs">
              <thead>
                <tr className="text-left">
                  <th className="pr-2">Point</th>
                  <th className="pr-2">Numéros</th>
                  <th>Événements</th>
                </tr>
              </thead>
              <tbody>
                {meetingPoints.map((m, i) => (
                  <tr key={i} className="border-t">
                    <td className="pr-2">{m.nom || `${m.lat},${m.lng}`}</td>
                    <td className="pr-2">{m.numbers.join(', ')}</td>
                    <td>{m.events.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur rounded-lg shadow-md p-4 text-sm space-y-4 z-[1000]">
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


    </>
  );
};

export default CdrMap;

