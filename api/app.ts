/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import callRoutes from './routes/calls.js'
import { initESL } from './lib/esl.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Serve static files (recordings)
app.use('/recordings', express.static(path.join(__dirname, 'public/recordings')))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/calls', callRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * Reinitialize ESL connection
 */
app.post('/api/admin/reinit-esl', (req: Request, res: Response): void => {
  try {
    initESL()
    res.status(200).json({
      success: true,
      message: 'ESL connection reinitialized',
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to reinitialize ESL',
    })
  }
})

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
