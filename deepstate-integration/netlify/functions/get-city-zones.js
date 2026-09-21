/**
 * get-city-zones.js
 * ---------------------------------------------------------------
 * Публічний ендпоінт для фронтенду: GET /.netlify/functions/get-city-zones
 *
 * Віддає довідник міст, ЗЛИТИЙ із кешем зон (без жодного звернення
 * до DeepState "наживо" — тому відповідає миттєво, незалежно від
 * того, чи доступний зараз сам DeepState).
 *
 * Формат відповіді:
 * {
 *   "updatedAt": "2026-08-14T09:00:00.000Z",
 *   "cities": [
 *     { "id":"kupiansk", "name_ua":"Купʼянськ", "name_en":"Kupiansk",
 *       "zone":"red", "distanceKm":42.3, "basis":"...", "overridden": false }
 *   ]
 * }
 * ---------------------------------------------------------------
 */

const { getStore } = require('@netlify/blobs');
const citiesData = require('../../data/cities.json');

const CACHE_KEY = 'zone-cache';

// Див. пояснення в update-zone-cache.js — той самий обхід для
// "Netlify Drop"-деплою, де автоконфігурація Blobs недоступна.
function getZonesStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.BLOBS_TOKEN || process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) {
    return getStore({ name: 'zones', siteID, token });
  }
  return getStore('zones');
}

exports.handler = async function (event) {
  const store = getZonesStore();
  const cache = (await store.get(CACHE_KEY, { type: 'json' })) || { cities: {}, updatedAt: null };

  const cities = citiesData.cities.map(city => {
    const z = cache.cities[city.id] || { zone: 'unknown', distanceKm: null, basis: 'Кеш ще не оновлено' };
    return {
      id: city.id,
      name_ua: city.name_ua,
      name_en: city.name_en,
      zone: z.zone,
      distanceKm: z.distanceKm,
      basis: z.basis,
      overridden: !!z.overriddenBy,
    };
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60', // короткий браузерний кеш — щоб після ручного оновлення update-zone-cache нові дані підхоплювались швидко, а не через 5 хв
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ updatedAt: cache.updatedAt, cities }),
  };
};
