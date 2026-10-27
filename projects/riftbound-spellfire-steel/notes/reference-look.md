# Reference look — analysis of the provided video

Source: a 14 s screen recording (2752×2064, 60 fps) of a pixel-art game clip ("sidequest", #pixelart #indiedev).

What we matched:
- **Rendering:** a real 3D scene rendered at low resolution and upscaled with nearest-neighbour — visible pixel stair-steps on every edge, but smooth camera motion. → Engine pixel scale (Classic ≈ 360 px tall internal image) + `image-rendering: pixelated`.
- **Camera:** three-quarter top-down, ~45–55° pitch, mild perspective, follows the wizard. → `CameraRig` pitch 0.95 rad, FOV 32°.
- **Lighting:** bright key light with soft, slightly offset drop shadows toward lower-right; saturated greens. → directional sun from upper-left with PCF shadows, hemisphere fill.
- **Ground:** painterly pixel grass with darker/lighter speckles, dirt paths with grass specks, crisp material borders. → `paintGround` palettes with value noise + speckle details + edge darkening.
- **Props:** grey stone pyramids lining paths, white posts with red-white striped caps, round low-poly trees with shadow pools, a pond with a white foam ring, a sun-gate of stone blocks around a glowing golden disc. → `pyramid`, `pylon`, `tree`, `pool` (+ foam ring) and `ExitPortal` (sun gate) assets.
- **Characters:** chunky wizard with a tall bent pink hat and blue robe holding a staff; a small companion creature. → `buildMage` (bent pink hat, blue robe, staff orb) + hovering companion orb.

Where we diverged on purpose (prompt requirements): purple cosmic rift sky and void, rain, military props (sandbags, asphalt, hangars), night lighting for Sector 3, and neon spell VFX.
