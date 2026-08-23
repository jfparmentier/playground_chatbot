<?php

declare(strict_types=1);

/**
 * Envoie une réponse JSON au navigateur.
 */
function sendJsonResponse(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);

    echo json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    );
}

/**
 * Envoie une réponse d'erreur JSON cohérente au navigateur.
 */
function sendJsonError(string $message, int $statusCode = 500): void
{
    sendJsonResponse(
        [
            'error' => [
                'message' => $message,
            ],
        ],
        $statusCode
    );
}

/**
 * Charge la configuration facultative stockée dans config.local.php.
 */
function loadLocalConfig(): array
{
    $configPath = __DIR__ . '/config.local.php';

    if (!is_file($configPath)) {
        return [];
    }

    $config = require $configPath;

    if (!is_array($config)) {
        throw new RuntimeException('Le fichier php/config.local.php doit retourner un tableau.');
    }

    return $config;
}

/**
 * Démarre une session PHP avec des paramètres de cookie adaptés à une
 * application servie depuis le même domaine.
 */
function startApplicationSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $httpsEnabled = isset($_SERVER['HTTPS'])
        && $_SERVER['HTTPS'] !== ''
        && strtolower((string) $_SERVER['HTTPS']) !== 'off';

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');

    session_set_cookie_params([
        'httponly' => true,
        'secure' => $httpsEnabled,
        'samesite' => 'Lax',
        'path' => '/',
    ]);

    if (!session_start()) {
        throw new RuntimeException('Impossible de démarrer la session PHP.');
    }
}

/**
 * Indique si le serveur a validé l'adresse électronique de la session.
 */
function isEmailSessionVerified(): bool
{
    return isset($_SESSION['email_verified'])
        && $_SESSION['email_verified'] === true
        && isset($_SESSION['user_uuid'])
        && is_string($_SESSION['user_uuid'])
        && $_SESSION['user_uuid'] !== '';
}

/**
 * Supprime uniquement les informations d'autorisation de la session.
 */
function clearEmailAuthorization(): void
{
    unset(
        $_SESSION['email_verified'],
        $_SESSION['user_uuid'],
        $_SESSION['email_domain']
    );
}
