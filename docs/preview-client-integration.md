# Preview Client Integration

This document describes how a Stremio Web client can use LATC preview sessions
to help users find a subtitle shift value before starting TV playback.

## Goal

The preview flow is not meant to play the whole movie in the browser. Its job is
to show short browser-compatible clips from the selected stream, display a
selected subtitle over those clips, and let the user adjust `shiftMs` quickly.

The final `shiftMs` value is then sent when creating the real playback session.

## Server Responsibilities

LATC owns the media-heavy and network-facing work:

- Create preview sessions for a selected `sourceUrl`.
- Generate several short HLS clips with ffmpeg.
- Serve HLS playlists and segments.
- Fetch external subtitles.
- Convert subtitle text to WebVTT.
- Keep preview sessions temporarily and dispose them after their TTL.

LATC does not apply preview subtitle shift or clip offset in the preview API.
Those are handled in the browser so UI changes feel immediate.

## Client Responsibilities

The Stremio Web client owns the interactive preview experience:

- Send the selected stream URL to LATC.
- Send the selected subtitle URL to LATC.
- Poll preview/clip status while clips are being prepared.
- Play streamable clips with hls.js.
- Fetch the subtitle VTT from LATC.
- Parse VTT cues in the browser.
- For the selected clip, convert subtitle cue times to clip-local times.
- Apply the user's `shiftMs` value instantly in the browser.
- Send the chosen subtitle and final `shiftMs` to the real playback endpoint.

## Create Preview Session

Request:

```http
POST /api/previews
Content-Type: application/json
```

Body:

```json
{
  "sourceUrl": "https://example.test/movie.mkv",
  "subtitle": {
    "url": "https://example.test/subtitle.srt",
    "language": "eng",
    "label": "English"
  }
}
```

Response:

```json
{
  "id": "preview-session-id",
  "source": {
    "url": "https://example.test/movie.mkv"
  },
  "status": "active",
  "clips": [
    {
      "id": "clip-1",
      "positionSeconds": 300,
      "durationSeconds": 20,
      "status": "encoding",
      "playlistUrl": "/api/previews/preview-session-id/clips/clip-1/playlist.m3u8"
    }
  ],
  "subtitles": [
    {
      "id": "subtitle-1",
      "url": "https://example.test/subtitle.srt",
      "language": "eng",
      "label": "English",
      "status": "ready",
      "subtitleUrl": "/api/previews/preview-session-id/subtitles/subtitle-1.vtt"
    }
  ]
}
```

The client should treat clip URLs as stable even when a clip is not ready yet.

## Poll Preview Status

Request:

```http
GET /api/previews/{previewId}
```

Use this to refresh clip statuses:

- `queued`: ffmpeg has not started this clip yet.
- `encoding`: ffmpeg is working, but no usable playlist is available yet.
- `streamable`: at least one playlist snapshot and segment are available.
- `ready`: the clip is fully encoded.
- `failed`: encoding failed.
- `canceled`: the job was canceled, usually because the session was suspended.

The client should start hls.js when a clip reaches `streamable` or `ready`.

## Play HLS Clip

When a clip is streamable:

```js
const hls = new Hls();
hls.loadSource(clip.playlistUrl);
hls.attachMedia(videoElement);
```

The playlist URL may keep changing while ffmpeg is encoding. hls.js will
periodically reload the playlist until it sees a completed VOD playlist.

The client should not attach a `queued` or `encoding` playlist URL directly to
the video element. Poll until `streamable`.

## Fetch Subtitle VTT

Request:

```http
GET /api/previews/{previewId}/subtitles/{subtitleId}.vtt
```

LATC returns WebVTT text. The timestamps are still in the original media
timeline. The client must adjust cue times for the selected clip.

## Convert Subtitle Times For A Clip

Each preview clip starts at a real media position:

```js
const clipStartMs = clip.positionSeconds * 1000;
```

The browser video element starts the clip at local time zero. Therefore each
subtitle cue must be converted like this:

```js
const previewCueStartMs = originalCueStartMs - clipStartMs + shiftMs;
const previewCueEndMs = originalCueEndMs - clipStartMs + shiftMs;
```

Drop cues that do not overlap the clip:

```js
const clipEndMs = clipStartMs + clip.durationSeconds * 1000;
const overlapsClip =
  originalCueEndMs > clipStartMs &&
  originalCueStartMs < clipEndMs;
```

Clamp visible cue times to the clip boundaries:

```js
const cueStartMs = Math.max(0, previewCueStartMs);
const cueEndMs = Math.min(clip.durationSeconds * 1000, previewCueEndMs);
```

Then create a browser-local WebVTT Blob URL and attach it as a text track.

## Replace Text Track

Shift changes should be instant. The client can regenerate the shifted clip-local
VTT in memory and replace the track:

```js
function replaceSubtitleTrack(video, vttText, subtitle) {
  for (const track of video.querySelectorAll("track[data-preview-subtitle]")) {
    URL.revokeObjectURL(track.src);
    track.remove();
  }

  const url = URL.createObjectURL(
    new Blob([vttText], { type: "text/vtt" })
  );
  const track = document.createElement("track");

  track.dataset.previewSubtitle = "true";
  track.kind = "subtitles";
  track.label = subtitle.label ?? subtitle.language ?? "Subtitle";
  track.srclang = subtitle.language ?? "und";
  track.src = url;
  track.default = true;

  video.appendChild(track);
  track.addEventListener("load", () => {
    track.track.mode = "showing";
  });
}
```

## Display Timeline Time

The UI timeline should represent the clip length, but display real media time:

```js
const realCurrentTimeSeconds = clip.positionSeconds + video.currentTime;
```

For a 20 second clip starting at `900`, display:

```text
15:00 - 15:20
current: 15:04
```

This keeps the UI simple while still showing where the user is in the source.

## Add Another Subtitle

If the user selects a different subtitle, reuse the same preview session:

```http
POST /api/previews/{previewId}/subtitles
Content-Type: application/json
```

```json
{
  "url": "https://example.test/other-subtitle.srt",
  "language": "tur",
  "label": "Turkish"
}
```

Do not create a new preview session just because the subtitle changed. Video
clip generation is the expensive part; subtitle preparation is cheap.

## Start Real TV Playback

When the user confirms the shift:

```http
POST /api/playback/sessions
Content-Type: application/json
```

```json
{
  "deviceRegistryId": "device-id",
  "sourceUrl": "https://example.test/movie.mkv",
  "subtitle": {
    "url": "https://example.test/subtitle.srt",
    "language": "eng",
    "shiftMs": 1500
  }
}
```

Unlike preview playback, the TV playback path is handled by LATC. LATC applies
`shiftMs` while preparing the subtitle served to the TV.

## Dispose Preview

When the preview UI is closed:

```http
DELETE /api/previews/{previewId}
```

LATC also disposes inactive preview sessions automatically after their TTL.
