# Living illustration asset pipeline

- Source image: `platform/assets/hero-louisville.webp` (1536 × 1024).
- Depth image: `platform/assets/hero-louisville-depth-tiefling-v1.png` (1536 × 1024, 117,290 bytes, SHA-256 `efa02c3966d0c093762b0493f71e3a34ce2d338c234b47759cb6099343f8103c`).
- Depth image generated locally on 08-22-2026 with Tiefling using Depth Anything V2 Small at a requested 1024-pixel model size. The model ran locally in the browser; no source image was uploaded.
- Runtime: pinned Three.js 0.185.1 plus the existing Motion 13.1.1 scroll hook.
- The browser receives only the source image, the pre-generated depth image, and the renderer. It does not receive Tiefling or an inference model.
- Reduced-motion, WebGL failure, texture failure, and context loss retain the existing static image explorer.

Licenses:

- Tiefling: MIT.
- Depth Anything V2 Small: Apache-2.0.
- Three.js: MIT; the vendored module retains its license header and `assets/vendor/three/LICENSE.js` contains the license text.
