import express from 'express';
const router = express.Router();

router.get('/', (req, res) => {
  res.render('index', { title: 'Inicio' });
});

router.get('/calendar', (req, res) => {
  const now = new Date();
  res.render('calendar', {
    title: 'Calendario',
    year: now.getFullYear(),
    month: now.getMonth() + 1
  });
});

router.get('/goals', (req, res) => {
  res.render('goals', { title: 'Objetivos' });
});

export default router;