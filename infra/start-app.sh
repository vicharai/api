#!/bin/bash
# App container: postgres and redis run elsewhere, nothing to initialise.
set -e
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
