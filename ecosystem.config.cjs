// PM2 Process Manager Konfiguration
module.exports = {
  apps: [
    {
      name: "titan-geo-core",
      script: "npm",
      args: "run start",
      cwd: "/var/www/titan-geo-core",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      error_file: "/var/log/titan-geo/error.log",
      out_file: "/var/log/titan-geo/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
