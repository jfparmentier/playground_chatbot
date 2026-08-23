<?php

declare(strict_types=1);

require_once __DIR__ . '/../llmChat.php';

function expect(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function expectInvalidArgument(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (InvalidArgumentException $exception) {
        return;
    }

    throw new RuntimeException($message);
}

$catalog = getChatModelCatalog();
expect(count($catalog) === 2, 'Le registre doit exposer exactement deux modèles.');
expect(
    $catalog[MODEL_CHOICE_OPENAI_GPT5_NANO]['model'] === 'gpt-5-nano',
    'Le modèle OpenAI doit être gpt-5-nano.'
);
expect(
    $catalog[MODEL_CHOICE_TOGETHER_QWEN]['model'] === 'Qwen/Qwen3.5-9B',
    'Le modèle Together doit être Qwen/Qwen3.5-9B.'
);
expect(
    $catalog[MODEL_CHOICE_OPENAI_GPT5_NANO]['supports_logprobs'] === false,
    'gpt-5-nano doit signaler l’absence de logprobs.'
);
expect(
    $catalog[MODEL_CHOICE_TOGETHER_QWEN]['supports_logprobs'] === true,
    'Qwen doit signaler la disponibilité des logprobs.'
);

$legacyRequest = normaliseChatRequest([
    'modele' => MODEL_CHOICE_OPENAI_GPT5_NANO,
    'prompt' => 'Bonjour',
]);
expect(
    $legacyRequest['messages'] === [['role' => 'user', 'content' => 'Bonjour']],
    'L’ancien champ prompt doit rester compatible pendant la transition.'
);

$threeTurnMessages = [
    ['role' => 'user', 'content' => 'Un'],
    ['role' => 'assistant', 'content' => 'Réponse un'],
    ['role' => 'user', 'content' => 'Deux'],
    ['role' => 'assistant', 'content' => 'Réponse deux'],
    ['role' => 'user', 'content' => 'Trois'],
];
expect(
    count(validateConversationMessages($threeTurnMessages)) === 5,
    'Trois messages utilisateur doivent être acceptés.'
);

expectInvalidArgument(
    static function () use ($threeTurnMessages): void {
        validateConversationMessages(array_merge($threeTurnMessages, [
            ['role' => 'assistant', 'content' => 'Réponse trois'],
            ['role' => 'user', 'content' => 'Quatre'],
        ]));
    },
    'Un quatrième message utilisateur doit être refusé.'
);

expectInvalidArgument(
    static function (): void {
        validateConversationMessages([
            ['role' => 'user', 'content' => 'Un'],
            ['role' => 'user', 'content' => 'Deux'],
        ]);
    },
    'Deux rôles utilisateur consécutifs doivent être refusés.'
);

$openAiPayload = buildChatPayload(
    $catalog[MODEL_CHOICE_OPENAI_GPT5_NANO],
    'Réponds brièvement.',
    [['role' => 'user', 'content' => 'Bonjour']]
);
expect($openAiPayload['messages'][0]['role'] === 'developer', 'OpenAI doit recevoir un message developer.');
expect(!isset($openAiPayload['logprobs']), 'gpt-5-nano ne doit pas demander de logprobs.');
expect(!isset($openAiPayload['top_logprobs']), 'gpt-5-nano ne doit pas demander d’alternatives.');
expect(!isset($openAiPayload['max_tokens']), 'Aucun plafond applicatif de sortie ne doit être envoyé.');
expect(!isset($openAiPayload['max_completion_tokens']), 'Aucun plafond applicatif de sortie ne doit être envoyé.');

$togetherPayload = buildChatPayload(
    $catalog[MODEL_CHOICE_TOGETHER_QWEN],
    'Réponds brièvement.',
    [['role' => 'user', 'content' => 'Bonjour']]
);
expect($togetherPayload['messages'][0]['role'] === 'system', 'Together doit recevoir un message system.');
expect($togetherPayload['logprobs'] === 5, 'Together doit demander cinq alternatives.');
expect($togetherPayload['reasoning']['enabled'] === false, 'Le raisonnement Qwen doit être désactivé.');
expect(!isset($togetherPayload['max_tokens']), 'Aucun plafond applicatif de sortie ne doit être envoyé.');

echo "OK - llmChatTest\n";
