# Vichar blue/green upstreams — INSTALLED ON THE HOST at
#   /etc/nginx/vichar-upstreams.conf
# and consumed by `include /etc/nginx/vichar-upstreams.conf;` inside
# infra/nginx-vichar.conf (http context — upstream blocks only).
#
# This copy in the repo is the INITIAL content (blue = current production
# ports). After go-live vichar-deploy rewrites the deployed file on every
# deploy and runs `nginx -t && systemctl reload nginx`. Never edit the live
# file by hand; edit ports here or in infra/deploy/lib.sh instead.
#
# REQUIRED: without the installed file, nginx -t fails with
# "host not found in upstream" for vichar_ui/vichar_docs/vichar_gateway/
# vichar_api/vichar_admin — install this file BEFORE loading the updated
# vichar.conf. A host file predating the admin panel gains the vichar_admin
# line on the next vichar-deploy; add it by hand first if you install the new
# vichar.conf before that deploy.

upstream vichar_ui      { server 127.0.0.1:3302; }
upstream vichar_docs    { server 127.0.0.1:3305; }
upstream vichar_gateway { server 127.0.0.1:4301; }
upstream vichar_api     { server 127.0.0.1:4302; }
upstream vichar_admin   { server 127.0.0.1:3306; }
