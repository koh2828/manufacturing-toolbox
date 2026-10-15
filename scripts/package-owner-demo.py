"""Package only synthetic fixtures and blank owner documentation; no app models/results."""
from pathlib import Path
import hashlib
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
destination = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'release-artifacts/Manufacturing-Toolbox-Owner-Test-v0.8.1-beta.1.zip'
destination.parent.mkdir(parents=True, exist_ok=True)
files = sorted(p for p in (root / 'demo-data').rglob('*') if p.is_file() and p.suffix in {'.xlsx', '.csv', '.pdf', '.rci', '.json', '.md'})
files += sorted((root / 'docs/release').glob('*.md'))
files += sorted(p for p in (root / 'docs/release/evidence').glob('*') if p.is_file() and p.suffix in {'.json', '.txt'})
with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        archive.write(file, file.relative_to(root))
    archive.writestr('START_HERE.txt', 'Manufacturing Toolbox v0.8.1-beta.1 — owner test pack\n\nRead docs/release/MANUAL_TEST_GUIDE_JA.md or QUICK_START_EN.md.\nThe application is in the candidate repository; this pack contains synthetic inputs, blank owner checklists and separate expected answers only.\nDo not use the existing public site to verify this candidate.\nKeep personal test results outside Git in local-test-results/.\n')
with zipfile.ZipFile(destination) as archive:
    assert archive.testzip() is None
    assert not any(any(word in name for word in ['node_modules', 'local-test-results', 'vendor/', '.env']) for name in archive.namelist())
print(destination)
print(f'{len(files) + 1} files; {destination.stat().st_size} bytes; SHA256 {hashlib.sha256(destination.read_bytes()).hexdigest()}')
