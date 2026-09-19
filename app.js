// Le questionnaire de douleur de KPULS, en parcours guidé.
//
// C'est le même parcours, la même carte anatomique et les mêmes règles de zoom
// que dans l'appli (écran « 1er RDV »). Une seule question à l'écran à la fois :
//   1. la partie du corps (face ou dos, haut ou bas)
//   2. le muscle, une fois la zone agrandie
//   3. une phrase pour dire d'où vient la douleur et comment elle est apparue
//   4. l'intensité, en pourcentage
//   5. trois questions de sécurité (allergie, grossesse, traitement), puis l'envoi

import { MUSCLES, DECORS, CADRES, REGIONS, SEUIL_HAUT_BAS, CENTRE_ZONE } from './donnees.js';

// ---------------------------------------------------------------------------
// Réglages (identiques à ParcoursGuide.swift et PlancheAnatomique.swift)
// ---------------------------------------------------------------------------

const SENSATIONS = [
  ['tire', 'Ça tire'], ['brule', 'Ça brûle'], ['lance', 'Ça lance'],
  ['transperce', 'Ça transperce'], ['raideur', 'Raideur'], ['fourmillements', 'Fourmillements'],
];
const ETAPES = ['zone', 'muscle', 'phrase', 'intensite', 'securite'];
const TITRES = {
  zone: 'Où as-tu mal ?', muscle: 'Quel muscle ?',
  phrase: 'Raconte-nous', intensite: 'Ta douleur', securite: 'Ta sécurité',
};
const ZONES_MAX = 3;
// SEUIL_HAUT_BAS : hauteur normalisée du cadre qui sépare le haut du bas du corps
// (le niveau des hanches), calculée sur le dessin avec le catalogue.
const LARGEUR = CADRES.face.l, HAUTEUR = CADRES.face.h;   // taille du cadre d'une vue
const TOLERANCE_DOIGT = 35;    // rattrapage d'un toucher approximatif, en pixels écran
const CLAIR = '#96dbfa', NUIT = '#3a4080';   // muscles bleu clair sur fond bleu nuit

const params = new URLSearchParams(location.search);
const prenom = (params.get('p') || '').trim().slice(0, 30);
const modeDebug = params.has('debug');

const etat = {
  etape: 'zone',
  vue: 'face',
  zone: null,            // { vue, moitie } de la partie du corps choisie
  actif: null,           // muscle en cours de saisie
  brouillon: null,       // { phrase, sensation, intensite }
  zones: new Map(),      // id du muscle -> { sensation, intensite, phrase }
  // Réponses aux questions de sécurité (null = pas encore répondu).
  securite: { allergie: null, allergiePrecision: '', grossesse: null, traitement: null, traitementPrecision: '' },
};

const $ = (sel) => document.querySelector(sel);
function elt(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}
const moitieDe = (m) => (m.centre[1] < SEUIL_HAUT_BAS ? 'haut' : 'bas');
const musclesDe = (vue) => MUSCLES.filter(m => m.vue === vue);
const parId = Object.fromEntries(MUSCLES.map(m => [m.id, m]));

// ---------------------------------------------------------------------------
// La planche : corps vectoriel, zoom
// ---------------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';
const svg = $('#planche');
const repere = $('#repere');   // décale les tracés pour que le cadre de la vue parte de 0,0
const corps = $('#corps');     // la silhouette : tous les muscles
const couche = $('#couche');   // la surbrillance corail par-dessus
const zoneScene = $('#scene');

let cadre = { cx: 0.5, cy: 0.5, s: 1 };   // centre normalisé et niveau de zoom
let animation = null;

function appliquerCadre(c) {
  const largeurEcran = zoneScene.clientWidth, hauteurEcran = zoneScene.clientHeight;
  if (!largeurEcran || !hauteurEcran) return;
  const ratio = largeurEcran / hauteurEcran;
  const h0 = Math.max(HAUTEUR, LARGEUR / ratio), w0 = h0 * ratio;
  const w = w0 / c.s, h = h0 / c.s;
  svg.setAttribute('viewBox', `${c.cx * LARGEUR - w / 2} ${c.cy * HAUTEUR - h / 2} ${w} ${h}`);
}

// Garde le zoom dans les limites du corps, comme dans l'appli.
function borner(cx, cy, s) {
  const demi = 0.5 / s;
  return { cx: Math.min(1 - demi, Math.max(demi, cx)), cy: Math.min(1 - demi, Math.max(demi, cy)), s };
}

function allerAu(cible, duree = 550) {
  const depart = { ...cadre };
  const t0 = performance.now();
  animation = { t0 };
  const pas = (maintenant) => {
    if (!animation || animation.t0 !== t0) return;
    const k = Math.min(1, (maintenant - t0) / duree);
    const e = 1 - Math.pow(1 - k, 3);
    cadre = {
      cx: depart.cx + (cible.cx - depart.cx) * e,
      cy: depart.cy + (cible.cy - depart.cy) * e,
      s: depart.s + (cible.s - depart.s) * e,
    };
    appliquerCadre(cadre);
    if (k < 1) requestAnimationFrame(pas);
    else animation = null;
  };
  requestAnimationFrame(pas);
}

new ResizeObserver(() => appliquerCadre(cadre)).observe(zoneScene);
appliquerCadre(cadre);

function apresMiseEnPage(fn) {
  requestAnimationFrame(() => requestAnimationFrame(() => { appliquerCadre(cadre); fn(); }));
}

function cadrerCorps() { allerAu({ cx: 0.5, cy: 0.5, s: 1 }); }

function cadrerZone(z) {
  allerAu(borner(0.5, CENTRE_ZONE[z.moitie], 1.55));
}

function cadrerMuscle(m) {
  allerAu(borner(m.centre[0], m.centre[1], 2.5));
}

function changerVue(vue) {
  const change = vue !== vueDessinee;
  etat.vue = vue;
  document.querySelectorAll('#vues button').forEach(b => b.classList.toggle('actif', b.dataset.vue === vue));
  if (change) construireCorps();
  dessiner();
}

// --- Le corps ---------------------------------------------------------------

function trace(d, remplissage, contour, epaisseur) {
  const e = document.createElementNS(NS, 'path');
  e.setAttribute('d', d);
  e.setAttribute('fill', remplissage);
  if (contour) {
    e.setAttribute('stroke', contour);
    e.setAttribute('stroke-width', epaisseur);
    e.setAttribute('stroke-linejoin', 'round');
  }
  return e;
}

let vueDessinee = null;
const formesParId = new Map();   // id du muscle -> tracés de la vue affichée

// Tête, puis chaque muscle. Les muscles se touchent presque : le trait bleu nuit
// fait les séparations, comme sur une planche de SVT.
function construireCorps() {
  vueDessinee = etat.vue;
  const c = CADRES[etat.vue];
  repere.setAttribute('transform', `translate(${-c.x} ${-c.y})`);
  corps.replaceChildren();
  formesParId.clear();
  for (const d of DECORS[etat.vue]) corps.append(trace(d, NUIT));
  for (const m of musclesDe(etat.vue)) {
    const els = m.formes.map(d => trace(d, CLAIR, NUIT, 2.2));
    formesParId.set(m.id, els);
    corps.append(...els);
  }
}

// --- Surbrillance et toucher ---------------------------------------------

// Le point normalisé (0…1 dans le cadre) tombe-t-il dans une des pièces du muscle ?
function contient(m, nx, ny) {
  const c = CADRES[m.vue];
  const pt = new DOMPoint(c.x + nx * LARGEUR, c.y + ny * HAUTEUR);
  return (formesParId.get(m.id) || []).some(p => p.isPointInFill(pt));
}

function peindre(m, remplissage, contour, epaisseur, classe) {
  for (const d of m.formes) {
    const f = trace(d, remplissage, contour, epaisseur);
    if (classe) f.setAttribute('class', classe);
    couche.append(f);
  }
}

const CORAIL = '255,107,94';

function dessiner() {
  couche.replaceChildren();

  // Parcours guidé : les muscles de la zone se dessinent en contour, pour les distinguer.
  let zone = null, force = 1;
  if (etat.etape === 'muscle') zone = etat.zone;
  else if ((etat.etape === 'phrase' || etat.etape === 'intensite') && etat.actif) {
    zone = { vue: etat.actif.vue, moitie: moitieDe(etat.actif) };
    force = 0.5;
  }
  if (zone && zone.vue === etat.vue) {
    for (const m of musclesDe(etat.vue)) {
      if (moitieDe(m) !== zone.moitie || (etat.actif && m.id === etat.actif.id)) continue;
      peindre(m, `rgba(${CORAIL},${0.10 * force})`, `rgba(${CORAIL},${0.6 * force})`, 1);
    }
  }

  // Les zones déjà renseignées, plus intenses quand la douleur l'est.
  for (const m of musclesDe(etat.vue)) {
    const z = etat.zones.get(m.id);
    if (!z || (etat.actif && m.id === etat.actif.id)) continue;
    peindre(m, `rgba(${CORAIL},${0.28 + 0.34 * z.intensite})`, `rgba(${CORAIL},0.7)`, 1);
  }

  // Le muscle en cours de saisie.
  if (etat.actif && etat.actif.vue === etat.vue) {
    peindre(etat.actif, `rgba(${CORAIL},0.82)`, 'rgba(255,255,255,0.55)', 1.6, 'actif');
  }
}

// ---------------------------------------------------------------------------
// Toucher la planche
// ---------------------------------------------------------------------------

let debut = null;
svg.addEventListener('pointerdown', (e) => { debut = { x: e.clientX, y: e.clientY, t: performance.now() }; });
svg.addEventListener('pointerup', (e) => {
  if (!debut) return;
  const d = Math.hypot(e.clientX - debut.x, e.clientY - debut.y);
  const duree = performance.now() - debut.t;
  debut = null;
  if (d < 10 && duree < 700) toucher(e.clientX, e.clientY);
});
svg.addEventListener('pointercancel', () => { debut = null; });

function pointNormalise(cx, cy) {
  const p = new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM().inverse());
  return [p.x / LARGEUR, p.y / HAUTEUR];
}

// Parmi les muscles dont une forme contient le doigt, le plus proche du doigt
// par son centre (si des formes se chevauchent, on prend le bon côté et le bon muscle).
function muscleSousLeDoigt(nx, ny, candidats) {
  const touches = candidats.filter(m => contient(m, nx, ny));
  if (!touches.length) return null;
  return touches.reduce((a, b) => (distanceCentre(nx, ny, a) <= distanceCentre(nx, ny, b) ? a : b));
}

function distanceCentre(nx, ny, m) {
  return Math.hypot((nx - m.centre[0]) * LARGEUR, (ny - m.centre[1]) * HAUTEUR);
}

function muscleProche(nx, ny, candidats) {
  const echelle = svg.getScreenCTM().a;   // pixels écran par unité de l'image
  let meilleur = null, distMin = TOLERANCE_DOIGT;
  for (const m of candidats) {
    const dist = Math.hypot((nx - m.centre[0]) * LARGEUR, (ny - m.centre[1]) * HAUTEUR) * echelle;
    if (dist < distMin) { distMin = dist; meilleur = m; }
  }
  return meilleur;
}

function toucher(cx, cy) {
  const [nx, ny] = pointNormalise(cx, cy);

  if (etat.etape === 'zone') {
    // Une zone déjà renseignée se rouvre en la touchant.
    const deja = muscleSousLeDoigt(nx, ny, musclesDe(etat.vue).filter(m => etat.zones.has(m.id)));
    if (deja) { modifierZone(deja.id); return; }
    // Sinon, le doigt désigne une partie du corps : haut ou bas, face ou dos.
    if (nx < 0.02 || nx > 0.98 || ny < 0 || ny > 1) return;
    choisirZone({ vue: etat.vue, moitie: ny < SEUIL_HAUT_BAS ? 'haut' : 'bas' });
    return;
  }

  if (etat.etape === 'muscle') {
    // Les formes comptent même au-delà de la moitié choisie (les mains sont au niveau des hanches).
    const tous = musclesDe(etat.zone.vue);
    const candidats = tous.filter(m => moitieDe(m) === etat.zone.moitie);
    const direct = muscleSousLeDoigt(nx, ny, tous) || muscleProche(nx, ny, candidats);
    if (direct) choisirMuscle(direct);
  }
}

// ---------------------------------------------------------------------------
// Le parcours
// ---------------------------------------------------------------------------

const dock = $('#dock');
const bulle = $('#bulle');

function dire(texte, precision) {
  bulle.replaceChildren(document.createTextNode(texte));
  if (precision) bulle.append(elt('small', '', precision));
  bulle.hidden = false;
  bulle.style.animation = 'none';
  void bulle.offsetWidth;
  bulle.style.animation = '';
}

function allerEtape(nom) {
  etat.etape = nom;
  const i = ETAPES.indexOf(nom);

  $('#titre-etape').textContent = TITRES[nom];
  $('#bt-retour').hidden = nom === 'zone';
  $('#entete').classList.toggle('sans-retour', nom === 'zone');
  document.querySelectorAll('#points span').forEach((p, k) => {
    p.classList.toggle('fait', k < i);
    p.classList.toggle('actif', k === i);
  });
  $('#vues').hidden = nom !== 'zone';

  dock.replaceChildren();
  dock.hidden = true;

  if (nom === 'zone') {
    etat.actif = null;
    etat.brouillon = null;
    dire(etat.zones.size === 0
      ? 'Touche la partie de ton corps qui te fait mal.'
      : 'Tu peux ajouter une autre zone, ou passer à la suite.',
      etat.zones.size === 0 ? 'Choisis Face ou Dos, puis touche le haut ou le bas du corps.' : null);
    afficherZonesDeja();
    dessiner();
    apresMiseEnPage(cadrerCorps);
    return;
  }

  if (nom === 'muscle') {
    etat.actif = null;
    etat.brouillon = null;
    changerVue(etat.zone.vue);
    dire('Peux-tu être plus précis ? Touche le muscle qui te fait mal.',
      'Si tu te trompes, la flèche en haut te ramène en arrière.');
    dessiner();
    apresMiseEnPage(() => cadrerZone(etat.zone));
    return;
  }

  if (nom === 'phrase') {
    dire("Dis-nous en une phrase d'où ça vient et comment c'est apparu.");
    afficherPhrase();
  } else if (nom === 'intensite') {
    dire('À combien évalues-tu ta douleur ?', 'Fais glisser le curseur.');
    afficherIntensite();
  } else if (nom === 'securite') {
    // Les zones signalées restent visibles, corps entier, pendant les questions.
    etat.actif = null;
    etat.brouillon = null;
    dire("Dernière étape : trois questions pour bien t'accompagner.",
      "Ton kiné s'en sert pour vérifier que tout est adapté à toi.");
    afficherSecurite();
    dock.hidden = false;
    dessiner();
    apresMiseEnPage(cadrerCorps);
    return;
  }
  dock.hidden = false;
  changerVue(etat.actif.vue);
  dessiner();
  apresMiseEnPage(() => cadrerMuscle(etat.actif));
}

function retour() {
  if (etat.etape === 'phrase') allerEtape('muscle');
  else if (etat.etape === 'intensite') allerEtape('phrase');
  else if (etat.etape === 'securite') { etat.zone = null; allerEtape('zone'); }
  else if (etat.etape === 'muscle') { etat.zone = null; allerEtape('zone'); }
}

function choisirZone(z) {
  etat.zone = z;
  allerEtape('muscle');
}

function choisirMuscle(m) {
  etat.actif = m;
  const existant = etat.zones.get(m.id);
  etat.brouillon = existant
    ? { phrase: existant.phrase, sensation: existant.sensation, intensite: existant.intensite }
    : { phrase: '', sensation: null, intensite: null };
  allerEtape('phrase');
}

function modifierZone(id) {
  const m = parId[id];
  etat.zone = { vue: m.vue, moitie: moitieDe(m) };
  choisirMuscle(m);
}

// --- Bas de l'écran : zones déjà renseignées -------------------------------

function afficherZonesDeja() {
  if (etat.zones.size === 0) return;
  dock.hidden = false;
  dock.append(elt('p', 'titre-petit', 'Tes zones (touche-en une pour la modifier)'));
  const liste = elt('div', 'zones');
  for (const [id, z] of etat.zones) {
    const m = parId[id];
    const b = elt('button', 'zone', m.nomAffiche);
    b.type = 'button';
    b.append(elt('b', '', `${Math.round(z.intensite * 100)} %`));
    b.addEventListener('click', () => modifierZone(id));
    liste.append(b);
  }
  const suite = boutonContinuer();
  suite.addEventListener('click', () => allerEtape('securite'));
  dock.append(liste, suite);
}

// --- Bas de l'écran : la phrase ---------------------------------------------

function afficherPhrase() {
  const m = etat.actif;
  dock.append(elt('h2', '', m.nomAffiche), elt('p', 'region', REGIONS[m.region]));
  dock.append(elt('p', 'consigne',
    'Une phrase suffit. Par exemple : « Ça a commencé après une chute, ça tire le matin. »'));

  const champ = document.createElement('textarea');
  champ.maxLength = 220;
  champ.placeholder = 'Écris ici, avec tes mots…';
  champ.value = etat.brouillon.phrase;
  champ.setAttribute('aria-label', "D'où vient la douleur et comment est-elle apparue");
  dock.append(champ);

  dock.append(elt('p', 'titre-petit', 'Comment tu la ressens ? (facultatif)'));
  const liste = elt('div', 'liste-choix');
  const boutons = [];
  for (const [cle, libelle] of SENSATIONS) {
    const b = elt('button', 'choix' + (etat.brouillon.sensation === cle ? ' actif' : ''), libelle);
    b.type = 'button';
    b.addEventListener('click', () => {
      etat.brouillon.sensation = etat.brouillon.sensation === cle ? null : cle;
      boutons.forEach(x => x.classList.remove('actif'));
      if (etat.brouillon.sensation) b.classList.add('actif');
    });
    boutons.push(b);
    liste.append(b);
  }
  dock.append(liste);

  const valider = elt('button', 'bouton', 'Valider');
  valider.type = 'button';
  const majBouton = () => { valider.disabled = champ.value.trim().length < 3; };
  champ.addEventListener('input', () => { etat.brouillon.phrase = champ.value; majBouton(); });
  majBouton();
  valider.addEventListener('click', () => {
    etat.brouillon.phrase = champ.value.trim();
    allerEtape('intensite');
  });
  const passer = elt('button', 'lien', 'Passer cette étape');
  passer.type = 'button';
  passer.addEventListener('click', () => { etat.brouillon.phrase = ''; allerEtape('intensite'); });
  dock.append(valider, passer);
}

// --- Bas de l'écran : l'intensité -------------------------------------------

function motIntensite(p) {
  if (p < 20) return 'Gêne légère';
  if (p < 40) return 'Gênante';
  if (p < 60) return 'Douloureuse';
  if (p < 80) return 'Forte';
  return 'Très forte';
}

function afficherIntensite() {
  const m = etat.actif;
  dock.append(elt('h2', '', m.nomAffiche), elt('p', 'region', REGIONS[m.region]));

  let touche = etat.brouillon.intensite !== null;
  const ligne = elt('div', 'ligne-intensite');
  const sortie = elt('output', '', `${touche ? Math.round(etat.brouillon.intensite * 100) : 0} %`);
  sortie.style.opacity = touche ? '1' : '0.4';
  const mot = elt('span', 'mot', touche ? motIntensite(etat.brouillon.intensite * 100) : '');
  ligne.append(sortie, mot);
  dock.append(ligne);

  const curseur = document.createElement('input');
  curseur.type = 'range'; curseur.min = '0'; curseur.max = '100'; curseur.step = '1';
  curseur.value = touche ? String(Math.round(etat.brouillon.intensite * 100)) : '0';
  curseur.className = touche ? '' : 'neuf';
  curseur.setAttribute('aria-label', 'Intensité de la douleur, de 0 à 100 pour cent');
  dock.append(curseur);
  const echelle = elt('div', 'echelle');
  echelle.append(elt('span', '', 'Gêne légère'), elt('span', '', 'Insupportable'));
  dock.append(echelle);

  const suite = boutonContinuer();
  const ajouter = elt('button', 'lien', 'Ajouter une autre zone');
  ajouter.type = 'button';
  ajouter.hidden = !(etat.zones.size + (etat.zones.has(m.id) ? 0 : 1) < ZONES_MAX);

  const debloquer = () => {
    touche = true;
    etat.brouillon.intensite = Number(curseur.value) / 100;
    curseur.classList.remove('neuf');
    sortie.textContent = `${curseur.value} %`;
    sortie.style.opacity = '1';
    mot.textContent = motIntensite(Number(curseur.value));
    suite.disabled = false;
    ajouter.disabled = false;
  };
  curseur.addEventListener('input', debloquer);
  curseur.addEventListener('change', debloquer);
  suite.disabled = !touche;
  ajouter.disabled = !touche;

  ajouter.addEventListener('click', () => { enregistrer(); etat.zone = null; allerEtape('zone'); });
  suite.addEventListener('click', () => { enregistrer(); allerEtape('securite'); });
  dock.append(suite, ajouter);
}

// --- Bas de l'écran : les questions de sécurité -------------------------------

function questionOuiNon(titre, cle, invite, clePrecision, maj) {
  const s = etat.securite;
  const bloc = elt('div', 'question');
  bloc.append(elt('p', 'question-titre', titre));
  const rangee = elt('div', 'oui-non');
  let champ = null;
  if (invite) {
    champ = document.createElement('input');
    champ.type = 'text'; champ.className = 'precision'; champ.maxLength = 120;
    champ.placeholder = invite;
    champ.value = s[clePrecision];
    champ.hidden = s[cle] !== true;
    champ.addEventListener('input', () => { s[clePrecision] = champ.value; });
  }
  const boutons = [];
  for (const [valeur, libelle] of [[false, 'Non'], [true, 'Oui']]) {
    const b = elt('button', 'choix' + (s[cle] === valeur ? ' actif' : ''), libelle);
    b.type = 'button';
    b.addEventListener('click', () => {
      s[cle] = valeur;
      boutons.forEach(x => x.classList.remove('actif'));
      b.classList.add('actif');
      if (champ) champ.hidden = valeur !== true;
      maj();
    });
    boutons.push(b);
    rangee.append(b);
  }
  bloc.append(rangee);
  if (champ) bloc.append(champ);
  return bloc;
}

function afficherSecurite() {
  const s = etat.securite;
  const envoyer = boutonEnvoyer();
  const maj = () => { envoyer.disabled = s.allergie === null || s.grossesse === null || s.traitement === null; };
  dock.append(
    questionOuiNon('As-tu une allergie connue à un médicament ?', 'allergie', 'Laquelle ? (facultatif)', 'allergiePrecision', maj),
    questionOuiNon('Es-tu enceinte ou allaites-tu ?', 'grossesse', null, null, maj),
    questionOuiNon('Prends-tu déjà un traitement ? (même sans ordonnance)', 'traitement', 'Lequel ? (facultatif)', 'traitementPrecision', maj),
    envoyer,
  );
  maj();
  envoyer.addEventListener('click', () => envoyerBilan(envoyer));
}

function enregistrer() {
  etat.zones.set(etat.actif.id, {
    sensation: etat.brouillon.sensation,
    intensite: etat.brouillon.intensite,
    phrase: etat.brouillon.phrase,
  });
}

function boutonContinuer() {
  const b = elt('button', 'bouton', 'Continuer');
  b.type = 'button';
  return b;
}

function boutonEnvoyer() {
  const b = elt('button', 'bouton', 'Envoyer à mon kiné');
  b.type = 'button';
  return b;
}

// ---------------------------------------------------------------------------
// Écrans et boutons
// ---------------------------------------------------------------------------

function montrer(nom) {
  $('#ecran-intro').hidden = nom !== 'intro';
  $('#ecran-envoye').hidden = nom !== 'envoye';
}

if (prenom) $('#titre-intro').textContent = `Bonjour ${prenom}, avant ton premier rendez-vous`;

$('#bt-commencer').addEventListener('click', () => { montrer('corps'); allerEtape('zone'); });
$('#bt-retour').addEventListener('click', retour);
document.querySelectorAll('#vues button').forEach(b => b.addEventListener('click', () => changerVue(b.dataset.vue)));

// Le clavier du téléphone réduit l'espace visible : on suit la zone réellement visible.
if (window.visualViewport) {
  const app = $('#app');
  const ajuster = () => {
    app.style.height = `${window.visualViewport.height}px`;
    app.style.transform = `translateY(${window.visualViewport.offsetTop}px)`;
  };
  window.visualViewport.addEventListener('resize', ajuster);
  window.visualViewport.addEventListener('scroll', ajuster);
}

// ---------------------------------------------------------------------------
// Envoi
// ---------------------------------------------------------------------------

function base64Url(texte) {
  const octets = new TextEncoder().encode(texte);
  let bin = '';
  octets.forEach(o => { bin += String.fromCharCode(o); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function construireBilan() {
  return {
    v: 3,
    prenom: prenom || null,
    securite: {
      allergie: etat.securite.allergie === true,
      allergiePrecision: etat.securite.allergie ? etat.securite.allergiePrecision.trim() : '',
      grossesse: etat.securite.grossesse === true,
      traitement: etat.securite.traitement === true,
      traitementPrecision: etat.securite.traitement ? etat.securite.traitementPrecision.trim() : '',
    },
    plaintes: [...etat.zones.entries()].map(([muscle, z]) => ({
      muscle,
      partie: `${parId[muscle].vue}-${moitieDe(parId[muscle])}`,
      sensation: z.sensation,
      intensite: Math.round(z.intensite * 100) / 100,
      phrase: z.phrase,
    })),
  };
}

function envoyerBilan(bouton) {
  bouton.disabled = true;
  bouton.textContent = 'Envoi en cours…';
  const bilan = construireBilan();
  setTimeout(() => {
    $('#lien-retour').href = `kpuls://bilan?d=${base64Url(JSON.stringify(bilan))}`;
    if (modeDebug) {
      const debug = $('#debug');
      debug.hidden = false;
      debug.textContent = JSON.stringify(bilan, null, 2);
    }
    montrer('envoye');
  }, 900);
}

// Démarrage : l'accueil, la planche est déjà prête derrière.
construireCorps();
dessiner();
montrer('intro');
bulle.hidden = true;
dock.hidden = true;
