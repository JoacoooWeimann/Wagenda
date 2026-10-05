import express from 'express';
import prisma from '../utiles/db.js';

const router = express.Router();

// Health check (lo usa Railway para saber si el deploy quedó andando): la app
// responde y la base contesta. Sin sesión ni datos de nadie.
router.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

export default router;
