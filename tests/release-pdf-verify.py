"""Read-only verification/rasterization of app-exported synthetic demo reports.

Run after release-demo-browser.cjs, passing its TOOLBOX_TEST_OUTPUT directory.
Requires pypdf, Pillow, and pdftoppm. Review every generated contact sheet;
successful text assertions alone are not a visual-layout approval.
"""
from pathlib import Path
import json
import re
import shutil
import subprocess
import sys
import unicodedata
from PIL import Image, ImageDraw
from pypdf import PdfReader

root = Path(sys.argv[1]).resolve()
render = root / "pdf-pages"
render.mkdir(exist_ok=True)
poppler = shutil.which("pdftoppm")
if not poppler:
    raise RuntimeError("pdftoppm is required to inspect PDF layout")

patterns = {
    "D01-xlsx.pdf": [r"Cpk\s+1\.128\b", r"Ppk\s+0\.632456\b", r"MR / R UCL\s+3\.267287\b"],
    "D01-ja.pdf": [r"工程能力解析レポート", r"Cpk\s+1\.128\b", r"平均\s+3\b"],
    "D02-period-comparison.pdf": [r"5 7 3\.162278 1\.128 0\.94", r"2026-09-01", r"2026-10-31"],
    "D04-cycle.pdf": [r"10 12\.25 14\.5", r"1,440 1,440"],
    "D05-parallel.pdf": [r"30 40 30 0", r"000123", r"percentages\s+are\s+undefined"],
    "D06-pareto.pdf": [r"Scratch 40 40 40", r"Bubble 30 30 70", r"Color 20 20 90", r"Other 10 10 100"],
}
results, thumbnails = [], []
for name, checks in patterns.items():
    pdf = root / name
    reader = PdfReader(pdf)
    pages = [unicodedata.normalize("NFKC", p.extract_text() or "") for p in reader.pages]
    text = "\n".join(pages)
    assert all(p.strip() for p in pages), name + ": blank text page"
    assert "\ufffd" not in text, name + ": replacement glyph"
    for pattern in checks:
        assert re.search(pattern, text), name + ": missing " + pattern
    prefix = render / pdf.stem
    subprocess.run([poppler, "-r", "85", "-png", str(pdf), str(prefix)], check=True, capture_output=True)
    rasters = sorted(render.glob(pdf.stem + "-*.png"))
    assert len(rasters) == len(pages), name + ": raster count mismatch"
    thumbnails.extend(rasters)
    results.append({"file": name, "pages": len(pages), "textChecks": len(checks), "rasters": [p.name for p in rasters]})

contacts = []
for start in range(0, len(thumbnails), 4):
    selected = thumbnails[start:start + 4]
    tile_width, tile_height = 710, 1040
    board = Image.new("RGB", (tile_width * 2, tile_height * 2), "#d9dde3")
    draw = ImageDraw.Draw(board)
    for index, file in enumerate(selected):
        image = Image.open(file).convert("RGB")
        image.thumbnail((tile_width - 20, tile_height - 44))
        x, y = (index % 2) * tile_width + 10, (index // 2) * tile_height + 30
        board.paste(image, (x, y))
        draw.text((x, y - 23), file.name, fill="black")
    target = render / f"contact-{start // 4 + 1}.jpg"
    board.save(target, quality=92)
    contacts.append(target.name)

evidence = {"reports": results, "pageCount": sum(r["pages"] for r in results), "contactSheets": contacts, "visualReview": "Required separately; text checks do not approve page layout"}
(root / "release-pdf-verification.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf8")
print(json.dumps({"reports": len(results), "pages": evidence["pageCount"], "textChecks": sum(r["textChecks"] for r in results), "contacts": contacts}))
