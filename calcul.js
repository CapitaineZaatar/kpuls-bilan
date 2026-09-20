// Le calcul du gain de temps et d'argent, partagé par le calculateur et le
// tableau de commande. Aucune donnée ici : tout vient de hypotheses.json.

const BASES = {
  seance:  { libelle: "chaque séance" },
  nouveau: { libelle: "chaque nouveau patient" }
};

// saisie : { patientsParJour, joursParSemaine, nouveauxParSemaine, dureeSeanceMin, tarifSeance,
//            reinvestissementPct, optionPoulie }
// Le patient guidé par la poulie (hyp.renforcementGuide) : pendant le renforcement, le jeu
// guide le patient. Le kiné ne reste attentif que sur une part du temps, le reste est libre.
function calculer(hyp, saisie) {
  const nb = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  const seancesSemaine = nb(saisie.patientsParJour) * nb(saisie.joursParSemaine);
  const nouveauxSemaine = nb(saisie.nouveauxParSemaine);
  const semaines = nb(hyp.semainesParAn);
  const duree = nb(saisie.dureeSeanceMin);

  const postes = hyp.postes.map((p) => {
    const volume = p.base === "nouveau" ? nouveauxSemaine : seancesSemaine;
    const minutesSemaine = nb(p.minutes) * volume * (nb(p.partPct) / 100);
    return { ...p, minutesSemaine };
  });
  const minutesAdminSemaine = postes.reduce((s, p) => s + p.minutesSemaine, 0);

  // Patient guidé par la poulie
  const rg = hyp.renforcementGuide || null;
  const optionActive = !!(rg && saisie.optionPoulie);
  let poulie = null, minutesPoulieSemaine = 0;
  if (rg) {
    const renfo = Math.min(nb(rg.minutesRenfo), duree);            // jamais plus que la séance
    const attentif = renfo * (nb(rg.supervisionPct) / 100);
    const libre = renfo - attentif;
    const partPatients = nb(rg.partPatientsPct) / 100;
    const liberesParSeance = partPatients * libre;                  // moyenne sur toutes les séances
    poulie = { libelle: rg.libelle, description: rg.description, partPatientsPct: nb(rg.partPatientsPct),
               renfo, attentif, libre, liberesParSeance,
               enAvant: Math.max(0, duree - renfo) };               // minutes de la séance sans poulie
    minutesPoulieSemaine = seancesSemaine * liberesParSeance;
  }

  const minutesSemaine = minutesAdminSemaine + (optionActive ? minutesPoulieSemaine : 0);
  const heuresSemaine = minutesSemaine / 60;
  const heuresAn = heuresSemaine * semaines;

  const reinvest = nb(saisie.reinvestissementPct) / 100;
  const tarif = nb(saisie.tarifSeance);
  const suppSemaine = (minutes) => (duree > 0 ? (minutes * reinvest) / duree : 0);
  const seancesSuppSemaine = suppSemaine(minutesSemaine);
  const seancesSuppMois = (seancesSuppSemaine * semaines) / 12;
  const caAn = seancesSuppSemaine * semaines * tarif;

  // Comparateur : ce que l'option apporte seule
  let comparateur = null;
  if (poulie) {
    const s = suppSemaine(minutesPoulieSemaine);
    const jours = nb(saisie.joursParSemaine);
    comparateur = {
      seancesSuppSemaine: s,
      seancesSuppJour: jours > 0 ? s / jours : 0,
      caAn: s * semaines * tarif,
      patientsJourSans: nb(saisie.patientsParJour),
      patientsJourAvec: nb(saisie.patientsParJour) + (jours > 0 ? s / jours : 0)
    };
  }

  const prix = Number.isFinite(hyp.prixMensuel) && hyp.prixMensuel > 0 ? hyp.prixMensuel : null;
  const coutAn = prix === null ? null : prix * 12;
  const gainNetAn = coutAn === null ? null : caAn - coutAn;
  const seuilSeancesMois = prix !== null && tarif > 0 ? prix / tarif : null;

  return {
    seancesSemaine, postes, heuresSemaine, heuresAn, minutesAdminSemaine, minutesPoulieSemaine,
    optionActive, poulie, comparateur,
    seancesSuppSemaine, seancesSuppMois, caAn, prix, coutAn, gainNetAn, seuilSeancesMois
  };
}

const fmt = {
  nombre: (v, d = 0) => v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }),
  euros: (v) => Math.round(v).toLocaleString("fr-FR") + " €",
  heures: (v) => {
    const h = Math.floor(v), m = Math.round((v - h) * 60);
    return m === 60 ? `${h + 1} h` : (h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, "0")}`);
  }
};
