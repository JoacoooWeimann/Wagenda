import express from 'express';
import { previewGoal, createGoal, listGoals, getGoal, deleteGoal, logSession } from '../controllers/goals.js';

const router = express.Router();

router.post('/api/goals/preview', previewGoal);
router.get('/api/goals', listGoals);
router.post('/api/goals', createGoal);
router.get('/api/goals/:id', getGoal);
router.delete('/api/goals/:id', deleteGoal);
router.post('/api/goals/:id/sessions', logSession);

export default router;
