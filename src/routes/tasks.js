import express from 'express';
import { getTasksForMonth, createTask, updateTask, deleteTask } from '../controllers/tasks.js';

const router = express.Router();

router.get('/api/tasks', getTasksForMonth);
router.post('/api/tasks', createTask);
router.patch('/api/tasks/:id', updateTask);
router.delete('/api/tasks/:id', deleteTask);

export default router;