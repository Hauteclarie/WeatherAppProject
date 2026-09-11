<?php

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/helpers.php';

// Adresy API Open-Meteo (usługa darmowa, nie wymaga klucza API)
define('GEOCODING_API', 'https://geocoding-api.open-meteo.com/v1/search');
define('FORECAST_API', 'https://api.open-meteo.com/v1/forecast');

// ------------------------------------------------------------
// Walidacja parametru wejściowego
// ------------------------------------------------------------
$city = isset($_GET['city']) ? trim($_GET['city']) : '';
if ($city === '') {
    respondError(400, 'Nie podano nazwy miasta.');
}


$geoUrl = GEOCODING_API . '?' . http_build_query([
    'name'     => $city,
    'count'    => 1,
    'language' => 'pl',
    'format'   => 'json',
]);

$geoData = fetchJson($geoUrl);

if (!$geoData || empty($geoData['results'])) {
    respondError(404, 'Nie znaleziono podanego miasta.');
}

$place = $geoData['results'][0];
$lat = $place['latitude'];
$lon = $place['longitude'];


$weatherUrl = FORECAST_API . '?' . http_build_query([
    'latitude'      => $lat,
    'longitude'     => $lon,
    'current'       => 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
    'hourly'        => 'temperature_2m,weather_code',
    'daily'         => 'weather_code,temperature_2m_max,temperature_2m_min',
    'forecast_days' => 7,
    'timezone'      => 'auto',
]);

$weatherData = fetchJson($weatherUrl);

if (!$weatherData || empty($weatherData['current'])) {
    respondError(502, 'Nie udało się pobrać danych pogodowych.');
}

// ------------------------------------------------------------
// Open-Meteo zwraca prognozę godzinową od północy bieżącej doby, a nie
// od "teraz" - żeby frontend dostał dokładnie "najbliższe 24 godziny",
// znajdujemy w tablicy godzin indeks najbliższy aktualnej godzinie
// (current.time) i od niego wycinamy 24 kolejne wpisy.
// ------------------------------------------------------------
$hourlyTimes = $weatherData['hourly']['time'] ?? [];
$currentTime = $weatherData['current']['time'] ?? null;

$startIndex = 0;
if ($currentTime !== null) {
    foreach ($hourlyTimes as $index => $time) {
        // Porównanie tekstowe działa poprawnie, bo Open-Meteo zwraca czas
        // w formacie ISO 8601 (np. "2026-08-13T14:00"), który sortuje się
        // leksykograficznie tak samo jak chronologicznie
        if ($time >= $currentTime) {
            $startIndex = $index;
            break;
        }
    }
}

$hourly = [
    'time'           => array_slice($hourlyTimes, $startIndex, 24),
    'temperature_2m' => array_slice($weatherData['hourly']['temperature_2m'] ?? [], $startIndex, 24),
    'weather_code'   => array_slice($weatherData['hourly']['weather_code'] ?? [], $startIndex, 24),
];

$daily = $weatherData['daily'] ?? [
    'time' => [], 'weather_code' => [], 'temperature_2m_max' => [], 'temperature_2m_min' => [],
];

// ------------------------------------------------------------
// Złożenie odpowiedzi w jednym, wygodnym dla frontendu formacie.
// Frontend (script.js) nie musi wiedzieć nic o tym, że dane pochodzą
// z jednego zapytania do Open-Meteo, ani że prognoza godzinowa została
// po drodze przycięta do najbliższych 24 godzin.
// ------------------------------------------------------------
$result = [
    'name'         => $place['name'],
    'country'      => $place['country'] ?? '',
    'admin1'       => $place['admin1'] ?? '',   
    'latitude'     => $lat,
    'longitude'    => $lon,
    'current'      => $weatherData['current'],
    'units'        => $weatherData['current_units'] ?? [],
    'hourly'       => $hourly,
    'hourly_units' => $weatherData['hourly_units'] ?? [],
    'daily'        => $daily,
    'daily_units'  => $weatherData['daily_units'] ?? [],
];

echo json_encode($result);
