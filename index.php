<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pogoda</title>

<link rel="stylesheet" href="style.css?v=4">

<!-- Leaflet.js - biblioteka do wyświetlania interaktywnej mapy (CSS) -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</head>
<body>
<a href="#main-content" class="skip-link">Przejdź do treści głównej</a>
<div class="app">

    <header class="app__header">
        <h1>Pogoda</h1>
        <p class="app__subtitle">Dane pogodowe z Open-Meteo</p>
    </header>
    <div class="layout">

        <!-- ================= LEWA KOLUMNA: prognoza 7-dniowa ================= -->
        <aside class="layout__daily panel" aria-label="Prognoza 7-dniowa">
            <h2 class="panel__title">Najbliższe 7 dni</h2>
            <ul id="daily-forecast" class="forecast-list forecast-list--daily" aria-live="polite">
                <li class="forecast-empty">Wyszukaj miasto, aby zobaczyć prognozę 7-dniową.</li>
            </ul>
        </aside>

        <!-- ================= ŚRODKOWA KOLUMNA: wyszukiwarka + mapa ================= -->
        <main class="layout__main" id="main-content" tabindex="-1">

            <form id="search-form" class="search">
                <label for="city-input" class="visually-hidden">Nazwa miasta</label>
                <input
                    type="text"
                    id="city-input"
                    class="search__input"
                    placeholder="Wpisz nazwę miasta, np. Warszawa"
                    autocomplete="off"
                    required
                >
                <button type="submit" class="search__button">Szukaj</button>
            </form>

            <!-- Tutaj JS wstawi listę "chipów" z ostatnio wyszukiwanymi miastami -->
            <section id="recent-list" class="recent" aria-label="Ostatnio wyszukiwane miasta"></section>

            <div id="message" class="message" role="status" aria-live="polite" hidden></div>

            <!-- Karta z danymi pogodowymi - domyślnie ukryta, pokazywana po pierwszym wyszukaniu -->
            <section id="weather-card" class="weather" aria-live="polite" aria-atomic="true" hidden>
                <div class="weather__location">
                    <h2 id="weather-city"></h2>
                    <span id="weather-country"></span>
                </div>

                <div class="weather__main">
                    <span id="weather-temp" class="weather__temp"></span>
                    <span id="weather-desc" class="weather__desc"></span>
                </div>

                <ul class="weather__details">
                    <li><span>Odczuwalna</span><strong id="weather-feels"></strong></li>
                    <li><span>Wilgotność</span><strong id="weather-humidity"></strong></li>
                    <li><span>Wiatr</span><strong id="weather-wind"></strong></li>
                    <li><span>Źródło danych</span><strong id="weather-source"></strong></li>
                </ul>
            </section>

            <div id="map" class="map"></div>

            <!-- Legenda kolorów temperatury - wypełniana dynamicznie przez script.js -->
            <div id="temp-legend" class="legend" aria-label="Legenda temperatury"></div>

        </main>

        <!-- ================= PRAWA KOLUMNA: prognoza godzinowa (24h) ================= -->
        <aside class="layout__hourly panel" aria-label="Prognoza godzinowa">
            <h2 class="panel__title">Najbliższe 24 godziny</h2>
            <ul id="hourly-forecast" class="forecast-list forecast-list--hourly" aria-live="polite">
                <li class="forecast-empty">Wyszukaj miasto, aby zobaczyć prognozę godzinową.</li>
            </ul>
        </aside>

    </div>

</div>

<!-- Leaflet.js - kod biblioteki mapy -->
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<!-- Nasza logika aplikacji -->
<script src="script.js?v=4"></script>

</body>
</html>
