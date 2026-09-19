#!/usr/bin/env python3
"""Agrandit les images de la planche anatomique en gardant des bords nets.

Le dessin n'a que quelques couleurs plates. Au lieu d'étirer les pixels (ce qui
rend flou), on retrouve ces couleurs, on agrandit la « carte » de chaque couleur
en la lissant, puis on redessine les bords proprement.

Usage : python3 outils/agrandir_planche.py entree.png sortie.png [facteur=4]
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, distance_transform_edt, gaussian_filter

K = 2          # couleurs du dessin : bleu clair et bleu nuit (les bords flous sont des mélanges, pas une couleur)
SUR = 2        # sur-échantillonnage pour des bords sans escalier

def agrandir(chemin_in, chemin_out, facteur):
    im = Image.open(chemin_in).convert("RGBA")
    w, h = im.size
    a = np.asarray(im).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3] / 255.0

    # Couleurs plates : k-means sur les pixels bien opaques
    pix = rgb[alpha > 0.98].reshape(-1, 3)
    rng = np.random.default_rng(1)
    centres = pix[rng.choice(len(pix), K, replace=False)]
    for _ in range(25):
        d = ((pix[:, None, :] - centres[None]) ** 2).sum(-1)
        lab = d.argmin(1)
        for k in range(K):
            if (lab == k).any():
                centres[k] = pix[lab == k].mean(0)

    # Classe de chaque pixel (y compris les bords semi-transparents)
    d = ((rgb[:, :, None, :] - centres[None, None]) ** 2).sum(-1)
    classe = d.argmin(-1)
    # Sur les 2 derniers pixels du contour, la couleur est contaminée par un
    # liseré clair : on reprend celle du pixel fiable le plus proche, à l'intérieur.
    fiable = binary_erosion(alpha > 0.98, iterations=2)
    _, (iy, ix) = distance_transform_edt(~fiable, return_indices=True)
    classe = classe[iy, ix]

    grand = (facteur * SUR)
    W, H = w * grand, h * grand

    def gros(carte):
        f = Image.fromarray(carte.astype(np.float32), mode="F").resize((W, H), Image.BICUBIC)
        return gaussian_filter(np.asarray(f), sigma=grand * 0.8)

    scores = np.stack([gros((classe == k) * alpha) for k in range(K)], -1)
    couleurs = centres[scores.argmax(-1)]
    opacite = gros(alpha)
    # bord net : petite rampe autour de 0,5 (une fraction de pixel final)
    opacite = np.clip((opacite - 0.5) * (grand * 1.2) + 0.5, 0, 1)

    sortie = np.dstack([couleurs, opacite * 255.0]).astype(np.uint8)
    img = Image.fromarray(sortie, "RGBA").resize((w * facteur, h * facteur), Image.LANCZOS)
    img.save(chemin_out, optimize=True)
    print(chemin_out, img.size, round(len(open(chemin_out, "rb").read()) / 1024), "Ko")

if __name__ == "__main__":
    agrandir(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 4)
