<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/llmChat.php';

header('Content-Type: application/json; charset=utf-8');

try {
    startApplicationSession();

    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        sendJsonError('Méthode HTTP non autorisée.', 405);
        exit;
    }

    if (!isEmailSessionVerified()) {
        sendJsonError('La session utilisateur n’est pas autorisée.', 401);
        exit;
    }

    if (!isset($_POST['params']) || !is_string($_POST['params'])) {
        sendJsonError('Paramètres manquants.', 400);
        exit;
    }

    $params = json_decode($_POST['params'], true, 512, JSON_THROW_ON_ERROR);

    if (!is_array($params)) {
        throw new InvalidArgumentException('Les paramètres sont invalides.');
    }

    $request = normaliseChatRequest($params);
    echo callSelectedChatModel($request, loadLocalConfig());
} catch (JsonException $exception) {
    sendJsonError('Données JSON invalides.', 400);
} catch (InvalidArgumentException $exception) {
    sendJsonError($exception->getMessage(), 400);
} catch (Throwable $exception) {
    sendJsonError($exception->getMessage(), 500);
}
