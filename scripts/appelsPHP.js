function appel_php_async(fichier, params_php, fonction_succes, fonction_erreur) {
    var requete = new XMLHttpRequest();

    requete.open("POST", fichier, true);
    requete.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
    requete.timeout = 65000;

    requete.onreadystatechange = function () {
        if (requete.readyState !== 4) {
            return;
        }

        if (requete.status >= 200 && requete.status < 300) {
            fonction_succes(requete.responseText);
            return;
        }

        if (typeof fonction_erreur === "function") {
            fonction_erreur(requete.responseText, requete.status);
        }
    };

    requete.onerror = function () {
        if (typeof fonction_erreur === "function") {
            fonction_erreur("", 0);
        }
    };

    requete.ontimeout = function () {
        if (typeof fonction_erreur === "function") {
            fonction_erreur("", 408);
        }
    };

    requete.send("params=" + encodeURIComponent(params_php));
}
