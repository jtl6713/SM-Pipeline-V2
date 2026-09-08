# Thumbnail style guidance

ChicagoShining grid covers (P2 / Studio finished-cover generation) use designed block-letter title cards, not raw photo crops.

## Mix (operator preference)

| Style | Share | When |
| --- | --- | --- |
| **Gold / black-and-gold sophisticated lettering** | **≥ ~80%** of posts | Default. Metallic gold or black-and-gold block letters, slightly arched or refined; elegant cinematic composition (dusk skyline, water reflections, architecture, moody city light). |
| **Colorful glossy 3D lettering** | **≤ ~20%** of posts | Only when the subject clearly calls for high-energy / playful treatment. Do not make bright multicolor “candy” 3D the default. |

Gold themes have been performing better than colorful 3D themes. Prefer premium, stylish sophistication over loud rainbow block letters unless variety is intentional.

## Always

- Large, mobile-readable title text near center or slightly below center.
- Keep text inside safe margins; avoid the top and bottom 10% of the frame.
- High contrast and polished production look.
- No fake logos, watermarks, platform UI, cluttered microtext, or distorted letters.
- Official ChicagoShining branding/watermarking is applied downstream — do not invent a logo in the image.

## Applies to

- P2 thumbnail prompt suffix (`services/pipeline-runner/p2/constants.py`)
- Studio finished-cover prompts (`studio_produce/thumbnail_prompt.py`, Studio API Worker)
- Brand `Thumbnail_Style_Guidelines` when those fields are used in P1 context

Native grid-cover attachment rules (publish `cover_url` / preferred thumbnails) are unchanged — see `.cursor/rules/native-grid-covers.mdc`.
