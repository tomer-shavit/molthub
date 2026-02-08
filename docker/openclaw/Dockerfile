FROM node:22

ARG OPENCLAW_VERSION=latest

RUN apt-get update && apt-get install -y --no-install-recommends git docker.io \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g openclaw@${OPENCLAW_VERSION}

RUN mkdir -p /home/node/.openclaw/workspace && chown -R node:node /home/node/.openclaw

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 755 /usr/local/bin/entrypoint.sh

ENV HOME="/home/node" TERM="xterm-256color"

EXPOSE 18789

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["openclaw", "gateway", "--port", "18789", "--allow-unconfigured"]
