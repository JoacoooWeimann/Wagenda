import express from 'express';
import {
  getWeek, putWindow, createRoutine, updateRoutine, deleteRoutine, markRoutineDone, unmarkRoutineDone
} from '../controllers/week.js';

const router = express.Router();

router.get('/api/week', getWeek);
router.put('/api/week/windows/:weekday', putWindow);
router.post('/api/routine', createRoutine);
router.patch('/api/routine/:id', updateRoutine);
router.delete('/api/routine/:id', deleteRoutine);
// Tildar / destildar un bloque en una fecha ("fui al gimnasio")
router.put('/api/routine/:id/done/:date', markRoutineDone);
router.delete('/api/routine/:id/done/:date', unmarkRoutineDone);

export default router;
