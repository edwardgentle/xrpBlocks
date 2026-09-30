"""Replace the dark workspace background around block pictures with white.

    python tools/whiten_block_images.py IN_DIR OUT_DIR [--skip name ...]

Block pictures are screenshots of dark-mode XRPBlocks; the blocks keep their
dark-mode colours, only the workspace background (#191B22) becomes white.
Pure background pixels become white. Anti-aliased edge pixels (within 2 px of
the background) are un-blended from the background colour towards the colour
of the nearest block pixel and composited over white, so no dark halo is left.
Images whose corner is not the workspace colour (full-screen or phone
screenshots) are copied unchanged.
"""
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

BG = np.array([25, 27, 34], float)


def whiten(a):
    a = a.astype(float)
    dist = np.abs(a - BG).max(axis=2)
    bg = dist <= 6
    near = ndimage.binary_dilation(bg, iterations=2) & ~bg
    # Solid block pixels: not background and not in the edge band.
    solid = ~bg & ~near
    # For each pixel, the colour of the nearest solid block pixel.
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    target = a[iy, ix]
    out = a.copy()
    out[bg] = 255
    # Edge band: c = alpha*target + (1-alpha)*BG  ->  alpha by projection.
    d = target - BG
    num = ((a - BG) * d).sum(axis=2)
    den = (d * d).sum(axis=2)
    alpha = np.clip(np.where(den > 1, num / np.maximum(den, 1), 1.0), 0, 1)
    comp = alpha[..., None] * target + (1 - alpha[..., None]) * 255
    out[near] = comp[near]
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    dst.mkdir(parents=True, exist_ok=True)
    changed = kept = 0
    for f in sorted(src.glob('*.png')):
        im = Image.open(f).convert('RGB')
        a = np.asarray(im)
        if np.abs(a[0, 0].astype(float) - BG).max() > 6:
            shutil.copy(f, dst / f.name)
            kept += 1
            continue
        Image.fromarray(whiten(a)).save(dst / f.name)
        changed += 1
    print(f'{changed} whitened, {kept} copied unchanged')


if __name__ == '__main__':
    main()
