// Alternativa a Docker para el VPS: correr con PM2 directamente sobre Node,
// sin contenedores (menos overhead en un KVM1 de 1 vCPU).
//
// Uso:
//   npm ci && npm run build
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup   (para que arranque solo tras reiniciar el VPS)
module.exports = {
  apps: [
    {
      name: "kredired",
      script: ".next/standalone/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
        // Sin esto PM2 hereda el TZ del sistema del VPS (a veces UTC) — toda
        // la lógica de vencido/próximo/corte de caja asume hora de México.
        TZ: "America/Mexico_City",
      },
      autorestart: true,
      max_memory_restart: "400M",
    },
  ],
};
