// Alternatif systemd: jalankan dengan PM2
//   npm i -g pm2
//   NITRO_PRESET=node-server npm run build
//   pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: "mikrotik-billing",
      script: ".output/server/index.mjs",
      cwd: __dirname + "/..",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 3000,
      },
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
