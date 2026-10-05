import express from 'express';
import {
  listTrackers, trackerOptions, getTracker, createTracker, updateTracker, deleteTracker
} from '../controllers/trackers.js';
import { createItem, updateItem, deleteItem, addEntry, deleteEntry } from '../controllers/items.js';

const router = express.Router();

// Seguimientos (áreas)
router.get('/api/trackers', listTrackers);
router.post('/api/trackers', createTracker);
router.get('/api/trackers/options', trackerOptions); // antes que /:id
router.get('/api/trackers/:id', getTracker);
router.patch('/api/trackers/:id', updateTracker);
router.delete('/api/trackers/:id', deleteTracker);

// Ítems de un seguimiento y sus registros
router.post('/api/trackers/:id/items', createItem);
router.patch('/api/items/:id', updateItem);
router.delete('/api/items/:id', deleteItem);
router.post('/api/items/:id/entries', addEntry);
router.delete('/api/items/:id/entries/:entryId', deleteEntry);

export default router;
