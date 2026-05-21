import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { User, UserRole, AdminPrivilege } from '../entities/user.entity';

const userRepo = AppDataSource.getRepository(User);

export const listAdmins = async (req: Request, res: Response): Promise<void> => {
  try {
    const admins = await userRepo.find({
      where: [
        { role: UserRole.ADMIN },
        { role: UserRole.SUPER_ADMIN }
      ],
      select: ['id', 'firstName', 'lastName', 'email', 'role', 'adminPrivileges', 'createdAt']
    });
    
    res.json({ success: true, data: admins });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch admins' });
  }
};

export const updateAdminPrivileges = async (req: Request, res: Response): Promise<void> => {
  try {
    const { adminId } = req.params;
    const { privileges } = req.body; // array of AdminPrivilege
    
    const admin = await userRepo.findOne({ where: { id: adminId } });
    if (!admin || admin.role === UserRole.USER) {
      res.status(404).json({ success: false, message: 'Admin not found' });
      return;
    }

    // A SUPER_ADMIN cannot have their privileges restricted this way, they always have all
    if (admin.role === UserRole.SUPER_ADMIN) {
      res.status(403).json({ success: false, message: 'Cannot modify Super Admin privileges' });
      return;
    }

    admin.adminPrivileges = privileges;
    await userRepo.save(admin);

    res.json({ success: true, data: admin });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update privileges' });
  }
};

export const promoteToAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;
    
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    user.role = UserRole.ADMIN;
    user.adminPrivileges = []; // Start with no privileges
    await userRepo.save(user);

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to promote user' });
  }
};
