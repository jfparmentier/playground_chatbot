function masqueErreursIdentification() {
    cacheVue("message_erreur_email");
    cacheVue("message_erreur_utilisateur_non_valide");
}

function activeBoutonIdentification(active) {
    var bouton = document.getElementById("bouton_identification");

    if (bouton) {
        bouton.disabled = !active;
    }
}

function litMessageErreurIdentification(responseText, fallback) {
    if (responseText) {
        try {
            var responseJson = JSON.parse(responseText);
            var message = responseJson && responseJson.error
                ? responseJson.error.message
                : responseJson.message;

            if (typeof message === "string" && message.trim() !== "") {
                return message;
            }
        } catch (error) {
            // Le texte de repli sera utilisé lorsque la réponse n'est pas du JSON.
        }
    }

    return fallback;
}

function verifieIdentifiant() {
    var inputEmail = document.getElementById("input_email_utilisateur");
    var email = inputEmail.value.trim();

    masqueErreursIdentification();
    activeBoutonIdentification(false);

    appel_php_async(
        "php/verifieEmail.php",
        JSON.stringify({
            action: "verify",
            email: email
        }),
        function (responseText) {
            activeBoutonIdentification(true);

            try {
                var responseJson = JSON.parse(responseText);

                if (
                    responseJson.authenticated !== true
                    || typeof responseJson.user_uuid !== "string"
                    || responseJson.user_uuid === ""
                ) {
                    throw new Error("Réponse d’identification invalide.");
                }

                localStorage.setItem("user_uuid", responseJson.user_uuid);
                inputEmail.value = "";
                initialisePage();
            } catch (error) {
                document.getElementById("contenu_message_erreur_email").textContent =
                    error.message || "Réponse d’identification invalide.";
                afficheVue("message_erreur_email");
            }
        },
        function (responseText, status) {
            activeBoutonIdentification(true);

            if (status === 400) {
                document.getElementById("contenu_message_erreur_email").textContent =
                    litMessageErreurIdentification(responseText, "Adresse e-mail invalide.");
                afficheVue("message_erreur_email");
                return;
            }

            if (status === 403) {
                document.getElementById("contenu_message_erreur_utilisateur_non_valide").textContent =
                    litMessageErreurIdentification(
                        responseText,
                        "Utilisateur inconnu ou non autorisé."
                    );
                afficheVue("message_erreur_utilisateur_non_valide");
                return;
            }

            alert(
                litMessageErreurIdentification(
                    responseText,
                    status === 0
                        ? "Impossible de contacter le serveur."
                        : "Erreur du serveur lors de l’identification."
                )
            );
        }
    );
}
