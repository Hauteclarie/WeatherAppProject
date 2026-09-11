<?php

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/helpers.php';

define('FORECAST_API', 'https://api.open-meteo.com/v1/forecast');

// Górny limit rozmiaru siatki (10 -> 10x10 = 100 punktów) - chroni przed
// zbyt dużym zapytaniem, gdyby ktoś podał zawyżoną wartość "size"
const MAX_GRID_SIZE = 10;

// ------------------------------------------------------------
// Walidacja parametrów wejściowych - granice widocznego obszaru mapy
// ------------------------------------------------------------
$south = isset($_GET['south']) ? filter_var($_GET['south'], FILTER_VALIDATE_FLOAT) : false;
$west  = isset($_GET['west'])  ? filter_var($_GET['west'],  FILTER_VALIDATE_FLOAT) : false;
$north = isset($_GET['north']) ? filter_var($_GET['north'], FILTER_VALIDATE_FLOAT) : false;
$east  = isset($_GET['east'])  ? filter_var($_GET['east'],  FILTER_VALIDATE_FLOAT) : false;
$size  = isset($_GET['size'])  ? (int) $_GET['size'] : 8;

if ($south === false || $west === false || $north === false || $east === false) {
    respondError(400, 'Brak poprawnych granic mapy (south, west, north, east).');
}

$size = max(2, min(MAX_GRID_SIZE, $size));


$south = max(-85, min(85, $south));
$north = max(-85, min(85, $north));
$west  = max(-180, min(180, $west));
$east  = max(-180, min(180, $east));

// ------------------------------------------------------------
// Budowa regularnej siatki $size x $size punktów, równomiernie
// rozłożonych w obrębie podanego obszaru - od SW do NE.
// ------------------------------------------------------------
$lats = [];
$lons = [];

for ($row = 0; $row < $size; $row++) {
    // Przy size == 1 unikamy dzielenia przez zero - bierzemy wtedy środek
    $latFraction = $size > 1 ? $row / ($size - 1) : 0.5;
    $lat = $south + ($north - $south) * $latFraction;

    for ($col = 0; $col < $size; $col++) {
        $lonFraction = $size > 1 ? $col / ($size - 1) : 0.5;
        $lon = $west + ($east - $west) * $lonFraction;

        $lats[] = round($lat, 4);
        $lons[] = round($lon, 4);
    }
}

// ------------------------------------------------------------
// Jedno zapytanie do Open-Meteo dla wszystkich punktów siatki naraz -
// listy współrzędnych przekazujemy jako wartości rozdzielone przecinkami.
// ------------------------------------------------------------
$weatherUrl = FORECAST_API . '?' . http_build_query([
    'latitude'  => implode(',', $lats),
    'longitude' => implode(',', $lons),
    'current'   => 'temperature_2m',
    'timezone'  => 'auto',
]);

$data = fetchJson($weatherUrl);

if (!$data) {
    respondError(502, 'Nie udało się pobrać siatki temperatur.');
}

// ------------------------------------------------------------
// Gdy pytamy o wiele lokalizacji jednocześnie, Open-Meteo zwraca TABLICĘ
// wyników (po jednym obiekcie na każdą parę współrzędnych) zamiast
// pojedynczego obiektu, jak przy zapytaniu o jedno miejsce w api.php.
// Tutaj upraszczamy tę strukturę do zwięzłej listy {lat, lon, temp}.
// ------------------------------------------------------------
$points = [];
foreach ($data as $entry) {
    if (!isset($entry['current']['temperature_2m'])) {
        continue; 
    }
    $points[] = [
        'lat'  => $entry['latitude'],
        'lon'  => $entry['longitude'],
        'temp' => $entry['current']['temperature_2m'],
    ];
}

echo json_encode($points);
