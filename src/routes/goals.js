import express from 'express';
import {
  previewGoal, createGoal, listGoals, getGoal, updateGoal, deleteGoal, logSession, updateWeek, addWeekTask
} from '../controllers/goals.js';

const router = express.Router();

router.post('/api/goals/preview', previewGoal);
router.get('/api/goals', listGoals);
router.post('/api/goals', createGoal);
router.get('/api/goals/:id', getGoal);
router.patch('/api/goals/:id', updateGoal);
router.delete('/api/goals/:id', deleteGoal);
router.post('/api/goals/:id/sessions', logSession);
router.patch('/api/goals/:id/weeks/:weekId', updateWeek);
router.post('/api/goals/:id/weeks/:weekId/tasks', addWeekTask);

export default router;
