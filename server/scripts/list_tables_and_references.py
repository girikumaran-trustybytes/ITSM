from pathlib import Path
import re

root = Path('server')
patterns = {
    'create': re.compile(r'CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"([A-Z][A-Za-z0-9_]*)"', re.IGNORECASE),
    'alter': re.compile(r'ALTER\s+TABLE\s+"([A-Z][A-Za-z0-9_]*)"', re.IGNORECASE),
    'references': re.compile(r'REFERENCES\s+"([A-Z][A-Za-z0-9_]*)"', re.IGNORECASE),
    'from': re.compile(r'FROM\s+"([A-Z][A-Za-z0-9_]*)"', re.IGNORECASE),
    'join': re.compile(r'JOIN\s+"([A-Z][A-Za-z0-9_]*)"', re.IGNORECASE),
    'insert': re.compile(r'INSERT\s+INTO\s+"([A-Z][A-Za-z0-9_]*)"', re.IGNORECASE),
    'update': re.compile(r'UPDATE\s+"([A-Z][A-Za-z0-9_]*)"', re.IGNORECASE),
    'delete': re.compile(r'DELETE\s+FROM\s+"([A-Z][A-Za-z0-9_]*)"', re.IGNORECASE),
}

tables = {}
for p in sorted(root.rglob('*')):
    if p.is_file() and p.suffix in {'.sql', '.ts'}:
        text = p.read_text(encoding='utf-8', errors='ignore')
        for kind, pat in patterns.items():
            for m in pat.findall(text):
                tables.setdefault(m, set()).add(f'{kind}:{p}')

for name in sorted(tables):
    print(name)
    for location in sorted(tables[name]):
        print('   ', location)
print('TOTAL', len(tables))
