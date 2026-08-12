module.exports = {
  apps: [
    {
      name: "agente-bot",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "scripts/start-bot.ts",
      cwd: __dirname,
      restart_delay: 5000,
      max_restarts: 10,
      env_file: ".env.local",
    },
    {
      name: "agente-web",
      script: "node_modules/next/dist/bin/next",
      args: "dev --hostname 0.0.0.0",
      cwd: __dirname,
      restart_delay: 5000,
      max_restarts: 10,
      env_file: ".env.local",
    },
  ],
};
