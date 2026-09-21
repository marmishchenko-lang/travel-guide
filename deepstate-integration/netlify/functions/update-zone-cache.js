/**
 * update-zone-cache.js
 * ---------------------------------------------------------------
 * SCHEDULED FUNCTION — запускається автоматично за розкладом
 * (див. netlify.toml, за замовчуванням кожні 6 годин).
 *
 * ДЖЕРЕЛО ДАНИХ: https://github.com/cyterat/deepstate-map-data
 * Публічний, безкоштовний, без ліцензії — щоденний авто-дамп
 * геометрії окупованих територій із DeepState Map через GitHub
 * Actions (оновлюється ~03:00 UTC). Перевірено напряму 14.08.2026 —
 * формат підтверджено, це не припущення (див. shared/classify.js).
 *
 * ⚠️ Важливо (з приводу самого джерела, не коду): DeepState — це
 * оперативне OSINT-джерело, а не офіційний державний реєстр.
 * Тому у відповіді get-city-zones.js і в UI завжди показуємо
 * дату останнього оновлення і назву джерела — команда й колеги
 * повинні бачити, наскільки свіжі дані.
 *
 * Що робить ця функція:
 *   1. Тягне сьогоднішній (або вчорашній, якщо сьогоднішній ще
 *      не встиг опублікуватись) GeoJSON з окупованою територією
 *   2. Рахує зону для кожного міста з data/cities.json
 *   3. Накладає ручні перевизначення з data/overrides.json
 *   4. Зберігає результат у Netlify Blobs — кеш, який читає
 *      get-city-zones.js для фронтенду
 * ---------------------------------------------------------------
 */

const { getStore } = require('@netlify/blobs');
const { classifyCity } = require('../../shared/classify');
const citiesData = require('../../data/cities.json');
let overridesData = {};
try {
  overridesData = require('../../data/overrides.json');
} catch {
  overridesData = { overrides: {} };
}

const CACHE_KEY = 'zone-cache';
const REPO_RAW_BASE = 'https://raw.githubusercontent.com/cyterat/deepstate-map-data/main/data';

// --------------------------------------------------------------------
// Деплой через "Netlify Drop" (перетягування папки/zip у браузері) не
// передає функціям автоматичний контекст для Netlify Blobs — на
// відміну від деплою через Git або Netlify CLI. Тому якщо в середовищі
// є явно задані SITE_ID і BLOBS_TOKEN, використовуємо їх; якщо ні —
// пробуємо автоконфігурацію (спрацює, якщо колись перейдете на
// Git/CLI-деплой — тоді ці змінні можна прибрати).
// --------------------------------------------------------------------
function getZonesStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.BLOBS_TOKEN || process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) {
    return getStore({ name: 'zones', siteID, token });
  }
  return getStore('zones');
}


function dateStr(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Файл публікується щодня ~03:00 UTC. Якщо наш запуск стався раніше
 * (напр. функція спрацювала о 01:00 UTC), сьогоднішнього файлу ще
 * не буде — тоді пробуємо вчорашній. Це не "поламані дані", а
 * нормальна затримка публікації джерела.
 */
async function fetchLatestOccupiedGeoJson() {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
  const candidates = [dateStr(today), dateStr(yesterday)];

  for (const ds of candidates) {
    const url = `${REPO_RAW_BASE}/deepstatemap_data_${ds}.geojson`;
    const res = await fetch(url);
    if (res.ok) {
      const geoJson = await res.json();
      return { geoJson, fileDate: ds, url };
    }
  }
  throw new Error(`Не знайшов файл ані за сьогодні (${candidates[0]}), ані за вчора (${candidates[1]}) у deepstate-map-data`);
}

exports.handler = async function () {
  const store = getZonesStore();
  const result = {
    updatedAt: new Date().toISOString(),
    source: 'deepstate-map-data (github.com/cyterat/deepstate-map-data)',
    sourceFileDate: null,
    cities: {},
  };

  try {
    const { geoJson, fileDate } = await fetchLatestOccupiedGeoJson();
    result.sourceFileDate = fileDate;

    for (const city of citiesData.cities) {
      const override = overridesData.overrides?.[city.id];

      if (override) {
        // Ручне перевизначення завжди перекриває автоматичний розрахунок
        result.cities[city.id] = {
          zone: override.zone,
          distanceKm: null,
          basis: `Перевизначено вручну: ${override.reason || 'без причини'}`,
          overriddenBy: override.by || 'Фокальна точка з безпеки',
          overriddenAt: override.at || null,
        };
        continue;
      }

      result.cities[city.id] = classifyCity(city, geoJson);
    }

    await store.setJSON(CACHE_KEY, result);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, updated: Object.keys(result.cities).length, sourceFileDate: fileDate }),
    };
  } catch (err) {
    // Якщо джерело недоступне — НЕ затираємо старий кеш поламаним результатом.
    // Форма продовжує показувати останні відомі (можливо, трохи застарілі) зони.
    console.error('update-zone-cache failed:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message, note: 'Старий кеш залишено без змін.' }),
    };
  }
};

// Розклад: кожні 6 годин. Джерело публікує раз на добу, тому частіше
// за 6 год сенсу немає — можна навіть рідше (напр. '0 6 * * *' — раз на день).
exports.config = {
  schedule: '0 */6 * * *',
};

