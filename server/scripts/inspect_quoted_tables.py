from pathlib import Path
import re

dirs = [Path('server/schema'), Path('server/src'), Path('server/scripts')]
pattern = re.compile(r'"([A-Za-z][A-Za-z0-9_]*)"')
seen = {}
for d in dirs:
    for p in sorted(d.rglob('*')):
        if p.is_file() and p.suffix in {'.sql', '.ts'}:
            text = p.read_text(encoding='utf-8', errors='ignore')
            for m in pattern.findall(text):
                if m not in seen:
                    seen[m] = set()
                seen[m].add(str(p))
for name in sorted(seen):
    print(name)
    for f in sorted(seen[name]):
        print('  ', f)
print('--- total', len(seen))
