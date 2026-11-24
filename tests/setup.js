const { execFileSync } = require('child_process');
const path = require('path');
require('./env');

module.exports = () => {
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });
};
