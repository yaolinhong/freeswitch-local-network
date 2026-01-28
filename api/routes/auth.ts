import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key'

/**
 * Register
 * POST /api/auth/register
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, email, extension, displayName } = req.body

    if (!username || !password || !email || !extension || !displayName) {
      res.status(400).json({ error: 'Missing required fields' })
      return
    }

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }, { extension }],
      },
    })

    if (existingUser) {
      res.status(409).json({ error: 'User already exists (username, email, or extension)' })
      return
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        email,
        extension,
        displayName,
        status: 'offline',
      },
    })

    // Generate token
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, {
      expiresIn: '24h',
    })

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        extension: user.extension,
        displayName: user.displayName,
        status: user.status,
      },
    })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * Login
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' })
      return
    }

    const user = await prisma.user.findUnique({
      where: { username },
    })

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash)
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    // Update status to online
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'online' },
    })

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, {
      expiresIn: '24h',
    })

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        extension: user.extension,
        displayName: user.displayName,
        status: 'online',
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * Logout
 * POST /api/auth/logout
 */
router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    // Ideally we should get userId from token middleware
    const authHeader = req.headers.authorization
    if (authHeader) {
        const token = authHeader.split(' ')[1]
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
            await prisma.user.update({
                where: { id: decoded.userId },
                data: { status: 'offline' }
            })
        } catch (e) {
            // ignore invalid token
        }
    }
    
    res.json({ success: true })
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * Guest Login
 * POST /api/auth/guest
 */
router.post('/guest', async (req: Request, res: Response): Promise<void> => {
    try {
        const { displayName } = req.body;
        
        if (!displayName) {
            res.status(400).json({ error: 'Display name is required' });
            return;
        }

        // Generate random extension (1000-1019) to match FreeSWITCH default config
        let extension = '';
        let isUnique = false;
        // Safety break to prevent infinite loop if all 20 extensions are taken
        let attempts = 0;
        while (!isUnique && attempts < 50) {
            extension = Math.floor(1000 + Math.random() * 20).toString();
            const existing = await prisma.user.findUnique({ where: { extension } });
            if (!existing) isUnique = true;
            attempts++;
        }

        if (!isUnique) {
             res.status(503).json({ error: 'No available extensions (1000-1019) at the moment' });
             return;
        }

        const randomSuffix = Math.random().toString(36).substring(7);
        const username = `guest_${randomSuffix}`;
        const password = '1234'; // Fixed password
        const passwordHash = await bcrypt.hash(password, 10);
        const email = `${username}@local.voip`;

        const user = await prisma.user.create({
            data: {
                username,
                passwordHash,
                email,
                extension,
                displayName,
                status: 'online'
            }
        });

        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, {
            expiresIn: '24h',
        });

        res.status(201).json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                extension: user.extension,
                displayName: user.displayName,
                status: user.status,
            }
        });

    } catch (error) {
        console.error('Guest login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get Current User
 * GET /api/auth/me
 */
router.get('/me', async (req: Request, res: Response): Promise<void> => {
    try {
        const authHeader = req.headers.authorization
        if (!authHeader) {
            res.status(401).json({ error: 'No token provided' })
            return
        }
        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
        
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId }
        })

        if (!user) {
            res.status(404).json({ error: 'User not found' })
            return
        }

        res.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                extension: user.extension,
                displayName: user.displayName,
                status: user.status
            }
        })

    } catch (error) {
        res.status(401).json({ error: 'Invalid token' })
    }
})

export default router
