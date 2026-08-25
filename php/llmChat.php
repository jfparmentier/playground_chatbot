<?php

declare(strict_types=1);

const MODEL_CHOICE_OPENAI_GPT5_NANO = 'openai_gpt5_nano';
const MODEL_CHOICE_TOGETHER = 'together';
const DEFAULT_MODEL_CHOICE = MODEL_CHOICE_TOGETHER;
const TOGETHER_MODEL_QWEN_3_5_9B = 'Qwen/Qwen3.5-9B';
const TOGETHER_MODEL_QWEN_3_8 = 'Qwen/Qwen3.8-2.4T-A95B';
const TOGETHER_MODEL_DEEPSEEK_V4_PRO = 'deepseek-ai/DeepSeek-V4-Pro';

// Pour tester un autre modèle Together, modifiez uniquement cette constante.
const TOGETHER_CHAT_MODEL = TOGETHER_MODEL_QWEN_3_5_9B;

const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const TOGETHER_CHAT_ENDPOINT = 'https://api.together.ai/v1/chat/completions';
const MAX_USER_MESSAGES = 3;
const MAX_SYSTEM_PROMPT_LENGTH = 8000;
const MAX_MESSAGE_LENGTH = 16000;
const REQUESTED_LOGPROBS = 5;

/**
 * Paramètres propres aux modèles Together pris en charge par l'application.
 * Certaines infrastructures Together attendent un entier pour `logprobs`,
 * tandis que Qwen 3.8 exige un booléen.
 */
function getTogetherChatModelProfile(string $model): array
{
    $profiles = [
        TOGETHER_MODEL_QWEN_3_5_9B => [
            'model' => TOGETHER_MODEL_QWEN_3_5_9B,
            'logprobs' => REQUESTED_LOGPROBS,
            'reasoning' => ['enabled' => false],
        ],
        TOGETHER_MODEL_QWEN_3_8 => [
            'model' => TOGETHER_MODEL_QWEN_3_8,
            'logprobs' => true,
            'reasoning' => null,
        ],
        TOGETHER_MODEL_DEEPSEEK_V4_PRO => [
            'model' => TOGETHER_MODEL_DEEPSEEK_V4_PRO,
            'logprobs' => REQUESTED_LOGPROBS,
            'reasoning' => null,
        ],
    ];

    if (!isset($profiles[$model])) {
        throw new LogicException('Le modèle Together configuré n’est pas pris en charge.');
    }

    return $profiles[$model];
}

/**
 * Registre serveur des seuls modèles exposés par l'application.
 * Les identifiants réels ne sont jamais acceptés directement du navigateur.
 */
function getChatModelCatalog(): array
{
    $togetherProfile = getTogetherChatModelProfile(TOGETHER_CHAT_MODEL);

    return [
        MODEL_CHOICE_OPENAI_GPT5_NANO => [
            'provider' => 'openai',
            'provider_name' => 'OpenAI',
            'model' => 'gpt-5-nano',
            'supports_logprobs' => false,
            'endpoint' => OPENAI_CHAT_ENDPOINT,
            'environment_key' => 'OPENAI_API_KEY',
            'config_key' => 'openai_api_key',
        ],
        MODEL_CHOICE_TOGETHER => [
            'provider' => 'together',
            'provider_name' => 'Together AI',
            'model' => $togetherProfile['model'],
            'supports_logprobs' => true,
            'logprobs' => $togetherProfile['logprobs'],
            'reasoning' => $togetherProfile['reasoning'],
            'endpoint' => TOGETHER_CHAT_ENDPOINT,
            'environment_key' => 'TOGETHER_API_KEY',
            'config_key' => 'together_api_key',
        ],
    ];
}

/**
 * Retourne la longueur d'une chaîne UTF-8, avec repli si mbstring est absent.
 */
function chatUtf8Length(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }

    return strlen($value);
}

/**
 * Valide une conversation terminée par le message utilisateur à générer.
 */
function validateConversationMessages(mixed $messages): array
{
    if (!is_array($messages) || $messages === []) {
        throw new InvalidArgumentException(
            'La conversation doit contenir au moins un message utilisateur.'
        );
    }

    $validatedMessages = [];
    $userMessageCount = 0;

    foreach (array_values($messages) as $index => $message) {
        if (!is_array($message)) {
            throw new InvalidArgumentException('Un message de la conversation est invalide.');
        }

        $role = $message['role'] ?? null;
        $content = $message['content'] ?? null;
        $expectedRole = $index % 2 === 0 ? 'user' : 'assistant';

        if ($role !== $expectedRole) {
            throw new InvalidArgumentException(
                'Les messages doivent alterner entre utilisateur et assistant.'
            );
        }

        if (!is_string($content) || trim($content) === '') {
            throw new InvalidArgumentException('Le contenu d’un message est absent ou invalide.');
        }

        if (chatUtf8Length($content) > MAX_MESSAGE_LENGTH) {
            throw new InvalidArgumentException(
                'Un message dépasse la longueur maximale autorisée.'
            );
        }

        if ($role === 'user') {
            $userMessageCount++;
        }

        $validatedMessages[] = [
            'role' => $role,
            'content' => $content,
        ];
    }

    if ($userMessageCount > MAX_USER_MESSAGES) {
        throw new InvalidArgumentException(
            'Une conversation est limitée à trois messages utilisateur.'
        );
    }

    if ($validatedMessages[array_key_last($validatedMessages)]['role'] !== 'user') {
        throw new InvalidArgumentException(
            'La conversation doit se terminer par un message utilisateur.'
        );
    }

    return $validatedMessages;
}

/**
 * Accepte le nouveau contrat de conversation et, temporairement, l'ancien
 * champ `prompt` afin que l'interface actuelle continue de fonctionner.
 */
function normaliseChatRequest(array $params): array
{
    $modelChoice = $params['modele'] ?? $params['model'] ?? DEFAULT_MODEL_CHOICE;

    if (!is_string($modelChoice) || !isset(getChatModelCatalog()[$modelChoice])) {
        throw new InvalidArgumentException('Le modèle sélectionné n’est pas autorisé.');
    }

    $systemPrompt = $params['systemPrompt'] ?? $params['system_prompt'] ?? '';

    if (!is_string($systemPrompt)) {
        throw new InvalidArgumentException('Le prompt système est invalide.');
    }

    if (chatUtf8Length($systemPrompt) > MAX_SYSTEM_PROMPT_LENGTH) {
        throw new InvalidArgumentException(
            'Le prompt système dépasse la longueur maximale autorisée.'
        );
    }

    $messages = $params['messages'] ?? null;

    if ($messages === null && isset($params['prompt']) && is_string($params['prompt'])) {
        $messages = [[
            'role' => 'user',
            'content' => $params['prompt'],
        ]];
    }

    return [
        'modelChoice' => $modelChoice,
        'systemPrompt' => $systemPrompt,
        'messages' => validateConversationMessages($messages),
    ];
}

/**
 * Le même prompt d'interface devient un message `developer` chez OpenAI et
 * un message `system` chez Together, puis l'historique validé est ajouté.
 */
function buildProviderMessages(
    string $provider,
    string $systemPrompt,
    array $messages
): array {
    $providerMessages = [];

    if (trim($systemPrompt) !== '') {
        $providerMessages[] = [
            'role' => $provider === 'openai' ? 'developer' : 'system',
            'content' => $systemPrompt,
        ];
    }

    return array_merge($providerMessages, $messages);
}

/**
 * Construit une requête Chat Completions sans plafond applicatif de sortie.
 * Chaque fournisseur conserve donc uniquement ses limites techniques natives.
 */
function buildChatPayload(array $model, string $systemPrompt, array $messages): array
{
    $payload = [
        'model' => $model['model'],
        'messages' => buildProviderMessages(
            $model['provider'],
            $systemPrompt,
            $messages
        ),
        'stream' => false,
    ];

    if ($model['provider'] === 'openai') {
        // gpt-5-nano est un modèle de raisonnement et refuse actuellement les
        // logprobs sur Chat Completions comme sur Responses.
        return $payload;
    }

    $payload['temperature'] = 0.7;
    $payload['top_p'] = 1.0;
    $payload['n'] = 1;
    $payload['logprobs'] = $model['logprobs'];

    if (is_array($model['reasoning'])) {
        $payload['reasoning'] = $model['reasoning'];
    }

    return $payload;
}

/**
 * Extrait un message d'erreur lisible depuis une réponse fournisseur.
 */
function extractChatApiError(
    string $responseBody,
    int $httpStatus,
    string $providerName
): string {
    $decoded = json_decode($responseBody, true);

    if (is_array($decoded)) {
        $message = $decoded['error']['message']
            ?? $decoded['message']
            ?? null;

        if (is_string($message) && trim($message) !== '') {
            return $providerName . ' : ' . trim($message);
        }
    }

    return $providerName . ' a retourné le statut HTTP ' . $httpStatus . '.';
}

/**
 * Exécute une requête JSON authentifiée vers le fournisseur sélectionné.
 */
function callChatJsonApi(
    string $endpoint,
    array $payload,
    string $apiKey,
    string $providerName
): string {
    if (!function_exists('curl_init')) {
        throw new RuntimeException(
            "L'extension PHP cURL n'est pas disponible sur le serveur."
        );
    }

    $encodedPayload = json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    );
    $curl = curl_init();

    curl_setopt_array($curl, [
        CURLOPT_URL => $endpoint,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $encodedPayload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey,
        ],
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 90,
    ]);

    $response = curl_exec($curl);

    if ($response === false) {
        $curlError = curl_error($curl);
        curl_close($curl);

        throw new RuntimeException(
            'Impossible de contacter ' . $providerName . ' : ' . $curlError
        );
    }

    $httpStatus = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if ($httpStatus < 200 || $httpStatus >= 300) {
        throw new RuntimeException(
            extractChatApiError($response, $httpStatus, $providerName)
        );
    }

    try {
        json_decode($response, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        throw new RuntimeException(
            $providerName . ' a renvoyé une réponse JSON invalide.'
        );
    }

    return $response;
}

function readChatApiKey(array $model, array $localConfig): string
{
    $apiKey = getenv($model['environment_key']);

    if (!is_string($apiKey) || trim($apiKey) === '') {
        $apiKey = $localConfig[$model['config_key']] ?? '';
    }

    return is_string($apiKey) ? trim($apiKey) : '';
}

function callSelectedChatModel(array $request, array $localConfig): string
{
    $catalog = getChatModelCatalog();
    $model = $catalog[$request['modelChoice']];
    $apiKey = readChatApiKey($model, $localConfig);

    if ($apiKey === '') {
        throw new RuntimeException(
            'Clé ' . $model['provider_name'] . ' absente. Définissez '
                . $model['environment_key'] . ' ou '
                . $model['config_key'] . ' dans php/config.local.php.'
        );
    }

    return callChatJsonApi(
        $model['endpoint'],
        buildChatPayload($model, $request['systemPrompt'], $request['messages']),
        $apiKey,
        $model['provider_name']
    );
}
