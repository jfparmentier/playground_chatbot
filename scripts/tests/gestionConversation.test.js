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
    model_llm: createElement({
        value: "openai_gpt5_nano",
        selectedIndex: 0,
        options: [{ text: "GPT-5 nano — OpenAI" }]
    }),
    regenerate_response_button: createElement(),
    restart_conversation_button: createElement(),
    conversation_messages: createElement(),
    model_capability_hint: createElement(),
    chat_error: createElement({ hidden: true }),
    chat_status: createElement(),
    probabilités: createElement({ className: "vue" }),
    vue_btn_affich_proba: createElement({ className: "vue-exclusive" }),
    vue_proba: createElement({ className: "vue-exclusive" }),
    token_unavailable_notice: createElement({ hidden: true }),
    token_unavailable_message: createElement(),
    token_inspector_count: createElement(),
    token_page_previous: createElement(),
    token_page_status: createElement(),
    token_page_next: createElement(),
    output_arbre_tokens: createElement(),
    chat_form: createElement()
};

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
assert.equal(elements.restart_conversation_button.disabled, true);

context.messagesConversation = [
    { role: "user", content: "Question" },
    { role: "assistant", content: "Ancienne réponse", modelLabel: "GPT-5 nano — OpenAI" }
];
context.actualiseInterfaceConversation();
assert.equal(elements.regenerate_response_button.disabled, false);
assert.equal(elements.restart_conversation_button.disabled, false);
assert.equal(elements.send_button_label.textContent, "Poursuivre");

context.appel_php_async = function (_file, _params, success) {
    success(JSON.stringify({
        choices: [{
            message: { content: "Nouvelle réponse" },
            logprobs: null
        }]
    }));
};
context.regenererDerniereReponse();
assert.equal(context.messagesConversation.length, 2);
assert.equal(context.messagesConversation[0].content, "Question");
assert.equal(context.messagesConversation[1].content, "Nouvelle réponse");
assert.equal(context.getNombreMessagesUtilisateur(), 1);
assert.equal(elements.token_unavailable_notice.hidden, false);
assert.match(elements.token_unavailable_message.textContent, /GPT-5 nano/);
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
const preservedModel = elements.model_llm.value;
context.recommencerConversation();
assert.equal(context.messagesConversation.length, 0);
assert.equal(elements.system_prompt.value, preservedSystemPrompt);
assert.equal(elements.model_llm.value, preservedModel);
assert.equal(elements.restart_conversation_button.disabled, true);

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
assert.equal(elements.restart_conversation_button.disabled, false);
assert.equal(elements.conversation_limit_notice.hidden, false);

const syntheticLogprobs = {
    tokens: Array.from({ length: 23 }, (_value, index) => `t${index + 1}`),
    tokenLogprobs: Array.from({ length: 23 }, () => -0.1),
    tokenBytes: Array.from({ length: 23 }, () => null),
    topLogprobs: Array.from({ length: 23 }, (_value, index) => [{
        token: `t${index + 1}`,
        logprob: -0.1,
        bytes: null
    }])
};

context.afficheInspecteurTokens(syntheticLogprobs);
assert.equal(elements.token_inspector_count.textContent, "23 tokens générés");
assert.equal(elements.token_page_status.textContent, "1–10 sur 23");
assert.equal(elements.token_page_previous.disabled, true);
assert.equal(elements.token_page_next.disabled, false);
assert.match(elements.output_arbre_tokens.innerHTML, /Token 10/);
assert.doesNotMatch(elements.output_arbre_tokens.innerHTML, /Token 11/);

context.changePageTokens(1);
assert.equal(elements.token_page_status.textContent, "11–20 sur 23");
assert.equal(elements.token_page_previous.disabled, false);
assert.equal(elements.token_page_next.disabled, false);
assert.match(elements.output_arbre_tokens.innerHTML, /Token 11/);

context.changePageTokens(1);
assert.equal(elements.token_page_status.textContent, "21–23 sur 23");
assert.equal(elements.token_page_next.disabled, true);

console.log("OK - gestionConversation.test");
