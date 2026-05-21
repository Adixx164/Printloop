import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.middleware';
import {
  createGroupSession,
  getSessionByShareId,
  joinSession,
  getHostSessionDetails,
  listHostSessions,
  closeSession,
} from '../controllers/groupSession.controller';

const router = Router();

// Public — anyone with the share link
router.get('/share/:shareId', getSessionByShareId);
router.post('/:shareId/join', optionalAuth, joinSession);

// Host endpoints — work for signed-in users OR guest hosts (client-held
// hostId). optionalAuth attaches req.user when a valid token is present.
router.post('/', optionalAuth, createGroupSession);
router.get('/', optionalAuth, listHostSessions);
router.get('/:id', optionalAuth, getHostSessionDetails);
router.post('/:id/close', optionalAuth, closeSession);

export default router;
