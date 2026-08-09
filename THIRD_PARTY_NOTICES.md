# Third-party notices

## Earthbound Battle Backgrounds JS

- Project: <https://github.com/gjtorikian/Earthbound-Battle-Backgrounds-JS>
- Pinned revision: `282fdd303e9d97d47bca568f03e549fb60028cf6`
- Copyright: Copyright (c) 2017 Garen Torikian, kdex
- License stated by upstream: MIT
- Upstream source file: `data/truncated_backgrounds.dat` (not bundled here)
- Recorded source SHA-256:
  `145306bf7c591973566a026caf8d7de88fb8ab6f911d0c43068ce3cd6a7650c1`

This package includes data extracted from that pinned file: 117,040 bytes of
decompressed SNES planar background graphics, 210,944 bytes of padded 32x32
tile arrangements, 114 BGR555 palette banks, 327 layer mappings, and 135
distortion parameter records. This repository stores the extracted graphics in
`data/native-data.json` and the layer, palette, and effect tables in
`data/layers.json`.

The decoder and renderer adapt the upstream implementations in
`src/rom/rom.js`, `src/rom/background_layer.js`, `src/rom/palette_cycle.js`,
`src/rom/distorter.js`, and `src/rom/background_palette.js` at the pinned
revision. This notice records provenance and the license supplied with the
upstream repository. It does not make additional claims about the underlying
game material.

### Upstream MIT license

The MIT License (MIT)

Copyright (c) 2017 Garen Torikian, kdex

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

EarthBound and related names are property of their respective owners. This is
an independent fan project and is not endorsed by Nintendo, APE, HAL
Laboratory, Shigesato Itoi, or the upstream project authors.
