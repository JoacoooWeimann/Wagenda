import express from 'express';
import { listBoards, createBoard, updateBoard, deleteBoard } from '../controllers/boards.js';

const router = express.Router();

router.get('/api/boards', listBoards);
router.post('/api/boards', createBoard);
router.patch('/api/boards/:id', updateBoard);
router.delete('/api/boards/:id', deleteBoard);

export default router;
