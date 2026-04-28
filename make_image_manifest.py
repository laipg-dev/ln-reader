from pathlib import Path
import json

IMAGE_DIR = Path("characters")
OUTPUT_FILE = Path("image_characters.js")
EXTS = {".png", ".jpg", ".jpeg", ".webp"}

if not IMAGE_DIR.exists():
    raise SystemExit(f"Khong tim thay folder anh: {IMAGE_DIR}")

names = sorted({
    file.stem
    for file in IMAGE_DIR.iterdir()
    if file.is_file() and file.suffix.lower() in EXTS
})

content = "const IMAGE_CHARACTERS = "
content += json.dumps(names, ensure_ascii=False, indent=2)
content += ";\n"

OUTPUT_FILE.write_text(content, encoding="utf-8")
print(f"Da tao {OUTPUT_FILE} voi {len(names)} ten nhan vat.")
