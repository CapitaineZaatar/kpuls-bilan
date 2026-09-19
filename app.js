// Le questionnaire de douleur de KPULS : le corps en 3D, la plainte zone par
// zone, l'origine de la douleur, puis l'envoi vers l'appli.

import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { construireCorps, MUSCLES, REGIONS } from './corps.js';

// ---------------------------------------------------------------------------
// Données du questionnaire
// ---------------------------------------------------------------------------

const SENSATIONS = [
  ['tire', 'Ça tire'], ['brule', 'Ça brûle'], ['lance', 'Ça lance'],
  ['transperce', 'Ça transperce'], ['raideur', 'Raideur'], ['fourmillements', 'Fourmillements'],
];
const ORIGINES = [
  ['chute', 'Une chute'], ['faux-mouvement', 'Un faux mouvement'], ['sport', 'Le sport'],
  ['travail', 'Le travail ou la posture'], ['progressif', "Ça s'est installé peu à peu"],
  ['inconnu', 'Je ne sais pas'],
];
const DEPUIS = [
  ['moins-1-semaine', "Moins d'une semaine"], ['1-4-semaines', '1 à 4 semaines'],
  ['1-3-mois', '1 à 3 mois'], ['plus-3-mois', 'Plus de 3 mois'],
];

const params = new URLSearchParams(location.search);
const prenom = (params.get('p') || '').trim().slice(0, 30);
const modeDebug = params.has('debug');

const etat = {
  vue: 'face',
  zones: new Map(),          // id du muscle -> { sensation, intensite }
  actif: null,               // muscle en cours d'édition
  origine: null,
  depuis: null,
};

const $ = (sel) => document.querySelector(sel);

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

const { corps, meshMuscles } = construireCorps();
scene.add(corps);

const CENTRE = new THREE.Vector3(0, 0.93, 0);
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

function distanceAjustee() {
  const demiFov = THREE.MathUtils.degToRad(camera.fov / 2);
  return 2.0 / (2 * Math.tan(demiFov));
}

function placerCamera(azimut, hauteur = 0.18, distance = distanceAjustee(), cible = CENTRE) {
  camera.position.set(
    cible.x + Math.sin(azimut) * distance,
    cible.y + hauteur * distance,
    cible.z + Math.cos(azimut) * distance,
  );
  controles.target.copy(cible);
  controles.update();
}
placerCamera(0);

let anim = null;
function animerVers(position, cible, duree = 650) {
  anim = {
    t0: performance.now(), duree,
    p0: camera.position.clone(), p1: position.clone(),
    c0: controles.target.clone(), c1: cible.clone(),
  };
}

function azimutCourant() {
  const d = camera.position.clone().sub(controles.target);
  return Math.atan2(d.x, d.z);
}

function versVue(vue) {
  etat.vue = vue;
  document.querySelectorAll('#vues button').forEach(b => b.classList.toggle('actif', b.dataset.vue === vue));
  fermerPlainte(false);
  const d = distanceAjustee();
  const a = vue === 'face' ? 0 : Math.PI;
  animerVers(new THREE.Vector3(Math.sin(a) * d, CENTRE.y + 0.18 * d, Math.cos(a) * d), CENTRE);
}

function vueDensemble() {
  const d = distanceAjustee();
  const a = azimutCourant();
  animerVers(new THREE.Vector3(Math.sin(a) * d, CENTRE.y + 0.18 * d, Math.cos(a) * d), CENTRE);
}

function focaliser(mesh) {
  const cible = new THREE.Vector3();
  mesh.getWorldPosition(cible);
  const normale = mesh.userData.normalLocale.clone()
    .applyQuaternion(mesh.parent.getWorldQuaternion(new THREE.Quaternion()));
  normale.y = 0;
  if (normale.lengthSq() < 1e-4) normale.set(0, 0, 1);
  normale.normalize();
  const d = 1.05;
  const position = cible.clone().addScaledVector(normale, d);
  position.y += 0.12;
  animerVers(position, cible);
}

// Adaptation à la taille de la zone d'affichage.
function redimensionner() {
  const w = zoneScene.clientWidth, h = zoneScene.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(redimensionner).observe(zoneScene);
redimensionner();

// Couleurs des muscles : neutre, ou dégradé selon l'intensité de la douleur.
const couleurFaible = new THREE.Color(0xffb3a8);
const couleurForte = new THREE.Color(0xff2d1f);

function rafraichirCouleurs() {
  for (const mesh of meshMuscles) {
    const id = mesh.userData.muscle.id;
    const zone = etat.zones.get(id);
    const mat = mesh.material;
    if (zone) {
      mat.color.copy(couleurFaible).lerp(couleurForte, zone.intensite);
      mat.emissive.copy(mat.color).multiplyScalar(0.35);
    } else {
      mat.color.copy(mesh.userData.couleur);
      mat.emissive.setRGB(0, 0, 0);
    }
    if (etat.actif && etat.actif.id === id) mat.emissive.setRGB(0.55, 0.55, 0.55);
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

  // Petite pulsation du muscle en cours d'édition.
  for (const mesh of meshMuscles) {
    const actif = etat.actif && etat.actif.id === mesh.userData.muscle.id;
    const f = actif ? 1.06 + 0.04 * Math.sin(maintenant / 220) : 1;
    mesh.scale.copy(mesh.userData.echelle).multiplyScalar(f);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(boucle);

// ---------------------------------------------------------------------------
// Choix d'un muscle au toucher
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

function toucher(cx, cy) {
  const r = toile.getBoundingClientRect();
  const x = cx - r.left, y = cy - r.top;
  const ndc = new THREE.Vector2((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1);
  rayon.setFromCamera(ndc, camera);

  // 1. Le muscle directement sous le doigt.
  const touches = rayon.intersectObjects([...meshMuscles, ...corps.children.flatMap(g => g.children.filter(c => !c.userData.muscle))], false);
  const premiere = touches[0];
  if (premiere && premiere.object.userData.muscle) {
    ouvrirPlainte(premiere.object.userData.muscle);
    return;
  }

  // 2. Sinon, le muscle visible le plus proche du doigt (tolérance d'un doigt).
  let meilleur = null, distMin = 34;
  const pos = new THREE.Vector3(), normale = new THREE.Vector3(), q = new THREE.Quaternion();
  for (const mesh of meshMuscles) {
    mesh.getWorldPosition(pos);
    normale.copy(mesh.userData.normalLocale).applyQuaternion(mesh.parent.getWorldQuaternion(q));
    const versCamera = camera.position.clone().sub(pos).normalize();
    if (normale.dot(versCamera) < 0.25) continue;
    const p = pos.clone().project(camera);
    const px = (p.x + 1) / 2 * r.width, py = (1 - p.y) / 2 * r.height;
    const dist = Math.hypot(px - x, py - y);
    if (dist < distMin) { distMin = dist; meilleur = mesh.userData.muscle; }
  }
  if (meilleur) ouvrirPlainte(meilleur);
}

// ---------------------------------------------------------------------------
// Bas de l'écran : liste des zones, ou saisie d'une plainte
// ---------------------------------------------------------------------------

const dock = $('#dock');

function elt(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

function afficherZones() {
  dock.replaceChildren();
  const titre = elt('p', 'titre-petit', 'Tes zones');
  dock.append(titre);

  if (etat.zones.size === 0) {
    dock.append(elt('p', 'vide', "Aucune zone pour l'instant. Touche un muscle pour commencer."));
  } else {
    const liste = elt('div', 'zones');
    const triees = [...etat.zones.entries()].sort((a, b) => b[1].intensite - a[1].intensite);
    for (const [id, z] of triees) {
      const m = MUSCLES.find(x => x.id === id);
      const b = elt('button', 'zone', m.nomAffiche);
      b.type = 'button';
      b.append(elt('b', '', `${Math.round(z.intensite * 100)} %`));
      b.addEventListener('click', () => { ouvrirPlainte(m); });
      liste.append(b);
    }
    dock.append(liste);
  }

  const suite = elt('button', 'bouton', 'Continuer');
  suite.type = 'button';
  suite.disabled = etat.zones.size === 0;
  suite.addEventListener('click', () => montrer('origine'));
  dock.append(suite);
}

function ouvrirPlainte(m) {
  etat.actif = m;
  const existant = etat.zones.get(m.id);
  let sensation = existant?.sensation ?? 'tire';
  let intensite = existant?.intensite ?? 0.5;

  dock.replaceChildren();
  dock.append(elt('h2', '', m.nomAffiche));
  dock.append(elt('p', 'region', REGIONS[m.region]));

  dock.append(elt('p', 'titre-petit', "Qu'est-ce que tu ressens ?"));
  const grille = elt('div', 'grille');
  const boutons = [];
  for (const [cle, libelle] of SENSATIONS) {
    const b = elt('button', 'choix' + (cle === sensation ? ' actif' : ''), libelle);
    b.type = 'button';
    b.addEventListener('click', () => {
      sensation = cle;
      boutons.forEach(x => x.classList.toggle('actif', x === b));
    });
    boutons.push(b);
    grille.append(b);
  }
  dock.append(grille);

  const ligne = elt('div', 'ligne-intensite');
  ligne.append(elt('p', 'titre-petit', 'Intensité'));
  const sortie = elt('output', '', `${Math.round(intensite * 100)} %`);
  ligne.append(sortie);
  dock.append(ligne);
  const curseur = document.createElement('input');
  curseur.type = 'range'; curseur.min = '0'; curseur.max = '100'; curseur.step = '1';
  curseur.value = String(Math.round(intensite * 100));
  curseur.setAttribute('aria-label', 'Intensité de la douleur');
  curseur.addEventListener('input', () => {
    intensite = Number(curseur.value) / 100;
    sortie.textContent = `${curseur.value} %`;
  });
  dock.append(curseur);
  const echelle = elt('div', 'echelle');
  echelle.append(elt('span', '', 'Gêne légère'), elt('span', '', 'Insupportable'));
  dock.append(echelle);

  const rangee = elt('div', 'boutons');
  if (existant) {
    const retirer = elt('button', 'bouton contour', 'Retirer');
    retirer.type = 'button';
    retirer.addEventListener('click', () => { etat.zones.delete(m.id); fermerPlainte(true); });
    rangee.append(retirer);
  } else {
    const annuler = elt('button', 'bouton contour', 'Annuler');
    annuler.type = 'button';
    annuler.addEventListener('click', () => fermerPlainte(true));
    rangee.append(annuler);
  }
  const valider = elt('button', 'bouton', 'Valider');
  valider.type = 'button';
  valider.addEventListener('click', () => {
    etat.zones.set(m.id, { sensation, intensite });
    fermerPlainte(true);
  });
  rangee.append(valider);
  dock.append(rangee);

  rafraichirCouleurs();
  $('#astuce').style.opacity = '0';
  // La zone d'affichage rétrécit : on attend un instant, puis on cadre le muscle.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    redimensionner();
    const mesh = meshMuscles.find(x => x.userData.muscle.id === m.id);
    if (mesh) focaliser(mesh);
  }));
}

function fermerPlainte(recadrer) {
  etat.actif = null;
  afficherZones();
  rafraichirCouleurs();
  if (recadrer) requestAnimationFrame(() => requestAnimationFrame(() => { redimensionner(); vueDensemble(); }));
}

// ---------------------------------------------------------------------------
// Écrans
// ---------------------------------------------------------------------------

function montrer(nom) {
  $('#ecran-intro').hidden = nom !== 'intro';
  $('#ecran-origine').hidden = nom !== 'origine';
  $('#ecran-envoye').hidden = nom !== 'envoye';
  if (nom === 'origine') majBoutonEnvoi();
}

if (prenom) $('#titre-intro').textContent = `Bonjour ${prenom}, avant ton premier rendez-vous`;

$('#bt-commencer').addEventListener('click', () => montrer('corps'));
$('#bt-retour-corps').addEventListener('click', () => montrer('corps'));
document.querySelectorAll('#vues button').forEach(b => b.addEventListener('click', () => versVue(b.dataset.vue)));

function remplirChoix(conteneur, liste, cle) {
  const boutons = [];
  for (const [valeur, libelle] of liste) {
    const b = elt('button', 'choix', libelle);
    b.type = 'button';
    b.addEventListener('click', () => {
      etat[cle] = valeur;
      boutons.forEach(x => x.classList.toggle('actif', x === b));
      majBoutonEnvoi();
    });
    boutons.push(b);
    conteneur.append(b);
  }
}
remplirChoix($('#liste-origine'), ORIGINES, 'origine');
remplirChoix($('#liste-depuis'), DEPUIS, 'depuis');

function majBoutonEnvoi() {
  $('#bt-envoyer').disabled = !(etat.origine && etat.depuis && etat.zones.size > 0);
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
    v: 1,
    prenom: prenom || null,
    origine: etat.origine,
    depuis: etat.depuis,
    note: $('#note').value.trim(),
    plaintes: [...etat.zones.entries()].map(([muscle, z]) => ({
      muscle, sensation: z.sensation, intensite: Math.round(z.intensite * 100) / 100,
    })),
  };
}

$('#bt-envoyer').addEventListener('click', () => {
  const bouton = $('#bt-envoyer');
  bouton.disabled = true;
  bouton.textContent = 'Envoi en cours…';
  const bilan = construireBilan();
  setTimeout(() => {
    const charge = base64Url(JSON.stringify(bilan));
    $('#lien-retour').href = `kpuls://bilan?d=${charge}`;
    if (modeDebug) {
      const debug = $('#debug');
      debug.hidden = false;
      debug.textContent = JSON.stringify(bilan, null, 2);
    }
    bouton.textContent = 'Envoyer à mon kiné';
    montrer('envoye');
  }, 900);
});

// Démarrage : on montre l'accueil, le corps est déjà prêt derrière.
montrer('intro');
afficherZones();
rafraichirCouleurs();
