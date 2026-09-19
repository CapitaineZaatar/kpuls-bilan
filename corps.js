// Le corps en 3D de KPULS.
//
// Le catalogue des muscles reprend exactement celui de l'application
// (CorpsAnatomique.swift) : mêmes noms, mêmes régions, mêmes identifiants.
// Un bilan rempli ici peut donc être relu tel quel dans l'appli.
//
// Le corps est dessiné à la main, à partir de formes simples : c'est un modèle
// stylisé, pas une reproduction médicale. Il pourra être remplacé par un modèle
// anatomique complet sans toucher au catalogue ni au reste de la page.
//
// Repère : y vers le haut (pieds à 0, tête vers 1,75 m), le patient regarde vers
// +z. Vu de face, le côté gauche du patient est à droite de l'écran (x positif).

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const REGIONS = {
  nuque: 'Nuque', epaule: 'Épaule', bras: 'Bras', avantBras: 'Avant-bras',
  thorax: 'Thorax', abdomen: 'Abdomen', hautDuDos: 'Haut du dos',
  lombaires: 'Lombaires', bassin: 'Bassin', cuisse: 'Cuisse', jambe: 'Jambe',
};

// Position de chaque muscle sur son segment de corps.
//   part   segment porteur
//   u      position le long du segment, 0 = haut, 1 = bas
//   th     angle autour du segment, en degrés, pour le côté gauche du patient
//          (90 = devant, 270 = derrière, 0 = vers l'extérieur gauche)
//   dx     largeur, dy longueur, dz épaisseur de la forme du muscle (en mètres)
//   lean   inclinaison des fibres, en degrés
// Le côté droit est le miroir du côté gauche.
const DEFS = [
  // ---------------- FACE ----------------
  { base: "sterno-cléido-mastoïdien", court: "cou", vue: "face", region: "nuque",
    part: "cou", u: 0.5, th: 58, dx: 0.018, dy: 0.075, dz: 0.016, lean: 32 },
  { base: "deltoïde antérieur", court: "épaule", vue: "face", region: "epaule",
    part: "bras", u: 0.12, th: 55, dx: 0.04, dy: 0.075, dz: 0.03, lean: 0 },
  { base: "grand pectoral", court: "pectoral", vue: "face", region: "thorax",
    part: "torse", u: 0.268, th: 52, dx: 0.075, dy: 0.06, dz: 0.035, lean: 20 },
  { base: "biceps brachial", court: "biceps", vue: "face", region: "bras",
    part: "bras", u: 0.5, th: 90, dx: 0.03, dy: 0.11, dz: 0.028, lean: 0 },
  { base: "brachial antérieur", court: "bras", vue: "face", region: "bras",
    part: "bras", u: 0.8, th: 110, dx: 0.026, dy: 0.06, dz: 0.022, lean: 0 },
  { base: "brachio-radial", court: "avant-bras", vue: "face", region: "avantBras",
    part: "avantBras", u: 0.2, th: 45, dx: 0.022, dy: 0.09, dz: 0.02, lean: 0 },
  { base: "fléchisseurs de l'avant-bras", court: "avant-bras", vue: "face", region: "avantBras",
    part: "avantBras", u: 0.4, th: 115, dx: 0.03, dy: 0.11, dz: 0.022, lean: 0 },
  { base: "grand droit de l'abdomen", court: "abdominaux", vue: "face", region: "abdomen",
    part: "torse", u: 0.589, th: 90, dx: 0.075, dy: 0.15, dz: 0.03, lean: 0, axial: true },
  { base: "oblique externe", court: "oblique", vue: "face", region: "abdomen",
    part: "torse", u: 0.536, th: 28, dx: 0.07, dy: 0.10, dz: 0.028, lean: 25 },
  { base: "tenseur du fascia lata", court: "hanche", vue: "face", region: "bassin",
    part: "cuisse", u: 0.06, th: 30, dx: 0.035, dy: 0.07, dz: 0.03, lean: 0 },
  { base: "sartorius", court: "couturier", vue: "face", region: "cuisse",
    part: "cuisse", u: 0.45, th: 80, dx: 0.017, dy: 0.27, dz: 0.016, lean: 30 },
  { base: "droit fémoral", court: "quadriceps", vue: "face", region: "cuisse",
    part: "cuisse", u: 0.42, th: 90, dx: 0.038, dy: 0.22, dz: 0.03, lean: 0 },
  { base: "vaste externe", court: "quadriceps", vue: "face", region: "cuisse",
    part: "cuisse", u: 0.55, th: 42, dx: 0.035, dy: 0.2, dz: 0.03, lean: 0 },
  { base: "vaste interne", court: "quadriceps", vue: "face", region: "cuisse",
    part: "cuisse", u: 0.78, th: 128, dx: 0.03, dy: 0.11, dz: 0.03, lean: 0 },
  { base: "adducteurs", court: "adducteurs", vue: "face", region: "cuisse",
    part: "cuisse", u: 0.3, th: 152, dx: 0.035, dy: 0.17, dz: 0.028, lean: 0 },
  { base: "tibial antérieur", court: "tibia", vue: "face", region: "jambe",
    part: "jambe", u: 0.3, th: 75, dx: 0.022, dy: 0.17, dz: 0.018, lean: 0 },
  { base: "long fibulaire", court: "péronier", vue: "face", region: "jambe",
    part: "jambe", u: 0.3, th: 20, dx: 0.02, dy: 0.16, dz: 0.018, lean: 0 },
  { base: "gastrocnémien", court: "mollet", vue: "face", region: "jambe",
    part: "jambe", u: 0.2, th: 158, dx: 0.03, dy: 0.12, dz: 0.022, lean: 0 },

  // ---------------- DOS ----------------
  { base: "trapèze supérieur", court: "trapèze", vue: "dos", region: "nuque",
    part: "torse", u: 0.107, th: 310, dx: 0.085, dy: 0.05, dz: 0.03, lean: -25 },
  { base: "trapèze moyen", court: "trapèze", vue: "dos", region: "hautDuDos",
    part: "torse", u: 0.268, th: 288, dx: 0.1, dy: 0.05, dz: 0.028, lean: 0 },
  { base: "trapèze inférieur", court: "trapèze", vue: "dos", region: "hautDuDos",
    part: "torse", u: 0.464, th: 282, dx: 0.05, dy: 0.12, dz: 0.026, lean: -15 },
  { base: "deltoïde postérieur", court: "épaule", vue: "dos", region: "epaule",
    part: "bras", u: 0.12, th: 310, dx: 0.04, dy: 0.07, dz: 0.03, lean: 0 },
  { base: "infra-épineux", court: "omoplate", vue: "dos", region: "hautDuDos",
    part: "torse", u: 0.30, th: 322, dx: 0.06, dy: 0.05, dz: 0.024, lean: 0 },
  { base: "grand rond", court: "omoplate", vue: "dos", region: "hautDuDos",
    part: "torse", u: 0.43, th: 338, dx: 0.05, dy: 0.04, dz: 0.024, lean: 30 },
  { base: "rhomboïdes", court: "omoplates", vue: "dos", region: "hautDuDos",
    part: "torse", u: 0.286, th: 278, dx: 0.04, dy: 0.08, dz: 0.022, lean: 20 },
  { base: "grand dorsal", court: "dorsaux", vue: "dos", region: "hautDuDos",
    part: "torse", u: 0.571, th: 315, dx: 0.085, dy: 0.17, dz: 0.03, lean: -30 },
  { base: "triceps brachial", court: "triceps", vue: "dos", region: "bras",
    part: "bras", u: 0.45, th: 270, dx: 0.035, dy: 0.12, dz: 0.03, lean: 0 },
  { base: "extenseurs de l'avant-bras", court: "avant-bras", vue: "dos", region: "avantBras",
    part: "avantBras", u: 0.35, th: 270, dx: 0.03, dy: 0.11, dz: 0.02, lean: 0 },
  { base: "érecteurs du rachis", court: "colonne", vue: "dos", region: "lombaires",
    part: "torse", u: 0.732, th: 280, dx: 0.03, dy: 0.2, dz: 0.03, lean: 0 },
  { base: "carré des lombes", court: "lombaires", vue: "dos", region: "lombaires",
    part: "torse", u: 0.786, th: 300, dx: 0.04, dy: 0.08, dz: 0.022, lean: 0 },
  { base: "moyen fessier", court: "fessier", vue: "dos", region: "bassin",
    part: "torse", u: 0.875, th: 332, dx: 0.06, dy: 0.06, dz: 0.028, lean: 0 },
  { base: "grand fessier", court: "fessier", vue: "dos", region: "bassin",
    part: "cuisse", u: 0.04, th: 285, dx: 0.085, dy: 0.085, dz: 0.05, lean: 0 },
  { base: "biceps fémoral", court: "ischio-jambiers", vue: "dos", region: "cuisse",
    part: "cuisse", u: 0.5, th: 305, dx: 0.03, dy: 0.25, dz: 0.028, lean: 0 },
  { base: "semi-tendineux", court: "ischio-jambiers", vue: "dos", region: "cuisse",
    part: "cuisse", u: 0.5, th: 235, dx: 0.03, dy: 0.25, dz: 0.028, lean: 0 },
  { base: "gastrocnémien", court: "mollet", vue: "dos", region: "jambe",
    part: "jambe", u: 0.2, th: 270, dx: 0.05, dy: 0.14, dz: 0.035, lean: 0 },
  { base: "soléaire", court: "mollet", vue: "dos", region: "jambe",
    part: "jambe", u: 0.55, th: 295, dx: 0.035, dy: 0.12, dz: 0.022, lean: 0 },
];

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/'/g, '').replace(/ /g, '-');
}

function capitaliser(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Liste à plat : un élément par muscle et par côté, avec l'identifiant de l'appli.
export const MUSCLES = [];
for (const d of DEFS) {
  const racine = `${slug(d.base)}-${d.vue}`;
  if (d.axial) {
    MUSCLES.push({ ...d, id: `${racine}-a`, cote: 'axial', nom: d.base });
  } else {
    // s = +1 : côté gauche du patient (x positif) ; s = -1 : côté droit.
    MUSCLES.push({ ...d, id: `${racine}-g`, cote: 'gauche', s: 1, nom: `${d.base} gauche` });
    MUSCLES.push({ ...d, id: `${racine}-d`, cote: 'droite', s: -1, nom: `${d.base} droite` });
  }
}
for (const m of MUSCLES) m.nomAffiche = capitaliser(m.nom);

export const parId = Object.fromEntries(MUSCLES.map(m => [m.id, m]));

// ---------------------------------------------------------------------------
// Segments du corps
// ---------------------------------------------------------------------------

// Chaque segment est un solide de section elliptique, décrit par un profil
// [u, demi-largeur, demi-profondeur] de haut (u = 0) en bas (u = 1).
function segment(haut, bas, profil) {
  return { haut: new THREE.Vector3(...haut), bas: new THREE.Vector3(...bas), profil };
}

function interpolerProfil(profil, u) {
  for (let i = 0; i < profil.length - 1; i++) {
    const [u0, a0, b0] = profil[i];
    const [u1, a1, b1] = profil[i + 1];
    if (u >= u0 && u <= u1) {
      const k = (u1 === u0) ? 0 : (u - u0) / (u1 - u0);
      const c = (1 - Math.cos(k * Math.PI)) / 2;
      return [a0 + (a1 - a0) * c, b0 + (b1 - b0) * c];
    }
  }
  const dernier = profil[profil.length - 1];
  return [dernier[1], dernier[2]];
}

function geometrieSegment(seg, L) {
  const N = 40, M = 36;
  const positions = [], indices = [];
  const bord = 0.07;
  for (let i = 0; i <= N; i++) {
    const u = 0.5 - 0.5 * Math.cos(Math.PI * i / N);
    let [a, b] = interpolerProfil(seg.profil, u);
    let c = 1;
    if (u < bord) c = Math.sqrt(Math.max(0, 1 - Math.pow((bord - u) / bord, 2)));
    else if (u > 1 - bord) c = Math.sqrt(Math.max(0, 1 - Math.pow((u - (1 - bord)) / bord, 2)));
    a *= c; b *= c;
    const y = (1 - u) * L;
    for (let j = 0; j < M; j++) {
      const phi = (j / M) * Math.PI * 2;
      positions.push(a * Math.cos(phi), y, b * Math.sin(phi));
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * M + j, b = i * M + (j + 1) % M;
      const c = (i + 1) * M + j, d = (i + 1) * M + (j + 1) % M;
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}


function definitionsSegments(s) {
  return {
    torse: segment([0, 1.46, 0], [0, 0.90, 0], [
      [0.00, 0.070, 0.060], [0.07, 0.140, 0.085], [0.11, 0.195, 0.105],
      [0.29, 0.200, 0.120], [0.46, 0.175, 0.115], [0.64, 0.150, 0.100],
      [0.82, 0.165, 0.108], [1.00, 0.140, 0.090],
    ]),
    cou: segment([0, 1.58, 0], [0, 1.44, 0], [[0, 0.052, 0.05], [1, 0.056, 0.054]]),
    cuisse: segment([s * 0.085, 0.95, 0], [s * 0.075, 0.50, 0], [
      [0.00, 0.088, 0.085], [0.15, 0.088, 0.092], [0.50, 0.072, 0.075], [1.00, 0.050, 0.052],
    ]),
    jambe: segment([s * 0.075, 0.50, 0], [s * 0.07, 0.075, 0], [
      [0.00, 0.050, 0.050], [0.25, 0.052, 0.064], [0.60, 0.042, 0.048], [1.00, 0.030, 0.032],
    ]),
    bras: segment([s * 0.245, 1.36, 0], [s * 0.29, 1.09, 0], [
      [0.00, 0.050, 0.050], [0.35, 0.052, 0.052], [1.00, 0.038, 0.040],
    ]),
    avantBras: segment([s * 0.29, 1.09, 0], [s * 0.325, 0.84, 0], [
      [0.00, 0.040, 0.042], [0.20, 0.043, 0.045], [1.00, 0.026, 0.027],
    ]),
  };
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

const COULEUR_CORPS = 0x3a5d80;

// Réglage visuel : facteurs (largeur, longueur) appliqués aux muscles de chaque segment.
const AJUSTEMENT = {
  torse: [0.9, 0.85], cou: [1, 1], bras: [1, 0.95], avantBras: [1, 0.95],
  cuisse: [0.82, 0.68], jambe: [0.85, 0.72],
};
export const COULEUR_MUSCLE = 0xd98a80;

export function construireCorps() {
  const corps = new THREE.Group();
  const meshMuscles = [];

  const matCorps = new THREE.MeshStandardMaterial({
    color: COULEUR_CORPS, roughness: 0.85, metalness: 0.0,
  });
  const geoSphere = new THREE.SphereGeometry(1, 24, 16);

  const groupes = {};   // 'torse', 'cou', 'cuisse+1', ...

  function ajouterSegment(nom, seg) {
    const L = seg.haut.distanceTo(seg.bas);
    const g = new THREE.Group();
    g.position.copy(seg.bas);
    const dir = seg.haut.clone().sub(seg.bas).normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const mesh = new THREE.Mesh(geometrieSegment(seg, L), matCorps);
    g.add(mesh);
    corps.add(g);
    groupes[nom] = { groupe: g, seg, L };
  }

  ajouterSegment('torse', definitionsSegments(1).torse);
  ajouterSegment('cou', definitionsSegments(1).cou);
  for (const s of [1, -1]) {
    const defs = definitionsSegments(s);
    for (const nom of ['cuisse', 'jambe', 'bras', 'avantBras']) ajouterSegment(nom + s, defs[nom]);
  }

  // Tête, nez (pour repérer l'avant), mains, pieds.
  const tete = new THREE.Mesh(geoSphere, matCorps);
  tete.scale.set(0.085, 0.105, 0.095);
  tete.position.set(0, 1.63, 0.005);
  corps.add(tete);
  const nez = new THREE.Mesh(geoSphere, matCorps);
  nez.scale.set(0.014, 0.02, 0.02);
  nez.position.set(0, 1.615, 0.098);
  corps.add(nez);
  for (const s of [1, -1]) {
    const main = new THREE.Mesh(geoSphere, matCorps);
    main.scale.set(0.03, 0.055, 0.02);
    main.position.set(s * 0.337, 0.79, 0.005);
    main.rotation.z = -s * 0.12;
    corps.add(main);
    const pied = new THREE.Mesh(geoSphere, matCorps);
    pied.scale.set(0.038, 0.032, 0.085);
    pied.position.set(s * 0.07, 0.035, 0.04);
    corps.add(pied);
  }

  // Muscles.
  const haut = new THREE.Vector3(0, 1, 0);
  for (const m of MUSCLES) {
    const s = m.s ?? 1;
    const nomGroupe = (m.part === 'torse' || m.part === 'cou') ? m.part : m.part + (m.axial ? 1 : s);
    const { groupe, seg, L } = groupes[nomGroupe];
    // Côté gauche : angle tel quel. Côté droit : miroir, 180 - angle.
    const thDeg = s === -1 ? 180 - m.th : m.th;
    const th = THREE.MathUtils.degToRad(thDeg);
    const lean = THREE.MathUtils.degToRad(s === -1 ? -m.lean : m.lean);

    const [a, b] = interpolerProfil(seg.profil, m.u);
    const pos = new THREE.Vector3(a * Math.cos(th), (1 - m.u) * L, b * Math.sin(th));
    const n = new THREE.Vector3(Math.cos(th) / a, 0, Math.sin(th) / b).normalize();

    const tangente = new THREE.Vector3(n.z, 0, -n.x);
    const along = haut.clone();
    tangente.applyAxisAngle(n, lean);
    along.applyAxisAngle(n, lean);
    const base = new THREE.Matrix4().makeBasis(tangente, along, n);

    // Une légère variation de teinte par muscle aide à distinguer les voisins.
    const graine = Math.abs([...m.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
    const couleur = new THREE.Color(COULEUR_MUSCLE).offsetHSL(0, 0, ((graine % 7) - 3) * 0.014);
    const mat = new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.6, metalness: 0.0 });
    const mesh = new THREE.Mesh(geoSphere, mat);
    const [fx, fy] = AJUSTEMENT[m.part];
    mesh.scale.set(m.dx * fx, m.dy * fy, m.dz);
    mesh.quaternion.setFromRotationMatrix(base);
    mesh.position.copy(pos).addScaledVector(n, m.dz * 0.42);
    mesh.userData = { muscle: m, normalLocale: n.clone(), echelle: mesh.scale.clone(), couleur };
    groupe.add(mesh);
    meshMuscles.push(mesh);
  }

  corps.updateMatrixWorld(true);
  return { corps, meshMuscles };
}
