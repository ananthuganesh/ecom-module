import express from 'express';
const router = express.Router();
import {
    getAllCollections,
    getCollectionsByCategory,
    getCollectionBySlug
} from '../controllers/collectionController.js';

router.get('/', getAllCollections);
router.get('/category/:slug', getCollectionsByCategory);
router.get('/:slug', getCollectionBySlug);

export default router;
