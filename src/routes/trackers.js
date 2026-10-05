import express from 'express';
import {
  listTrackers, trackerOptions, getTracker, createTracker, updateTracker, deleteTracker, addEntry, deleteEntry
} from '../controllers/trackers.js';

const router = express.Router();

router.get('/api/trackers', listTrackers);
router.post('/api/trackers', createTracker);
router.get('/api/trackers/options', trackerOptions); // antes que /:id
router.get('/api/trackers/:id', getTracker);
router.patch('/api/trackers/:id', updateTracker);
router.delete('/api/trackers/:id', deleteTracker);
router.post('/api/trackers/:id/entries', addEntry);
router.delete('/api/trackers/:id/entries/:entryId', deleteEntry);

export default router;
