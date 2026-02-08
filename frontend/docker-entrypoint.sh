#!/bin/sh
# This script is executed inside the docker container before nginx starts
# It sets up environment variables that can be used by the frontend

cat > /usr/share/nginx/html/config.js << EOF
window.__API_BASE__ = '/api';
EOF

exec "$@"
