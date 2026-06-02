"""Generate PaveRate PWA icons and logo assets from the source brand PNGs.

Source files (already transparent-background, 1254x1254):
  branding/generated-image (1).png  -> square app icon (road + hex badge)
  branding/logo_with_text (1).png    -> full logo with PAVERATE wordmark

Outputs:
  static/icons/icon-192.png            transparent, trimmed, 192
  static/icons/icon-512.png            transparent, trimmed, 512
  static/icons/icon-512-maskable.png   slate background + safe padding, 512
  static/icons/apple-touch-icon.png    slate background, 180
  static/logo-mark.png                 transparent icon, 256 (header/login)
  static/logo-wordmark.png             transparent wordmark, height 200 (login)
"""

from PIL import Image

SLATE = (46, 59, 70, 255)  # #2e3b46 brand slate
ICON_SRC = "branding/generated-image (1).png"
WORD_SRC = "branding/logo_with_text (1).png"


def trim(im: Image.Image, pad_ratio: float = 0.0) -> Image.Image:
    """Crop to the non-transparent bounding box, optional padding as a ratio of max side."""
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    if pad_ratio > 0:
        w, h = im.size
        pad = int(max(w, h) * pad_ratio)
        out = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
        out.paste(im, (pad, pad), im)
        im = out
    return im


def square_canvas(im: Image.Image, size: int, bg=(0, 0, 0, 0), content_ratio: float = 1.0) -> Image.Image:
    """Center `im` on a square `size` canvas; content_ratio scales the art within."""
    target = int(size * content_ratio)
    w, h = im.size
    scale = target / max(w, h)
    resized = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), bg)
    x = (size - resized.width) // 2
    y = (size - resized.height) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def main() -> None:
    icon = trim(Image.open(ICON_SRC).convert("RGBA"))
    word = trim(Image.open(WORD_SRC).convert("RGBA"))

    # Transparent app icons (trimmed art fills the square)
    square_canvas(icon, 192).save("static/icons/icon-192.png")
    square_canvas(icon, 512).save("static/icons/icon-512.png")

    # Maskable: full-bleed slate background, art at ~70% (safe zone for clipping)
    square_canvas(icon, 512, bg=SLATE, content_ratio=0.70).save(
        "static/icons/icon-512-maskable.png"
    )

    # Apple touch icon: slate background (iOS doesn't honor transparency), 180
    square_canvas(icon, 180, bg=SLATE, content_ratio=0.86).save(
        "static/icons/apple-touch-icon.png"
    )

    # In-site assets
    square_canvas(icon, 256).save("static/logo-mark.png")

    # Favicon (transparent, small)
    square_canvas(icon, 48).save("static/favicon.png")

    # Wordmark: keep aspect, height 240, transparent
    ww, wh = word.size
    target_h = 240
    scale = target_h / wh
    word_resized = word.resize((round(ww * scale), target_h), Image.LANCZOS)
    word_resized.save("static/logo-wordmark.png")

    print("icon trimmed:", icon.size)
    print("word trimmed:", word.size, "-> wordmark", word_resized.size)
    print("Done.")


if __name__ == "__main__":
    main()
