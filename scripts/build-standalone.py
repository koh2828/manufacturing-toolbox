"""Bundle core tools into offline-capable Launch.html; document OCR assets are lazy-loaded beside it."""
from pathlib import Path
import base64
import hashlib
import re

root = Path(__file__).resolve().parents[1]
dist = root / 'dist'
html = (dist / 'index.html').read_text(encoding='utf-8')
for stylesheet in re.findall(r'<link rel="stylesheet" href="([^"]+)">', html):
    html = html.replace(f'<link rel="stylesheet" href="{stylesheet}">', '<style>' + (dist / stylesheet).read_text(encoding='utf-8') + '</style>')
parts, hashes = [], []
for defer, script in re.findall(r'<script (defer )?src="([^"]+)"></script>', html):
    tag = f'<script {defer}src="{script}"></script>'
    content = '\n' + re.sub(r'</script', r'<\\/script', (dist / script).read_text(encoding='utf-8'), flags=re.I) + '\n'
    bundled = '<script>' + content + '</script>'
    # Keep early theme initialization in the head to avoid a light flash on reload.
    if defer:
        html = html.replace(tag, '')
        parts.append(bundled)
    else:
        html = html.replace(tag, bundled)
    hashes.append("'sha256-" + base64.b64encode(hashlib.sha256(content.encode()).digest()).decode() + "'")
html = html.replace("script-src 'self'", "script-src 'self' " + ' '.join(hashes))
html = html.replace('</body>', '\n'.join(parts) + '</body>')
license_text = (dist / 'vendor' / 'LICENSE.sheetjs.txt').read_text(encoding='utf-8')
before_close, after_close = html.rsplit('</html>', 1)
html = before_close + '<!-- Bundled SheetJS CE license\n' + license_text.replace('--', '—') + '\n-->\n</html>' + after_close
(root / 'Launch.html').write_text(html, encoding='utf-8')
print('Built Launch.html (core tools bundled; OCR uses same-origin dist/vendor/document assets).')
