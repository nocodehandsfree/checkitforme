#!/usr/bin/env bash
# Deploy the staging reverse-proxy worker (staging.checkitforme.com) to Cloudflare.
# Needs CLOUDFLARE_API_TOKEN (pull it from Railway). Account + script id are fixed below.
set -euo pipefail
ACCT="9ae93ac1675d04db6b9ff876923898ef"
SCRIPT="checkit-staging-proxy"
SRC="$(dirname "$0")/checkit-staging-proxy.worker.js"
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (fetch from Railway)}"
curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/${ACCT}/workers/scripts/${SCRIPT}" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/javascript" \
  --data-binary @"${SRC}" | python3 -c "import sys,json;d=json.load(sys.stdin);print('deployed:' , d.get('success'), d.get('errors') or '')"
