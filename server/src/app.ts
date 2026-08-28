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

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(compression());
app.use(hpp());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(requestIdMiddleware);
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
});
app.use(limiter);

app.use('/health', healthRoutes);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const v1Prefix = '/api/v1';
app.use(`${v1Prefix}/auth`, authRoutes);
app.use(`${v1Prefix}/users`, userRoutes);
app.use(`${v1Prefix}/menstrual`, menstrualRoutes);
app.use(`${v1Prefix}/symptoms`, symptomRoutes);
app.use(`${v1Prefix}/emergency`, emergencyRoutes);
app.use(`${v1Prefix}/sos`, sosRoutes);
app.use(`${v1Prefix}/assistant`, assistantRoutes);
app.use(`${v1Prefix}/notifications`, notificationRoutes);
app.use(`${v1Prefix}/wellness`, wellnessRoutes);

app.use((_req: Request, res: Response) => {
  sendError(res, 'Requested API endpoint not found.', [], HTTP_STATUS.NOT_FOUND);
});

app.use(errorHandler);

export default app;