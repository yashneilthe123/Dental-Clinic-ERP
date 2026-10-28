import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool } from './db.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

import authRoutes from './modules/auth.routes.js';
import userRoutes from './modules/users.routes.js';
import patientRoutes from './modules/patients.routes.js';
import appointmentRoutes from './modules/appointments.routes.js';
import procedureRoutes from './modules/procedures.routes.js';
import treatmentRoutes from './modules/treatments.routes.js';
import prescriptionRoutes from './modules/prescriptions.routes.js';
import invoiceRoutes from './modules/invoices.routes.js';
import inventoryRoutes from './modules/inventory.routes.js';
import expenseRoutes from './modules/expenses.routes.js';
import { dashboardRouter, reportsRouter, settingsRouter, auditRouter } from './modules/reports.routes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '1mb' }));
  if (config.env !== 'test') app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  // Public
  app.use('/api/auth', authRoutes);

  // Everything below requires a valid token
  const api = express.Router();
  api.use(authenticate);
  api.use('/users', userRoutes);
  api.use('/patients', patientRoutes);
  api.use('/appointments', appointmentRoutes);
  api.use('/procedures', procedureRoutes);
  api.use('/treatments', treatmentRoutes);
  api.use('/prescriptions', prescriptionRoutes);
  api.use('/invoices', invoiceRoutes);
  api.use('/inventory', inventoryRoutes);
  api.use('/expenses', expenseRoutes);
  api.use('/dashboard', dashboardRouter);
  api.use('/reports', reportsRouter);
  api.use('/settings', settingsRouter);
  api.use('/audit', auditRouter);
  app.use('/api', api);
  app.use('/api', notFoundHandler);

  // In production, serve the built React app from ../client/dist
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.resolve(here, '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
