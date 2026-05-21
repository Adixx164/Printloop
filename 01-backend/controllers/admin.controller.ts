import { Request, Response } from 'express';
import { AdminDashboardService } from '../services/adminDashboard.service';

const dashboardService = new AdminDashboardService();

export const getOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await dashboardService.getStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch admin overview' });
  }
};
