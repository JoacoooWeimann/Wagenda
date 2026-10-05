import express from 'express';
import { getWeek, putWindow, createRoutine, updateRoutine, deleteRoutine } from '../controllers/week.js';

const router = express.Router();

router.get('/api/week', getWeek);
router.put('/api/week/windows/:weekday', putWindow);
router.post('/api/routine', createRoutine);
router.patch('/api/routine/:id', updateRoutine);
router.delete('/api/routine/:id', deleteRoutine);

export default router;
