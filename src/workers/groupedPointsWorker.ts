type Point = {
  latitude: string;
  longitude: string;
  source?: string;
  tracked?: string;
  caller?: string;
  callee?: string;
  direction?: string;
};

type GroupedPoint = {
  lat: number;
  lng: number;
  events: Point[];
  perSource: { source?: string; events: Point[] }[];
};

const NO_SOURCE_KEY = '__no_source__';

const normalizePhoneDigits = (value?: string): string => {
  if (!value) return '';
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.replace(/^00+/, '');
  }
  if (digits.startsWith('221')) {
    digits = digits.slice(3);
  }
  return digits;
};

const getPointSourceValue = (point: Point): string | undefined => {
  const tracked = point.tracked?.trim();
  if (tracked) return tracked;

  const direction = (point.direction || '').toLowerCase();
  const candidate = direction === 'incoming' ? point.callee || point.caller : point.caller || point.callee;
  const fallback = candidate || point.source;
  const trimmed = fallback?.toString().trim();
  return trimmed || undefined;
};

const computeGroupedPoints = (points: Point[]): GroupedPoint[] => {
  const groups = new Map<string, { lat: number; lng: number; perSource: Map<string, { source?: string; events: Point[] }> }>();

  points.forEach((p) => {
    const lat = Number.parseFloat(p.latitude);
    const lng = Number.parseFloat(p.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const locationKey = `${lat},${lng}`;
    let locationGroup = groups.get(locationKey);
    if (!locationGroup) {
      locationGroup = { lat, lng, perSource: new Map() };
      groups.set(locationKey, locationGroup);
    }

    const sourceValue = getPointSourceValue(p);
    const normalizedSource = normalizePhoneDigits(sourceValue);
    const sourceKey = normalizedSource || sourceValue || NO_SOURCE_KEY;

    const sourceEntry = locationGroup.perSource.get(sourceKey);
    if (sourceEntry) {
      sourceEntry.events.push(p);
    } else {
      locationGroup.perSource.set(sourceKey, { source: sourceValue, events: [p] });
    }
  });

  return Array.from(groups.values()).map(({ lat, lng, perSource }) => {
    const perSourceEntries = Array.from(perSource.values());
    const events = perSourceEntries.flatMap((entry) => entry.events);
    return { lat, lng, perSource: perSourceEntries, events };
  });
};

self.onmessage = (event: MessageEvent<Point[]>) => {
  const groupedPoints = computeGroupedPoints(event.data ?? []);
  self.postMessage(groupedPoints);
};
