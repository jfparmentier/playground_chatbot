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
expect(count($catalog) === 4, 'Le registre doit exposer exactement quatre choix de modèles.');
expect(
    $catalog[MODEL_CHOICE_OPENAI_GPT4_1_MINI]['model'] === 'gpt-4.1-mini',
    'Le modèle OpenAI doit être gpt-4.1-mini.'
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
expect(
    $catalog[MODEL_CHOICE_FIREWORKS_NEMOTRON_LIGHTNING_3P5_30B_A3B]['model']
        === FIREWORKS_MODEL_NEMOTRON_LIGHTNING_3P5_30B_A3B,
    'Nemotron Lightning doit être disponible dans le registre Fireworks.'
);
expect(
    $catalog[MODEL_CHOICE_FIREWORKS_NEMOTRON_LIGHTNING_3P5_30B_A3B]['endpoint']
        === FIREWORKS_COMPLETIONS_ENDPOINT,
    'Nemotron Lightning doit utiliser Fireworks Completions.'
);
$supportedTogetherModels = [
    TOGETHER_MODEL_TERNARY_BONSAI_27B,
    TOGETHER_MODEL_QWEN_3_5_9B,
    TOGETHER_MODEL_QWEN_3_8,
    TOGETHER_MODEL_DEEPSEEK_V4_PRO,
];
expect(
    in_array($catalog[MODEL_CHOICE_TOGETHER]['model'], $supportedTogetherModels, true),
    'Le modèle Together configuré doit appartenir au registre pris en charge.'
);
expect(
    $catalog[MODEL_CHOICE_OPENAI_GPT4_1_MINI]['supports_logprobs'] === true,
    'gpt-4.1-mini doit signaler la disponibilité des logprobs.'
);
expect(
    $catalog[MODEL_CHOICE_TOGETHER]['supports_logprobs'] === true,
    'Le modèle Together doit signaler la disponibilité des logprobs.'
);
expect(
    $catalog[MODEL_CHOICE_FIREWORKS_DEEPSEEK_V4_FLASH_0731]['supports_logprobs'] === true,
    'DeepSeek-V4-Flash-0731 doit signaler la disponibilité des logprobs.'
);
expect(
    $catalog[MODEL_CHOICE_FIREWORKS_NEMOTRON_LIGHTNING_3P5_30B_A3B]['supports_logprobs'] === true,
    'Nemotron Lightning doit signaler la disponibilité des logprobs.'
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

$bonsaiProfile = getTogetherChatModelProfile(TOGETHER_MODEL_TERNARY_BONSAI_27B);
expect($bonsaiProfile['logprobs'] === true, 'Ternary Bonsai doit demander les logprobs sous forme booléenne.');
expect(
    $bonsaiProfile['chat_template_kwargs']['enable_thinking'] === false,
    'Ternary Bonsai doit désactiver le raisonnement dans son gabarit de chat.'
);
expect(
    $catalog[MODEL_CHOICE_TOGETHER]['model'] === TOGETHER_MODEL_TERNARY_BONSAI_27B,
    'Ternary Bonsai doit être le modèle Together configuré.'
);

$defaultRequest = normaliseChatRequest([
    'messages' => [['role' => 'user', 'content' => 'Bonjour']],
]);
expect(
    $defaultRequest['modelChoice'] === MODEL_CHOICE_TOGETHER,
    'Ternary Bonsai doit être le modèle sélectionné par défaut.'
);

$legacyRequest = normaliseChatRequest([
    'modele' => MODEL_CHOICE_OPENAI_GPT4_1_MINI,
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
    $catalog[MODEL_CHOICE_OPENAI_GPT4_1_MINI],
    'Réponds brièvement.',
    [['role' => 'user', 'content' => 'Bonjour']]
);
expect($openAiPayload['messages'][0]['role'] === 'developer', 'OpenAI doit recevoir un message developer.');
expect($openAiPayload['logprobs'] === true, 'gpt-4.1-mini doit demander les logprobs.');
expect($openAiPayload['top_logprobs'] === REQUESTED_LOGPROBS, 'gpt-4.1-mini doit demander cinq alternatives.');
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

$bonsaiPayload = buildModelPayload(
    $catalog[MODEL_CHOICE_TOGETHER],
    'Réponds brièvement.',
    [['role' => 'user', 'content' => 'Bonjour']]
);
expect($bonsaiPayload['model'] === TOGETHER_MODEL_TERNARY_BONSAI_27B, 'Le payload doit cibler Ternary Bonsai.');
expect($bonsaiPayload['logprobs'] === true, 'Ternary Bonsai doit recevoir logprobs=true.');
expect(
    $bonsaiPayload['chat_template_kwargs']['enable_thinking'] === false,
    'Ternary Bonsai doit recevoir enable_thinking=false.'
);

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

$nemotronRequest = normaliseChatRequest([
    'model' => MODEL_CHOICE_FIREWORKS_NEMOTRON_LIGHTNING_3P5_30B_A3B,
    'messages' => [['role' => 'user', 'content' => 'Bonjour']],
]);
expect(
    $nemotronRequest['modelChoice'] === MODEL_CHOICE_FIREWORKS_NEMOTRON_LIGHTNING_3P5_30B_A3B,
    'Nemotron Lightning doit être sélectionnable par la passerelle.'
);
$nemotronPayload = buildModelPayload(
    $catalog[$nemotronRequest['modelChoice']],
    'Réponds brièvement.',
    $nemotronRequest['messages']
);
expect(
    $nemotronPayload['model'] === FIREWORKS_MODEL_NEMOTRON_LIGHTNING_3P5_30B_A3B,
    'Le payload Fireworks doit cibler Nemotron Lightning.'
);
expect($nemotronPayload['logprobs'] === REQUESTED_LOGPROBS, 'Nemotron Lightning doit demander cinq logprobs.');

echo "OK - llmChatTest\n";
