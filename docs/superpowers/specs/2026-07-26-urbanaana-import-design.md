# Urban Aana data import — design

**Date:** 2026-07-26  
**Status:** Approved (option B, approach 1)  
**Hard rules:** Live Urban Aana MongoDB and R2 are **read-only**. Do not write, delete, or modify them. Image URLs remain on `images.urbanaana.com`.

## Scope

Import into Urban Aana Mongo:
1. Categories
2. Products (with variants/stock/images)
3. Customers (`role=user` only)
4. Orders (with remapped refs)

Skip: carts, banners, source admins. Keep Urban Aana `admin@urbanaana.com`.

## Mapping

See implementation script `apps/api/scripts/import_urbanaana.py`.

## Secrets

`SOURCE_MONGO_URI` provided at runtime only (never committed). Target uses existing Urban Aana `MONGO_URI`.
