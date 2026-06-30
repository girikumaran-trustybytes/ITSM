from pathlib import Path

replacements = {
    '"User"': '"user"',
    '"RefreshToken"': '"refreshtoken"',
    '"PasswordResetToken"': '"passwordresettoken"',
    '"MfaChallenge"': '"mfachallenge"',
    '"MfaTrustedDevice"': '"mfatrusteddevice"',
    '"MfaPolicy"': '"mfapolicy"',
    '"ServiceAccounts"': '"serviceaccounts"',
    '"Asset"': '"asset"',
    '"Supplier"': '"supplier"',
    '"Ticket"': '"ticket"',
    '"TicketHistory"': '"tickethistory"',
    '"Attachment"': '"attachment"',
    '"AuditLog"': '"auditlog"',
    '"AssetAttachment"': '"assetattachment"',
    '"Change"': '"change"',
    '"Problem"': '"problem"',
    '"Service"': '"service"',
    '"AssetChange"': '"assetchange"',
    '"AssetProblem"': '"assetproblem"',
    '"AssetService"': '"assetservice"',
    '"Approval"': '"approval"',
    '"SlaTracking"': '"slatracking"',
    '"SlaConfig"': '"slaconfig"',
    '"Task"': '"task"',
}

root = Path('server')
modified_files = []
for path in sorted(root.rglob('*')):
    if not path.is_file() or path.suffix not in {'.sql', '.ts'}:
        continue
    text = path.read_text(encoding='utf-8', errors='ignore')
    new_text = text
    for old, new in replacements.items():
        new_text = new_text.replace(old, new)
    if new_text != text:
        path.write_text(new_text, encoding='utf-8')
        modified_files.append(path)

print('Modified files:')
for path in modified_files:
    print(path)
print('Total modified:', len(modified_files))
