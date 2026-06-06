// pm2 process config. Run the built app: `npm run build && pm2 start ecosystem.config.cjs`.
// .env is loaded by the app itself (src/config.ts imports dotenv/config), so no env_file here.
// The restart policy is the seed of the §4.5 crash-loop guard (full self-restart is M4).
module.exports = {
  apps: [
    {
      name: "ceo-agent",
      script: "dist/main.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      min_uptime: "30s", // a run that dies sooner counts as a crash
      max_restarts: 10, // …after this many fast crashes, pm2 stops trying
      exp_backoff_restart_delay: 1000, // back off on repeated crashes instead of hot-looping
      max_memory_restart: "600M",
      kill_timeout: 16000, // give graceful shutdown (15s) time to finish in-flight wakes
      time: true, // timestamp log lines
    },
  ],
};
