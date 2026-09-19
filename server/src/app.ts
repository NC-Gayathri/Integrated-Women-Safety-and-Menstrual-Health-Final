import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import hpp from 'hpp';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { swaggerSpec } from './config/swagger';
import { requestIdMiddleware } from './middleware/requestId';
import { errorHandler } from './middleware/errorHandler';
import { sendError } from './utils/apiResponse';
import { HTTP_STATUS } from './constants/status';

import healthRoutes from './routes/healthRoutes';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import menstrualRoutes from './routes/menstrualRoutes';
import symptomRoutes from './routes/symptomRoutes';
import emergencyRoutes from './routes/emergencyRoutes';
import sosRoutes from './routes/sosRoutes';
import assistantRoutes from './routes/assistantRoutes';
import notificationRoutes from './routes/notificationRoutes';
import wellnessRoutes from './routes/wellnessRoutes';
import iotRoutes from './routes/iotRoutes';
import fitnessRoutes from './routes/fitnessRoutes';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(compression());
app.use(hpp());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(requestIdMiddleware);
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 10000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Health checks and API docs should not consume rate limit quotas
    if (req.path === '/health' || req.path.startsWith('/api/docs')) {
      return true;
    }
    return false;
  },
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
});
app.use(limiter);

// Dedicated rate limiter preserving strict protection for production auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 1000 : 30, // 30 attempts per 15 min in production to stop brute-force; relaxed in dev
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP, please try again later.',
  },
});

app.use('/health', healthRoutes);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const v1Prefix = '/api/v1';
app.use(`${v1Prefix}/auth`, authLimiter, authRoutes);
app.use(`${v1Prefix}/users`, userRoutes);
app.use(`${v1Prefix}/menstrual`, menstrualRoutes);
app.use(`${v1Prefix}/symptoms`, symptomRoutes);
app.use(`${v1Prefix}/emergency`, emergencyRoutes);
app.use(`${v1Prefix}/sos`, sosRoutes);
app.use(`${v1Prefix}/assistant`, assistantRoutes);
app.use(`${v1Prefix}/notifications`, notificationRoutes);
app.use(`${v1Prefix}/wellness`, wellnessRoutes);
app.use(`${v1Prefix}/iot`, iotRoutes);
app.use(`${v1Prefix}/fitness`, fitnessRoutes);


// Compatibility aliases without /v1 prefix
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/menstrual', menstrualRoutes);
app.use('/api/symptoms', symptomRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/wellness', wellnessRoutes);
app.use('/api/fitness', fitnessRoutes);

// Direct root aliases (e.g. if baseURL has no /api prefix)
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/menstrual', menstrualRoutes);
app.use('/symptoms', symptomRoutes);
app.use('/emergency', emergencyRoutes);
app.use('/sos', sosRoutes);
app.use('/assistant', assistantRoutes);
app.use('/notifications', notificationRoutes);
app.use('/wellness', wellnessRoutes);
app.use('/fitness', fitnessRoutes);

app.use((req: Request, res: Response) => {
  console.warn(`[404 Not Found] ${req.method} ${req.originalUrl}`);
  sendError(res, `Requested API endpoint not found: ${req.method} ${req.originalUrl}`, [], HTTP_STATUS.NOT_FOUND);
});

app.use(errorHandler);

export default app;