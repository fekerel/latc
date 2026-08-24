import { Router } from "express";

export function createDiscoveryApi(discovery) {
  const router = Router();

  router.get("/devices", async (req, res) => {
    const devices = discovery.listDevices();
    res.json({ devices });
  });

  return router;
}
