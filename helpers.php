<?php

/**
 * Wykonuje zapytanie GET pod wskazany adres URL i zwraca zdekodowaną
 * odpowiedź JSON jako tablicę PHP (lub null w razie błędu/braku danych).
 */
function fetchJson(string $url): ?array
{
    $context = stream_context_create([
        'http' => [
            'timeout' => 8,
            'header' => "User-Agent: PogodaApp/1.0\r\n",
        ],
    ]);

    // "@" wycisza ostrzeżenie PHP przy błędzie sieciowym - obsługujemy to
    // sami poniżej, sprawdzając czy $response === false
    $response = @file_get_contents($url, false, $context);

    // Sprawdzenie kodu HTTP
    if (isset($http_response_header[0])) {
        if (preg_match('/HTTP\/\S+\s+429\b/', $http_response_header[0])) {
            respondError(429, 'Wyszerpano limit darmowego planu API.');
            return null;
        }
    }


    if ($response === false) {
        return null;
    }

    $decoded = json_decode($response, true);
    return is_array($decoded) ? $decoded : null;
}

/**
 * Kończy wykonanie skryptu i zwraca błąd w formacie JSON z odpowiednim
 * kodem HTTP - ujednolica obsługę błędów we wszystkich endpointach.
 */
function respondError(int $httpCode, string $message): void
{
    http_response_code($httpCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $message]);
    exit;
}
