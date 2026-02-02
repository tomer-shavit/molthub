FROM node:22-slim

# Install git (required by openclaw's npm dependencies)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Install OpenClaw globally
RUN npm install -g openclaw@latest

# Create OpenClaw home directory structure matching upstream expectations
# OpenClaw looks for config at ~/.openclaw/openclaw.json by default
RUN mkdir -p /home/node/.openclaw/workspace && \
    chown -R node:node /home/node/.openclaw

ENV HOME="/home/node"
ENV TERM="xterm-256color"

EXPOSE 18789

# Run as non-root user (node user comes with node:22-slim)
USER node

# --allow-unconfigured lets the gateway start before Clawster pushes a config
CMD ["openclaw", "gateway", "--port", "18789", "--allow-unconfigured"]
