/**
 * classify.js
 * ---------------------------------------------------------------
 * Логіка визначення зони (green / orange / red / full_ban) для міста.
 *
 * ✅ ФОРМАТ ДАНИХ ПІДТВЕРДЖЕНО (не припущення) — перевірено напряму
 * на репозиторії https://github.com/cyterat/deepstate-map-data
 * (щоденний автоматичний дамп геометрії DeepState, публічний,
 * без ліцензії, GitHub Actions оновлює ~03:00 UTC):
 *
 *   {
 *     "type": "FeatureCollection",
 *     "features": [{
 *       "type": "Feature",
 *       "properties": {},
 *       "geometry": { "type": "MultiPolygon", "coordinates": [...] }
 *     }]
 *   }
 *
 * Тобто це РІВНО ОДИН MultiPolygon — тимчасово окупована територія.
 * Окремої лінії фронту (LineString) тут немає — "відстань до лінії
 * фронту" рахується як відстань до МЕЖІ цього полігону.
 * ---------------------------------------------------------------
 */

const turf = require('@turf/turf');

// Пороги з §5 Рамкової політики безпекового врядування
const THRESHOLD_RED_KM = 70;      // 0–70 км від межі окупованої території
const THRESHOLD_ORANGE_KM = 150;  // 70–150 км
// 150+ км → зелена (за замовчуванням)

/**
 * Дістає полігон(и) окупованої території з реального формату
 * cyterat/deepstate-map-data.
 */
function extractOccupiedPolygons(geoJson) {
  const features = geoJson?.features || [];
  return features.filter(f =>
    f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
  );
}

/**
 * Перетворює полігони на лінії (їхні межі), щоб порахувати
 * відстань "точка → межа окупованої території" = наближення
 * до "відстань до лінії фронту".
 */
function polygonsToBoundaryLines(polygonFeatures) {
  const lines = [];
  for (const poly of polygonFeatures) {
    try {
      const line = turf.polygonToLine(poly);
      // polygonToLine може повернути один Feature з MultiLineString
      // (типово для MultiPolygon із десятками кілець) — pointToLineDistance
      // приймає лише LineString, тож розбиваємо на окремі частини.
      const flattened = turf.flatten(line);
      lines.push(...flattened.features);
    } catch (e) {
      // деякі мультиполігони з "дірками" іноді падають на конвертації —
      // пропускаємо конкретний непридатний фрагмент, не весь розрахунок
      console.warn('polygonToLine failed for one fragment:', e.message);
    }
  }
  return lines;
}

function minDistanceToLines(point, lines) {
  let min = Infinity;
  for (const line of lines) {
    const d = turf.pointToLineDistance(point, line, { units: 'kilometers' });
    if (d < min) min = d;
  }
  return min;
}

function isInsideAnyPolygon(point, polygons) {
  return polygons.some(poly => {
    try {
      return turf.booleanPointInPolygon(point, poly);
    } catch {
      return false;
    }
  });
}

/**
 * Головна функція: класифікує один населений пункт.
 *
 * @param {{lat:number,lng:number}} city
 * @param {object} geoJson - сира відповідь із deepstate-map-data (GeoJSON)
 * @returns {{zone:'green'|'orange'|'red'|'full_ban', distanceKm:number|null, basis:string}}
 */
function classifyCity(city, geoJson) {
  const point = turf.point([city.lng, city.lat]);

  const occupiedPolygons = extractOccupiedPolygons(geoJson);
  if (occupiedPolygons.length === 0) {
    return { zone: 'unknown', distanceKm: null, basis: 'deepstate-map-data: полігон окупованої території не знайдено у відповіді' };
  }

  if (isInsideAnyPolygon(point, occupiedPolygons)) {
    return { zone: 'full_ban', distanceKm: 0, basis: 'deepstate-map-data: точка всередині окупованої території' };
  }

  const boundaryLines = polygonsToBoundaryLines(occupiedPolygons);
  const distanceKm = Math.round(minDistanceToLines(point, boundaryLines) * 10) / 10;

  let zone;
  if (distanceKm <= THRESHOLD_RED_KM) zone = 'red';
  else if (distanceKm <= THRESHOLD_ORANGE_KM) zone = 'orange';
  else zone = 'green';

  return { zone, distanceKm, basis: 'deepstate-map-data: відстань до межі окупованої території' };
}

module.exports = { classifyCity, extractOccupiedPolygons };

