import React, { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  PhoneIncoming,
  PhoneOutgoing,
  MessageSquare,
  MapPin,
  ArrowRight,
  Car,
  Layers,
  Users,
  Clock,
  Flame,
  Eye,
  EyeOff,
  Activity,
  Square
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
  lastDate?: string;
  lastTime?: string;
}

interface LocationMarker extends LocationStat {
  source?: string;
}

interface MeetingPoint {
  lat: number;
  lng: number;
  nom: string;
  numbers: string[];
  events: Point[];
  perNumber: {
    number: string;
    events: { date: string; start: string; end: string; duration: string }[];
    total: string;
  }[];
  date: string;
  start: string;
  end: string;
  total: string;
}

interface Props {
  points: Point[];
  showRoute?: boolean;
  showMeetingPoints?: boolean;
  onToggleMeetingPoints?: () => void;
  zoneMode?: boolean;
  onZoneCreated?: () => void;
  onToggleZoneMode?: () => void;
}

const getPointColor = (type: string, direction?: string) => {
  if (type === 'web') return '#dc2626';
  if (type === 'sms') return '#16a34a';
  if (direction === 'outgoing') return '#2563eb';
  return '#16a34a';
};

const getIcon = (type: string, direction: string | undefined) => {
  const size = 32;
  let inner: React.ReactElement;

  if (type === 'web') {
    inner = <MapPin size={16} className="text-white" />;
  } else if (type === 'sms') {
    inner = <MessageSquare size={16} className="text-white" />;
  } else {
    inner =
      direction === 'outgoing' ? (
        <PhoneOutgoing size={16} className="text-white" />
      ) : (
        <PhoneIncoming size={16} className="text-white" />
      );
  }

  const icon = (
    <div
      style={{
        backgroundColor: getPointColor(type, direction),
        borderRadius: '9999px',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {inner}
    </div>
  );

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
      <ArrowRight size={size} className="text-blue-600" />
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
    <div className="relative">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shadow-md"
        style={{ backgroundColor: bgColor }}
      >
        <MapPin size={16} className="text-white" />
      </div>
      <span className="absolute -bottom-1 -right-1 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-xs font-bold rounded-full px-1">
        {text}
      </span>
    </div>
  );

  return L.divIcon({
    html: renderToStaticMarkup(icon),
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });
};

const getGroupIcon = (count: number, type: string, direction: string | undefined) => {
  const size = 32;
  const color = getPointColor(type, direction);
  const icon = (
    <div className="relative">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white"
        style={{ backgroundColor: color }}
      >
        <Layers size={16} />
      </div>
      <span className="absolute -top-1 -right-1 bg-gray-700 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
        {count}
      </span>
    </div>
  );
  return L.divIcon({
    html: renderToStaticMarkup(icon),
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size]
  });
};

const numberColors = [
  '#ef4444',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f43f5e'
];

const formatDate = (d: string) => {
  const [year, month, day] = d.split('-');
  return `${day}/${month}/${year}`;
};

const MeetingPointMarker: React.FC<{
  mp: MeetingPoint;
}> = React.memo(({ mp }) => {
  return (
    <Marker
      position={[mp.lat, mp.lng]}
      icon={L.divIcon({
        html: renderToStaticMarkup(
          <div className="relative flex items-center justify-center">
            <span className="absolute inline-flex h-8 w-8 rounded-full bg-red-400 opacity-75 animate-ping"></span>
            <span className="relative inline-flex h-4 w-4 rounded-full bg-red-600"></span>
          </div>
        ),
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      })}
    >
      <Popup>
        <div className="space-y-2 text-sm">
          <p className="font-semibold">{mp.nom || 'Point de rencontre'}</p>
          <table className="min-w-full text-xs border border-gray-200 rounded">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-2 py-1 text-left">Numéro</th>
                <th className="px-2 py-1 text-left">Heures & durées</th>
                <th className="px-2 py-1 text-left">Total</th>
              </tr>
            </thead>
            <tbody>
              {mp.perNumber.map((d, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-2 py-1 font-medium">{d.number}</td>
                  <td className="px-2 py-1">
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {d.events.map((ev, i) => (
                        <div key={i}>{ev.date} {ev.start} - {ev.end} ({ev.duration})</div>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-1 font-semibold">{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Popup>
    </Marker>
  );
});

const CdrMap: React.FC<Props> = ({ points, showRoute, showMeetingPoints, onToggleMeetingPoints, zoneMode, onZoneCreated, onToggleZoneMode }) => {
  if (!points || points.length === 0) return null;

  const first = points[0];
  const center: [number, number] = [parseFloat(first.latitude), parseFloat(first.longitude)];

  const [activeInfo, setActiveInfo] = useState<'contacts' | 'recent' | 'popular' | null>(null);
  const [showOthers, setShowOthers] = useState(true);
  const pageSize = 20;
  const [contactPage, setContactPage] = useState(1);
  const [showZoneInfo, setShowZoneInfo] = useState(false);
  const [hiddenLocations, setHiddenLocations] = useState<Set<string>>(new Set());
  const [showSimilar, setShowSimilar] = useState(false);

  const sourceNumbers = useMemo(
    () =>
      Array.from(
        new Set(points.map((p) => p.source).filter((n): n is string => Boolean(n)))
      ),
    [points]
  );
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    sourceNumbers.forEach((n, i) => map.set(n, numberColors[i % numberColors.length]));
    return map;
  }, [sourceNumbers]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [visibleSources, setVisibleSources] = useState<Set<string>>(new Set());

  useEffect(() => {
    setVisibleSources(new Set(sourceNumbers));
  }, [sourceNumbers]);

  useEffect(() => {
    if (sourceNumbers.length < 2) setShowSimilar(false);
  }, [sourceNumbers]);

  useEffect(() => {
    if (sourceNumbers.length < 2 && showMeetingPoints && onToggleMeetingPoints) {
      onToggleMeetingPoints();
    }
  }, [sourceNumbers, showMeetingPoints, onToggleMeetingPoints]);

  useEffect(() => {
    if (selectedSource && !sourceNumbers.includes(selectedSource)) {
      setSelectedSource(null);
    }
  }, [sourceNumbers, selectedSource]);

  const toggleSourceVisibility = (src: string) => {
    setVisibleSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  };
  const toggleInfo = (key: 'contacts' | 'recent' | 'popular') => {
    setShowZoneInfo(false);
    setActiveInfo((prev) => (prev === key ? null : key));
    if (key === 'contacts') setContactPage(1);
    if (key !== 'recent' && key !== 'popular') setShowOthers(true);
  };

  const [zoneShape, setZoneShape] = useState<L.LatLng[] | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<L.LatLng[]>([]);

  useEffect(() => {
    setContactPage(1);
  }, [selectedSource]);

  useEffect(() => {
    if (zoneMode) {
      setZoneShape(null);
      setCurrentPoints([]);
      setShowZoneInfo(false);
    }
  }, [zoneMode]);

  const pointInPolygon = (point: L.LatLng, polygon: L.LatLng[]) => {
    const x = point.lng;
    const y = point.lat;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;
      const intersect =
        yi > y !== yj > y &&
        x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const displayedPoints = useMemo(() => {
    let filtered = points;
    if (selectedSource) {
      filtered = filtered.filter((p) => p.source === selectedSource);
    } else {
      filtered = filtered.filter((p) => !p.source || visibleSources.has(p.source));
    }
    if (!zoneShape || zoneShape.length < 3) return filtered;
    return filtered.filter((p) => {
      const lat = parseFloat(p.latitude);
      const lng = parseFloat(p.longitude);
      if (isNaN(lat) || isNaN(lng)) return false;
      return pointInPolygon(L.latLng(lat, lng), zoneShape);
    });
  }, [points, zoneShape, selectedSource, visibleSources]);

  const { topContacts, topLocations, recentLocations, total } = useMemo(() => {
    const contactMap = new Map<string, { callCount: number; smsCount: number }>();
    const locationMap = new Map<string, LocationStat>();

    displayedPoints.forEach((p) => {
      if (p.number) {
        const entry = contactMap.get(p.number) || { callCount: 0, smsCount: 0 };
        if (p.type === 'sms') entry.smsCount += 1; else entry.callCount += 1;
        contactMap.set(p.number, entry);
      }

      const key = `${p.latitude},${p.longitude},${p.nom || ''}`;
      const loc =
        locationMap.get(key) ||
        {
          latitude: p.latitude,
          longitude: p.longitude,
          nom: p.nom,
          count: 0,
          lastDate: p.callDate,
          lastTime: p.startTime
        };
      loc.count += 1;
      const current = new Date(`${p.callDate}T${p.startTime}`);
      const prev = loc.lastDate && loc.lastTime ? new Date(`${loc.lastDate}T${loc.lastTime}`) : null;
      if (!prev || current > prev) {
        loc.lastDate = p.callDate;
        loc.lastTime = p.startTime;
      }
      locationMap.set(key, loc);
    });

    const contacts: Contact[] = Array.from(contactMap.entries())
      .map(([number, c]) => ({
        number,
        callCount: c.callCount,
        smsCount: c.smsCount,
        total: c.callCount + c.smsCount
      }))
      .sort((a, b) => b.total - a.total);

    const allLocations = Array.from(locationMap.values()).filter(
      (loc) =>
        !isNaN(parseFloat(loc.latitude)) && !isNaN(parseFloat(loc.longitude))
    );

    const locations: LocationStat[] = allLocations
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const recent: LocationStat[] = allLocations
      .slice()
      .sort((a, b) => {
        const dateA = new Date(`${a.lastDate || ''}T${a.lastTime || '00:00:00'}`).getTime();
        const dateB = new Date(`${b.lastDate || ''}T${b.lastTime || '00:00:00'}`).getTime();
        return dateB - dateA;
      })
      .slice(0, 10);

    return { topContacts: contacts, topLocations: locations, recentLocations: recent, total: displayedPoints.length };
  }, [displayedPoints]);

  const toggleLocationVisibility = (loc: LocationStat) => {
    const key = `${loc.latitude},${loc.longitude},${loc.nom || ''}`;
    setHiddenLocations((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAllLocations = (list: LocationStat[]) => {
    setHiddenLocations((prev) => {
      const next = new Set(prev);
      const keys = list.map((l) => `${l.latitude},${l.longitude},${l.nom || ''}`);
      const allHidden = keys.every((k) => next.has(k));
      if (allHidden) keys.forEach((k) => next.delete(k)); else keys.forEach((k) => next.add(k));
      return next;
    });
  };

  const locationMarkers = useMemo<LocationMarker[]>(() => {
    if (activeInfo !== 'popular' && activeInfo !== 'recent') return [];
    if (selectedSource === null && sourceNumbers.length > 1) {
      const perSource = new Map<string, Map<string, LocationStat>>();
      displayedPoints.forEach((p) => {
        const src = p.source || 'unknown';
        let map = perSource.get(src);
        if (!map) {
          map = new Map();
          perSource.set(src, map);
        }
        const key = `${p.latitude},${p.longitude},${p.nom || ''}`;
        const loc =
          map.get(key) ||
          {
            latitude: p.latitude,
            longitude: p.longitude,
            nom: p.nom,
            count: 0,
            lastDate: p.callDate,
            lastTime: p.startTime
          };
        loc.count += 1;
        const current = new Date(`${p.callDate}T${p.startTime}`);
        const prev =
          loc.lastDate && loc.lastTime
            ? new Date(`${loc.lastDate}T${loc.lastTime}`)
            : null;
        if (!prev || current > prev) {
          loc.lastDate = p.callDate;
          loc.lastTime = p.startTime;
        }
        map.set(key, loc);
      });
      const markers: LocationMarker[] = [];
      perSource.forEach((map, src) => {
        const all = Array.from(map.values()).filter(
          (loc) =>
            !isNaN(parseFloat(loc.latitude)) && !isNaN(parseFloat(loc.longitude))
        );
        const sorted =
          activeInfo === 'popular'
            ? all.sort((a, b) => b.count - a.count)
            : all.sort((a, b) => {
                const dateA = new Date(
                  `${a.lastDate || ''}T${a.lastTime || '00:00:00'}`
                ).getTime();
                const dateB = new Date(
                  `${b.lastDate || ''}T${b.lastTime || '00:00:00'}`
                ).getTime();
                return dateB - dateA;
              });
        sorted.slice(0, 10).forEach((loc) => {
          const key = `${loc.latitude},${loc.longitude},${loc.nom || ''}`;
          if (!hiddenLocations.has(key)) markers.push({ ...loc, source: src });
        });
      });
      const grouped = new Map<string, LocationMarker[]>();
      markers.forEach((m) => {
        const key = `${m.latitude},${m.longitude}`;
        let arr = grouped.get(key);
        if (!arr) {
          arr = [];
          grouped.set(key, arr);
        }
        arr.push(m);
      });
      const adjusted: LocationMarker[] = [];
      grouped.forEach((group) => {
        if (group.length === 1) {
          adjusted.push(group[0]);
          return;
        }
        const angleStep = (2 * Math.PI) / group.length;
        const radius = 0.0003;
        group.forEach((m, idx) => {
          const angle = idx * angleStep;
          const lat =
            parseFloat(m.latitude) + radius * Math.cos(angle);
          const lng =
            parseFloat(m.longitude) + radius * Math.sin(angle);
          adjusted.push({ ...m, latitude: lat.toString(), longitude: lng.toString() });
        });
      });
      return adjusted;
    }
    const base = (activeInfo === 'popular' ? topLocations : recentLocations)
      .filter((l) => !hiddenLocations.has(`${l.latitude},${l.longitude},${l.nom || ''}`))
      .map((l) => ({ ...l }));
    const grouped = new Map<string, LocationMarker[]>();
    base.forEach((m) => {
      const key = `${m.latitude},${m.longitude}`;
      let arr = grouped.get(key);
      if (!arr) {
        arr = [];
        grouped.set(key, arr);
      }
      arr.push(m);
    });
    const adjusted: LocationMarker[] = [];
    grouped.forEach((group) => {
      if (group.length === 1) {
        adjusted.push(group[0]);
        return;
      }
      const angleStep = (2 * Math.PI) / group.length;
      const radius = 0.0003;
      group.forEach((m, idx) => {
        const angle = idx * angleStep;
        const lat = parseFloat(m.latitude) + radius * Math.cos(angle);
        const lng = parseFloat(m.longitude) + radius * Math.sin(angle);
        adjusted.push({ ...m, latitude: lat.toString(), longitude: lng.toString() });
      });
    });
    return adjusted;
  }, [
    activeInfo,
    selectedSource,
    sourceNumbers,
    displayedPoints,
    topLocations,
    recentLocations,
    hiddenLocations
  ]);

  const showBaseMarkers = useMemo(
    () =>
      !(
        activeInfo === 'recent' ||
        activeInfo === 'popular' ||
        showMeetingPoints ||
        showSimilar
      ) ||
      showOthers,
    [activeInfo, showMeetingPoints, showSimilar, showOthers]
  );

  const routePositions = useMemo(() => {
    if (!showRoute) return [];
    const sorted = [...displayedPoints].sort((a, b) => {
      const dateA = new Date(`${a.callDate}T${a.startTime}`);
      const dateB = new Date(`${b.callDate}T${b.startTime}`);
      return dateA.getTime() - dateB.getTime();
    });
    return sorted.map((p) => [parseFloat(p.latitude), parseFloat(p.longitude)] as [number, number]);
  }, [displayedPoints, showRoute]);

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

  const similarSegments = useMemo(() => {
    if (sourceNumbers.length < 2)
      return [] as { positions: [number, number][]; sources: string[] }[];
    const segmentMap = new Map<
      string,
      { positions: [number, number][]; sources: Set<string> }
    >();
    sourceNumbers.forEach((src) => {
      const pts = points
        .filter((p) => p.source === src)
        .sort((a, b) => {
          const dateA = new Date(`${a.callDate}T${a.startTime}`);
          const dateB = new Date(`${b.callDate}T${b.startTime}`);
          return dateA.getTime() - dateB.getTime();
        });
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const lat1 = parseFloat(a.latitude);
        const lng1 = parseFloat(a.longitude);
        const lat2 = parseFloat(b.latitude);
        const lng2 = parseFloat(b.longitude);
        if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) continue;
        const key = `${lat1},${lng1}|${lat2},${lng2}`;
        const seg =
          segmentMap.get(key) || {
            positions: [
              [lat1, lng1] as [number, number],
              [lat2, lng2] as [number, number]
            ],
            sources: new Set<string>()
          };
        seg.sources.add(src);
        segmentMap.set(key, seg);
      }
    });
    return Array.from(segmentMap.values())
      .filter((s) => s.sources.size > 1)
      .map((s) => ({ positions: s.positions, sources: Array.from(s.sources) }));
  }, [points, sourceNumbers]);

  const similarNumbers = useMemo(() => {
    const set = new Set<string>();
    similarSegments.forEach((s) => s.sources.forEach((src) => set.add(src)));
    return Array.from(set);
  }, [similarSegments]);

  const [visibleSimilar, setVisibleSimilar] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (showSimilar) {
      setVisibleSimilar(new Set(similarNumbers));
    }
  }, [showSimilar, similarNumbers]);

  const toggleSimilarVisibility = (src: string) => {
    setVisibleSimilar((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  };

  const [carIndex, setCarIndex] = useState(0);
  const [speed, setSpeed] = useState(1);

  const paginatedContacts = useMemo(() => {
    const start = (contactPage - 1) * pageSize;
    return topContacts.slice(start, start + pageSize);
  }, [topContacts, contactPage, pageSize]);


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

  const ZoneSelector: React.FC = () => {
    const map = useMapEvents({
      mousedown(e) {
        if (!zoneMode) return;
        setDrawing(true);
        setCurrentPoints([e.latlng]);
        map.dragging.disable();
      },
      mousemove(e) {
        if (!zoneMode || !drawing) return;
        setCurrentPoints((pts) => [...pts, e.latlng]);
      },
      mouseup() {
        if (!zoneMode || !drawing) return;
        map.dragging.enable();
        setDrawing(false);
        if (currentPoints.length > 2) {
          const final = currentPoints.slice();
          setZoneShape(final);
          setShowZoneInfo(true);
          onZoneCreated && onZoneCreated();
        }
        setCurrentPoints([]);
      }
    });
    return null;
  };

  const carIcon = useMemo(() => {
    const size = 32;
    const icon = (
      <div
        style={{
          transform: `rotate(${carAngle}deg)`,
          backgroundColor: '#2563eb',
          borderRadius: '9999px',
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Car size={16} className="text-white" />
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
    // Group events by location regardless of start time
    const locationMap = new Map<
      string,
      { lat: number; lng: number; nom: string; events: Point[] }
    >();
    displayedPoints.forEach((p) => {
      if (!p.source) return;
      const key = `${p.latitude},${p.longitude}`;
      if (!locationMap.has(key)) {
        locationMap.set(key, {
          lat: parseFloat(p.latitude),
          lng: parseFloat(p.longitude),
          nom: p.nom,
          events: []
        });
      }
      locationMap.get(key)!.events.push(p);
    });

    const result: MeetingPoint[] = [];

    locationMap.forEach((loc) => {
      const evs = loc.events;
      if (evs.length < 2) return;

      // Build timeline of all events to detect distinct overlapping windows
      const timeline: { time: Date; type: 'start' | 'end'; index: number }[] = [];
      evs.forEach((e, idx) => {
        timeline.push({
          time: new Date(`${e.callDate}T${e.startTime}`),
          type: 'start',
          index: idx
        });
        timeline.push({
          time: new Date(`${e.endDate || e.callDate}T${e.endTime}`),
          type: 'end',
          index: idx
        });
      });

      timeline.sort((a, b) => {
        const diff = a.time.getTime() - b.time.getTime();
        if (diff !== 0) return diff;
        if (a.type === b.type) return 0;
        return a.type === 'end' ? -1 : 1;
      });

      const active = new Set<number>();
      const windows: { start: Date; end: Date }[] = [];
      let windowStart: Date | null = null;

      const getActiveSources = () =>
        new Set(
          Array.from(active).map((i) => evs[i].source).filter(Boolean) as string[]
        );

      timeline.forEach(({ time, type, index }) => {
        if (type === 'start') {
          active.add(index);
          const sources = getActiveSources();
          if (windowStart === null && sources.size >= 2) {
            windowStart = time;
          }
        } else {
          const wasMeeting = windowStart !== null;
          active.delete(index);
          const sources = getActiveSources();
          if (wasMeeting && sources.size < 2) {
            windows.push({ start: windowStart!, end: time });
            windowStart = null;
          }
        }
      });

      windows.forEach(({ start, end }) => {
        const groupEvents = evs.filter((e) => {
          const s = new Date(`${e.callDate}T${e.startTime}`);
          const en = new Date(`${e.endDate || e.callDate}T${e.endTime}`);
          return s < end && start < en;
        });

        const numbers = Array.from(
          new Set(groupEvents.map((e) => e.source!).filter(Boolean))
        );
        if (numbers.length < 2) return;

        const perNumber = numbers.map((num) => {
          const evts = groupEvents
            .filter((e) => e.source === num)
            .map((e) => {
              const s = new Date(`${e.callDate}T${e.startTime}`);
              const en = new Date(`${e.endDate || e.callDate}T${e.endTime}`);
              const overlapStart = s < start ? start : s;
              const overlapEnd = en > end ? end : en;
              const durationSec = Math.max(
                0,
                (overlapEnd.getTime() - overlapStart.getTime()) / 1000
              );
              return {
                date: formatDate(overlapStart.toISOString().split('T')[0]),
                start: overlapStart.toTimeString().substr(0, 8),
                end: overlapEnd.toTimeString().substr(0, 8),
                duration: new Date(durationSec * 1000)
                  .toISOString()
                  .substr(11, 8),
                durationSec
              };
            });
          const totalSec = evts.reduce((a, b) => a + b.durationSec, 0);
          const total = new Date(totalSec * 1000).toISOString().substr(11, 8);
          return {
            number: num,
            events: evts.map(({ date, start, end, duration }) => ({
              date,
              start,
              end,
              duration
            })),
            total,
            totalSec
          };
        });

        const overallSec = perNumber.reduce((sum, n) => sum + n.totalSec, 0);
        const dateStr = formatDate(start.toISOString().split('T')[0]);
        const startStr = `${dateStr} ${start.toTimeString().substr(0, 8)}`;
        const endStr = `${formatDate(
          end.toISOString().split('T')[0]
        )} ${end.toTimeString().substr(0, 8)}`;
        const total = new Date(overallSec * 1000).toISOString().substr(11, 8);

        result.push({
          lat: loc.lat,
          lng: loc.lng,
          nom: loc.nom,
          numbers,
          perNumber: perNumber.map(({ totalSec, ...rest }) => rest),
          events: groupEvents,
          date: dateStr,
          start: startStr,
          end: endStr,
          total
        });
      });
    });

    return result;
  }, [displayedPoints]);

  const startIcon = useMemo(() => createLabelIcon('Départ', '#16a34a'), []);
  const endIcon = useMemo(() => createLabelIcon('Arrivée', '#dc2626'), []);
  const groupedPoints = useMemo(() => {
    const map = new Map<string, Point[]>();
    displayedPoints.forEach((p) => {
      const lat = parseFloat(p.latitude);
      const lng = parseFloat(p.longitude);
      if (isNaN(lat) || isNaN(lng)) return;
      const key = `${lat},${lng}`;
      const arr = map.get(key) || [];
      arr.push(p);
      map.set(key, arr);
    });
    return Array.from(map.entries()).map(([key, events]) => {
      const [lat, lng] = key.split(',').map(Number);
      return { lat, lng, events };
    });
  }, [displayedPoints]);
  return (
    <>
      <div className="relative w-full h-full">
        <MapContainer
          center={center}
          zoom={13}
          className="w-full h-full"
          style={{ cursor: zoneMode ? 'url("/pen.svg") 0 24, crosshair' : undefined }}
        >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoneSelector />
        {drawing && currentPoints.length > 0 && (
          <Polyline positions={currentPoints} pathOptions={{ color: 'blue' }} />
        )}
        {zoneShape && (
          <Polygon positions={zoneShape} pathOptions={{ color: 'blue' }} />
        )}
        {showBaseMarkers &&
          groupedPoints.map((group, idx) => {
          if (group.events.length === 1) {
            const loc = group.events[0];
            return (
              <Marker
                key={idx}
                position={[group.lat, group.lng]}
                icon={getIcon(
                  loc.type,
                  loc.direction
                )}
              >
                <Popup>
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold text-blue-600">{loc.nom || 'Localisation'}</p>
                    <div className="flex items-center space-x-1">
                      <PhoneOutgoing size={16} className="text-gray-700" />
                      <span>Appelant: {loc.caller || 'N/A'}</span>
                    </div>
                    {loc.type !== 'web' && (
                      <div className="flex items-center space-x-1">
                        <PhoneIncoming size={16} className="text-gray-700" />
                        <span>Appelé: {loc.callee || 'N/A'}</span>
                      </div>
                    )}
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
                    ) : loc.type === 'sms' ? (
                      <>
                        <p>Type: SMS</p>
                        <p>Date: {formatDate(loc.callDate)}</p>
                        <p>Heure: {loc.startTime}</p>
                      </>
                    ) : (
                      <>
                        <p>
                          Type:{' '}
                          {loc.direction === 'outgoing'
                            ? 'Appel Sortant'
                            : 'Appel Entrant'}
                        </p>
                        <p>Date: {formatDate(loc.callDate)}</p>
                        <p>Début: {loc.startTime}</p>
                        <p>Fin: {loc.endTime}</p>
                        <p>Durée: {loc.duration || 'N/A'}</p>
                      </>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          }
          const first = group.events[0];
          return (
            <Marker
              key={idx}
              position={[group.lat, group.lng]}
              icon={getGroupIcon(
                group.events.length,
                first.type,
                first.direction
              )}
            >
              <Popup>
                <div className="space-y-2 text-sm max-h-60 overflow-y-auto pr-1 bg-white dark:!bg-white text-gray-900 dark:!text-gray-900">
                  <p className="font-semibold text-blue-600 text-center">{first.nom || 'Localisation'}</p>
                  {group.events.map((loc, i) => (
                    <div key={i} className="mt-2 p-2 bg-white dark:!bg-white rounded-lg shadow text-gray-900 dark:!text-gray-900">
                      <p className="font-semibold">{loc.source || 'N/A'}</p>
                      <div className="flex items-center space-x-1">
                        <PhoneOutgoing size={16} className="text-gray-700 dark:!text-gray-700" />
                        <span>Appelant: {loc.caller || 'N/A'}</span>
                      </div>
                      {loc.type !== 'web' && (
                        <div className="flex items-center space-x-1">
                          <PhoneIncoming size={16} className="text-gray-700 dark:!text-gray-700" />
                          <span>Appelé: {loc.callee || 'N/A'}</span>
                        </div>
                      )}
                      {loc.type === 'web' ? (
                        <>
                          <p>Type: Position</p>
                          {loc.callDate === loc.endDate ? (
                            <p>Date: {formatDate(loc.callDate)}</p>
                          ) : (
                            <>
                              <p>Date début: {formatDate(loc.callDate)}</p>
                              <p>Date fin: {loc.endDate && formatDate(loc.endDate!)}</p>
                            </>
                          )}
                          <p>Début: {loc.startTime}</p>
                          <p>Fin: {loc.endTime}</p>
                          <p>Durée: {loc.duration || 'N/A'}</p>
                        </>
                      ) : loc.type === 'sms' ? (
                        <>
                          <p>Type: SMS</p>
                          <p>Date: {formatDate(loc.callDate)}</p>
                          <p>Heure: {loc.startTime}</p>
                        </>
                      ) : (
                        <>
                          <p>
                            Type:{' '}
                            {loc.direction === 'outgoing'
                              ? 'Appel Sortant'
                              : 'Appel Entrant'}
                          </p>
                          <p>Date: {formatDate(loc.callDate)}</p>
                          <p>Début: {loc.startTime}</p>
                          <p>Fin: {loc.endTime}</p>
                          <p>Durée: {loc.duration || 'N/A'}</p>
                        </>
                      )}
                    </div>
                  ))}
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
        {showBaseMarkers && showRoute && routePositions.length > 1 && (
          <Polyline positions={routePositions} color="black" />
        )}
        {showBaseMarkers && showRoute && routePositions.length > 0 && (
          <Marker position={routePositions[0]} icon={startIcon} />
        )}
        {showBaseMarkers && showRoute && routePositions.length > 1 && (
          <Marker
            position={routePositions[routePositions.length - 1]}
            icon={endIcon}
          />
        )}
        {showBaseMarkers && showRoute && interpolatedRoute.length > 0 && (
          <Marker position={carPosition} icon={carIcon} />
        )}
        {showBaseMarkers && showRoute &&
          arrowMarkers.map((a, idx) => (
            <Marker
              key={`arrow-${idx}`}
              position={a.position}
              icon={getArrowIcon(a.angle)}
              interactive={false}
            />
          ))}
        {showSimilar &&
          similarSegments.flatMap((seg, idx) =>
            seg.sources.map((src) =>
              visibleSimilar.has(src) ? (
                <Polyline
                  key={`similar-${idx}-${src}`}
                  positions={seg.positions}
                  color={colorMap.get(src) || '#ef4444'}
                  weight={4}
                />
              ) : null
            )
          )}
        {locationMarkers.map((loc, idx) => (
          <Marker
            key={`stat-${idx}`}
            position={[parseFloat(loc.latitude), parseFloat(loc.longitude)]}
            icon={createLabelIcon(
              String(loc.count),
              selectedSource === null &&
              sourceNumbers.length > 1 &&
              (activeInfo === 'recent' || activeInfo === 'popular')
                ? colorMap.get(loc.source || '') || '#f97316'
                : activeInfo === 'popular'
                ? '#9333ea'
                : '#f97316'
            )}
            zIndexOffset={1000}
          >
            <Popup>
              <div>
                <p>{loc.nom || `${loc.latitude},${loc.longitude}`}</p>
                <p>Occurrences : {loc.count}</p>
                {loc.lastDate && (
                  <p>
                    Dernière visite : {formatDate(loc.lastDate)}
                    {loc.lastTime && ` à ${loc.lastTime}`}
                  </p>
                )}
                {selectedSource === null &&
                  sourceNumbers.length > 1 &&
                  loc.source && <p>Numéro : {loc.source}</p>}
              </div>
            </Popup>
          </Marker>
        ))}
        </MapContainer>

        <div className="pointer-events-none absolute top-2 left-0 right-0 z-[1000] flex justify-center">
          <div className="pointer-events-auto flex bg-white/90 backdrop-blur rounded-full shadow overflow-hidden divide-x divide-gray-200">
            {sourceNumbers.length >= 2 && (
              <button
                onClick={() => setShowSimilar((s) => !s)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                  showSimilar
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Trajectoires similaires</span>
              </button>
            )}
            <button
              onClick={() => toggleInfo('contacts')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeInfo === 'contacts'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Personnes en contact</span>
            </button>
            <button
              onClick={() => toggleInfo('recent')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeInfo === 'recent'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Localisations récentes</span>
            </button>
            <button
              onClick={() => toggleInfo('popular')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeInfo === 'popular'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Flame className="w-4 h-4" />
              <span>Lieux les plus visités</span>
            </button>
            {sourceNumbers.length >= 2 && (
              <button
                onClick={onToggleMeetingPoints}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                  showMeetingPoints
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <MapPin className="w-4 h-4" />
                <span>Points de rencontre</span>
              </button>
            )}
            {onToggleZoneMode && (
              <button
                onClick={onToggleZoneMode}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                  zoneMode ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Square className="w-4 h-4" />
                <span>{zoneMode ? 'Annuler' : 'Créer une zone'}</span>
              </button>
            )}
            {(activeInfo === 'recent' ||
              activeInfo === 'popular' ||
              showMeetingPoints ||
              showSimilar) && (
              <button
                onClick={() => setShowOthers((s) => !s)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  showOthers
                    ? 'text-gray-600 hover:bg-gray-100'
                    : 'bg-gray-600 text-white'
                }`}
                title={showOthers ? 'Masquer autres éléments' : 'Afficher autres éléments'}
              >
                {showOthers ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        <div className="absolute left-2 top-24 z-[1000]">
          <div className="bg-white/80 backdrop-blur-md rounded-xl border border-gray-200 shadow-lg p-3 text-xs text-gray-700">
            <p className="font-bold text-sm mb-2 border-b border-gray-200 pb-1">Légende</p>
            <ul className="space-y-1">
              <li className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: '#16a34a' }}>
                  <PhoneIncoming className="w-3 h-3 text-white" />
                </span>
                <span>Appel entrant</span>
              </li>
              <li className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: '#2563eb' }}>
                  <PhoneOutgoing className="w-3 h-3 text-white" />
                </span>
                <span>Appel sortant</span>
              </li>
              <li className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: '#16a34a' }}>
                  <MessageSquare className="w-3 h-3 text-white" />
                </span>
                <span>SMS</span>
              </li>
              <li className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: '#dc2626' }}>
                  <MapPin className="w-3 h-3 text-white" />
                </span>
                <span>Position</span>
              </li>
              {showSimilar ? (
                similarNumbers.map((n) => (
                  <li key={n} className="flex items-center space-x-2">
                    <span
                      className="w-5 h-5 rounded-full"
                      style={{
                        backgroundColor: colorMap.get(n),
                        opacity: visibleSimilar.has(n) ? 1 : 0.3
                      }}
                    ></span>
                    <span className={visibleSimilar.has(n) ? '' : 'line-through'}>
                      {n}
                    </span>
                    <button
                      className="ml-1"
                      onClick={() => toggleSimilarVisibility(n)}
                    >
                      {visibleSimilar.has(n) ? (
                        <Eye className="w-4 h-4 text-gray-600" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </li>
                ))
              ) : selectedSource === null &&
                sourceNumbers.length > 1 &&
                (activeInfo === 'recent' || activeInfo === 'popular') ? (
                sourceNumbers.map((n) => (
                  <li key={n} className="flex items-center space-x-2">
                    <span
                      className="w-5 h-5 rounded-full"
                      style={{
                        backgroundColor: colorMap.get(n),
                        opacity: visibleSources.has(n) ? 1 : 0.3
                      }}
                    ></span>
                    <span className={visibleSources.has(n) ? '' : 'line-through'}>
                      {n}
                    </span>
                    <button
                      className="ml-1"
                      onClick={() => toggleSourceVisibility(n)}
                    >
                      {visibleSources.has(n) ? (
                        <Eye className="w-4 h-4 text-gray-600" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </li>
                ))
              ) : (
                <>
                  <li className="flex items-center space-x-2">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: '#f97316' }}
                    >
                      <Clock className="w-3 h-3 text-white" />
                    </span>
                    <span>Localisations récentes</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: '#9333ea' }}
                    >
                      <Flame className="w-3 h-3 text-white" />
                    </span>
                    <span>Lieux les plus visités</span>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>

        {showBaseMarkers && showRoute && (
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
                  <th className="pr-2">Événements</th>
                </tr>
              </thead>
              <tbody>
                {meetingPoints.map((m, i) => (
                  <tr key={i} className="border-t">
                    <td className="pr-2">{m.nom || `${m.lat},${m.lng}`}</td>
                    <td className="pr-2">{m.numbers.join(', ')}</td>
                    <td className="pr-2">{m.events.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(showZoneInfo || activeInfo) && (
          <div className="absolute top-20 right-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur rounded-lg shadow-md p-4 text-sm space-y-4 text-gray-800 dark:text-white z-[1000] max-h-[80vh] overflow-y-auto">
            <p className="font-semibold">Total : {total}</p>
            {sourceNumbers.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedSource(null)}
                  className={`px-2 py-1 rounded ${
                    selectedSource === null
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-800'
                  }`}
                >
                  Tous
                </button>
                {sourceNumbers.map((n) => (
                  <button
                    key={n}
                    onClick={() => setSelectedSource(n)}
                    className={`px-2 py-1 rounded ${
                      selectedSource === n
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            {(showZoneInfo || activeInfo === 'contacts') && topContacts.length > 0 && (
              <div>
                <p className="font-semibold mb-2">Personnes en contact</p>
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="text-left">
                      <th className="pr-4">Numéro</th>
                      <th className="pr-4">Appels</th>
                      <th className="pr-4">SMS</th>
                      <th className="pr-4">Rencontres</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedContacts.map((c, i) => {
                      const idx = (contactPage - 1) * pageSize + i;
                      return (
                        <tr
                          key={c.number}
                          className={`${idx === 0 ? 'font-bold text-blue-600' : ''} border-t`}
                        >
                          <td className="pr-4">{c.number}</td>
                          <td className="pr-4">{c.callCount}</td>
                          <td className="pr-4">{c.smsCount}</td>
                          <td className="pr-4">{meetingPoints.filter((m) => m.numbers.includes(c.number)).length}</td>
                          <td>{c.total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex justify-center items-center space-x-2 mt-2">
                  <button
                    className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
                    onClick={() => setContactPage((p) => Math.max(1, p - 1))}
                    disabled={contactPage === 1}
                  >
                    Précédent
                  </button>
                  <span>
                    Page {contactPage} / {Math.max(1, Math.ceil(topContacts.length / pageSize))}
                  </span>
                  <button
                    className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
                    onClick={() => setContactPage((p) => p + 1)}
                    disabled={contactPage >= Math.ceil(topContacts.length / pageSize)}
                  >
                    Suivant
                  </button>
                </div>
              </div>
            )}
            {(showZoneInfo || activeInfo === 'recent') && recentLocations.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold">Localisations récentes</p>
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => toggleAllLocations(recentLocations)}
                  >
                    {recentLocations.every((l) =>
                      hiddenLocations.has(`${l.latitude},${l.longitude},${l.nom || ''}`)
                    )
                      ? 'Tout afficher'
                      : 'Tout cacher'}
                  </button>
                </div>
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="text-left">
                      <th className="pr-4"></th>
                      <th className="pr-4">Lieu</th>
                      <th className="pr-4">Occurrences</th>
                      <th className="pr-4">Dernière visite</th>
                      <th>Heure dernière visite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLocations.map((l, i) => {
                      const key = `${l.latitude},${l.longitude},${l.nom || ''}`;
                      const hidden = hiddenLocations.has(key);
                      return (
                        <tr key={i} className="border-t">
                          <td className="pr-4">
                            <button onClick={() => toggleLocationVisibility(l)}>
                              {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </td>
                          <td className="pr-4">{l.nom || `${l.latitude},${l.longitude}`}</td>
                          <td className="pr-4 text-gray-800 dark:text-white">{l.count}</td>
                          <td className="pr-4">{l.lastDate && formatDate(l.lastDate)}</td>
                          <td>{l.lastTime}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {(showZoneInfo || activeInfo === 'popular') && topLocations.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold">Lieux les plus visités</p>
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => toggleAllLocations(topLocations)}
                  >
                    {topLocations.every((l) =>
                      hiddenLocations.has(`${l.latitude},${l.longitude},${l.nom || ''}`)
                    )
                      ? 'Tout afficher'
                      : 'Tout cacher'}
                  </button>
                </div>
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="text-left">
                      <th className="pr-4"></th>
                      <th className="pr-4">Lieu</th>
                      <th>Occurrences</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topLocations.map((l, i) => {
                      const key = `${l.latitude},${l.longitude},${l.nom || ''}`;
                      const hidden = hiddenLocations.has(key);
                      return (
                        <tr key={i} className="border-t">
                          <td className="pr-4">
                            <button onClick={() => toggleLocationVisibility(l)}>
                              {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </td>
                          <td className="pr-4">{l.nom || `${l.latitude},${l.longitude}`}</td>
                          <td className="text-gray-800 dark:text-white">{l.count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>


    </>
  );
};

export default CdrMap;

