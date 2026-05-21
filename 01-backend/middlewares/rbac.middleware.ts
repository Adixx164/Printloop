import { Request, Response, NextFunction } from 'express';
import { UserRole, AdminPrivilege } from '../entities/user.entity';

// This extends your custom AuthedRequest type assuming req.user exists
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const user = (req as any).user;
  
  if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
    res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
    return;
  }
  
  next();
};

export const requirePrivilege = (privilege: AdminPrivilege) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      // Super admins bypass all privilege checks
      next();
      return;
    }

    if (user.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
      return;
    }

    const hasPrivilege = user.adminPrivileges?.includes(privilege);
    if (!hasPrivilege) {
      res.status(403).json({ 
        success: false, 
        message: `Forbidden: Requires ${privilege} privilege` 
      });
      return;
    }

    next();
  };
};
