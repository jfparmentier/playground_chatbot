//--------------------------------------------------------------------------------------//
// initialisation
//--------------------------------------------------------------------------------------//

function affichePageIdentification() {
    localStorage.removeItem("user_uuid");
    afficheVue("vue_premiere_connexion");
}

function initialisePage() {
    // Initialise l'affichage des vues.
    initialiseVues();

    if (typeof initialiseChatInterface === "function") {
        initialiseChatInterface();
    }

    var userUuid = localStorage.getItem("user_uuid");

    if (userUuid === null) {
        affichePageIdentification();
        return;
    }

    // Le stockage local sert uniquement à mémoriser l'interface. L'autorisation
    // réelle est vérifiée par la session PHP à chaque chargement de page.
    appel_php_async(
        "php/verifieEmail.php",
        JSON.stringify({ action: "status" }),
        function (responseText) {
            try {
                var responseJson = JSON.parse(responseText);

                if (
                    responseJson.authenticated !== true
                    || typeof responseJson.user_uuid !== "string"
                    || responseJson.user_uuid === ""
                ) {
                    throw new Error("Session utilisateur invalide.");
                }

                localStorage.setItem("user_uuid", responseJson.user_uuid);
                afficheVue("pagePrompt");
            } catch (error) {
                affichePageIdentification();
            }
        },
        function () {
            affichePageIdentification();
        }
    );
}

//--------------------------------------------------------------------------------------//
