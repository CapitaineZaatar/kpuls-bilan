// Le calcul du gain de temps et d'argent, partagé par le calculateur et le
// tableau de commande. Aucune donnée ici : tout vient de hypotheses.json.

const BASES = {
  seance:  { libelle: "chaque séance" },
  nouveau: { libelle: "chaque nouveau patient" }
};

// saisie : { patientsParJour, joursParSemaine, nouveauxParSemaine, dureeSeanceMin, tarifSeance, reinvestissementPct }
function calculer(hyp, saisie) {
  const nb = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  const seancesSemaine = nb(saisie.patientsParJour) * nb(saisie.joursParSemaine);
  const nouveauxSemaine = nb(saisie.nouveauxParSemaine);
  const semaines = nb(hyp.semainesParAn);

  const postes = hyp.postes.map((p) => {
    const volume = p.base === "nouveau" ? nouveauxSemaine : seancesSemaine;
    const minutesSemaine = nb(p.minutes) * volume * (nb(p.partPct) / 100);
    return { ...p, minutesSemaine };
  });

  const minutesSemaine = postes.reduce((s, p) => s + p.minutesSemaine, 0);
  const heuresSemaine = minutesSemaine / 60;
  const heuresAn = heuresSemaine * semaines;

  const reinvest = nb(saisie.reinvestissementPct) / 100;
  const duree = nb(saisie.dureeSeanceMin);
  const seancesSuppSemaine = duree > 0 ? (minutesSemaine * reinvest) / duree : 0;
  const seancesSuppMois = (seancesSuppSemaine * semaines) / 12;
  const caAn = seancesSuppSemaine * semaines * nb(saisie.tarifSeance);

  const prix = Number.isFinite(hyp.prixMensuel) && hyp.prixMensuel > 0 ? hyp.prixMensuel : null;
  const coutAn = prix === null ? null : prix * 12;
  const gainNetAn = coutAn === null ? null : caAn - coutAn;
  const tarif = nb(saisie.tarifSeance);
  const seuilSeancesMois = prix !== null && tarif > 0 ? prix / tarif : null;

  return {
    seancesSemaine, postes, heuresSemaine, heuresAn,
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
