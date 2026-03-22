set -e
BACKEND_DIR="$HOME/BestMedicare/medicre (2) (1)/medicre/backend"
python3 - <<'PY'
from pathlib import Path
p = Path('/root/BestMedicare/medicre (2) (1)/medicre/backend/.env')
text = p.read_text().splitlines()
updates = {
    'SMS_ENABLED': 'true',
    'SMS_API_URL': 'https://app.notify.lk/api/v1/send',
    'SMS_USER_ID': '31203',
    'SMS_API_KEY': 'qeJpVGwr8NNbY0LF6XFg',
    'SMS_SENDER_ID': 'NotifyDEMO',
    'SMS_TO_FORMAT': '077xxxxxxx',
    'SMS_METHOD': 'POST',
    'SMS_TIMEOUT_MS': '10000',
    'SMS_USER_PARAM': 'user_id',
    'SMS_KEY_PARAM': 'api_key',
    'SMS_SENDER_PARAM': 'sender_id',
    'SMS_TO_PARAM': 'to',
    'SMS_MESSAGE_PARAM': 'message',
    'SMS_EXTRA_PARAMS': '',
    'PASSWORD_RESET_OTP_TTL_MINUTES': '10',
    'PASSWORD_RESET_OTP_MAX_ATTEMPTS': '5',
    'PASSWORD_RESET_FRONTEND_URL': 'https://bestmedicarenawala.com/forgot-password',
    'APPOINTMENT_REMINDER_ENABLED': 'true',
    'APPOINTMENT_REMINDER_LEAD_MINUTES': '60',
    'APPOINTMENT_REMINDER_SCAN_INTERVAL_MS': '60000',
    'APPOINTMENT_REMINDER_SEND_WINDOW_MINUTES': '5',
}
lookup = {line.split('=',1)[0]: idx for idx, line in enumerate(text) if '=' in line and not line.lstrip().startswith('#')}
for key, value in updates.items():
    line = f'{key}={value}'
    if key in lookup:
        text[lookup[key]] = line
    else:
        text.append(line)
p.write_text('\n'.join(text) + '\n')
print('updated env')
for key in ['SMS_ENABLED','SMS_API_URL','SMS_USER_ID','SMS_SENDER_ID','PASSWORD_RESET_FRONTEND_URL','APPOINTMENT_REMINDER_ENABLED']:
    for line in text:
        if line.startswith(key + '='):
            print(line)
            break
PY
pm2 restart hospital-api
sleep 3
cd "$BACKEND_DIR"
node -e "const sms=require('./services/smsGateway'); console.log(JSON.stringify({configured:sms.isSmsGatewayConfigured()}, null, 2));"
