import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PreviewService } from "../src/preview/preview-service.js";

test("creates preview sessions with clips, subtitles, and encode jobs", async () => {
  const enqueuedJobs = [];
  const service = createPreviewService({
    encodeQueue: {
      enqueue(job) {
        enqueuedJobs.push(job);
      },
      cancelSessionJobs() {}
    }
  });

  const preview = await service.createPreview({
    sourceUrl: "http://media.test/video.mkv",
    subtitle: {
      url: "http://media.test/subtitle.srt",
      language: "eng",
      label: "English"
    }
  });

  assert.equal(preview.clips.length, 2);
  assert.deepEqual(
    preview.clips.map((clip) => ({
      id: clip.id,
      status: clip.status,
      positionSeconds: clip.positionSeconds,
      durationSeconds: clip.durationSeconds
    })),
    [
      {
        id: "clip-1",
        status: "queued",
        positionSeconds: 10,
        durationSeconds: 5
      },
      {
        id: "clip-2",
        status: "queued",
        positionSeconds: 20,
        durationSeconds: 5
      }
    ]
  );
  assert.deepEqual(preview.subtitles, [
    {
      id: "subtitle-1",
      url: "http://media.test/subtitle.srt",
      language: "eng",
      label: "English",
      status: "ready",
      subtitleUrl: `/api/previews/${preview.id}/subtitles/subtitle-1.vtt`,
      error: undefined
    }
  ]);
  assert.deepEqual(
    enqueuedJobs.map((job) => ({
      sessionId: job.sessionId,
      priority: job.priority
    })),
    [
      {
        sessionId: preview.id,
        priority: 100
      },
      {
        sessionId: preview.id,
        priority: 0
      }
    ]
  );
});

test("suspends active previews and reactivates accessed previews", async () => {
  const enqueuedJobs = [];
  const canceledSessionIds = [];
  const service = createPreviewService({
    encodeQueue: {
      enqueue(job) {
        enqueuedJobs.push(job);
      },
      cancelSessionJobs(sessionId) {
        canceledSessionIds.push(sessionId);
      }
    }
  });

  const first = await service.createPreview({
    sourceUrl: "http://media.test/one.mkv"
  });
  const second = await service.createPreview({
    sourceUrl: "http://media.test/two.mkv"
  });

  assert.equal(service.sessions.get(first.id).status, "suspended");
  assert.equal(service.sessions.get(second.id).status, "active");

  service.getPreview(first.id);

  assert.equal(service.sessions.get(first.id).status, "active");
  assert.equal(service.sessions.get(second.id).status, "suspended");
  assert.deepEqual(canceledSessionIds, [
    first.id,
    second.id
  ]);
  assert.equal(enqueuedJobs.length, 6);
});

test("rewrites playlist segment urls from the last good playlist", async () => {
  const service = createPreviewService();
  const preview = await service.createPreview({
    sourceUrl: "http://media.test/video.mkv"
  });
  const clip = service.getClip(preview.id, "clip-1");

  clip.markStreamable([
    "#EXTM3U",
    "#EXTINF:2.000,",
    "Q:\\tmp\\preview\\segment_000.ts",
    "#EXTINF:2.000,",
    "segment_001.ts"
  ].join("\n"));

  assert.equal(
    service.getPlaylist(preview.id, "clip-1").playlistText,
    [
      "#EXTM3U",
      "#EXTINF:2.000,",
      `/api/previews/${preview.id}/clips/clip-1/segments/segment_000.ts`,
      "#EXTINF:2.000,",
      `/api/previews/${preview.id}/clips/clip-1/segments/segment_001.ts`
    ].join("\n")
  );
});

test("disposes expired previews", async () => {
  const canceledSessionIds = [];
  const service = createPreviewService({
    ttlMs: 1000,
    encodeQueue: {
      enqueue() {},
      cancelSessionJobs(sessionId) {
        canceledSessionIds.push(sessionId);
      }
    }
  });
  const preview = await service.createPreview({
    sourceUrl: "http://media.test/video.mkv"
  });

  service.sessions.get(preview.id).lastAccessedAt = new Date(Date.now() - 2000);

  assert.equal(await service.disposeExpiredPreviews(), 1);
  assert.equal(service.sessions.has(preview.id), false);
  assert.deepEqual(canceledSessionIds, [preview.id]);
});

test("returns segment readiness based on file existence", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "latc-preview-service-test-"));
  const service = createPreviewService({
    runtimeDir: tempDir
  });

  try {
    const preview = await service.createPreview({
      sourceUrl: "http://media.test/video.mkv"
    });
    const missingSegment = await service.getSegment(
      preview.id,
      "clip-1",
      "segment_000.ts"
    );

    assert.equal(missingSegment.ready, false);
    assert.equal(missingSegment.status, "queued");

    const segmentPath = service.getSegmentPath(
      preview.id,
      "clip-1",
      "segment_000.ts"
    );
    await mkdir(path.dirname(segmentPath), {
      recursive: true
    });
    await writeFile(segmentPath, "segment");

    assert.deepEqual(
      await service.getSegment(preview.id, "clip-1", "segment_000.ts"),
      {
        ready: true,
        segmentPath
      }
    );
  } finally {
    await rm(tempDir, {
      recursive: true,
      force: true
    });
  }
});

function createPreviewService(options = {}) {
  return new PreviewService({
    runtimeDir: "Q:/tmp/latc-preview-test",
    subtitlePreviewService: {
      prepareSubtitle: async () => "WEBVTT\n"
    },
    encoder: {
      encodeClip: async () => {}
    },
    encodeQueue: {
      enqueue() {},
      cancelSessionJobs() {}
    },
    clipPositionsSeconds: [10, 20],
    clipDurationSeconds: 5,
    cleanupIntervalMs: 0,
    ...options
  });
}
