<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../llmChat.php';

if (getenv('RUN_LIVE_LLM_TESTS') !== '1') {
    fwrite(STDOUT, "SKIP - définissez RUN_LIVE_LLM_TESTS=1 pour lancer les appels réels.\n");
    exit(0);
}

$config = loadLocalConfig();
$models = [
    MODEL_CHOICE_OPENAI_GPT5_NANO,
    MODEL_CHOICE_TOGETHER_QWEN,
];
$prompts = [
    'Réponds uniquement par le mot un.',
    'Réponds uniquement par le mot deux.',
    'Réponds uniquement par le mot trois.',
];
$failed = false;

foreach ($models as $modelChoice) {
    $messages = [];
    $lastRequest = null;
    $model = getChatModelCatalog()[$modelChoice];

    try {
        foreach ($prompts as $prompt) {
            $messages[] = ['role' => 'user', 'content' => $prompt];
            $lastRequest = normaliseChatRequest([
                'model' => $modelChoice,
                'systemPrompt' => 'Réponds par un seul mot, sans ponctuation.',
                'messages' => $messages,
            ]);
            $response = json_decode(
                callSelectedChatModel($lastRequest, $config),
                true,
                512,
                JSON_THROW_ON_ERROR
            );
            $choice = $response['choices'][0] ?? [];
            $content = $choice['message']['content'] ?? '';

            if (!is_string($content) || trim($content) === '') {
                throw new RuntimeException('Une réponse est vide.');
            }

            $messages[] = ['role' => 'assistant', 'content' => $content];
        }

        if ($lastRequest === null) {
            throw new RuntimeException('Aucune requête n’a été préparée.');
        }

        $regenerated = json_decode(
            callSelectedChatModel($lastRequest, $config),
            true,
            512,
            JSON_THROW_ON_ERROR
        );
        $regeneratedChoice = $regenerated['choices'][0] ?? [];
        $regeneratedContent = $regeneratedChoice['message']['content'] ?? '';

        if (!is_string($regeneratedContent) || trim($regeneratedContent) === '') {
            throw new RuntimeException('La réponse régénérée est vide.');
        }

        $hasLogprobs = is_array($regeneratedChoice['logprobs'] ?? null);
        if ($hasLogprobs !== $model['supports_logprobs']) {
            throw new RuntimeException('La disponibilité des logprobs est inattendue.');
        }

        fwrite(
            STDOUT,
            sprintf(
                "OK - %s : 3 tours, régénération, logprobs=%s\n",
                $model['model'],
                $hasLogprobs ? 'oui' : 'non'
            )
        );
    } catch (Throwable $exception) {
        $failed = true;
        fwrite(
            STDERR,
            sprintf("ECHEC - %s : %s\n", $model['model'], $exception->getMessage())
        );
    }
}

exit($failed ? 1 : 0);
