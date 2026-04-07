module.exports = {
  apps: [
    {
      name: "bieliskobot",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
      },
      // Restartuje bota w wypadku błędu/craszu
      autorestart: true,
      // Jeżeli aplikacja upada szybciej niż 5 sekund non-stop - PM2 chwilę odczeka
      min_uptime: "10s",
      max_restarts: 5,
      // Opcjonalne zbieranie logów
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      merge_logs: true
    }
  ]
};
