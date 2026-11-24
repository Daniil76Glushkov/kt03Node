const dotenv = require('dotenv');

dotenv.config();

const accessSecret = process.env.JWT_ACCESS_SECRET;
const refreshSecret = process.env.JWT_REFRESH_SECRET;

if (!accessSecret || !refreshSecret || accessSecret === refreshSecret) {
  throw new Error('Задайте разные JWT_ACCESS_SECRET и JWT_REFRESH_SECRET в .env');
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  accessSecret,
  refreshSecret,
  refreshMaxAge: 7 * 24 * 60 * 60 * 1000,
};
