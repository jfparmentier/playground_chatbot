<?php

/**
 * Copiez ce fichier sous le nom config.local.php, puis renseignez les clés API
 * nécessaires et les domaines de messagerie autorisés.
 *
 * Ne publiez jamais config.local.php et ne l'ajoutez pas à un dépôt Git.
 */
return [
    // Fireworks AI : DeepSeek-V4-Flash-0731 et Nemotron Lightning via Completions.
    'fireworks_api_key' => 'COLLEZ_ICI_VOTRE_CLE_FIREWORKS_AI',

    // Together AI : modèle défini par TOGETHER_CHAT_MODEL dans llmChat.php.
    'together_api_key' => 'COLLEZ_ICI_VOTRE_CLE_TOGETHER_AI',

    // OpenAI : gpt-4.1-mini via Chat Completions.
    'openai_api_key' => 'COLLEZ_ICI_VOTRE_CLE_OPENAI',

    // Saisissez un ou plusieurs domaines sans adresse utilisateur.
    'email_domains' => [
        'univ.fr',
        'etudiant.univ.fr',
    ],
];
