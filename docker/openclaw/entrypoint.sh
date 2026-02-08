#!/bin/sh
if [ -S /var/run/docker.sock ]; then chmod 666 /var/run/docker.sock; fi
exec setpriv --reuid=node --regid=node --init-groups "$@"
