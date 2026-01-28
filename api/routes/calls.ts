import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma.js'

const router = Router()

/**
 * Get call history for a user
 * GET /api/calls
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.query
    if (!userId) {
        res.status(400).json({ error: 'userId is required' })
        return
    }

    const calls = await prisma.call.findMany({
      where: {
        OR: [
            { callerId: String(userId) },
            { calleeId: String(userId) }
        ]
      },
      include: {
        caller: {
            select: { displayName: true, extension: true }
        },
        callee: {
            select: { displayName: true, extension: true }
        }
      },
      orderBy: {
        startTime: 'desc',
      },
      take: 50
    })
    res.json({ calls })
  } catch (error) {
    console.error('Get calls error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * Create call record (when call starts)
 * POST /api/calls
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const { callerId, calleeId, sipCallId, callerExtension, calleeExtension } = req.body
        
        let finalCallerId = callerId
        let finalCalleeId = calleeId

        // If extensions are provided, lookup user IDs
        if (!finalCallerId && callerExtension) {
            const user = await prisma.user.findUnique({ where: { extension: callerExtension } })
            if (user) finalCallerId = user.id
        }

        if (!finalCalleeId && calleeExtension) {
            const user = await prisma.user.findUnique({ where: { extension: calleeExtension } })
            if (user) finalCalleeId = user.id
        }

        if (!finalCallerId || !finalCalleeId) {
            res.status(400).json({ error: 'Caller or Callee not found' })
            return
        }

        const call = await prisma.call.create({
            data: {
                callerId: finalCallerId,
                calleeId: finalCalleeId,
                sipCallId,
                status: 'initiated'
            }
        })
        res.json({ call })
    } catch (error) {
        console.error('Create call error:', error)
        res.status(500).json({ error: 'Internal server error', details: String(error) })
    }
})

/**
 * Update call record (when call ends or connects)
 * PUT /api/calls/:id
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params
        const { status, duration, endTime } = req.body
        
        const data: any = { status }
        if (endTime) data.endTime = endTime
        if (duration) data.duration = duration

        const call = await prisma.call.update({
            where: { id },
            data
        })
        res.json({ call })
    } catch (error) {
        console.error('Update call error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
