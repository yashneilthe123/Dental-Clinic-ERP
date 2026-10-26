import 'dotenv/config';

const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  // Clinic's local timezone: "today", daily reports etc. are calculated in this zone
  timezone: process.env.TIMEZONE || 'Asia/Kolkata',
};

if (config.env === 'production' && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}
