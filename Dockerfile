# Runs the iDos Games SDK MCP server (stdio) from its npm package.
# Used by catalogs that start a server in a sandbox to inspect its tools (e.g. Glama).
# The hosted iDos Games server needs no image: https://site.idosgames.com/api/v2/mcp
FROM node:22-alpine

ENV NODE_ENV=production
RUN npm install -g @idosgames/mcp@0.1.38 && npm cache clean --force

USER node
ENTRYPOINT ["idosgames-mcp"]
