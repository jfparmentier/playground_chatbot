//--------------------------------------------------------------------------------------//
// gestion de l'affichage des vues
// l'idée est de switcher entre différentes "vues utilisateurs"
//
// 3 types de vues :
//  . vue : peut s'afficher / se cacher
//  . vue-fixe : reste toujours affichée
//  . vue-exclusive : cache toutes les autres vues exclusives du même niveau
//
// seulement 2 fonctions de demande d'affichage : afficheVue et cacheVue
//  . retourne un message de warning si appliqué à autre chose qu'une vue
//  . retourne un warning si appliqué à une vue fixe
//
// plus une troisième fonction d'initialisation : initialiseVuesExclusives
//
// principes sous-jacent :
//  . on ne spécifie pas l'attribut display dans le html pour les vues exclusives : on met default comme attribut
//  . on n'affiche / cache pas des éléments, on doit passer par des vues
//
// attention : le parent d'une vue exclusive doit avoir un id
//--------------------------------------------------------------------------------------//


function afficheVue(idVue) {
	var elementCible = document.getElementById(idVue);
	var nom_classe = elementCible.className;
	switch(nom_classe) {
		case "vue-fixe":
			console.log("Warning : demande d'affichage d'une vue fixe. Utilisez une vue normale si besoin.");
			break;
		case "vue-exclusive":
			// cache les autres vues exclusives du même niveau : passe par l'id du noeud parent
			var parent_id = elementCible.parentNode.id;
			var vues_exclusives_meme_niveau = document.querySelectorAll("#" + parent_id + " > .vue-exclusive");			
			for (var i = 0 ; i < vues_exclusives_meme_niveau.length ; i++)
				vues_exclusives_meme_niveau[i].style.display = "none";
			// affiche l'element cible : idem que pour les vues
		case "vue":
			// on affiche l'element
			elementCible.style.display = "block";
			// s'il a l'attribut restart, on re-initialise ses sous-vues
			if(elementCible.getAttribute("restart") != null)
				initialiseVues(idVue);
			// s'il a l'attribut affiche, on appel la fonction correspondante
			if(elementCible.getAttribute("affiche") != null)		
				window[elementCible.getAttribute("affiche")]();
			break;
		default:
			console.log("Warning : appel de l'affichage d'une vue sur un élément autre.");
			break;
	}
}

function cacheVue(idVue) {
	var elementCible = document.getElementById(idVue);
	var nom_classe = elementCible.className;
	switch(nom_classe) {
		case "vue-fixe":
			console.log("Warning : demande de masquage d'une vue fixe. Utilisez une vue normale si besoin.");
			break;
		case "vue":
		case "vue-exclusive":
			elementCible.style.display = "none";
			break;
		default:
			console.log("Warning : appel de masquage d'une vue sur un élément autre.");
			break;
	}
}

// renvoie vrai si la vue est visible, false sinon
function vueVisible(idVue) {
	var elementCible = document.getElementById(idVue);
	var nom_classe = elementCible.className;
	switch(nom_classe) {
		case "vue-fixe":
			return(true);
			break;
		case "vue":
		case "vue-exclusive":		
			var style = window.getComputedStyle(elementCible);
			return (style.display === 'block');
			break;
		default:
			console.log("Warning : test d'une visibilité d'une vue sur un élément autre.");
			return(false);
			break;
	}
}

// re-initialise l'affichage des vues
// parametre default pour les vues exclusives
// parametres show / hide pour les autres vues
function initialiseVues(idParent) {
	if(idParent == undefined)
		var parent = document;
	else
		var parent = document.getElementById(idParent);

	// vues exclusives
	var vues_exclusives_par_default = parent.querySelectorAll(".vue-exclusive[default]");	
	for (var i = 0 ; i <  vues_exclusives_par_default.length ; i++)
	{
		afficheVue(vues_exclusives_par_default[i].id);
	}
	
	// vues normales visibles par défaut
	var vues_show = parent.querySelectorAll(".vue[show]");	
	for (var i = 0 ; i <  vues_show.length ; i++)
	{
		afficheVue(vues_show[i].id);
	}

	// vues normales cachee par défaut
	var vues_hide = parent.querySelectorAll(".vue[hide]");	
	for (var i = 0 ; i <  vues_hide.length ; i++)
	{
		cacheVue(vues_hide[i].id);
	}
	
}
