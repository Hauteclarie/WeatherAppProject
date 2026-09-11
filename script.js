// ============================================================
// KONFIGURACJA I STAŁE
// ============================================================

// Klucz pod którym przechowujemy wszystkie dane aplikacji w localStorage
const CACHE_KEY = 'weatherApp_cache';

// Co ile czasu czyścimy zapisane dane (1 godzina, w milisekundach)
const CLEAR_INTERVAL_MS = 60 * 60 * 1000;

// Ile ostatnio wyszukiwanych miast pokazujemy jako "chipy" pod formularzem
const MAX_RECENT = 6;

// Mapowanie kodów pogodowych WMO (zwracanych przez Open-Meteo w polu "weather_code")
// na czytelne opisy w języku polskim
const WEATHER_CODES = {
    0: 'Bezchmurnie', 1: 'Głównie bezchmurnie', 2: 'Częściowe zachmurzenie', 3: 'Zachmurzenie całkowite',
    45: 'Mgła', 48: 'Mgła osadzająca szron',
    51: 'Lekka mżawka', 53: 'Mżawka', 55: 'Gęsta mżawka',
    56: 'Marznąca mżawka', 57: 'Gęsta marznąca mżawka',
    61: 'Lekki deszcz', 63: 'Deszcz', 65: 'Silny deszcz',
    66: 'Marznący deszcz', 67: 'Silny marznący deszcz',
    71: 'Lekki śnieg', 73: 'Śnieg', 75: 'Silny śnieg', 77: 'Ziarna śniegu',
    80: 'Przelotny deszcz', 81: 'Przelotny deszcz', 82: 'Gwałtowny przelotny deszcz',
    85: 'Przelotny śnieg', 86: 'Silny przelotny śnieg',
    95: 'Burza', 96: 'Burza z gradem', 99: 'Silna burza z gradem',
};

// Skala kolorów używana zarówno do pokolorowania znacznika temperatury
// na mapie, jak i do wygenerowania legendy pod mapą. Każdy przedział
// ma górną granicę (max) - szukamy pierwszego przedziału, do którego
// pasuje dana temperatura.
const TEMP_SCALE = [
    { max: -10, color: '#08306b', label: '≤ -10°C' },
    { max: 0,   color: '#2171b5', label: '-10…0°C' },
    { max: 10,  color: '#6baed6', label: '0…10°C' },
    { max: 18,  color: '#74c476', label: '10…18°C' },
    { max: 25,  color: '#fdae61', label: '18…25°C' },
    { max: 32,  color: '#f46d43', label: '25…32°C' },
    { max: Infinity, color: '#a50f15', label: '> 32°C' },
];

// Zwraca kolor (hex) odpowiadający podanej temperaturze w stopniach Celsjusza
function tempColor(tempC) {
    const match = TEMP_SCALE.find((step) => tempC <= step.max);
    return match ? match.color : TEMP_SCALE[TEMP_SCALE.length - 1].color;
}

function relativeLuminance([r, g, b]) {
    const channel = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(rgb1, rgb2) {
    const l1 = relativeLuminance(rgb1);
    const l2 = relativeLuminance(rgb2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

function contrastingTextColor(hex) {
    const bgRgb = hexToRgb(hex);
    const contrastWithBlack = contrastRatio(bgRgb, [0, 0, 0]);
    const contrastWithWhite = contrastRatio(bgRgb, [255, 255, 255]);
    return contrastWithBlack >= contrastWithWhite ? '#000000' : '#ffffff';
}

// ------------------------------------------------------------
// Gradient temperatur wyświetlany na mapie 
// ------------------------------------------------------------


// Zakres temperatur mapowany na skalę 0-1 używaną wewnętrznie do interpolacji koloru
const HEAT_MIN_TEMP = -20;
const HEAT_MAX_TEMP = 40;

// Kolory gradientu z kluczami 0-1 odpowiadającymi pozycji w zakresie
// HEAT_MIN_TEMP..HEAT_MAX_TEMP. Te same kolory (i granice) co w TEMP_SCALE,
// więc znacznik miasta, legenda i tło mapy są ze sobą spójne.
const TEMP_HEAT_GRADIENT = {
    0.00: '#08306b', // ok. -20°C i poniżej
    0.17: '#2171b5', // ok. -10°C
    0.33: '#6baed6', // ok. 0°C
    0.50: '#74c476', // ok. 10°C
    0.63: '#fdae61', // ok. 18°C
    0.75: '#f46d43', // ok. 25°C
    0.87: '#a50f15', // ok. 32°C
    1.00: '#a50f15', // ok. 40°C i powyżej
};

// Rozmiar siatki punktów próbkowanych z API (size x size) dla aktualnie
// widocznego obszaru mapy - patrz grid.php
const GRID_SIZE = 8;

// Rozdzielczość rastru gradientu w pikselach (mniejsza wartość = szybciej
// liczone; przeglądarka i tak wygładza obrazek przy rozciąganiu na mapę,
// więc nie trzeba tu dużej rozdzielczości, żeby przejścia wyglądały płynnie)
const FIELD_CANVAS_SIZE = 96;

// Wykładnik IDW - im wyższy, tym mocniej dominują najbliższe punkty próbki
const IDW_POWER = 2;

// Zamienia temperaturę w stopniach na wartość 0-1 (intensywność), przycinaną
// do zakresu HEAT_MIN_TEMP..HEAT_MAX_TEMP
function tempToIntensity(tempC) {
    const clamped = Math.min(Math.max(tempC, HEAT_MIN_TEMP), HEAT_MAX_TEMP);
    return (clamped - HEAT_MIN_TEMP) / (HEAT_MAX_TEMP - HEAT_MIN_TEMP);
}

// Zamienia kolor hex ("#rrggbb") na tablicę [r, g, b]
function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    return [
        parseInt(clean.substring(0, 2), 16),
        parseInt(clean.substring(2, 4), 16),
        parseInt(clean.substring(4, 6), 16),
    ];
}

// Te same przystanki co w TEMP_HEAT_GRADIENT, ale posortowane i od razu
// zamienione na RGB - liczymy to raz, przy starcie, zamiast przy każdym pikselu
const HEAT_STOPS = Object.entries(TEMP_HEAT_GRADIENT)
    .map(([t, color]) => ({ t: parseFloat(t), rgb: hexToRgb(color) }))
    .sort((a, b) => a.t - b.t);

// Zwraca płynnie interpolowany kolor [r, g, b] dla danej intensywności 0-1,
// liniowo pomiędzy dwoma najbliższymi przystankami HEAT_STOPS - dzięki temu
// gradient nie ma "pasków" (bandingu), tylko płynne przejścia między kolorami
function colorForIntensity(intensity) {
    const t = Math.min(1, Math.max(0, intensity));
    for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
        const a = HEAT_STOPS[i];
        const b = HEAT_STOPS[i + 1];
        if (t >= a.t && t <= b.t) {
            const span = b.t - a.t || 1;
            const f = (t - a.t) / span;
            return [
                Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * f),
                Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * f),
                Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * f),
            ];
        }
    }
    return HEAT_STOPS[HEAT_STOPS.length - 1].rgb;
}

// Buduje obrazek (data URL PNG) z ciągłym gradientem temperatur dla podanych
// punktów próbki, rozciągnięty dokładnie na wskazany obszar (bounds).
// Dla każdego piksela liczymy średnią ważoną odwrotnością odległości (IDW)
// od wszystkich punktów próbki - im bliżej punktu, tym większy jego wpływ.
function buildTemperatureFieldImage(points, bounds) {
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const west = bounds.getWest();
    const east = bounds.getEast();

    // Punkty próbki przeliczone na współrzędne znormalizowane 0-1
    // wewnątrz aktualnego obszaru mapy (x: zachód->wschód, y: północ->południe)
    const samples = points.map((p) => ({
        x: (p.lon - west) / (east - west || 1),
        y: 1 - (p.lat - south) / (north - south || 1),
        value: tempToIntensity(p.temp),
    }));

    const canvas = document.createElement('canvas');
    canvas.width = FIELD_CANVAS_SIZE;
    canvas.height = FIELD_CANVAS_SIZE;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(FIELD_CANVAS_SIZE, FIELD_CANVAS_SIZE);

    for (let py = 0; py < FIELD_CANVAS_SIZE; py++) {
        const fy = py / (FIELD_CANVAS_SIZE - 1);
        for (let px = 0; px < FIELD_CANVAS_SIZE; px++) {
            const fx = px / (FIELD_CANVAS_SIZE - 1);

            let weightSum = 0;
            let valueSum = 0;
            for (let i = 0; i < samples.length; i++) {
                const s = samples[i];
                const dx = fx - s.x;
                const dy = fy - s.y;
                const distSq = dx * dx + dy * dy;

                // Piksel dokładnie w punkcie próbki - bierzemy jego wartość wprost,
                // żeby uniknąć dzielenia przez (prawie) zero
                if (distSq < 1e-9) {
                    weightSum = 1;
                    valueSum = s.value;
                    break;
                }

                const weight = 1 / Math.pow(distSq, IDW_POWER / 2);
                weightSum += weight;
                valueSum += weight * s.value;
            }

            const intensity = weightSum > 0 ? valueSum / weightSum : 0.5;
            const [r, g, b] = colorForIntensity(intensity);

            const idx = (py * FIELD_CANVAS_SIZE + px) * 4;
            imageData.data[idx] = r;
            imageData.data[idx + 1] = g;
            imageData.data[idx + 2] = b;
            imageData.data[idx + 3] = 255; // przezroczystość ustawiamy osobno, przez opacity warstwy
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
}

// Referencje do obiektu mapy Leaflet i aktualnego znacznika - ustawiane w initMap()
let map, marker;

// Referencja do aktualnej warstwy gradientu temperatur (L.imageOverlay) -
// nadpisywana przy każdym odświeżeniu (przesunięcie mapy, co godzinę)
let tempFieldLayer;

// Licznik zapytań o siatkę temperatur - służy do ignorowania odpowiedzi
// z "nieaktualnych" zapytań (np. gdy użytkownik szybko przesunął mapę
// jeszcze zanim poprzednie zapytanie zdążyło wrócić)
let gridRequestId = 0;

// Timer używany do "uspokojenia" (debounce) odświeżania gradientu podczas
// przesuwania/przybliżania mapy - inaczej każdy mały ruch generowałby nowe zapytanie
let gridDebounceTimer = null;

// ============================================================
// WARSTWA PRZECHOWYWANIA DANYCH (localStorage)
// ============================================================

// Odczytuje obiekt z localStorage. Jeśli nic tam nie ma (albo dane są
// uszkodzone), zwraca "pusty" obiekt startowy.
function loadStore() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        // uszkodzony JSON - traktujemy tak, jakby pamięć była pusta
    }
    return { lastClear: Date.now(), cities: {}, recent: [] };
}

// Zapisuje obiekt store z powrotem do localStorage (jako tekst JSON)
function saveStore(store) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
}

// Sprawdza, czy od ostatniego czyszczenia minęła już godzina.
// Jeśli tak - kasuje wszystkie zapisane miasta i historię wyszukiwań,
// a licznik czasu ustawia od nowa. Dzięki temu dane w localStorage
// "wygasają" automatycznie co godzinę, tak jak wymaga specyfikacja.
function maybeClearStore(store) {
    const now = Date.now();
    if (now - store.lastClear >= CLEAR_INTERVAL_MS) {
        store.cities = {};
        store.recent = [];
        store.lastClear = now;
        saveStore(store);
    }
    return store;
}

// Zamienia nazwę miasta na jednolity klucz używany w obiekcie "cities"
// (małe litery, bez spacji na początku/końcu) - dzięki temu "Warszawa"
// i "warszawa " trafiają do tego samego wpisu w cache.
function normalizeKey(name) {
    return name.trim().toLowerCase();
}

// ============================================================
// MAPA 
// ============================================================

// Tworzy mapę i ustawia domyślny widok 
function initMap() {
    map = L.map('map', { zoomControl: true }).setView([52.0, 19.0], 5);

    // Własna "pasek" (pane) tylko dla bazowych kafelków OSM.
    map.createPane('baseTiles');
    map.getPane('baseTiles').style.zIndex = 200;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 18,
        pane: 'baseTiles',
    }).addTo(map);

    renderLegend();

    
    loadTemperatureGrid();

    // Za każdym razem, gdy użytkownik przesunie lub przybliży/oddali mapę
    // (w tym też programowo, np. przez wyszukanie miasta), odświeżamy
    // gradient tak, żeby zawsze pasował do aktualnie widocznego obszaru
    map.on('moveend', scheduleGridRefresh);
}

// "Uspokaja" (debounce) odświeżanie gradientu - gdy użytkownik przesuwa
// mapę wielokrotnie w krótkim czasie, chcemy wysłać tylko jedno zapytanie
// po tym, jak ruch się ustabilizuje, a nie po każdej pojedynczej zmianie
function scheduleGridRefresh() {
    clearTimeout(gridDebounceTimer);
    gridDebounceTimer = setTimeout(loadTemperatureGrid, 300);
}

// Pobiera z backendu (grid.php) siatkę punktów 
async function loadTemperatureGrid() {
    const requestId = ++gridRequestId;

    try {
        const bounds = map.getBounds();
        const url = `grid.php?south=${bounds.getSouth()}&west=${bounds.getWest()}` +
            `&north=${bounds.getNorth()}&east=${bounds.getEast()}&size=${GRID_SIZE}`;

        const res = await fetch(url);
        const points = await res.json();

        // Jeśli w międzyczasie wystartowało już nowsze zapytanie (np. użytkownik
        // zdążył przesunąć mapę dalej), ignorujemy tę nieaktualną odpowiedź
        if (requestId !== gridRequestId) return;
        if (!Array.isArray(points) || points.length < 4) return;

        const imageUrl = buildTemperatureFieldImage(points, bounds);

        // Usuwamy poprzedni gradient, zanim narysujemy nowy - inaczej stary
        // i nowy obrazek nakładałyby się na siebie
        if (tempFieldLayer) map.removeLayer(tempFieldLayer);

        tempFieldLayer = L.imageOverlay(imageUrl, bounds, {
            opacity: 0.55,
            interactive: false,
        }).addTo(map);

        // Warstwa gradientu ma zawsze leżeć POD znacznikiem miasta (jeśli jest),
        // żeby liczba z temperaturą pozostała czytelna
        tempFieldLayer.bringToBack();
    } catch (e) {
        // Brak gradientu nie jest błędem krytycznym - reszta aplikacji
        // (znacznik z dokładną temperaturą, wyszukiwanie) działa dalej normalnie
        console.warn('Nie udało się załadować gradientu temperatur:', e);
    }
}

// Buduje legendę kolorów temperatury pod mapą - dotyczy zarówno znacznika
// miasta, jak i gradientu w tle, bo obie warstwy używają tej samej palety
function renderLegend() {
    const container = document.getElementById('temp-legend');
    if (!container) return;
    container.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'legend__title';
    title.textContent = 'Kolor na mapie = temperatura';
    container.appendChild(title);

    const row = document.createElement('div');
    row.className = 'legend__row';
    TEMP_SCALE.forEach((step) => {
        const item = document.createElement('span');
        item.className = 'legend__item';
        item.innerHTML = `<span class="legend__swatch" style="background:${step.color}"></span>${step.label}`;
        row.appendChild(item);
    });
    container.appendChild(row);
}

// Przesuwa mapę nad wskazane współrzędne i ustawia tam znacznik z dokładną
// wartością temperatury. 
function updateMap(lat, lon, label, tempC) {
    map.setView([lat, lon], 8);
    if (marker) map.removeLayer(marker);

    const backgroundColor = tempColor(tempC);
    const textColor = contrastingTextColor(backgroundColor);

    const icon = L.divIcon({
        className: 'temp-marker-wrapper',
        html: `<div class="temp-marker" style="background:${backgroundColor};color:${textColor}">${Math.round(tempC)}°</div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
    });

    marker = L.marker([lat, lon], { icon, zIndexOffset: 1000 }).addTo(map).bindPopup(label).openPopup();
}

// ============================================================
// KOMUNIKACJA Z BACKENDEM (api.php)
// ============================================================
async function fetchWeatherFromApi(city) {
    const response = await fetch(`api.php?city=${encodeURIComponent(city)}`);
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Wystąpił błąd podczas pobierania danych.');
    }
    return data;
}

// ============================================================
// RENDEROWANIE INTERFEJSU
// ============================================================

function showMessage(text) {
    const el = document.getElementById('message');
    el.textContent = text;
    el.hidden = false;
    document.getElementById('weather-card').hidden = true;
}

function hideMessage() {
    document.getElementById('message').hidden = true;
}

// Wypełnia kartę pogody danymi. Parametr fromCache mówi, czy dane
// pochodzą z localStorage, czy właśnie zostały pobrane z API - pokazujemy
// to użytkownikowi w polu "Źródło danych", żeby było jasne co się dzieje.
function renderWeather(data, fromCache) {
    hideMessage();
    const card = document.getElementById('weather-card');
    card.hidden = false;

    document.getElementById('weather-city').textContent = data.name;
    document.getElementById('weather-country').textContent =
        [data.admin1, data.country].filter(Boolean).join(', ');

    const tempUnit = data.units.temperature_2m || '°C';
    document.getElementById('weather-temp').textContent =
        `${Math.round(data.current.temperature_2m)}${tempUnit}`;
    document.getElementById('weather-desc').textContent =
        WEATHER_CODES[data.current.weather_code] || 'Brak opisu';
    document.getElementById('weather-feels').textContent =
        `${Math.round(data.current.apparent_temperature)}${tempUnit}`;
    document.getElementById('weather-humidity').textContent =
        `${data.current.relative_humidity_2m}%`;
    document.getElementById('weather-wind').textContent =
        `${data.current.wind_speed_10m} ${data.units.wind_speed_10m || 'km/h'}`;
    document.getElementById('weather-source').textContent =
        fromCache ? 'pamięć lokalna (cache)' : 'na żywo z API';

    updateMap(data.latitude, data.longitude, data.name, data.current.temperature_2m);

    renderHourlyForecast(data);
    renderDailyForecast(data);
}

// Zamienia znacznik czasu ISO zwracany przez Open-Meteo (np. "2026-08-13T14:00")
// na samą godzinę do wyświetlenia w prawej kolumnie ("14:00")
function formatHour(isoDateTime) {
    const parts = isoDateTime.split('T');
    return parts[1] || isoDateTime;
}

// Polskie nazwy dni tygodnia - indeks 0 = niedziela, zgodnie z Date.getDay()
const DAY_NAMES = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];

// Wypełnia prawą kolumnę prognozą na najbliższe 24 godziny. Backend
// (api.php) przycina dane godzinowe tak, żeby zaczynały się od bieżącej
// godziny, więc tutaj wystarczy po prostu wypisać kolejne wpisy w kolejności.
function renderHourlyForecast(data) {
    const container = document.getElementById('hourly-forecast');
    if (!container) return;

    // Starsze wpisy zapisane w localStorage jeszcze przed dodaniem tej
    // funkcji mogą nie mieć pola "hourly" - zamiast zostawić dane
    // poprzedniego miasta, pokazujemy czytelny komunikat
    if (!data.hourly || !data.hourly.time || !data.hourly.time.length) {
        container.innerHTML = '<li class="forecast-empty">Brak danych godzinowych - wyszukaj miasto ponownie.</li>';
        return;
    }

    const { time, temperature_2m: temps, weather_code: codes } = data.hourly;
    const tempUnit = (data.hourly_units && data.hourly_units.temperature_2m) || '°C';

    container.innerHTML = '';
    time.forEach((isoDateTime, i) => {
        const li = document.createElement('li');
        li.className = 'forecast-item';
        li.innerHTML =
            `<span class="forecast-item__time">${formatHour(isoDateTime)}</span>` +
            `<span class="forecast-item__desc">${WEATHER_CODES[codes[i]] || ''}</span>` +
            `<span class="forecast-item__temp">${Math.round(temps[i])}${tempUnit}</span>`;
        container.appendChild(li);
    });
}

// Wypełnia lewą kolumnę prognozą na najbliższe 7 dni (temperatura
// minimalna/maksymalna oraz dominujące zjawisko pogodowe każdego dnia)
function renderDailyForecast(data) {
    const container = document.getElementById('daily-forecast');
    if (!container) return;

    if (!data.daily || !data.daily.time || !data.daily.time.length) {
        container.innerHTML = '<li class="forecast-empty">Brak danych dobowych - wyszukaj miasto ponownie.</li>';
        return;
    }

    const { time, weather_code: codes, temperature_2m_max: maxTemps, temperature_2m_min: minTemps } = data.daily;

    container.innerHTML = '';
    time.forEach((isoDate, i) => {
        const li = document.createElement('li');
        li.className = 'forecast-item';

        // isoDate ma postać "2026-08-13" (bez godziny) - dodajemy "T00:00:00",
        // żeby przeglądarka sparsowała to jako lokalną północ, a nie UTC
        const date = new Date(`${isoDate}T00:00:00`);
        const label = i === 0 ? 'Dziś' : DAY_NAMES[date.getDay()];

        li.innerHTML =
            `<span class="forecast-item__time">${label}</span>` +
            `<span class="forecast-item__desc">${WEATHER_CODES[codes[i]] || ''}</span>` +
            `<span class="forecast-item__temp">${Math.round(maxTemps[i])}° / ${Math.round(minTemps[i])}°</span>`;
        container.appendChild(li);
    });
}

// Rysuje listę "chipów" z ostatnio wyszukiwanymi miastami. Kliknięcie
// chipa ponownie wywołuje handleSearch(), które i tak najpierw sprawdzi
// cache - więc kliknięcie NIE generuje nowego zapytania do API.
function renderRecent(store) {
    const container = document.getElementById('recent-list');
    container.innerHTML = '';
    store.recent.forEach((key) => {
        const entry = store.cities[key];
        if (!entry) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'recent__item';
        btn.textContent = entry.data.name;
        btn.addEventListener('click', () => handleSearch(entry.data.name));
        container.appendChild(btn);
    });
}

// ============================================================
// GŁÓWNA LOGIKA WYSZUKIWANIA
// ============================================================
async function handleSearch(cityRaw) {
    const city = cityRaw.trim();
    if (!city) return;

    // Najpierw sprawdzamy, czy nie minęła godzina i trzeba wyczyścić pamięć
    let store = maybeClearStore(loadStore());
    const key = normalizeKey(city);

    // jeśli miasto jest już zapisane w localStorage, używamy zapisanych
    // danych i NIE wysyłamy kolejnego zapytania do API
    if (store.cities[key]) {
        renderWeather(store.cities[key].data, true);
        return;
    }

    showMessage('Pobieranie danych pogodowych...');

    try {
        const data = await fetchWeatherFromApi(city);

        // Zapis nowego wyniku do cache oraz aktualizacja listy "ostatnich"
        // (miasto trafia na początek listy, duplikaty są usuwane,
        // lista jest przycinana do MAX_RECENT pozycji)
        store.cities[key] = { data, savedAt: Date.now() };
        store.recent = [key, ...store.recent.filter((k) => k !== key)].slice(0, MAX_RECENT);
        saveStore(store);

        renderRecent(store);
        renderWeather(data, false);
    } catch (err) {
        showMessage(err.message);
    }
}

// ============================================================
// START APLIKACJI
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initMap();

    // Przy każdym otwarciu strony sprawdzamy, czy pamięć nie "wygasła"
    // oraz renderujemy to, co ewentualnie zostało z poprzedniej sesji
    const store = maybeClearStore(loadStore());
    renderRecent(store);

    document.getElementById('search-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('city-input');
        handleSearch(input.value);
        input.value = '';
    });

    // Dodatkowo, co minutę sprawdzamy w tle, czy nie minęła już godzina -
    // dzięki temu czyszczenie zadziała nawet jeśli użytkownik trzyma
    // stronę otwartą bez odświeżania i bez wyszukiwania niczego nowego
    setInterval(() => {
        const s = maybeClearStore(loadStore());
        renderRecent(s);
    }, 60 * 1000);

    // Gradient temperatur odświeżamy też co godzinę niezależnie od tego,
    // czy użytkownik poruszył mapą - dane pogodowe z czasem się starzeją,
    // nawet jeśli ktoś cały czas patrzy na ten sam fragment mapy
    setInterval(loadTemperatureGrid, CLEAR_INTERVAL_MS);
});
