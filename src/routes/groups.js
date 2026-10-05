import express from 'express';
import {
  listGroups, getGroup, createGroup, updateGroup, deleteGroup, regenerateCode, joinGroup,
  leaveGroup, kickMember, transferGroup, shareBoard, unshareBoard, joinBoard, leaveBoard, getRanking
} from '../controllers/groups.js';

const router = express.Router();

router.get('/api/groups', listGroups);
router.post('/api/groups', createGroup);
router.post('/api/groups/join', joinGroup); // antes que /:id
router.get('/api/groups/:id', getGroup);
router.patch('/api/groups/:id', updateGroup);
router.delete('/api/groups/:id', deleteGroup);
router.post('/api/groups/:id/code', regenerateCode);
router.post('/api/groups/:id/transfer', transferGroup);
router.delete('/api/groups/:id/members/me', leaveGroup);
router.delete('/api/groups/:id/members/:userId', kickMember);
router.post('/api/groups/:id/shares', shareBoard);
router.delete('/api/groups/:id/shares/:shareId', unshareBoard);
router.post('/api/groups/:id/shares/:shareId/join', joinBoard);
router.delete('/api/groups/:id/shares/:shareId/join', leaveBoard);
router.get('/api/groups/:id/shares/:shareId/ranking', getRanking);

export default router;
