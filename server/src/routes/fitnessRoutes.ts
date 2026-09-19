import { Router } from 'express';
import { FitnessController } from '../controllers/fitnessController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/today', FitnessController.getToday);
router.get('/week', FitnessController.getWeekTrend);
router.post('/log', FitnessController.saveDailyLog);

export default router;
