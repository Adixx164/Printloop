import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { User } from '../entities/user.entity';
import { Wallet } from '../entities/wallet.entity';
import { env } from '../utils/env';

const userRepository = AppDataSource.getRepository(User);
const walletRepository = AppDataSource.getRepository(Wallet);

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, email, phoneNumber, password } = req.body;

    const existingUser = await userRepository.findOne({ where: { email } });
    if (existingUser) {
      res.status(409).json({ success: false, message: 'Email already in use' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user and wallet in a transaction
    await AppDataSource.transaction(async (manager) => {
      const user = manager.create(User, {
        firstName,
        lastName,
        email,
        phoneNumber,
        passwordHash,
        salt,
        verificationToken: Math.floor(100000 + Math.random() * 900000).toString(),
      });
      await manager.save(User, user);

      const wallet = manager.create(Wallet, {
        userId: user.id,
        balance: 0,
      });
      await manager.save(Wallet, wallet);
    });

    res.status(201).json({ success: true, message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    const user = await userRepository.findOne({ where: { email } });

    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const accessToken = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      data: {
        user: { id: user.id, firstName: user.firstName, email: user.email },
        tokens: { accessToken, refreshToken }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
