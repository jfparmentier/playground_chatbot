<?php

/**
 * Copiez ce fichier sous le nom config.local.php, puis renseignez les clés API
 * nécessaires et les domaines de messagerie autorisés.
 *
 * Ne publiez jamais config.local.php et ne l'ajoutez pas à un dépôt Git.
 */
return [
    // Together AI : Qwen/Qwen3.5-9B via Chat Completions.
    'together_api_key' => 'COLLEZ_ICI_VOTRE_CLE_TOGETHER_AI',

    // OpenAI : gpt-5-nano via Chat Completions.
    'openai_api_key' => 'COLLEZ_ICI_VOTRE_CLE_OPENAI',

    // Saisissez un ou plusieurs domaines sans adresse utilisateur. Les formes
    // "ipsa.fr" et "@ipsa.fr" sont acceptées. Les sous-domaines ne sont pas
    // autorisés implicitement : ajoutez-les explicitement dans ce tableau.
    'email_domains' => [
        'ipsa.fr',
        'etudiant.ipsa.fr',
    ],
];
