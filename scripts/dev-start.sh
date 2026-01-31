#!/bin/bash
#
# DEPRECATED: Use scripts/setup.sh instead
#

printf "\n"
printf "  \033[1;33m[DEPRECATED]\033[0m dev-start.sh has been replaced by setup.sh\n"
printf "\n"
printf "  Run instead:  \033[1mbash scripts/setup.sh\033[0m\n"
printf "  See options:  \033[1mbash scripts/setup.sh --help\033[0m\n"
printf "\n"
printf "  Redirecting...\n"
printf "\n"

exec bash "$(dirname "$0")/setup.sh" "$@"
