FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.server.json ./
COPY server ./server
RUN npm run build:server
RUN npm prune --omit=dev --ignore-scripts

FROM node:24.21.0-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json index.html style.css combat.js scene.js audio.js run.js game.js network.js performance.js combat-feedback.js ./
COPY fighter-faces.js organic-mesh.js fighters-human.js fighters-dog.js ./
COPY arena-island.js arena-nightclub.js arena-seaside.js arena-helipad.js ./
COPY assets ./assets
COPY vendor/three.min.js vendor/THREE-LICENSE.txt ./vendor/
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server/index.js"]
