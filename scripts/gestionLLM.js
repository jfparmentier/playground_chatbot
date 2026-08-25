var MAX_MESSAGES_UTILISATEUR = 3;
var messagesConversation = [];
var generationEnCours = false;
var interfaceConversationInitialisee = false;

function initialiseChatInterface() {
    if (interfaceConversationInitialisee) {
        return;
    }

    interfaceConversationInitialisee = true;
    initialiseChatBottomDock();
    ajusteHauteurChampMessage();
    afficheConversation();
    actualiseInterfaceConversation();
}

function actualiseHauteurChatBottomDock() {
    var dock = document.getElementById("chat_bottom_dock");
    var page = document.getElementById("pagePrompt");

    if (!dock || !page || !dock.offsetHeight) {
        return;
    }

    page.style.setProperty("--chat-dock-height", dock.offsetHeight + "px");
}

function initialiseChatBottomDock() {
    actualiseHauteurChatBottomDock();

    if (window.ResizeObserver) {
        var dock = document.getElementById("chat_bottom_dock");

        if (dock) {
            var dockObserver = new window.ResizeObserver(actualiseHauteurChatBottomDock);
            dockObserver.observe(dock);
        }
    }

    window.addEventListener("resize", actualiseHauteurChatBottomDock);
}

function getNombreMessagesUtilisateur() {
    return messagesConversation.filter(function (message) {
        return message.role === "user";
    }).length;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function logprobToPercent(logprob) {
    var value = Number(logprob);

    if (!Number.isFinite(value)) {
        return null;
    }

    return 100 * Math.exp(value);
}

function formatProbability(logprob) {
    var probability = logprobToPercent(logprob);

    if (probability === null) {
        return null;
    }

    if (probability >= 10) {
        return probability.toFixed(1).replace(".", ",") + "%";
    }

    if (probability >= 1) {
        return probability.toFixed(2).replace(".", ",") + "%";
    }

    if (probability >= 0.01) {
        return probability.toFixed(3).replace(".", ",") + "%";
    }

    return "< 0,01%";
}

function isCandidateObject(value) {
    return value
        && typeof value === "object"
        && !Array.isArray(value)
        && typeof value.token === "string"
        && Number.isFinite(Number(value.logprob));
}

/**
 * Convertit une collection d'alternatives en tableau sans fusionner les tokens.
 * Together AI peut renvoyer soit une liste d'objets {token, logprob}, soit un
 * objet dont les clés sont les tokens et les valeurs leurs log-probabilités.
 */
function alternativesToArray(alternatives) {
    if (!alternatives) {
        return [];
    }

    if (Array.isArray(alternatives)) {
        var arrayResult = [];

        alternatives.forEach(function (candidate) {
            if (isCandidateObject(candidate)) {
                arrayResult.push({
                    token: candidate.token,
                    logprob: Number(candidate.logprob),
                    tokenId: candidate.token_id ?? candidate.tokenId ?? null,
                    bytes: Array.isArray(candidate.bytes) ? candidate.bytes.slice() : null
                });
                return;
            }

            if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
                arrayResult = arrayResult.concat(alternativesToArray(candidate));
            }
        });

        return arrayResult;
    }

    if (isCandidateObject(alternatives)) {
        return [{
            token: alternatives.token,
            logprob: Number(alternatives.logprob),
            tokenId: alternatives.token_id ?? alternatives.tokenId ?? null,
            bytes: Array.isArray(alternatives.bytes) ? alternatives.bytes.slice() : null
        }];
    }

    if (typeof alternatives !== "object") {
        return [];
    }

    var objectResult = [];

    Object.keys(alternatives).forEach(function (token) {
        var value = alternatives[token];

        if (Number.isFinite(Number(value))) {
            objectResult.push({
                token: token,
                logprob: Number(value),
                tokenId: null,
                bytes: null
            });
            return;
        }

        if (value && typeof value === "object") {
            var candidateToken = typeof value.token === "string" ? value.token : token;
            var candidateLogprob = value.logprob ?? value.log_prob;

            if (Number.isFinite(Number(candidateLogprob))) {
                objectResult.push({
                    token: candidateToken,
                    logprob: Number(candidateLogprob),
                    tokenId: value.token_id ?? value.tokenId ?? null,
                    bytes: Array.isArray(value.bytes) ? value.bytes.slice() : null
                });
            }
        }
    });

    return objectResult;
}

/**
 * Normalise les structures de logprobs rencontrées dans :
 * - l'ancien endpoint OpenAI /v1/completions ;
 * - Together AI /v1/chat/completions ;
 * - les réponses modernes de type chat, à titre de compatibilité défensive.
 */
function normaliseLogprobs(choice) {
    var logprobs = choice && choice.logprobs ? choice.logprobs : {};

    if (Array.isArray(logprobs.content)) {
        return {
            tokens: logprobs.content.map(function (item) {
                return item.token;
            }),
            tokenLogprobs: logprobs.content.map(function (item) {
                return item.logprob;
            }),
            tokenBytes: logprobs.content.map(function (item) {
                return Array.isArray(item.bytes) ? item.bytes.slice() : null;
            }),
            topLogprobs: logprobs.content.map(function (item) {
                return alternativesToArray(item.top_logprobs);
            })
        };
    }

    var tokens = Array.isArray(logprobs.tokens) ? logprobs.tokens : [];
    var tokenLogprobs = Array.isArray(logprobs.token_logprobs)
        ? logprobs.token_logprobs
        : [];
    var rawTopLogprobs = logprobs.top_logprobs;
    var topLogprobs = [];

    if (Array.isArray(rawTopLogprobs)) {
        // Structure habituelle de /v1/completions : une collection par token.
        // Une liste directe de candidats est également acceptée par sécurité.
        if (rawTopLogprobs.length > 0 && rawTopLogprobs.every(isCandidateObject)) {
            topLogprobs = [alternativesToArray(rawTopLogprobs)];
        } else {
            topLogprobs = rawTopLogprobs.map(alternativesToArray);
        }
    } else if (rawTopLogprobs && typeof rawTopLogprobs === "object") {
        var keys = Object.keys(rawTopLogprobs);
        var indexedStructure = keys.length > 0 && keys.every(function (key) {
            return /^\d+$/.test(key)
                && rawTopLogprobs[key]
                && typeof rawTopLogprobs[key] === "object";
        });

        if (indexedStructure) {
            keys.sort(function (a, b) {
                return Number(a) - Number(b);
            });
            topLogprobs = keys.map(function (key) {
                return alternativesToArray(rawTopLogprobs[key]);
            });
        } else {
            topLogprobs = [alternativesToArray(rawTopLogprobs)];
        }
    }

    return {
        tokens: tokens,
        tokenLogprobs: tokenLogprobs,
        tokenBytes: [],
        topLogprobs: topLogprobs
    };
}

function extractErrorMessage(responseText, status) {
    var apiMessage = "";

    if (responseText) {
        try {
            var errorJson = JSON.parse(responseText);
            apiMessage = errorJson && errorJson.error
                ? errorJson.error.message
                : errorJson.message;

            if (typeof apiMessage !== "string") {
                apiMessage = "";
            }
        } catch (error) {
            // La réponse n'était pas du JSON ; le message générique est utilisé.
        }
    }

    var detail = apiMessage.trim() ? " Détail : " + apiMessage.trim() : "";

    if (status === 400) {
        return "La requête a été refusée par le serveur." + detail;
    }

    if (status === 408) {
        return "La requête a dépassé le délai maximal autorisé." + detail;
    }

    if (status === 429) {
        return "Le modèle reçoit trop de demandes. Réessayez dans quelques instants." + detail;
    }

    if (status === 0) {
        return "Impossible de contacter le serveur.";
    }

    if (status >= 500) {
        return "Le service du modèle est temporairement indisponible." + detail;
    }

    return "Une erreur est survenue lors de l’appel au modèle (HTTP " + status + ")." + detail;
}

function candidateKey(candidate) {
    if (Array.isArray(candidate.bytes)) {
        return "bytes:" + candidate.bytes.join(",");
    }

    return "token:" + candidate.token;
}

/**
 * Construit exactement cinq lignes lorsque l'API fournit cinq candidats.
 * Les candidats restent classés par probabilité décroissante et le token
 * effectivement tiré est signalé en gras à son rang réel.
 *
 * L'endpoint de chat renvoie une liste top_logprobs indépendante pour chaque
 * position. Le nombre de lignes ne dépend donc plus du rang du token tiré.
 */
function selectDisplayedCandidates(logprobs, tokenIndex) {
    var chosenToken = logprobs.tokens[tokenIndex];
    var chosenLogprob = Number(logprobs.tokenLogprobs[tokenIndex]);
    var chosenBytes = Array.isArray(logprobs.tokenBytes && logprobs.tokenBytes[tokenIndex])
        ? logprobs.tokenBytes[tokenIndex].slice()
        : null;
    var alternatives = Array.isArray(logprobs.topLogprobs[tokenIndex])
        ? logprobs.topLogprobs[tokenIndex].slice()
        : [];
    var chosenCandidate = null;
    var candidates = [];
    var seen = new Set();

    if (typeof chosenToken === "string" && Number.isFinite(chosenLogprob)) {
        chosenCandidate = {
            token: chosenToken,
            logprob: chosenLogprob,
            tokenId: null,
            bytes: chosenBytes,
            chosen: true
        };
    }

    alternatives
        .filter(function (candidate) {
            return candidate
                && typeof candidate.token === "string"
                && Number.isFinite(Number(candidate.logprob));
        })
        .sort(function (a, b) {
            return Number(b.logprob) - Number(a.logprob);
        })
        .forEach(function (candidate) {
            var normalizedCandidate = {
                token: candidate.token,
                logprob: Number(candidate.logprob),
                tokenId: candidate.tokenId ?? null,
                bytes: Array.isArray(candidate.bytes) ? candidate.bytes.slice() : null,
                chosen: false
            };
            var key = candidateKey(normalizedCandidate);

            if (seen.has(key)) {
                return;
            }

            if (chosenCandidate && key === candidateKey(chosenCandidate)) {
                normalizedCandidate.chosen = true;
                // La logprob associée à l'échantillon est la valeur de référence.
                normalizedCandidate.logprob = chosenCandidate.logprob;
            }

            candidates.push(normalizedCandidate);
            seen.add(key);
        });

    // L'API inclut normalement le token tiré dans top_logprobs. Ce repli le
    // conserve néanmoins si un moteur compatible ne le fournit pas.
    if (chosenCandidate && !seen.has(candidateKey(chosenCandidate))) {
        candidates.push(chosenCandidate);
    }

    candidates.sort(function (a, b) {
        return Number(b.logprob) - Number(a.logprob);
    });

    var displayed = candidates.slice(0, 5);

    // Si le token tiré est hors du top 5, afficher les quatre meilleurs tokens
    // et le token tiré, puis restaurer l'ordre probabiliste.
    if (chosenCandidate && !displayed.some(function (candidate) {
        return candidate.chosen;
    })) {
        displayed = candidates
            .filter(function (candidate) {
                return !candidate.chosen;
            })
            .slice(0, 4)
            .concat([chosenCandidate])
            .sort(function (a, b) {
                return Number(b.logprob) - Number(a.logprob);
            });
    }

    return displayed;
}

var probabilityTreeRedrawTimer = null;

function getProbabilityTreeTokenCount(logprobs) {
    return Math.max(
        Array.isArray(logprobs.tokens) ? logprobs.tokens.length : 0,
        Array.isArray(logprobs.topLogprobs) ? logprobs.topLogprobs.length : 0
    );
}

function probabilityBarWidth(logprob) {
    var probability = logprobToPercent(logprob);

    if (probability === null) {
        return 0;
    }

    return Math.max(0, Math.min(100, probability));
}

function renderProbabilityTreeNode(candidate, tokenIndex, candidateIndex) {
    var probability = formatProbability(candidate.logprob);
    var classes = "token-tree-node" + (candidate.chosen ? " is-chosen" : "");
    var chosenLabel = candidate.chosen
        ? '<span class="token-tree-chosen-label">choisi</span>'
        : "";

    return ''
        + '<div class="' + classes + '"'
        + ' data-tree-node="token-' + tokenIndex + '-' + candidateIndex + '"'
        + ' data-token-index="' + tokenIndex + '"'
        + ' data-candidate-index="' + candidateIndex + '">'
        + '  <div class="token-tree-node-content">'
        + '    <span class="token-tree-token">' + formatToken(candidate.token) + '</span>'
        + '    <span class="token-tree-probability">' + (probability || "—") + '</span>'
        + '  </div>'
        + '  <span class="token-tree-probability-bar" aria-hidden="true">'
        + '    <span style="width: ' + probabilityBarWidth(candidate.logprob).toFixed(4) + '%;"></span>'
        + '  </span>'
        + chosenLabel
        + '</div>';
}

/**
 * Construit un arbre probabiliste horizontal.
 * Chaque niveau présente les cinq candidats d'une position. Seul le candidat
 * effectivement choisi sert de parent au niveau suivant.
 */
function renderProbabilityTree(logprobs) {
    var output = document.getElementById("output_arbre_tokens");

    if (!output) {
        return;
    }

    var tokenCount = getProbabilityTreeTokenCount(logprobs);
    var levels = [];
    var firstTokenIndex = 0;
    var lastTokenIndex = tokenCount;

    for (var tokenIndex = firstTokenIndex; tokenIndex < lastTokenIndex; tokenIndex++) {
        var candidates = selectDisplayedCandidates(logprobs, tokenIndex);

        if (candidates.length === 0) {
            break;
        }

        levels.push({
            tokenIndex: tokenIndex,
            candidates: candidates
        });
    }

    if (levels.length === 0) {
        output.innerHTML = '<p><em>Arrêt du modèle ou probabilités indisponibles.</em></p>';
        return;
    }

    var html = ''
        + '<div class="token-tree-scroll" tabindex="0" aria-label="Arbre des probabilités des tokens">'
        + '  <div class="token-tree-canvas" id="token_tree_canvas">'
        + '    <svg class="token-tree-links" id="token_tree_links" aria-hidden="true"></svg>'
        + '    <div class="token-tree-root" data-tree-node="root">'
        + '      <span class="token-tree-root-title">Contexte</span>'
        + '      <span class="token-tree-root-subtitle">'
        + (firstTokenIndex === 0 ? "Début de la réponse" : "Suite de la réponse")
        + '</span>'
        + '    </div>';

    levels.forEach(function (level) {
        var tokenIndex = level.tokenIndex;
        var candidates = level.candidates;
        html += ''
            + '<section class="token-tree-level" data-token-level="' + tokenIndex + '">'
            + '  <h6>Token ' + (tokenIndex + 1) + '</h6>'
            + '  <div class="token-tree-candidates">';

        candidates.forEach(function (candidate, candidateIndex) {
            html += renderProbabilityTreeNode(candidate, tokenIndex, candidateIndex);
        });

        if (candidates.length < 5) {
            html += '<p class="token-tree-warning"><small>'
                + candidates.length
                + ' candidat(s) exploitable(s) renvoyé(s) par l’API.</small></p>';
        }

        html += '  </div></section>';
    });

    html += '  </div></div>';
    output.innerHTML = html;

    scheduleProbabilityTreeRedraw();
}

function createProbabilityTreePath(parentNode, childNode, canvasRect, selected) {
    var parentRect = parentNode.getBoundingClientRect();
    var childRect = childNode.getBoundingClientRect();
    var x1 = parentRect.right - canvasRect.left;
    var y1 = parentRect.top + parentRect.height / 2 - canvasRect.top;
    var x2 = childRect.left - canvasRect.left;
    var y2 = childRect.top + childRect.height / 2 - canvasRect.top;
    var controlDistance = Math.max(28, (x2 - x1) * 0.46);
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");

    path.setAttribute(
        "d",
        "M " + x1 + " " + y1
        + " C " + (x1 + controlDistance) + " " + y1
        + ", " + (x2 - controlDistance) + " " + y2
        + ", " + x2 + " " + y2
    );
    path.setAttribute("class", selected ? "token-tree-link is-selected" : "token-tree-link");

    return path;
}

/**
 * Dessine les branches après la mise en page effective du navigateur.
 * Cette fonction est aussi appelée lorsque la vue cachée devient visible.
 */
function redessineArbreProbabilites() {
    var canvas = document.getElementById("token_tree_canvas");
    var svg = document.getElementById("token_tree_links");

    if (!canvas || !svg || canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
        return;
    }

    var canvasRect = canvas.getBoundingClientRect();
    var width = canvas.scrollWidth;
    var height = canvas.scrollHeight;

    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.innerHTML = "";

    var levels = Array.from(canvas.querySelectorAll(".token-tree-level"));
    var parentNode = canvas.querySelector('[data-tree-node="root"]');

    levels.forEach(function (level) {
        var children = Array.from(level.querySelectorAll(".token-tree-node"));

        if (!parentNode || children.length === 0) {
            return;
        }

        children.forEach(function (childNode) {
            svg.appendChild(
                createProbabilityTreePath(
                    parentNode,
                    childNode,
                    canvasRect,
                    childNode.classList.contains("is-chosen")
                )
            );
        });

        parentNode = level.querySelector(".token-tree-node.is-chosen");
    });
}

function scheduleProbabilityTreeRedraw() {
    if (probabilityTreeRedrawTimer !== null) {
        window.clearTimeout(probabilityTreeRedrawTimer);
    }

    window.requestAnimationFrame(redessineArbreProbabilites);
    probabilityTreeRedrawTimer = window.setTimeout(function () {
        redessineArbreProbabilites();
        probabilityTreeRedrawTimer = null;
    }, 120);
}

window.addEventListener("resize", scheduleProbabilityTreeRedraw);

function formatMessageContent(content, logprobs) {
    if (
        !logprobs
        || !Array.isArray(logprobs.tokens)
        || !Array.isArray(logprobs.tokenLogprobs)
    ) {
        return escapeHtml(content);
    }

    var tokens = logprobs.tokens.slice();

    if (tokens.length === 0) {
        return escapeHtml(content);
    }

    var cursor = 0;
    var tokenHtml = "";

    tokens.some(function (token, index) {
        if (
            typeof token !== "string"
            || token === ""
            || content.slice(cursor, cursor + token.length) !== token
        ) {
            // Les fournisseurs peuvent ajouter un token terminal invisible.
            // Il ne doit pas annuler les info-bulles déjà construites.
            return true;
        }

        var probability = formatProbability(logprobs.tokenLogprobs[index]);

        if (!probability) {
            tokenHtml += escapeHtml(token);
            cursor += token.length;
            return false;
        }

        var tooltip = "Probabilité : " + probability;

        tokenHtml += ''
            + '<span class="assistant-token-probability" tabindex="0"'
            + ' data-probability="' + escapeHtml(tooltip) + '"'
            + ' aria-label="' + escapeHtml("Token « " + token + " ». " + tooltip) + '">'
            + escapeHtml(token)
            + '</span>';
        cursor += token.length;
        return false;
    });

    return tokenHtml + escapeHtml(content.slice(cursor));
}

function construitMessageHtml(message, index) {
    var isUser = message.role === "user";
    var classes = "chat-message " + (isUser ? "is-user" : "is-assistant");
    var icon = isUser ? "fas fa-user" : "fas fa-robot";
    var displaysTokenProbabilities = !isUser
        && index === messagesConversation.length - 1
        && message.logprobs;
    var isLastUserMessage = isUser && index === getIndexDernierMessageUtilisateur();
    var userActions = isLastUserMessage
        ? ''
            + '    <div class="chat-message-actions is-user-actions">'
            + '      <button type="button" aria-label="Copier le dernier message"'
            + '        title="Copier" onclick="copierDernierMessageUtilisateur();">'
            + '        <span class="chatgpt-action-icon is-copy" aria-hidden="true"></span>'
            + '      </button>'
            + '      <button type="button" aria-label="Éditer le dernier message"'
            + '        title="Éditer" onclick="editerDernierMessageUtilisateur();"'
            + (generationEnCours ? ' disabled' : '') + '>'
            + '        <span class="chatgpt-action-icon is-edit" aria-hidden="true"></span>'
            + '      </button>'
            + '    </div>'
        : "";
    var regenerateAction = !isUser && index === messagesConversation.length - 1
        ? ''
            + '    <div class="chat-message-actions">'
            + '      <button type="button" id="regenerate_response_button"'
            + '        aria-label="Régénérer la dernière réponse"'
            + '        title="Régénérer la dernière réponse"'
            + '        onclick="regenererDerniereReponse();">'
            + '        <i class="fas fa-sync-alt" aria-hidden="true"></i>'
            + '      </button>'
            + '    </div>'
        : "";

    return ''
        + '<article class="' + classes + '" aria-label="'
        + (isUser ? "Message de l’utilisateur" : "Réponse du modèle")
        + '">'
        + '  <div class="chat-avatar" aria-hidden="true"><i class="' + icon + '"></i></div>'
        + '  <div class="chat-message-body">'
        + '    <div class="chat-bubble">'
        + formatMessageContent(message.content, displaysTokenProbabilities ? message.logprobs : null)
        + '</div>'
        + userActions
        + regenerateAction
        + '  </div>'
        + '</article>';
}

function getIndexDernierMessageUtilisateur() {
    for (var index = messagesConversation.length - 1; index >= 0; index--) {
        if (messagesConversation[index].role === "user") {
            return index;
        }
    }

    return -1;
}

function construitAttenteHtml() {
    return ''
        + '<article class="chat-message is-assistant is-waiting" aria-label="Le modèle génère une réponse">'
        + '  <div class="chat-avatar" aria-hidden="true"><i class="fas fa-robot"></i></div>'
        + '  <div class="chat-message-body">'
        + '    <div class="chat-bubble">'
        + '      <span class="typing-dot"></span>'
        + '      <span class="typing-dot"></span>'
        + '      <span class="typing-dot"></span>'
        + '    </div>'
        + '  </div>'
        + '</article>';
}

function afficheConversation() {
    var container = document.getElementById("conversation_messages");

    if (!container) {
        return;
    }

    if (messagesConversation.length === 0 && !generationEnCours) {
        container.innerHTML = ''
            + '<div class="conversation-empty">'
            + '  <i class="far fa-comments" aria-hidden="true"></i>'
            + '  <p><strong>La conversation est vide.</strong></p>'
            + '  <p>Écrivez votre premier message ci-dessous.</p>'
            + '</div>';
        return;
    }

    var html = messagesConversation.map(construitMessageHtml).join("");

    if (generationEnCours) {
        html += construitAttenteHtml();
    }

    container.innerHTML = html;

    window.requestAnimationFrame(function () {
        container.scrollTop = container.scrollHeight;
    });
}

function actualiseInterfaceConversation() {
    var input = document.getElementById("user_message");
    var sendButton = document.getElementById("send_message_button");
    var sendLabel = document.getElementById("send_button_label");
    var sendIcon = document.getElementById("send_button_icon");
    var counter = document.getElementById("message_counter");
    var hint = document.getElementById("composer_hint");
    var limitNotice = document.getElementById("conversation_limit_notice");
    var systemPrompt = document.getElementById("system_prompt");
    var regenerateButton = document.getElementById("regenerate_response_button");
    var resetButton = document.getElementById("reset_chat_button");
    var userMessageCount = getNombreMessagesUtilisateur();
    var limitReached = userMessageCount >= MAX_MESSAGES_UTILISATEUR;
    var hasText = input && input.value.trim() !== "";
    var hasMessages = messagesConversation.length > 0;
    var lastMessage = hasMessages
        ? messagesConversation[messagesConversation.length - 1]
        : null;
    var canRegenerate = lastMessage && lastMessage.role === "assistant";

    if (counter) {
        counter.textContent = userMessageCount
            + " / "
            + MAX_MESSAGES_UTILISATEUR
            + (userMessageCount === 1 ? " message" : " messages");
        counter.classList.toggle("is-complete", limitReached);
    }

    var messagesContainer = document.getElementById("conversation_messages");
    if (messagesContainer) {
        messagesContainer.setAttribute("aria-busy", generationEnCours ? "true" : "false");
    }

    if (input) {
        input.disabled = generationEnCours || limitReached;
        input.placeholder = limitReached
            ? "Limite de trois messages atteinte."
            : "Écrivez votre message…";
    }

    if (sendButton) {
        sendButton.disabled = generationEnCours || limitReached || !hasText;
    }

    if (sendLabel) {
        if (generationEnCours) {
            sendLabel.textContent = "Génération…";
        } else if (limitReached) {
            sendLabel.textContent = "Limite atteinte";
        } else {
            sendLabel.textContent = userMessageCount === 0 ? "Envoyer" : "Poursuivre";
        }
    }

    if (sendIcon) {
        sendIcon.className = generationEnCours
            ? "fas fa-circle-notch fa-spin"
            : "fas fa-arrow-up";
    }

    if (hint) {
        if (generationEnCours) {
            hint.textContent = "Le modèle prépare sa réponse…";
        } else if (limitReached) {
            hint.textContent = "Limite de conversation atteinte";
        } else {
            hint.innerHTML = "Ctrl&nbsp;↵ ou ⌘&nbsp;↵ pour envoyer";
        }
    }

    if (limitNotice) {
        limitNotice.hidden = !limitReached || generationEnCours;
    }

    if (systemPrompt) {
        systemPrompt.disabled = generationEnCours;
    }

    if (regenerateButton) {
        regenerateButton.disabled = generationEnCours || !canRegenerate;
    }

    if (resetButton) {
        resetButton.disabled = generationEnCours;
    }

}

function gereRaccourciEnvoi(event) {
    if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) {
        return;
    }

    event.preventDefault();

    var form = document.getElementById("chat_form");
    if (form) {
        form.requestSubmit();
    }
}

function ajusteHauteurChampMessage() {
    var input = document.getElementById("user_message");

    if (!input) {
        return;
    }

    input.style.height = "auto";
    var targetHeight = Math.min(input.scrollHeight || 40, 180);
    input.style.height = targetHeight + "px";
    input.style.overflowY = (input.scrollHeight || 0) > 180 ? "auto" : "hidden";
    actualiseHauteurChatBottomDock();
}

function gereSaisieMessage() {
    ajusteHauteurChampMessage();
    actualiseInterfaceConversation();
}

function copierDernierMessageUtilisateur() {
    var index = getIndexDernierMessageUtilisateur();
    var clipboard = window.navigator && window.navigator.clipboard;

    if (index < 0 || !clipboard || typeof clipboard.writeText !== "function") {
        annonceStatutConversation("La copie n’est pas disponible dans ce navigateur.");
        return;
    }

    clipboard.writeText(messagesConversation[index].content).then(function () {
        annonceStatutConversation("Le message a été copié.");
    }).catch(function () {
        annonceStatutConversation("La copie du message a échoué.");
    });
}

function editerDernierMessageUtilisateur() {
    if (generationEnCours) {
        return;
    }

    var index = getIndexDernierMessageUtilisateur();
    var input = document.getElementById("user_message");

    if (index < 0 || !input) {
        return;
    }

    var content = messagesConversation[index].content;
    messagesConversation = messagesConversation.slice(0, index);
    input.value = content;
    cacheErreurConversation();
    ajusteHauteurChampMessage();
    afficheConversation();
    actualiseInterfaceConversation();
    annonceStatutConversation("Le message peut maintenant être modifié.");
    input.focus();
}

function afficheErreurConversation(message) {
    var errorElement = document.getElementById("chat_error");

    if (!errorElement) {
        return;
    }

    errorElement.textContent = message;
    errorElement.hidden = false;
    errorElement.focus();
}

function cacheErreurConversation() {
    var errorElement = document.getElementById("chat_error");

    if (errorElement) {
        errorElement.textContent = "";
        errorElement.hidden = true;
    }
}

function messagesPourApi() {
    return messagesConversation.map(function (message) {
        return {
            role: message.role,
            content: message.content
        };
    });
}

function restaureGenerationApresErreur(contexte, messageErreur) {
    generationEnCours = false;

    if (contexte.type === "nouveau_message") {
        if (
            messagesConversation.length > 0
            && messagesConversation[messagesConversation.length - 1].role === "user"
        ) {
            messagesConversation.pop();
        }

        var input = document.getElementById("user_message");
        if (input) {
            input.value = contexte.messageUtilisateur;
            ajusteHauteurChampMessage();
        }
    } else if (contexte.reponsePrecedente) {
        messagesConversation.push(contexte.reponsePrecedente);
    }

    afficheConversation();
    actualiseInterfaceConversation();
    afficheErreurConversation(messageErreur);
}

function reinitialiseApresPerteDeSession() {
    localStorage.removeItem("user_uuid");
    messagesConversation = [];
    generationEnCours = false;
    afficheConversation();
    actualiseInterfaceConversation();
    initialisePage();
}

function lanceGeneration(contexte) {
    var input = document.getElementById("user_message");
    var modelSelect = document.getElementById("model_llm");
    var systemPrompt = document.getElementById("system_prompt");
    var modele = modelSelect ? modelSelect.value : "together";
    var paramsPhp = {
        model: modele,
        systemPrompt: systemPrompt ? systemPrompt.value : "",
        messages: messagesPourApi()
    };

    appel_php_async(
        "php/appelLLM.php",
        JSON.stringify(paramsPhp),
        function (responseText) {
            try {
                var responseJson = JSON.parse(responseText);

                if (responseJson.error) {
                    throw new Error(responseJson.error.message || "Erreur retournée par le modèle.");
                }

                if (!Array.isArray(responseJson.choices) || !responseJson.choices[0]) {
                    throw new Error("La réponse du modèle ne contient aucun message.");
                }

                var choice = responseJson.choices[0];
                var assistantContent = choice.message
                    && typeof choice.message.content === "string"
                    ? choice.message.content
                    : "";

                if (assistantContent.trim() === "") {
                    throw new Error("Le modèle n’a généré aucun texte.");
                }

                var normalizedLogprobs = normaliseLogprobs(choice);
                var hasTokenProbabilities = normalizedLogprobs
                    && Array.isArray(normalizedLogprobs.tokens)
                    && normalizedLogprobs.tokens.length > 0;

                messagesConversation.push({
                    role: "assistant",
                    content: assistantContent,
                    logprobs: hasTokenProbabilities ? normalizedLogprobs : null
                });
                generationEnCours = false;

                afficheConversation();
                actualiseInterfaceConversation();
                annonceStatutConversation(
                    contexte.type === "regeneration"
                        ? "La réponse a été régénérée."
                        : "La réponse du modèle a été reçue."
                );

                if (input && !input.disabled) {
                    input.focus();
                }
            } catch (error) {
                restaureGenerationApresErreur(
                    contexte,
                    error.message || "Réponse invalide du serveur."
                );
            }
        },
        function (responseText, status) {
            if (status === 401) {
                reinitialiseApresPerteDeSession();
                return;
            }

            restaureGenerationApresErreur(
                contexte,
                extractErrorMessage(responseText, status)
            );
        }
    );
}

function envoyerMessage(event) {
    event.preventDefault();

    if (generationEnCours || getNombreMessagesUtilisateur() >= MAX_MESSAGES_UTILISATEUR) {
        return;
    }

    var input = document.getElementById("user_message");
    var messageUtilisateur = input ? input.value.trim() : "";

    if (messageUtilisateur === "") {
        actualiseInterfaceConversation();
        return;
    }

    var contexte = {
        type: "nouveau_message",
        messageUtilisateur: messageUtilisateur
    };

    cacheErreurConversation();
    messagesConversation.push({
        role: "user",
        content: messageUtilisateur
    });
    generationEnCours = true;
    annonceStatutConversation("Génération de la réponse en cours.");

    if (input) {
        input.value = "";
        ajusteHauteurChampMessage();
    }

    afficheConversation();
    actualiseInterfaceConversation();
    lanceGeneration(contexte);
}

function regenererDerniereReponse() {
    if (generationEnCours || messagesConversation.length < 2) {
        return;
    }

    var derniereReponse = messagesConversation[messagesConversation.length - 1];

    if (!derniereReponse || derniereReponse.role !== "assistant") {
        return;
    }

    var contexte = {
        type: "regeneration",
        reponsePrecedente: derniereReponse
    };

    cacheErreurConversation();
    messagesConversation.pop();
    generationEnCours = true;
    annonceStatutConversation("Régénération de la réponse en cours.");
    afficheConversation();
    actualiseInterfaceConversation();
    lanceGeneration(contexte);
}

function reinitialiserChatComplet() {
    if (generationEnCours) {
        return;
    }

    messagesConversation = [];
    generationEnCours = false;
    cacheErreurConversation();

    var input = document.getElementById("user_message");
    var systemPrompt = document.getElementById("system_prompt");

    if (input) {
        input.value = "";
        ajusteHauteurChampMessage();
    }

    if (systemPrompt) {
        systemPrompt.value = "";
    }

    afficheConversation();
    actualiseInterfaceConversation();
    annonceStatutConversation("La conversation et le prompt système ont été effacés.");

    if (input) {
        input.focus();
    }
}

function annonceStatutConversation(message) {
    var status = document.getElementById("chat_status");

    if (status) {
        status.textContent = message;
    }
}
