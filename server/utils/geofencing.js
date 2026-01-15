const toNumber = (value) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toRadians = (value) => (value * Math.PI) / 180;

const distanceBetweenPoints = (a, b) => {
  const lat1 = toNumber(a?.lat ?? a?.latitude);
  const lng1 = toNumber(a?.lng ?? a?.longitude);
  const lat2 = toNumber(b?.lat ?? b?.latitude);
  const lng2 = toNumber(b?.lng ?? b?.longitude);

  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) {
    return null;
  }

  const R = 6371e3;
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lng2 - lng1);

  const sinDeltaPhi = Math.sin(deltaPhi / 2);
  const sinDeltaLambda = Math.sin(deltaLambda / 2);
  const aVal =
    sinDeltaPhi * sinDeltaPhi +
    Math.cos(phi1) * Math.cos(phi2) * (sinDeltaLambda * sinDeltaLambda);
  const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
  return R * c;
};

const parseZoneGeometry = (rawValue) => {
  if (!rawValue) {
    return null;
  }

  if (typeof rawValue === 'object') {
    return rawValue;
  }

  if (typeof rawValue !== 'string') {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    return null;
  }
};

const normalizePolygon = (coordinates) => {
  if (!Array.isArray(coordinates)) {
    return null;
  }

  const polygon = coordinates
    .map((point) => {
      if (Array.isArray(point) && point.length >= 2) {
        const lng = toNumber(point[0]);
        const lat = toNumber(point[1]);
        if (lng !== null && lat !== null) {
          return { lat, lng };
        }
      }
      if (point && typeof point === 'object') {
        const lat = toNumber(point.lat ?? point.latitude);
        const lng = toNumber(point.lng ?? point.longitude);
        if (lat !== null && lng !== null) {
          return { lat, lng };
        }
      }
      return null;
    })
    .filter(Boolean);

  return polygon.length >= 3 ? polygon : null;
};

const computePolygonCentroid = (polygon) => {
  if (!polygon || polygon.length === 0) {
    return null;
  }

  let x = 0;
  let y = 0;
  let signedArea = 0;

  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const a = current.lng * next.lat - next.lng * current.lat;
    signedArea += a;
    x += (current.lng + next.lng) * a;
    y += (current.lat + next.lat) * a;
  }

  signedArea *= 0.5;

  if (signedArea === 0) {
    const avgLat = polygon.reduce((sum, point) => sum + point.lat, 0) / polygon.length;
    const avgLng = polygon.reduce((sum, point) => sum + point.lng, 0) / polygon.length;
    return { lat: avgLat, lng: avgLng };
  }

  return {
    lat: y / (6 * signedArea),
    lng: x / (6 * signedArea)
  };
};

const isPointInPolygon = (point, polygon) => {
  if (!polygon || polygon.length < 3) {
    return false;
  }

  const lat = toNumber(point?.lat ?? point?.latitude);
  const lng = toNumber(point?.lng ?? point?.longitude);
  if (lat === null || lng === null) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
};

const isPointInCircle = (point, center, radiusMeters) => {
  const radius = toNumber(radiusMeters);
  if (!center || radius === null) {
    return false;
  }

  const distance = distanceBetweenPoints(point, center);
  if (distance === null) {
    return false;
  }

  return distance <= radius;
};

const resolveZoneGeometry = (zone) => {
  const geometry = parseZoneGeometry(zone?.coordonnees_geo);
  if (!geometry) {
    return null;
  }

  const type = String(geometry.type || geometry.geometryType || '').toLowerCase();
  if (type === 'circle') {
    const center = geometry.center || geometry.centre || geometry.centerPoint;
    const radius = toNumber(geometry.radius_m ?? geometry.radius ?? zone?.rayon_m);
    if (!center || radius === null) {
      return null;
    }
    const lat = toNumber(center.lat ?? center.latitude);
    const lng = toNumber(center.lng ?? center.longitude);
    if (lat === null || lng === null) {
      return null;
    }
    return {
      type: 'circle',
      center: { lat, lng },
      radius
    };
  }

  if (type === 'polygon' || Array.isArray(geometry.coordinates)) {
    const coords = geometry.coordinates || geometry.points || geometry;
    const polygon = normalizePolygon(coords);
    if (!polygon) {
      return null;
    }
    return {
      type: 'polygon',
      polygon
    };
  }

  return null;
};

const isPointInZone = (point, zone) => {
  const geometry = resolveZoneGeometry(zone);
  if (!geometry) {
    return false;
  }

  if (geometry.type === 'circle') {
    return isPointInCircle(point, geometry.center, geometry.radius);
  }

  if (geometry.type === 'polygon') {
    return isPointInPolygon(point, geometry.polygon);
  }

  return false;
};

const getZoneCenter = (zone) => {
  const geometry = resolveZoneGeometry(zone);
  if (!geometry) {
    return null;
  }

  if (geometry.type === 'circle') {
    return geometry.center;
  }

  if (geometry.type === 'polygon') {
    return computePolygonCentroid(geometry.polygon);
  }

  return null;
};

export {
  distanceBetweenPoints,
  parseZoneGeometry,
  resolveZoneGeometry,
  isPointInZone,
  getZoneCenter,
  isPointInCircle,
  isPointInPolygon,
  normalizePolygon,
  computePolygonCentroid
};
