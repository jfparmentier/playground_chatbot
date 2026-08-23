<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');

/**
 * Normalise et contrôle les domaines définis dans config.local.php.
 *
 * La propriété recommandée est "email_domains", sous forme de tableau.
 * L'ancienne propriété "email_domain" reste acceptée pour compatibilité.
 * Les formes "ipsa.fr" et "@ipsa.fr" sont toutes deux acceptées.
 */
function getConfiguredEmailDomains(array $config): array
{
    $configuredDomains = $config['email_domains'] ?? ($config['email_domain'] ?? []);

    if (is_string($configuredDomains)) {
        $configuredDomains = [$configuredDomains];
    }

    if (!is_array($configuredDomains)) {
        throw new RuntimeException(
            "La valeur 'email_domains' doit être un tableau de noms de domaine."
        );
    }

    $domains = [];

    foreach ($configuredDomains as $configuredDomain) {
        if (!is_string($configuredDomain)) {
            throw new RuntimeException(
                "Chaque valeur de 'email_domains' doit être une chaîne de caractères."
            );
        }

        $domain = strtolower(trim($configuredDomain));
        $domain = ltrim($domain, '@');
        $domain = rtrim($domain, '.');

        if (
            $domain === ''
            || strpos($domain, '@') !== false
            || preg_match('/\s/', $domain) === 1
            || filter_var('validation@' . $domain, FILTER_VALIDATE_EMAIL) === false
        ) {
            throw new RuntimeException(
                "Un domaine autorisé est invalide dans php/config.local.php."
            );
        }

        $domains[$domain] = true;
    }

    if ($domains === []) {
        throw new RuntimeException(
            "La liste 'email_domains' est absente ou vide dans php/config.local.php."
        );
    }

    return array_keys($domains);
}

/**
 * Lit le document JSON transmis dans le champ POST "params".
 */
function readRequestParameters(): array
{
    if (!isset($_POST['params']) || !is_string($_POST['params'])) {
        throw new InvalidArgumentException('Paramètres manquants.');
    }

    $params = json_decode($_POST['params'], true, 512, JSON_THROW_ON_ERROR);

    if (!is_array($params)) {
        throw new InvalidArgumentException('Paramètres invalides.');
    }

    return $params;
}

try {
    startApplicationSession();

    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        sendJsonError('Méthode HTTP non autorisée.', 405);
        exit;
    }

    $params = readRequestParameters();
    $action = $params['action'] ?? 'verify';

    if ($action === 'status') {
        if (!isEmailSessionVerified()) {
            sendJsonError('La session utilisateur n’est pas autorisée.', 401);
            exit;
        }

        sendJsonResponse([
            'authenticated' => true,
            'user_uuid' => $_SESSION['user_uuid'],
        ]);
        exit;
    }

    if ($action !== 'verify') {
        sendJsonError('Action inconnue.', 400);
        exit;
    }

    $email = $params['email'] ?? null;

    if (!is_string($email)) {
        clearEmailAuthorization();
        sendJsonError('Adresse e-mail invalide.', 400);
        exit;
    }

    $normalizedEmail = strtolower(trim($email));

    if (filter_var($normalizedEmail, FILTER_VALIDATE_EMAIL) === false) {
        clearEmailAuthorization();
        sendJsonError('Adresse e-mail invalide.', 400);
        exit;
    }

    $separatorPosition = strrpos($normalizedEmail, '@');
    $emailDomain = $separatorPosition === false
        ? ''
        : substr($normalizedEmail, $separatorPosition + 1);

    $configuredDomains = getConfiguredEmailDomains(loadLocalConfig());
    $normalizedEmailDomain = strtolower($emailDomain);
    $domainAllowed = false;

    foreach ($configuredDomains as $configuredDomain) {
        if (hash_equals($configuredDomain, $normalizedEmailDomain)) {
            $domainAllowed = true;
            break;
        }
    }

    if (!$domainAllowed) {
        clearEmailAuthorization();
        sendJsonError('Utilisateur inconnu ou non autorisé.', 403);
        exit;
    }

    session_regenerate_id(true);

    $userUuid = hash('sha256', $normalizedEmail);

    $_SESSION['email_verified'] = true;
    $_SESSION['user_uuid'] = $userUuid;
    $_SESSION['email_domain'] = $normalizedEmailDomain;

    sendJsonResponse([
        'authenticated' => true,
        'user_uuid' => $userUuid,
    ]);
} catch (JsonException $exception) {
    clearEmailAuthorization();
    sendJsonError('Données JSON invalides.', 400);
} catch (InvalidArgumentException $exception) {
    clearEmailAuthorization();
    sendJsonError($exception->getMessage(), 400);
} catch (Throwable $exception) {
    sendJsonError($exception->getMessage(), 500);
}
