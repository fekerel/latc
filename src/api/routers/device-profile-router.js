import { Router } from "express";

export function createDeviceProfileRouter(deviceProfiles) {
  const router = Router();

// TODO  
  router.get("/:id", async (req, res) => {
    const profile = await deviceProfiles.getProfileForDevice(req.params.id);
    res.json({ profile });
  });

  return router;
}