const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createClassList() {
    const values = new Set();

    return {
        toggle(name, enabled) {
            if (enabled) {
                values.add(name);
            } else {
                values.delete(name);
            }
        },
        contains(name) {
            return values.has(name);
        }
    };
}

function createElement(overrides = {}) {
    return Object.assign({
        value: "",
        textContent: "",
        innerHTML: "",
        disabled: false,
        hidden: false,
        placeholder: "",
        style: { display: "" },
        classList: createClassList(),
        scrollTop: 0,
        scrollHeight: 0,
        selectedIndex: 0,
        options: [],
        setAttribute(name, value) {
            this[name] = value;
        },
        focus() {
            this.focused = true;
        },
        requestSubmit() {}
    }, overrides);
}

const elements = {
    user_message: createElement(),
    send_message_button: createElement(),
    send_button_label: createElement(),
    send_button_icon: createElement(),
    message_counter: createElement(),
    composer_hint: createElement(),
    conversation_limit_notice: createElement({ hidden: true }),
    system_prompt: createElement({ value: "Reste concis." }),
    regenerate_response_button: createElement(),
    reset_chat_button: createElement(),
    conversation_messages: createElement(),
    chat_error: createElement({ hidden: true }),
    chat_status: createElement(),
    chat_form: createElement()
};

let copiedMessage = "";

const context = {
    console,
    document: {
        getElementById(id) {
            return elements[id] || null;
        }
    },
    localStorage: {
        removeItem() {}
    },
    afficheVue(id) {
        if (elements[id]) {
            elements[id].style.display = "block";
        }
    },
    cacheVue(id) {
        if (elements[id]) {
            elements[id].style.display = "none";
        }
    },
    initialisePage() {},
    appel_php_async() {
        throw new Error("Un appel simulé doit être installé par le test.");
    },
    window: {
        navigator: {
            clipboard: {
                writeText(value) {
                    copiedMessage = value;
                    return Promise.resolve();
                }
            }
        },
        addEventListener() {},
        requestAnimationFrame(callback) {
            callback();
        },
        setTimeout(callback) {
            callback();
            return 1;
        },
        clearTimeout() {},
        confirm() {
            return true;
        }
    }
};

vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "gestionLLM.js"), "utf8"),
    context,
    { filename: "gestionLLM.js" }
);

context.initialiseChatInterface();
assert.equal(elements.send_message_button.disabled, true);
assert.equal(elements.regenerate_response_button.disabled, true);
assert.equal(elements.reset_chat_button.disabled, false);

context.messagesConversation = [
    { role: "user", content: "Question" },
    { role: "assistant", content: "Ancienne réponse", modelLabel: "GPT-5 nano — OpenAI" }
];
context.afficheConversation();
context.actualiseInterfaceConversation();
assert.equal(elements.regenerate_response_button.disabled, false);
assert.equal(elements.send_button_label.textContent, "Poursuivre");
assert.match(elements.conversation_messages.innerHTML, /id="regenerate_response_button"/);
assert.match(elements.conversation_messages.innerHTML, /copierDernierMessageUtilisateur/);
assert.match(elements.conversation_messages.innerHTML, /editerDernierMessageUtilisateur/);
assert.match(elements.conversation_messages.innerHTML, /chatgpt-action-icon is-copy/);
assert.match(elements.conversation_messages.innerHTML, /chatgpt-action-icon is-edit/);
assert.doesNotMatch(elements.conversation_messages.innerHTML, /GPT-5 nano — OpenAI/);
assert.doesNotMatch(elements.conversation_messages.innerHTML, />Vous</);
context.copierDernierMessageUtilisateur();
assert.equal(copiedMessage, "Question");

context.appel_php_async = function (_file, _params, success) {
    success(JSON.stringify({
        choices: [{
            message: { content: "Nouvelle réponse" },
            logprobs: {
                content: [
                    { token: "Nouvelle", logprob: -0.1, top_logprobs: [] },
                    { token: " réponse", logprob: -0.2, top_logprobs: [] }
                ]
            }
        }]
    }));
};
context.regenererDerniereReponse();
assert.equal(context.messagesConversation.length, 2);
assert.equal(context.messagesConversation[0].content, "Question");
assert.equal(context.messagesConversation[1].content, "Nouvelle réponse");
assert.equal(context.getNombreMessagesUtilisateur(), 1);
assert.match(elements.conversation_messages.innerHTML, /assistant-token-probability/);
assert.match(elements.conversation_messages.innerHTML, /Probabilité : 90,5%/);
assert.equal(elements.chat_status.textContent, "La réponse a été régénérée.");

context.appel_php_async = function (_file, _params, _success, error) {
    error(JSON.stringify({ error: { message: "Indisponible" } }), 500);
};
context.regenererDerniereReponse();
assert.equal(context.messagesConversation.length, 2);
assert.equal(context.messagesConversation[1].content, "Nouvelle réponse");
assert.equal(elements.chat_error.hidden, false);
assert.equal(elements.chat_error.focused, true);
assert.match(elements.chat_error.textContent, /temporairement indisponible/);

const preservedSystemPrompt = elements.system_prompt.value;
context.reinitialiserChatComplet();
assert.equal(context.messagesConversation.length, 0);
assert.notEqual(preservedSystemPrompt, "");
assert.equal(elements.system_prompt.value, "");
assert.equal(elements.user_message.value, "");

context.messagesConversation = [
    { role: "user", content: "Un" },
    { role: "assistant", content: "Réponse un" },
    { role: "user", content: "Deux" },
    { role: "assistant", content: "Réponse deux" },
    { role: "user", content: "Trois" },
    { role: "assistant", content: "Réponse trois" }
];
elements.user_message.value = "Quatre";
context.actualiseInterfaceConversation();
assert.equal(elements.user_message.disabled, true);
assert.equal(elements.send_message_button.disabled, true);
assert.equal(elements.regenerate_response_button.disabled, false);
assert.equal(elements.conversation_limit_notice.hidden, false);

context.editerDernierMessageUtilisateur();
assert.equal(context.messagesConversation.length, 4);
assert.equal(elements.user_message.value, "Trois");
assert.equal(context.getNombreMessagesUtilisateur(), 2);
assert.equal(elements.user_message.focused, true);

elements.user_message.disabled = false;
elements.user_message.value = "Un message sur plusieurs lignes";
elements.user_message.scrollHeight = 120;
context.gereSaisieMessage();
assert.equal(elements.user_message.style.height, "120px");

const tokenizedMessage = {
    role: "assistant",
    content: "abcdefghijkl",
    logprobs: {
        tokens: Array.from("abcdefghijkl").concat(["<|im_end|>"]),
        tokenLogprobs: Array.from({ length: 13 }, () => -0.1),
        tokenBytes: Array.from({ length: 13 }, () => null),
        topLogprobs: Array.from({ length: 13 }, () => [])
    }
};
context.messagesConversation = [tokenizedMessage];
context.afficheConversation();
const tooltipCount = (elements.conversation_messages.innerHTML.match(/class="assistant-token-probability"/g) || []).length;
assert.equal(tooltipCount, 12);
assert.doesNotMatch(elements.conversation_messages.innerHTML, /<\/span>kl/);
assert.doesNotMatch(elements.conversation_messages.innerHTML, /im_end/);

console.log("OK - gestionConversation.test");
