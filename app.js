// Le questionnaire de douleur de KPULS, en parcours guidé.
//
// Une seule question à l'écran à la fois, pour que le patient se sente accompagné :
//   1. la partie du corps (face ou dos, haut ou bas)
//   2. le muscle, une fois la zone agrandie
//   3. une phrase pour dire d'où vient la douleur et comment elle est apparue
//   4. l'intensité, en pourcentage, puis l'envoi

import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { construireCorps, MUSCLES, REGIONS } from './corps.js';

// ---------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------

const SENSATIONS = [
  ['tire', 'Ça tire'], ['brule', 'Ça brûle'], ['lance', 'Ça lance'],
  ['transperce', 'Ça transperce'], ['raideur', 'Raideur'], ['fourmillements', 'Fourmillements'],
];
const NOMS_PARTIE = {
  'face-haut': 'Face, haut du corps', 'face-bas': 'Face, bas du corps',
  'dos-haut': 'Dos, haut du corps', 'dos-bas': 'Dos, bas du corps',
};
const ETAPES = ['zone', 'muscle', 'phrase', 'intensite'];
const TITRES = {
  zone: 'Où as-tu mal ?', muscle: 'Quel muscle ?',
  phrase: 'Raconte-nous', intensite: 'Ta douleur',
};
const ZONES_MAX = 3;
const SEUIL_HAUT_BAS = 1.0;   // hauteur du corps (en mètres) qui sépare le haut du bas

const params = new URLSearchParams(location.search);
const prenom = (params.get('p') || '').trim().slice(0, 30);
const modeDebug = params.has('debug');

const etat = {
  etape: 'zone',
  zone: null,            // { vue, moitie } de la partie du corps choisie
  actif: null,           // muscle en cours de saisie
  brouillon: null,       // { phrase, sensation, intensite }
  zones: new Map(),      // id du muscle -> { sensation, intensite, phrase, vue, moitie }
};

const $ = (sel) => document.querySelector(sel);
function elt(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

// ---------------------------------------------------------------------------
// Scène 3D
// ---------------------------------------------------------------------------

const zoneScene = $('#scene');
const toile = $('#toile');
const renderer = new THREE.WebGLRenderer({ canvas: toile, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3f57, 1.05));
const lumiere = new THREE.DirectionalLight(0xffffff, 1.35);
lumiere.position.set(0.6, 0.9, 1);
camera.add(lumiere);

const { corps, meshMuscles, parties } = construireCorps();
scene.add(corps);

// Chaque muscle sait dans quelle moitié du corps il se trouve.
{
  const p = new THREE.Vector3();
  for (const mesh of meshMuscles) {
    mesh.getWorldPosition(p);
    mesh.userData.moitie = p.y >= SEUIL_HAUT_BAS ? 'haut' : 'bas';
    mesh.visible = false;
  }
}

const CENTRE = new THREE.Vector3(0, 1.0, 0);
const controles = new OrbitControls(camera, toile);
controles.enableDamping = true;
controles.dampingFactor = 0.09;
controles.rotateSpeed = 0.9;
controles.minDistance = 0.7;
controles.maxDistance = 4.6;
controles.minPolarAngle = 0.55;
controles.maxPolarAngle = 2.0;
controles.screenSpacePanning = true;
controles.target.copy(CENTRE);

const TAN_DEMI_FOV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

function distanceEnsemble() {
  return Math.max(2.1 / (2 * TAN_DEMI_FOV), 0.95 / (2 * TAN_DEMI_FOV * camera.aspect));
}

function positionCamera(azimut, cible, distance, hauteur = 0.16) {
  return new THREE.Vector3(
    cible.x + Math.sin(azimut) * distance,
    cible.y + hauteur * distance,
    cible.z + Math.cos(azimut) * distance,
  );
}

camera.position.copy(positionCamera(0, CENTRE, distanceEnsemble()));
controles.update();

let anim = null;
function animerVers(position, cible, duree = 700) {
  anim = {
    t0: performance.now(), duree,
    p0: camera.position.clone(), p1: position.clone(),
    c0: controles.target.clone(), c1: cible.clone(),
  };
}

function vueCourante() {
  const d = camera.position.clone().sub(controles.target);
  return d.z >= 0 ? 'face' : 'dos';
}

function surlignerVue(vue) {
  document.querySelectorAll('#vues button').forEach(b => b.classList.toggle('actif', b.dataset.vue === vue));
}

function vueDensemble(vue = vueCourante()) {
  surlignerVue(vue);
  const a = vue === 'face' ? 0 : Math.PI;
  animerVers(positionCamera(a, CENTRE, distanceEnsemble()), CENTRE);
}

// Agrandit la partie du corps choisie pour que les muscles se distinguent.
function cadrerZone(z) {
  const haut = z.moitie === 'haut';
  const hauteur = haut ? 0.74 : 1.0;
  const largeur = haut ? 0.84 : 0.56;
  const d = Math.max(hauteur / (2 * TAN_DEMI_FOV), largeur / (2 * TAN_DEMI_FOV * camera.aspect));
  const cible = new THREE.Vector3(0, haut ? 1.27 : 0.52, 0);
  animerVers(positionCamera(z.vue === 'face' ? 0 : Math.PI, cible, d), cible);
}

// Rapproche la caméra d'un muscle, en le tournant vers l'écran.
function focaliser(mesh) {
  const cible = new THREE.Vector3();
  mesh.getWorldPosition(cible);
  const normale = mesh.userData.normalLocale.clone()
    .applyQuaternion(mesh.parent.getWorldQuaternion(new THREE.Quaternion()));
  normale.y = 0;
  if (normale.lengthSq() < 1e-4) normale.set(0, 0, 1);
  normale.normalize();
  const position = cible.clone().addScaledVector(normale, 1.05);
  position.y += 0.12;
  animerVers(position, cible);
}

function redimensionner() {
  const w = zoneScene.clientWidth, h = zoneScene.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(redimensionner).observe(zoneScene);
redimensionner();

// L'affichage se réorganise quand le bas de l'écran apparaît : on attend un instant.
function apresMiseEnPage(fn) {
  requestAnimationFrame(() => requestAnimationFrame(() => { redimensionner(); fn(); }));
}

// Couleurs des muscles : neutre, ou dégradé selon l'intensité de la douleur.
const couleurFaible = new THREE.Color(0xffb3a8);
const couleurForte = new THREE.Color(0xff2d1f);

function rafraichirCouleurs() {
  for (const mesh of meshMuscles) {
    const id = mesh.userData.muscle.id;
    const zone = etat.zones.get(id);
    const mat = mesh.material;
    let intensite = zone ? zone.intensite : null;
    if (etat.actif && etat.actif.id === id && etat.brouillon && etat.brouillon.intensite !== null) {
      intensite = etat.brouillon.intensite;
    }
    if (intensite !== null) {
      mat.color.copy(couleurFaible).lerp(couleurForte, intensite);
      mat.emissive.copy(mat.color).multiplyScalar(0.35);
    } else {
      mat.color.copy(mesh.userData.couleur);
      mat.emissive.setRGB(0, 0, 0);
    }
    if (etat.actif && etat.actif.id === id) mat.emissive.setRGB(0.55, 0.55, 0.55);
  }
}

// Les muscles n'apparaissent qu'une fois la partie du corps choisie.
function majVisibilite() {
  const enDetail = etat.etape !== 'zone' && etat.zone;
  for (const mesh of meshMuscles) {
    const m = mesh.userData.muscle;
    const dansZone = enDetail && m.vue === etat.zone.vue && mesh.userData.moitie === etat.zone.moitie;
    mesh.visible = Boolean(etat.zones.has(m.id) || dansZone || (etat.actif && etat.actif.id === m.id));
  }
}

function boucle(maintenant) {
  requestAnimationFrame(boucle);
  if (anim) {
    const k = Math.min(1, (maintenant - anim.t0) / anim.duree);
    const e = 1 - Math.pow(1 - k, 3);
    camera.position.lerpVectors(anim.p0, anim.p1, e);
    controles.target.lerpVectors(anim.c0, anim.c1, e);
    if (k >= 1) anim = null;
  }
  controles.update();

  for (const mesh of meshMuscles) {
    if (!mesh.visible) continue;
    const actif = etat.actif && etat.actif.id === mesh.userData.muscle.id;
    const f = actif ? 1.06 + 0.04 * Math.sin(maintenant / 220) : 1;
    mesh.scale.copy(mesh.userData.echelle).multiplyScalar(f);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(boucle);

// ---------------------------------------------------------------------------
// Toucher le corps
// ---------------------------------------------------------------------------

const rayon = new THREE.Raycaster();
const pointeurs = new Set();
let debut = null;

toile.addEventListener('pointerdown', (e) => {
  pointeurs.add(e.pointerId);
  debut = pointeurs.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
});
toile.addEventListener('pointerup', (e) => {
  pointeurs.delete(e.pointerId);
  if (!debut) return;
  const d = Math.hypot(e.clientX - debut.x, e.clientY - debut.y);
  const duree = performance.now() - debut.t;
  debut = null;
  if (d < 9 && duree < 600) toucher(e.clientX, e.clientY);
});
toile.addEventListener('pointercancel', (e) => { pointeurs.delete(e.pointerId); debut = null; });

function pointeRayon(cx, cy) {
  const r = toile.getBoundingClientRect();
  const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  rayon.setFromCamera(ndc, camera);
  return r;
}

// Le muscle visible le plus proche du doigt, avec une tolérance d'un doigt.
function muscleProche(cx, cy, candidats, tolerance = 34) {
  const r = toile.getBoundingClientRect();
  const x = cx - r.left, y = cy - r.top;
  let meilleur = null, distMin = tolerance;
  const pos = new THREE.Vector3(), normale = new THREE.Vector3(), q = new THREE.Quaternion();
  for (const mesh of candidats) {
    mesh.getWorldPosition(pos);
    normale.copy(mesh.userData.normalLocale).applyQuaternion(mesh.parent.getWorldQuaternion(q));
    if (normale.dot(camera.position.clone().sub(pos).normalize()) < 0.25) continue;
    const p = pos.clone().project(camera);
    const dist = Math.hypot((p.x + 1) / 2 * r.width - x, (1 - p.y) / 2 * r.height - y);
    if (dist < distMin) { distMin = dist; meilleur = mesh.userData.muscle; }
  }
  return meilleur;
}

function toucher(cx, cy) {
  pointeRayon(cx, cy);

  if (etat.etape === 'zone') {
    // Une zone déjà renseignée se rouvre en la touchant.
    const deja = meshMuscles.filter(m => m.visible);
    const touchesM = rayon.intersectObjects(deja, false);
    if (touchesM[0]) { modifierZone(touchesM[0].object.userData.muscle.id); return; }
    // Sinon, on regarde où le doigt a touché le corps : haut ou bas, face ou dos.
    const touchesC = rayon.intersectObjects(parties, false);
    if (!touchesC[0]) return;
    choisirZone({
      vue: vueCourante(),
      moitie: touchesC[0].point.y >= SEUIL_HAUT_BAS ? 'haut' : 'bas',
    });
    return;
  }

  if (etat.etape === 'muscle') {
    const candidats = meshMuscles.filter(m => m.visible);
    const directs = rayon.intersectObjects(candidats, false);
    const muscle = directs[0] ? directs[0].object.userData.muscle : muscleProche(cx, cy, candidats);
    if (muscle) choisirMuscle(muscle);
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
      : 'Tu peux ajouter une autre zone, ou envoyer ton bilan.',
      etat.zones.size === 0 ? 'Tu peux le tourner du doigt, ou choisir Face ou Dos.' : null);
    afficherZonesDeja();
    majVisibilite();
    rafraichirCouleurs();
    apresMiseEnPage(() => vueDensemble());
    return;
  }

  if (nom === 'muscle') {
    etat.actif = null;
    etat.brouillon = null;
    dire('Peux-tu être plus précis ? Touche le muscle qui te fait mal.',
      'Si tu te trompes, la flèche en haut te ramène en arrière.');
    majVisibilite();
    rafraichirCouleurs();
    apresMiseEnPage(() => cadrerZone(etat.zone));
    return;
  }

  if (nom === 'phrase') {
    dire("Dis-nous en une phrase d'où ça vient et comment c'est apparu.");
    afficherPhrase();
  } else if (nom === 'intensite') {
    dire('Dernière étape : à combien évalues-tu ta douleur ?', 'Fais glisser le curseur.');
    afficherIntensite();
  }
  dock.hidden = false;
  majVisibilite();
  rafraichirCouleurs();
  const mesh = meshMuscles.find(x => x.userData.muscle.id === etat.actif.id);
  apresMiseEnPage(() => { if (mesh) focaliser(mesh); });
}

function retour() {
  if (etat.etape === 'phrase') allerEtape('muscle');
  else if (etat.etape === 'intensite') allerEtape('phrase');
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
  const zone = etat.zones.get(id);
  const m = MUSCLES.find(x => x.id === id);
  etat.zone = { vue: zone.vue, moitie: zone.moitie };
  choisirMuscle(m);
}

// --- Bas de l'écran : zones déjà renseignées -------------------------------

function afficherZonesDeja() {
  if (etat.zones.size === 0) return;
  dock.hidden = false;
  dock.append(elt('p', 'titre-petit', 'Tes zones (touche-en une pour la modifier)'));
  const liste = elt('div', 'zones');
  for (const [id, z] of etat.zones) {
    const m = MUSCLES.find(x => x.id === id);
    const b = elt('button', 'zone', m.nomAffiche);
    b.type = 'button';
    b.append(elt('b', '', `${Math.round(z.intensite * 100)} %`));
    b.addEventListener('click', () => modifierZone(id));
    liste.append(b);
  }
  const envoyer = boutonEnvoyer();
  envoyer.addEventListener('click', () => envoyerBilan(envoyer));
  dock.append(liste, envoyer);
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

  const envoyer = boutonEnvoyer();
  const ajouter = elt('button', 'lien', 'Ajouter une autre zone');
  ajouter.type = 'button';
  const peutAjouter = etat.zones.size + (etat.zones.has(m.id) ? 0 : 1) < ZONES_MAX;
  ajouter.hidden = !peutAjouter;

  const debloquer = () => {
    touche = true;
    etat.brouillon.intensite = Number(curseur.value) / 100;
    curseur.classList.remove('neuf');
    sortie.textContent = `${curseur.value} %`;
    sortie.style.opacity = '1';
    mot.textContent = motIntensite(Number(curseur.value));
    envoyer.disabled = false;
    ajouter.disabled = false;
    rafraichirCouleurs();
  };
  curseur.addEventListener('input', debloquer);
  curseur.addEventListener('change', debloquer);
  envoyer.disabled = !touche;
  ajouter.disabled = !touche;

  ajouter.addEventListener('click', () => { enregistrer(); etat.zone = null; allerEtape('zone'); });
  envoyer.addEventListener('click', () => { enregistrer(); envoyerBilan(envoyer); });
  dock.append(envoyer, ajouter);
}

function enregistrer() {
  etat.zones.set(etat.actif.id, {
    sensation: etat.brouillon.sensation,
    intensite: etat.brouillon.intensite,
    phrase: etat.brouillon.phrase,
    vue: etat.zone.vue,
    moitie: etat.zone.moitie,
  });
}

function boutonEnvoyer() {
  const b = elt('button', 'bouton', 'Envoyer à mon kiné');
  b.type = 'button';
  b.style.width = '100%';
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
document.querySelectorAll('#vues button').forEach(b => b.addEventListener('click', () => vueDensemble(b.dataset.vue)));

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
    v: 2,
    prenom: prenom || null,
    plaintes: [...etat.zones.entries()].map(([muscle, z]) => ({
      muscle,
      partie: `${z.vue}-${z.moitie}`,
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

// Démarrage : l'accueil, le corps est déjà prêt derrière.
montrer('intro');
bulle.hidden = true;
dock.hidden = true;
