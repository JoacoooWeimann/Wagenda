import express from 'express';
import { validateMonthQuery } from '../utiles/validation/tasks.js';
import { hasErrors } from '../utiles/validation/common.js';
import { requireAuth } from '../middlewares/auth.js';
const router = express.Router();

router.get('/', (req, res) => {
  res.render('index', { title: 'Inicio' });
});

// Acepta ?year=&month= (lo usa "Ver en calendario" desde un objetivo);
// si faltan o son inválidos, abre el mes actual
router.get('/calendar', requireAuth, (req, res) => {
  const { data, fields } = validateMonthQuery(req.query);
  const now = new Date();
  const valid = !hasErrors(fields);
  res.render('calendar', {
    title: 'Calendario',
    year: valid ? data.year : now.getFullYear(),
    month: valid ? data.month : now.getMonth() + 1
  });
});

router.get('/goals', requireAuth, (req, res) => {
  res.render('goals', { title: 'Objetivos' });
});

router.get('/trackers', requireAuth, (req, res) => {
  res.render('trackers', { title: 'Seguimientos' });
});

export default router;