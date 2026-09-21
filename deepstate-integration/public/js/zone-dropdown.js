/**
 * zone-dropdown.js
 * ---------------------------------------------------------------
 * Вставляється у travel_application.html поруч із полем #req-place.
 * Замінює вільний текст на dropdown міст + автоматично показує
 * зону поруч, підтягуючи дані з /.netlify/functions/get-city-zones.
 *
 * Як підключити (у travel_application.html):
 *   1. Додати <div id="zone-city-picker"></div> одразу над/під
 *      існуючим полем #req-place (рядок ~465 у поточному файлі).
 *   2. Підключити <script src="/js/zone-dropdown.js" defer></script>
 *      перед закриттям </body>.
 *
 * Що робить:
 *   - Рендерить <select> зі списком міст (укр. назви)
 *   - При виборі — показує кольоровий бейдж зони + "за даними
 *     DeepState, оновлено X тому"
 *   - Автоматично заповнює існуюче поле #req-place назвою міста
 *     (щоб не ламати наявну логіку синхронізації з TRA003/004)
 *   - Якщо зона red/orange — показує попередження про TRA005
 *   - Дає посилання "Не згоден? Позначити для перегляду" —
 *     наразі просто фіксує прапорець у localStorage-подібному
 *     стані форми; реальна маршрутизація до Фокальної точки —
 *     окрема задача (не заблокована цим кодом)
 * ---------------------------------------------------------------
 */

(function () {
  const ZONE_LABELS = {
    green:    { emoji: '🟢', label_ua: 'Зелена зона',       color: '#1a5c3a', bg: '#e8f5ee' },
    orange:   { emoji: '🟠', label_ua: 'Оранжева зона',     color: '#d47a00', bg: '#fff3e0' },
    red:      { emoji: '🔴', label_ua: 'Червона зона',      color: '#a5322a', bg: '#fdeceb' },
    full_ban: { emoji: '⛔', label_ua: 'Повна заборона',    color: '#2c343f', bg: '#e6e8ec' },
    unknown:  { emoji: '❔', label_ua: 'Зона не визначена', color: '#4b5d6e', bg: '#eceff3' },
  };

  function timeAgo(isoString) {
    if (!isoString) return 'ще не оновлювалось';
    const diffMs = Date.now() - new Date(isoString).getTime();
    const hrs = Math.round(diffMs / 3600000);
    if (hrs < 1) return 'щойно';
    if (hrs === 1) return '1 годину тому';
    if (hrs < 24) return `${hrs} год тому`;
    const days = Math.round(hrs / 24);
    return `${days} дн тому`;
  }

  async function loadZones() {
    const res = await fetch('/.netlify/functions/get-city-zones');
    if (!res.ok) throw new Error('Не вдалося завантажити перелік міст/зон');
    return res.json();
  }

  function renderBadge(container, cityEntry, updatedAt) {
    const meta = ZONE_LABELS[cityEntry.zone] || ZONE_LABELS.unknown;
    const overrideNote = cityEntry.overridden
      ? '<span style="font-size:11px;color:#4b5d6e"> · перевизначено вручну</span>'
      : `<span style="font-size:11px;color:#4b5d6e"> · за даними DeepState, оновлено ${timeAgo(updatedAt)}</span>`;

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px;padding:10px 12px;border-radius:8px;background:${meta.bg};border:1px solid ${meta.color}33">
        <span style="font-weight:700;color:${meta.color}">${meta.emoji} ${meta.label_ua}</span>
        ${overrideNote}
        <a href="#" id="zone-dispute-link" style="margin-left:auto;font-size:11px;color:#0064af;text-decoration:underline">Не згоден? Позначити для перегляду →</a>
      </div>
      ${cityEntry.zone === 'orange' || cityEntry.zone === 'red' ? `
        <div style="margin-top:6px;font-size:12px;color:#a5322a">
          ⚠️ Ця поїздка потребує Форми безпеки поїздки (TRA005) — заповніть після погодження цієї заявки.
        </div>` : ''}
    `;

    const disputeLink = container.querySelector('#zone-dispute-link');
    if (disputeLink) {
      disputeLink.addEventListener('click', (e) => {
        e.preventDefault();
        disputeLink.textContent = '✓ Позначено для перегляду Фокальною точкою з безпеки';
        disputeLink.style.pointerEvents = 'none';
        disputeLink.style.color = '#4b5d6e';
        // TODO: реальна відправка прапорця на бекенд (напр. окрема
        // Netlify Function 'flag-zone-dispute'), поки що лише UI-стан.
      });
    }
  }

  function buildPicker(mountEl, zonesData) {
    mountEl.innerHTML = `
      <div class="fld required">
        <label>Місто / населений пункт</label>
        <select id="zone-city-select" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:14px">
          <option value="">— оберіть місто —</option>
          ${zonesData.cities.map(c => `<option value="${c.id}">${c.name_ua}</option>`).join('')}
        </select>
        <div id="zone-badge-mount"></div>
      </div>
    `;

    const select = mountEl.querySelector('#zone-city-select');
    const badgeMount = mountEl.querySelector('#zone-badge-mount');

    select.addEventListener('change', () => {
      const cityId = select.value;
      const cityEntry = zonesData.cities.find(c => c.id === cityId);
      if (!cityEntry) {
        badgeMount.innerHTML = '';
        return;
      }
      renderBadge(badgeMount, cityEntry, zonesData.updatedAt);

      // Сумісність з існуючою формою: заповнюємо приховане/наявне
      // поле #req-place, щоб не ламати syncToReport() та TRA003/004.
      const placeInput = document.getElementById('req-place');
      if (placeInput) {
        placeInput.value = cityEntry.name_ua;
        placeInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Кастомна подія — якщо іншому коду форми треба відреагувати
      // на зміну зони (напр. розблокувати TRA005 tab).
      document.dispatchEvent(new CustomEvent('zoneChanged', { detail: cityEntry }));
    });
  }

  async function init() {
    const mount = document.getElementById('zone-city-picker');
    if (!mount) return; // блок ще не додано у розмітку — нічого не робимо

    mount.innerHTML = '<div style="font-size:12px;color:#4b5d6e">Завантаження переліку міст…</div>';
    try {
      const data = await loadZones();
      buildPicker(mount, data);
    } catch (err) {
      mount.innerHTML = `<div style="font-size:12px;color:#a5322a">Не вдалося завантажити зони (${err.message}). Введіть місто вручну в полі нижче.</div>`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
