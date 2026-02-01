import { Router, Request, Response } from 'express'
import { getAssets, getAssetById } from '../../data'
import { authenticateJWT } from '../../common/middleware/auth.middleware'

const router = Router()

router.use(authenticateJWT)

router.get('/', async (_req: Request, res: Response) => {
  const assets = await getAssets()
  res.json(assets)
})

router.get('/:id', async (req: Request, res: Response) => {
  const asset = await getAssetById(req.params.id)
  if (asset) {
    res.json(asset)
  } else {
    res.status(404).json({ error: 'Asset not found' })
  }
})

export default router
