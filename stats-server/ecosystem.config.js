module.exports = {
  apps: [
    {
      name: 'enstar-stats',
      script: 'server.js',
      cwd: '/home/ubuntu/enstar/stats-server',
      env: {
        PORT: '8893',
        DATA_DIR: '/home/ubuntu/enstar/stats-server/data',
        ALLOWED_ORIGINS: 'https://chillingdaisydev.github.io,http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080,http://127.0.0.1:8080',
      },
    },
  ],
};
