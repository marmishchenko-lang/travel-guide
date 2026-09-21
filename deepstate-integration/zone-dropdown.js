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
 *   - Якщо зона red/orange — показує контакт Security Focal Point,
 *     чекбокс "оформити страхування" та підказку про консультацію
 *     перед поїздкою (ці ж дані потім автоматично йдуть у Excel-файл
 *     заявки через downloadTRA002() у travel_application.html)
 *   - Дає посилання "Не згоден? Позначити для перегляду" —
 *     наразі просто фіксує прапорець у localStorage-подібному
 *     стані форми; реальна маршрутизація до Фокальної точки —
 *     окрема задача (не заблокована цим кодом)
 *   - Для оранжевої/червоної зони показує кнопку "Переглянути
 *     пам'ятку з безпеки", яка відкриває саму пам'ятку (той самий
 *     JPEG, що зашитий у SAFETY_NOTE_B64 і додається у .zip при
 *     завантаженні заявки) прямо в модальному вікні над формою.
 *     Поки людина не відкриє й не закриє цю пам'ятку, решта полів
 *     заявки (усе, що йде після цього блоку) заблокована — щоб
 *     запобігти заповненню запиту в ризиковану зону "не читаючи".
 * ---------------------------------------------------------------
 */

(function () {
  // Клас, яким позначені елементи самого віджета (кнопка перегляду,
  // модальне вікно тощо) — вони НІКОЛИ не потрапляють під блокування,
  // навіть якщо технічно розташовані у DOM після #zone-city-picker.
  const WIDGET_EXEMPT_CLASS = 'zone-widget-exempt';
  const LOCK_MARK_ATTR = 'data-zone-locked';

  // Чи вже переглянуто пам'ятку в поточній сесії роботи зі сторінкою.
  // Один раз переглянув — повторно блокувати форму при виборі іншого
  // ризикованого міста вже не потрібно.
  let noteViewedThisSession = false;

  function getSafetyNoteB64() {
    // SAFETY_NOTE_B64 оголошений як `const` у окремому <script> в
    // travel_application.html. Класичні (не-module) <script>-теги в
    // одному документі спільно використовують глобальне лексичне
    // середовище, тож ця константа доступна і тут.
    try {
      // eslint-disable-next-line no-undef
      return typeof SAFETY_NOTE_B64 !== 'undefined' ? SAFETY_NOTE_B64 : null;
    } catch (e) {
      return null;
    }
  }

  function isExempt(el) {
    return !!(el.closest && el.closest('.' + WIDGET_EXEMPT_CLASS));
  }

  function lockDownstreamFields(mountEl) {
    if (noteViewedThisSession) return;
    // Блокуємо всю форму TRA002 (включно з тулбаром "Завантажити
    // запит" / "Save Draft" вище блоку з містом) — окрім самого
    // блоку вибору міста/зони, який має лишатись керованим.
    const scope = mountEl.closest('#tab-tra002') || document;
    const all = scope.querySelectorAll('input, select, textarea, button');
    all.forEach((el) => {
      if (isExempt(el)) return;
      if (mountEl.contains(el)) return; // сам блок вибору міста лишається активним
      if (el.disabled) return; // вже вимкнено з інших причин — не чіпаємо
      el.setAttribute(LOCK_MARK_ATTR, '1');
      el.disabled = true;
    });
  }

  function unlockDownstreamFields() {
    document.querySelectorAll('[' + LOCK_MARK_ATTR + ']').forEach((el) => {
      el.disabled = false;
      el.removeAttribute(LOCK_MARK_ATTR);
    });
  }

  function openSafetyNotePreview(onAcknowledge) {
    const b64 = getSafetyNoteB64();
    const fullSrc = b64 ? ('data:image/jpeg;base64,' + b64) : null;

    const overlay = document.createElement('div');
    overlay.className = WIDGET_EXEMPT_CLASS;
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(20,24,30,0.72);z-index:9999;'
      + 'display:flex;align-items:center;justify-content:center;padding:20px;';

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:12px;max-width:960px;width:100%;'
      + 'max-height:92vh;display:flex;flex-direction:column;overflow:hidden;'
      + 'box-shadow:0 10px 40px rgba(0,0,0,0.35);';

    const header = document.createElement('div');
    header.style.cssText = 'padding:14px 18px;border-bottom:1px solid #e5e8ec;'
      + 'font-weight:700;color:#2c343f;font-size:14px;display:flex;'
      + 'align-items:center;justify-content:space-between;gap:10px;';
    header.innerHTML = '<span>🛡️ Пам’ятка з безпеки — TRUE Rehabilitation for Ukraine</span>';

    const body = document.createElement('div');
    body.style.cssText = 'padding:12px;overflow:auto;flex:1;background:#f5f6f8;text-align:center;';

    const footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 18px;border-top:1px solid #e5e8ec;display:flex;'
      + 'align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;';

    if (fullSrc) {
      // Картинка, що зашита у SAFETY_NOTE_B64, — це дві сторінки (укр. + eng.)
      // складені одна під одною в один файл, тому пряме масштабування під
      // ширину модалки вдвічі "стискає" текст і робить його нечітким.
      // Тут ми обрізаємо зображення до половини — тільки та мова, яка зараз
      // активна на сторінці (перемикач EN/УК) — це вдвічі підвищує
      // "видиму" роздільність тексту без жодної втрати якості вихідного файлу.
      const img = new Image();
      img.alt = "Пам'ятка з безпеки";
      img.style.cssText = 'max-width:100%;border-radius:6px;box-shadow:0 1px 6px rgba(0,0,0,0.15);'
        + 'display:block;margin:0 auto;';
      body.appendChild(img);

      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:11.5px;color:#4b5d6e;';
      hint.textContent = 'Показано мовну версію відповідно до поточної мови сторінки.';

      const fullLink = document.createElement('a');
      fullLink.href = fullSrc;
      fullLink.target = '_blank';
      fullLink.rel = 'noopener';
      fullLink.textContent = 'Відкрити зображення повністю (обидві мови, оригінальний розмір) →';
      fullLink.style.cssText = 'font-size:12px;color:#0064af;text-decoration:underline;white-space:nowrap;';

      footer.appendChild(hint);
      footer.appendChild(fullLink);

      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        // Currently active language on the page: 'uk' (default) or 'en'.
        // eslint-disable-next-line no-undef
        const currentLang = (typeof lang !== 'undefined' && lang === 'en') ? 'en' : 'uk';
        const halfH = Math.round(h / 2);
        const yOffset = currentLang === 'en' ? halfH : 0;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = halfH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, yOffset, w, halfH, 0, 0, w, halfH);
        img.src = canvas.toDataURL('image/jpeg', 0.95);
        img.style.maxHeight = '68vh';
        img.style.width = 'auto';
      };
      img.onerror = () => {
        img.remove();
        body.innerHTML = '<div style="padding:30px;color:#a5322a;font-size:13px">'
          + 'Не вдалося показати зображення пам’ятки тут. Скористайтесь посиланням '
          + '«Відкрити зображення повністю» нижче.</div>';
      };
      img.src = fullSrc;
    } else {
      body.innerHTML = '<div style="padding:30px;color:#a5322a;font-size:13px">'
        + 'Не вдалося завантажити зображення пам’ятки на цій сторінці. '
        + 'Вона все одно автоматично додається у .zip разом із заявкою — '
        + 'будь ласка, ознайомтесь із нею там перед поїздкою.</div>';
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Ознайомився(-лась) — продовжити заповнення';
    btn.style.cssText = 'background:#0064af;color:#fff;border:none;border-radius:8px;'
      + 'padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;'
      + 'margin-left:auto;';
    footer.appendChild(btn);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function close() {
      overlay.remove();
      if (typeof onAcknowledge === 'function') onAcknowledge();
    }
    btn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(); // клік по фону теж закриває — форма розблокується
    });
  }

  function renderNoteGate(container, mountEl) {
    const wrap = document.createElement('div');
    wrap.className = WIDGET_EXEMPT_CLASS;
    wrap.style.cssText = 'margin-top:10px;padding:12px 14px;border-radius:8px;'
      + 'background:#eaf2fb;border:1px solid #0064af33;display:flex;'
      + 'align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;';

    const text = document.createElement('div');
    text.style.cssText = 'font-size:12.5px;color:#0f2f4d;flex:1;min-width:200px';
    text.innerHTML = noteViewedThisSession
      ? '✅ Пам’ятку з безпеки переглянуто. Можна продовжувати заповнення заявки.'
      : '🔒 Заповнення решти заявки відкриється після того, як ви відкриєте й перегляньте пам’ятку з безпеки.';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = noteViewedThisSession
      ? '📄 Переглянути пам’ятку ще раз'
      : '📄 Переглянути пам’ятку з безпеки';
    btn.style.cssText = 'background:#0064af;color:#fff;border:none;border-radius:8px;'
      + 'padding:9px 14px;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;';

    btn.addEventListener('click', () => {
      openSafetyNotePreview(() => {
        noteViewedThisSession = true;
        unlockDownstreamFields();
        text.textContent = '✅ Пам’ятку з безпеки переглянуто. Можна продовжувати заповнення заявки.';
        btn.textContent = '📄 Переглянути пам’ятку ще раз';
      });
    });

    wrap.appendChild(text);
    wrap.appendChild(btn);
    container.appendChild(wrap);

    if (!noteViewedThisSession) {
      lockDownstreamFields(mountEl);
    }
  }

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

  const SFP_NAME = 'Марина Кравченко';
  const SFP_PHONE = '093-902-22-28';
  const SFP_EMAIL = 'kravchenko.m@patients.org.ua';

  function renderBadge(container, cityEntry, updatedAt) {
    const meta = ZONE_LABELS[cityEntry.zone] || ZONE_LABELS.unknown;
    const overrideNote = cityEntry.overridden
      ? '<span style="font-size:11px;color:#4b5d6e"> · перевизначено вручну</span>'
      : `<span style="font-size:11px;color:#4b5d6e"> · за даними DeepState, оновлено ${timeAgo(updatedAt)}</span>`;

    const isOrange = cityEntry.zone === 'orange';
    const isRed = cityEntry.zone === 'red';
    const isRisky = isOrange || isRed;

    // Оранжева і червона зони показують той самий заголовок і контакт SFP,
    // але текст під ним різний: помаранчева — рекомендація проконсультуватись,
    // червона — обов'язковий маршрут погодження (SFP → Team Lead/SPOC) і
    // повторне підтвердження ситуації безпосередньо перед прибуттям.
    const riskyBodyText = isRed
      ? `Подайте ваш запит на поїздку Security Focal Point, який перевірить його та передасть на затвердження
         Team Lead та SPOC. Поїздка може відбутися лише після отримання погодження Team Lead та SPOC.`
      : `Будь ласка, ознайомтесь із пам'яткою безпеки та збережіть собі контакт Security Focal Point
         перед поїздкою. При поверненні заявка та ця пам'ятка автоматично збережуться в одному файлі.`;

    const riskyTipText = isRed
      ? `❗ Безпосередньо перед прибуттям повторно підтверджується ситуація з місцевою громадою/приймаючою
         стороною.`
      : `💡 Перед виїздом рекомендується коротка консультація з Security Focal Point щодо поточної
         безпекової ситуації в цьому напрямку.`;

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px;padding:10px 12px;border-radius:8px;background:${meta.bg};border:1px solid ${meta.color}33">
        <span style="font-weight:700;color:${meta.color}">${meta.emoji} ${meta.label_ua}</span>
        ${overrideNote}
        <a href="#" id="zone-dispute-link" style="margin-left:auto;font-size:11px;color:#0064af;text-decoration:underline">Не згоден? Позначити для перегляду →</a>
      </div>
      ${isRisky ? `
        <div style="margin-top:8px;padding:12px 14px;border-radius:8px;background:#fdeceb;border:1px solid #a5322a33">
          <div style="font-weight:700;color:#a5322a;font-size:13px">⚠️ Ви їдете у зону підвищеної небезпеки</div>
          <div style="font-size:12.5px;color:#4b3230;margin-top:4px">
            ${riskyBodyText}
          </div>
          <div style="font-size:12.5px;margin-top:8px">
            📞 <strong>${SFP_NAME}</strong> — ${SFP_PHONE} · <a href="mailto:${SFP_EMAIL}" style="color:#0064af">${SFP_EMAIL}</a>
          </div>
          <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12.5px;cursor:pointer">
            <input type="checkbox" id="zone-insurance-opt"${isRed ? ' checked' : ''}>
            Оформити страхування за рахунок організації на${isRed ? ' весь' : ''} період поїздки${isRed ? ' (обов’язково для червоної зони)' : ''}
          </label>
          <div style="font-size:12px;color:#4b5d6e;margin-top:6px">
            ${riskyTipText}
          </div>
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

    // Ризикована зона — вимагаємо перегляду пам'ятки з безпеки перед
    // тим, як дозволити продовжити заповнення решти заявки.
    if (isRisky) {
      const riskyBlock = container.querySelector('div[style*="fdeceb"]');
      renderNoteGate(riskyBlock || container, container.closest('#zone-city-picker') || container);
    } else {
      // Зелена/невизначена зона — форма має бути повністю доступною,
      // навіть якщо до цього людина обирала ризиковане місто.
      unlockDownstreamFields();
    }
  }

  function renderManualFallback(mount, err) {
    // Немає даних про зони — не можемо визначити ризик автоматично,
    // тож не блокуємо форму (Security Focal Point перевірить вручну).
    unlockDownstreamFields();
    mount.innerHTML = `
      <div class="fld required">
        <label>Місто / населений пункт</label>
        <input type="text" id="zone-city-manual" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:14px" placeholder="Введіть назву міста">
        <div style="font-size:11px;color:#a5322a;margin-top:4px">⚠️ Не вдалося автоматично визначити зону${err && err.message ? ' (' + err.message + ')' : ''}. Введіть місто вручну — Security Focal Point перевірить зону під час погодження заявки.</div>
      </div>
    `;
    const input = mount.querySelector('#zone-city-manual');
    input.addEventListener('input', () => {
      const name = input.value.trim();
      mount.dataset.cityName = name;
      document.dispatchEvent(new CustomEvent('zoneChanged', {
        detail: name ? { zone: 'unknown', name_ua: name, overridden: false } : null
      }));
    });
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
        mountEl.dataset.cityName = '';
        mountEl.dataset.zone = '';
        mountEl.dataset.zoneLabel = '';
        unlockDownstreamFields(); // місто не обрано — нема ризику, який треба підтверджувати
        document.dispatchEvent(new CustomEvent('zoneChanged', { detail: null }));
        return;
      }
      renderBadge(badgeMount, cityEntry, zonesData.updatedAt);

      // Записуємо обране місто в data-атрибут контейнера — саме звідси
      // travel_application.html бере назву міста, щоб об'єднати її з
      // полем "Заклад / установа" в підсумкове поле #req-place.
      mountEl.dataset.cityName = cityEntry.name_ua;

      // Записуємо зону — downloadTRA002() у travel_application.html
      // читає саме ці два атрибути, щоб заповнити клітинку із зоною
      // в Excel-файлі та вирішити, чи додавати пам'ятку з безпеки.
      const meta = ZONE_LABELS[cityEntry.zone] || ZONE_LABELS.unknown;
      mountEl.dataset.zone = cityEntry.zone;
      mountEl.dataset.zoneLabel = meta.label_ua;

      // Кастомна подія — форма сама перерахує #req-place та відреагує
      // на зміну зони.
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
      renderManualFallback(mount, err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
