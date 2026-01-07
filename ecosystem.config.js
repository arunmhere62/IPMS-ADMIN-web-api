module.exports = {
  apps: [
    {
      name: 'pg-admin-api',
      script: './dist/main.js',
      instances: 'max', // Use all CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      max_memory_restart: '500M',
      autorestart: true,
      watch: false,
    },
  ],
};
