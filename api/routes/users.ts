import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma.js'

const router = Router()

/**
 * Get all online users (excluding self if userId provided in query)
 * GET /api/users
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        extension: true,
        displayName: true,
        status: true,
      },
      orderBy: [
        { status: 'desc' }, // Sort by status first (online > offline)
        { displayName: 'asc' }, // Then by name
      ],
    })
    res.json({ users })
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * Update user status
 * PUT /api/users/status
 */
router.put('/status', async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, status } = req.body
        if (!userId || !status) {
            res.status(400).json({ error: 'Missing userId or status' })
            return
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { status }
        })

        res.json({ user })
    } catch (error) {
        console.error('Update status error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
