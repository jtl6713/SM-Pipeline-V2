# Thumbnail style guidance

ChicagoShining grid covers (P2 / Studio finished-cover generation) are photorealistic title cards with restrained lettering, not raw photo crops and not luxury-ad CGI.

## Mix (operator preference)

| Style | Share | When |
| --- | --- | --- |
| **Photoreal scene + restrained gold / black-and-gold lettering** | **≥ ~80%** of posts | Default. Real-camera look (natural light, real textures). Soft brushed or matte gold, or black letters with a thin gold edge. Quiet and sophisticated. Lettering stays secondary to the photo. |
| **Colorful glossy 3D lettering** | **≤ ~20%** of posts | Only when the subject clearly calls for high-energy / playful treatment. Do not make bright multicolor “candy” 3D the default. |

Gold themes have been performing well, but the treatment should stay understated. Prefer a real photograph with quiet gold type over chrome foil, glow, sparkle, giant arched 3D slabs, or gold-on-everything.

## Always

- Photorealistic scene — not illustrated, CGI, painterly, or plastic.
- Large, mobile-readable title text near center or slightly below center.
- Keep text inside safe margins; avoid the top and bottom 10% of the frame.
- Do not let lettering dominate the frame.
- No fake logos, watermarks, platform UI, cluttered microtext, or distorted letters.
- Official ChicagoShining branding/watermarking is applied downstream — do not invent a logo in the image.

## Applies to

- P2 thumbnail prompt suffix (`services/pipeline-runner/p2/constants.py`)
- Studio finished-cover prompts (`studio_produce/thumbnail_prompt.py`, Studio API Worker)
- Brand `Thumbnail_Style_Guidelines` when those fields are used in P1 context

Native grid-cover attachment rules (publish `cover_url` / preferred thumbnails) are unchanged — see `.cursor/rules/native-grid-covers.mdc`.
