# TP LLM — interface pédagogique de conversation

Cette application évolue vers un chatbot pédagogique limité à trois messages utilisateur par conversation. Le socle serveur utilise désormais Chat Completions et conserve les probabilités associées aux tokens générés lorsqu’elles sont fournies par le modèle.

## Modèles disponibles

Le menu de paramètres, accessible par l’icône en forme d’engrenage en haut à droite, propose deux modèles :

- **GPT-5 nano**, développé et appelé par OpenAI ;
- **Qwen3.5-9B**, développé par Alibaba Cloud et appelé par Together AI.

Qwen3.5-9B est sélectionné par défaut.

## Configuration

Copiez le fichier `php/config.example.php` sous le nom `php/config.local.php`, puis renseignez les clés nécessaires :

```php
<?php

return [
    'together_api_key' => 'VOTRE_CLE_TOGETHER_AI',
    'openai_api_key' => 'VOTRE_CLE_OPENAI',

    'email_domains' => [
        'ipsa.fr',
        'etudiant.ipsa.fr',
    ],
];
```

Le fichier `php/config.local.php` est exclu du dépôt par `.gitignore`. Il ne doit jamais être publié.

Les clés peuvent aussi être définies avec les variables d’environnement suivantes :

- `TOGETHER_API_KEY` ;
- `OPENAI_API_KEY`.

Les identifiants de modèles et les endpoints sont fixés dans le registre serveur afin que le navigateur ne puisse pas appeler un modèle arbitraire.

## Contrat de conversation

La passerelle accepte un `systemPrompt`, un identifiant `model` ou `modele`, et un tableau `messages`. Les rôles `user` et `assistant` doivent alterner, la requête doit se terminer par `user` et le serveur refuse tout quatrième message utilisateur. Aucun petit plafond de génération n’est ajouté par l’application : seules les limites techniques du fournisseur demeurent.

L’interface transmet le prompt système et l’historique complet à chaque appel. L’ancien champ `prompt` reste accepté par la passerelle pour les anciennes intégrations à un tour. Qwen3.5-9B fournit les `logprobs` attendues. Les API OpenAI refusent actuellement les `logprobs` pour `gpt-5-nano`, qui reste utilisable sans cet affichage. L’interface l’indique sans traiter cette absence comme une erreur.

Les messages suivent l’ordre chronologique dans une colonne principale de 900 px, également utilisée par le prompt système et le champ de saisie. Le champ arrondi reste fixé au bas de la fenêtre et grandit avec son contenu ; la page réserve automatiquement sa hauteur afin qu’il ne masque pas la conversation.

Lorsque le modèle fournit les `logprobs`, tous les tokens de sa dernière réponse affichent leur probabilité dans une info-bulle au survol ou au focus clavier. Aucun arbre séparé n’est affiché.

## Actions de conversation

- **Poursuivre** ajoute un nouveau message utilisateur, dans la limite de trois ;
- L’icône **Régénérer** placée sous la dernière réponse supprime uniquement cette réponse et rejoue le même historique, sans consommer de message utilisateur supplémentaire.

Si une régénération échoue, l’ancienne réponse et son affichage de tokens sont restaurés.

## Prérequis

- PHP avec l’extension cURL ;
- sessions PHP activées ;
- accès HTTPS sortant vers les API configurées ;
- au moins une clé API correspondant à un modèle proposé.

## Validation de l’adresse électronique

La syntaxe de l’adresse et son domaine sont contrôlés côté serveur. Les domaines autorisés sont définis par le tableau `email_domains` dans `php/config.local.php`. L’ancienne propriété `email_domain` reste acceptée pour compatibilité. Une session PHP autorisée est créée après validation et vérifiée avant chaque appel au modèle.

## Structure principale

- `index.html` : interface de conversation et prompt système ;
- `scripts/gestionLLM.js` : état de la conversation, appels, rendu des messages et info-bulles de probabilités ;
- `php/appelLLM.php` : point d’entrée HTTP authentifié ;
- `php/llmChat.php` : registre des modèles, validation des conversations et routage Chat Completions ;
- `php/verifieEmail.php` : validation serveur de l’adresse électronique ;
- `php/config.example.php` : modèle de configuration sans secret.

Les tests s’exécutent avec `php php/tests/llmChatTest.php` pour la passerelle et `node scripts/tests/gestionConversation.test.js` pour les actions de l’interface.

Un test réel facultatif vérifie trois tours puis une régénération auprès de chaque fournisseur configuré :

```bash
RUN_LIVE_LLM_TESTS=1 php php/tests/liveConversationSmoke.php
```

Il effectue huit appels courts et n’affiche ni les clés ni le texte des réponses.

## Sécurité

Le navigateur transmet uniquement un identifiant de modèle autorisé. Les endpoints, les modèles et les clés API sont sélectionnés côté PHP. Aucune clé API ne doit être placée dans les fichiers JavaScript ou HTML.
