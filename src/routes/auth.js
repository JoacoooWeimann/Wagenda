import express from 'express';
import { showLogin, login, showRegister, register, logout } from '../controllers/auth.js';

const router = express.Router();

router.get('/login', showLogin);
router.post('/login', login);
router.get('/register', showRegister);
router.post('/register', register);
router.post('/logout', logout);

export default router;
