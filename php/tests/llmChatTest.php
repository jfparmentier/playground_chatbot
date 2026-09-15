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
expect(count($catalog) === 3, 'Le registre doit exposer exactement trois modèles.');
expect(
    $catalog[MODEL_CHOICE_OPENAI_GPT5_6_LUNA]['model'] === 'gpt-5.6-luna',
    'Le modèle OpenAI doit être gpt-5.6-luna.'
);
expect(
    $catalog[MODEL_CHOICE_FIREWORKS_DEEPSEEK_V4_FLASH_0731]['model']
        === FIREWORKS_MODEL_DEEPSEEK_V4_FLASH_0731,
    'Le modèle Fireworks doit être DeepSeek-V4-Flash-0731.'
);
expect(
    $catalog[MODEL_CHOICE_FIREWORKS_DEEPSEEK_V4_FLASH_0731]['endpoint']
        === FIREWORKS_COMPLETIONS_ENDPOINT,
    'Fireworks doit utiliser l’endpoint Completions demandé.'
);
$supportedTogetherModels = [
    TOGETHER_MODEL_QWEN_3_5_9B,
    TOGETHER_MODEL_QWEN_3_8,
    TOGETHER_MODEL_DEEPSEEK_V4_PRO,
];
expect(
    in_array($catalog[MODEL_CHOICE_TOGETHER]['model'], $supportedTogetherModels, true),
    'Le modèle Together configuré doit appartenir au registre pris en charge.'
);
expect(
    $catalog[MODEL_CHOICE_OPENAI_GPT5_6_LUNA]['supports_logprobs'] === false,
    'gpt-5.6-luna doit signaler l’absence de logprobs.'
);
expect(
    $catalog[MODEL_CHOICE_TOGETHER]['supports_logprobs'] === true,
    'Qwen doit signaler la disponibilité des logprobs.'
);
expect(
    $catalog[MODEL_CHOICE_FIREWORKS_DEEPSEEK_V4_FLASH_0731]['supports_logprobs'] === true,
    'DeepSeek-V4-Flash-0731 doit signaler la disponibilité des logprobs.'
);

$qwen38Profile = getTogetherChatModelProfile(TOGETHER_MODEL_QWEN_3_8);
expect(
    $qwen38Profile['logprobs'] === true,
    'Qwen 3.8 doit utiliser la forme booléenne de logprobs.'
);
expect(
    $qwen38Profile['reasoning']['enabled'] === false,
    'Qwen 3.8 doit demander la désactivation du raisonnement.'
);
expect(
    $qwen38Profile['chat_template_kwargs']['enable_thinking'] === false,
    'Qwen 3.8 doit désactiver le raisonnement dans son gabarit de chat.'
);

$deepseekProfile = getTogetherChatModelProfile(TOGETHER_MODEL_DEEPSEEK_V4_PRO);
expect(
    $deepseekProfile['logprobs'] === REQUESTED_LOGPROBS,
    'DeepSeek V4 Pro doit demander les logprobs et leurs alternatives.'
);
expect(
    $deepseekProfile['reasoning']['enabled'] === false,
    'DeepSeek V4 Pro doit désactiver le raisonnement pour aligner les logprobs.'
);

$defaultRequest = normaliseChatRequest([
    'messages' => [['role' => 'user', 'content' => 'Bonjour']],
]);
expect(
    $defaultRequest['modelChoice'] === MODEL_CHOICE_FIREWORKS_DEEPSEEK_V4_FLASH_0731,
    'DeepSeek-V4-Flash-0731 doit être le modèle sélectionné par défaut.'
);

$legacyRequest = normaliseChatRequest([
    'modele' => MODEL_CHOICE_OPENAI_GPT5_6_LUNA,
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

$openAiPayload = buildModelPayload(
    $catalog[MODEL_CHOICE_OPENAI_GPT5_6_LUNA],
    'Réponds brièvement.',
    [['role' => 'user', 'content' => 'Bonjour']]
);
expect($openAiPayload['messages'][0]['role'] === 'developer', 'OpenAI doit recevoir un message developer.');
expect(!isset($openAiPayload['logprobs']), 'gpt-5.6-luna ne doit pas demander de logprobs.');
expect(!isset($openAiPayload['top_logprobs']), 'gpt-5.6-luna ne doit pas demander d’alternatives.');
expect(!isset($openAiPayload['max_tokens']), 'Aucun plafond applicatif de sortie ne doit être envoyé.');
expect(!isset($openAiPayload['max_completion_tokens']), 'Aucun plafond applicatif de sortie ne doit être envoyé.');

$qwen35Profile = getTogetherChatModelProfile(TOGETHER_MODEL_QWEN_3_5_9B);
$togetherPayload = buildModelPayload(
    array_merge($catalog[MODEL_CHOICE_TOGETHER], $qwen35Profile),
    'Réponds brièvement.',
    [['role' => 'user', 'content' => 'Bonjour']]
);
expect($togetherPayload['messages'][0]['role'] === 'system', 'Together doit recevoir un message system.');
expect($togetherPayload['logprobs'] === 5, 'Together doit demander cinq alternatives.');
expect($togetherPayload['reasoning']['enabled'] === false, 'Le raisonnement Qwen doit être désactivé.');
expect(!isset($togetherPayload['max_tokens']), 'Aucun plafond applicatif de sortie ne doit être envoyé.');

$qwen38Payload = buildModelPayload(
    array_merge($catalog[MODEL_CHOICE_TOGETHER], $qwen38Profile),
    'Réponds brièvement.',
    [['role' => 'user', 'content' => 'Bonjour']]
);
expect($qwen38Payload['logprobs'] === true, 'Qwen 3.8 doit recevoir logprobs=true.');
expect(
    $qwen38Payload['reasoning']['enabled'] === false,
    'Qwen 3.8 doit demander la désactivation du raisonnement.'
);
expect(
    $qwen38Payload['chat_template_kwargs']['enable_thinking'] === false,
    'Qwen 3.8 doit recevoir enable_thinking=false.'
);

$deepseekPayload = buildModelPayload(
    array_merge($catalog[MODEL_CHOICE_TOGETHER], $deepseekProfile),
    'Réponds brièvement.',
    [['role' => 'user', 'content' => 'Bonjour']]
);
expect(
    $deepseekPayload['logprobs'] === REQUESTED_LOGPROBS,
    'DeepSeek V4 Pro doit recevoir le nombre de logprobs demandé.'
);
expect(
    $deepseekPayload['reasoning']['enabled'] === false,
    'DeepSeek V4 Pro doit demander la désactivation du raisonnement.'
);
expect(
    !isset($deepseekPayload['chat_template_kwargs']),
    'DeepSeek V4 Pro ne doit pas recevoir de paramètre de gabarit Qwen.'
);

$fireworksPayload = buildModelPayload(
    $catalog[MODEL_CHOICE_FIREWORKS_DEEPSEEK_V4_FLASH_0731],
    'Réponds brièvement.',
    [
        ['role' => 'user', 'content' => 'Bonjour'],
        ['role' => 'assistant', 'content' => 'Bonjour !'],
        ['role' => 'user', 'content' => 'Comment vas-tu ?'],
    ]
);
expect(!isset($fireworksPayload['messages']), 'Fireworks Completions ne doit pas recevoir messages.');
expect(
    $fireworksPayload['prompt'] === "Instructions système :\nRéponds brièvement.\n\n"
        . "Utilisateur :\nBonjour\n\nAssistant :\nBonjour !\n\n"
        . "Utilisateur :\nComment vas-tu ?\n\nAssistant :\n",
    'Le prompt Fireworks doit conserver le système et tout l’historique.'
);
expect($fireworksPayload['logprobs'] === REQUESTED_LOGPROBS, 'Fireworks doit demander cinq logprobs.');
expect($fireworksPayload['reasoning_effort'] === 'none', 'Le raisonnement Fireworks doit être désactivé.');
expect($fireworksPayload['stop'] === ["\n\nUtilisateur :"], 'Fireworks doit arrêter le tour suivant.');
expect(!isset($fireworksPayload['max_tokens']), 'Aucun plafond applicatif ne doit être envoyé à Fireworks.');

echo "OK - llmChatTest\n";
