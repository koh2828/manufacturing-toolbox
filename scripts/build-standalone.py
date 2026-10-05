"""Build a self-contained, offline-capable Launch.html from the shared source."""
from pathlib import Path
import base64
import hashlib
import re

root = Path(__file__).resolve().parents[1]
dist = root / 'dist'
html = (dist / 'index.html').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + (dist / 'style.css').read_text(encoding='utf-8') + '</style>')
parts, hashes = [], []
for script in re.findall(r'<script defer src="([^"]+)"></script>', html):
    html = html.replace(f'<script defer src="{script}"></script>', '')
    content = '\n' + re.sub(r'</script', r'<\\/script', (dist / script).read_text(encoding='utf-8'), flags=re.I) + '\n'
    parts.append('<script>' + content + '</script>')
    hashes.append("'sha256-" + base64.b64encode(hashlib.sha256(content.encode()).digest()).decode() + "'")
html = html.replace("script-src 'self'", 'script-src ' + ' '.join(hashes))
html = html.replace('</body>', '\n'.join(parts) + '</body>')
license_text = (dist / 'vendor' / 'LICENSE.sheetjs.txt').read_text(encoding='utf-8')
before_close, after_close = html.rsplit('</html>', 1)
html = before_close + '<!-- Bundled SheetJS CE license\n' + license_text.replace('--', '—') + '\n-->\n</html>' + after_close
(root / 'Launch.html').write_text(html, encoding='utf-8')
print('Built Launch.html (all assets and SheetJS license included).')
