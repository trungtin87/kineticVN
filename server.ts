import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = 3000;
const JOBS_ROOT = '/tmp/kt-render-jobs';

fs.mkdirSync(JOBS_ROOT, { recursive: true });

interface RenderJob {
  id: string;
  dir: string;
  framesDir: string;
  format: 'mp4' | 'prores4444';
  frameFormat: 'png' | 'jpg';
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  durationSec: number;
  includeBackground: boolean;
  bgDimmer: number;
  bgBlur: number;
  bgLoopMode: 'crossfade' | 'pingpong' | 'cut';
  bgCrossfadeSec: number;
  bgPlaybackRate: number;
  voiceVolume: number;
  bgAudioVolume: number;
  bgAudioSource: 'video' | 'custom';
  audioPath: string | null;
  bgVideoPath: string | null;
  bgAudioPath: string | null;
  outputPath: string | null;
  outputFilename: string;
  status: 'uploading' | 'encoding' | 'done' | 'error';
  progress: number;
  receivedFrames: number;
  error: string | null;
  createdAt: number;
}

function runCmd(bin: string, args: string[]): Promise<{ code: number; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stderr, stdout }));
  });
}

async function probeDuration(filePath: string): Promise<number> {
  const res = await runCmd('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const val = parseFloat(res.stdout.trim());
  return Number.isFinite(val) && val > 0 ? val : 0;
}

async function probeHasAudio(filePath: string): Promise<boolean> {
  const res = await runCmd('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=codec_type',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return res.stdout.trim().length > 0;
}

async function prepareSeamlessBackgroundVideo(
  job: RenderJob
): Promise<{ path: string; needsLoop: boolean }> {
  const srcPath = job.bgVideoPath!;
  const rate = Math.max(0.5, Math.min(1.5, job.bgPlaybackRate || 1));
  const rawDur = await probeDuration(srcPath);
  const effDur = rawDur > 0 ? rawDur / rate : 0;
  const W = job.width;
  const H = job.height;
  const fps = job.fps;

  const baseChain = `setpts=PTS/${rate.toFixed(4)},fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;

  // If source video already covers duration or direct cut mode is chosen
  if (job.bgLoopMode === 'cut' || rawDur <= 0.6 || effDur >= job.durationSec) {
    return { path: srcPath, needsLoop: true };
  }

  const keepVideoAudio =
    job.bgAudioSource === 'video' &&
    job.bgAudioVolume > 0.005 &&
    (await probeHasAudio(srcPath));

  const audioBaseChain = `atempo=${rate.toFixed(4)},aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${effDur.toFixed(4)},asetpts=PTS-STARTPTS`;

  if (job.bgLoopMode === 'pingpong') {
    const ppPath = path.join(job.dir, 'bg_pingpong.mp4');
    const fc = keepVideoAudio
      ? `[0:v]${baseChain},split=2[fwd][revsrc];[revsrc]reverse,setpts=PTS-STARTPTS[rev];[0:a]${audioBaseChain},asplit=2[afwd][arevsrc];[arevsrc]areverse,asetpts=PTS-STARTPTS[arev];[fwd][afwd][rev][arev]concat=n=2:v=1:a=1[vout][aout]`
      : `[0:v]${baseChain},split=2[fwd][revsrc];[revsrc]reverse,setpts=PTS-STARTPTS[rev];[fwd][rev]concat=n=2:v=1:a=0,setpts=PTS-STARTPTS[vout]`;

    const ppArgs = ['-y', '-i', srcPath, '-filter_complex', fc, '-map', '[vout]'];
    if (keepVideoAudio) {
      ppArgs.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
    } else {
      ppArgs.push('-an');
    }
    ppArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '14', '-pix_fmt', 'yuv420p', ppPath);

    const res = await runCmd('ffmpeg', ppArgs);
    if (res.code === 0 && fs.existsSync(ppPath)) {
      return { path: ppPath, needsLoop: true };
    }
    return { path: srcPath, needsLoop: true };
  }

  // Seamless Crossfade Loop: Intro [0..P] + periodic Tile ([P..effD] xfade [0..F] + [F..P])
  const fadeDur = Math.max(0.25, Math.min(job.bgCrossfadeSec, effDur * 0.4));
  const period = Math.max(0.25, effDur - fadeDur);

  const introPath = path.join(job.dir, 'bg_intro.mp4');
  const tilePath = path.join(job.dir, 'bg_tile.mp4');
  const concatListPath = path.join(job.dir, 'bg_concat.txt');
  const seamlessPath = path.join(job.dir, 'bg_seamless.mp4');

  const introFc = keepVideoAudio
    ? `[0:v]${baseChain},trim=0:${period.toFixed(4)},setpts=PTS-STARTPTS[vintro];[0:a]${audioBaseChain},atrim=0:${period.toFixed(4)},asetpts=PTS-STARTPTS[aintro]`
    : `[0:v]${baseChain},trim=0:${period.toFixed(4)},setpts=PTS-STARTPTS[vintro]`;

  const introArgs = ['-y', '-i', srcPath, '-filter_complex', introFc, '-map', '[vintro]'];
  if (keepVideoAudio) {
    introArgs.push('-map', '[aintro]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
  } else {
    introArgs.push('-an');
  }
  introArgs.push(
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '14',
    '-pix_fmt',
    'yuv420p',
    '-video_track_timescale',
    '90000',
    introPath
  );

  const introRes = await runCmd('ffmpeg', introArgs);

  const tileVideoParts = [
    `[0:v]${baseChain},split=3[s1][s2][s3]`,
    `[s1]trim=start=${period.toFixed(4)}:end=${effDur.toFixed(4)},setpts=PTS-STARTPTS[tail]`,
    `[s2]trim=start=0:end=${fadeDur.toFixed(4)},setpts=PTS-STARTPTS[head]`,
    `[tail][head]xfade=transition=fade:duration=${fadeDur.toFixed(4)}:offset=0,setpts=PTS-STARTPTS[xf]`,
    `[s3]trim=start=${fadeDur.toFixed(4)}:end=${period.toFixed(4)},setpts=PTS-STARTPTS[mid]`,
    `[xf][mid]concat=n=2:v=1:a=0,setpts=PTS-STARTPTS[vtile]`,
  ];

  const tileAudioParts = keepVideoAudio
    ? [
        `[0:a]${audioBaseChain},asplit=3[a1][a2][a3]`,
        `[a1]atrim=start=${period.toFixed(4)}:end=${effDur.toFixed(4)},asetpts=PTS-STARTPTS[atail]`,
        `[a2]atrim=start=0:end=${fadeDur.toFixed(4)},asetpts=PTS-STARTPTS[ahead]`,
        `[atail][ahead]acrossfade=d=${fadeDur.toFixed(4)}:c1=tri:c2=tri,asetpts=PTS-STARTPTS[axf]`,
        `[a3]atrim=start=${fadeDur.toFixed(4)}:end=${period.toFixed(4)},asetpts=PTS-STARTPTS[amid]`,
        `[axf][amid]concat=n=2:v=0:a=1,asetpts=PTS-STARTPTS[atile]`,
      ]
    : [];

  const tileFc = [...tileVideoParts, ...tileAudioParts].join(';');
  const tileArgs = ['-y', '-i', srcPath, '-filter_complex', tileFc, '-map', '[vtile]'];
  if (keepVideoAudio) {
    tileArgs.push('-map', '[atile]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
  } else {
    tileArgs.push('-an');
  }
  tileArgs.push(
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '14',
    '-pix_fmt',
    'yuv420p',
    '-video_track_timescale',
    '90000',
    tilePath
  );

  const tileRes = await runCmd('ffmpeg', tileArgs);

  if (introRes.code !== 0 || tileRes.code !== 0 || !fs.existsSync(introPath) || !fs.existsSync(tilePath)) {
    return { path: srcPath, needsLoop: true };
  }

  const tileCopies = Math.max(1, Math.ceil((job.durationSec - period) / period) + 1);
  const lines = [`file '${introPath.replace(/'/g, "'\\''")}'`];
  for (let i = 0; i < tileCopies; i++) {
    lines.push(`file '${tilePath.replace(/'/g, "'\\''")}'`);
  }
  await fs.promises.writeFile(concatListPath, lines.join('\n'), 'utf8');

  const concatRes = await runCmd('ffmpeg', [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatListPath,
    '-c',
    'copy',
    seamlessPath,
  ]);

  if (concatRes.code === 0 && fs.existsSync(seamlessPath)) {
    return { path: seamlessPath, needsLoop: false };
  }

  return { path: srcPath, needsLoop: true };
}

const jobs = new Map<string, RenderJob>();

// Periodic cleanup for expired jobs (> 45 mins)
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > 45 * 60 * 1000) {
      fs.rmSync(job.dir, { recursive: true, force: true });
      jobs.delete(id);
    }
  }
}, 5 * 60 * 1000);

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const jobId = (req as express.Request & { jobId?: string }).jobId!;
    const jobDir = path.join(JOBS_ROOT, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    cb(null, jobDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${file.fieldname}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

function assignJobId(
  req: express.Request & { jobId?: string },
  _res: express.Response,
  next: express.NextFunction
) {
  req.jobId = crypto.randomUUID();
  next();
}

async function startServer() {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Package & download clean project source code archive (.zip)
  app.get('/api/export-source', async (_req, res) => {
    const zipPath = path.join('/tmp', `kinetik-studio-source-${crypto.randomUUID()}.zip`);
    const rootDir = process.cwd();
    const pyScript = `
import os, sys, zipfile
root = sys.argv[1]
out_zip = sys.argv[2]
skip_dirs = {'node_modules', 'dist', 'dev-dist', '.git', '.aistudio', '__pycache__', '.next'}
skip_files = {'.env', '.env.local', '.DS_Store'}
with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        for fname in filenames:
            if fname in skip_files or fname.endswith('.log'):
                continue
            full = os.path.join(dirpath, fname)
            rel = os.path.relpath(full, root)
            zf.write(full, os.path.join('kinetik-studio', rel))
`;
    try {
      const result = await runCmd('python3', ['-c', pyScript, rootDir, zipPath]);
      if (result.code !== 0 || !fs.existsSync(zipPath)) {
        res.status(500).json({ error: 'Không thể đóng gói mã nguồn' });
        return;
      }
      res.download(zipPath, 'kinetik-studio-source.zip', () => {
        fs.rmSync(zipPath, { force: true });
      });
    } catch (err) {
      fs.rmSync(zipPath, { force: true });
      const message = err instanceof Error ? err.message : 'Failed to export source';
      res.status(500).json({ error: message });
    }
  });

  // 1. Initialize render job & upload audio / optional background video
  app.post(
    '/api/export/init',
    assignJobId,
    upload.fields([
      { name: 'audio', maxCount: 1 },
      { name: 'bgVideo', maxCount: 1 },
      { name: 'bgAudio', maxCount: 1 },
    ]),
    (req, res) => {
      try {
        const jobId = (req as express.Request & { jobId?: string }).jobId!;
        const jobDir = path.join(JOBS_ROOT, jobId);
        const framesDir = path.join(jobDir, 'frames');
        fs.mkdirSync(framesDir, { recursive: true });

        const files = req.files as Record<string, Express.Multer.File[]> | undefined;
        const audioFile = files?.audio?.[0] ?? null;
        const bgVideoFile = files?.bgVideo?.[0] ?? null;
        const bgAudioFile = files?.bgAudio?.[0] ?? null;

        const format = req.body.format === 'prores4444' ? 'prores4444' : 'mp4';
        const frameFormat: RenderJob['frameFormat'] =
          req.body.frameFormat === 'jpg' ? 'jpg' : 'png';
        const width = Math.max(256, Math.min(3840, Number(req.body.width) || 1920));
        const height = Math.max(256, Math.min(3840, Number(req.body.height) || 1080));
        const fps = Math.max(12, Math.min(60, Number(req.body.fps) || 30));
        const totalFrames = Math.max(1, Number(req.body.totalFrames) || 30);
        const durationSec = Math.max(0.1, Number(req.body.durationSec) || totalFrames / fps);
        const includeBackground = req.body.includeBackground !== 'false';
        const bgDimmer = Math.max(0, Math.min(0.95, Number(req.body.bgDimmer) || 0));
        const bgBlur = Math.max(0, Math.min(40, Number(req.body.bgBlur) || 0));
        const rawLoopMode = String(req.body.bgLoopMode || 'crossfade');
        const bgLoopMode: RenderJob['bgLoopMode'] =
          rawLoopMode === 'pingpong' || rawLoopMode === 'cut' ? rawLoopMode : 'crossfade';
        const bgCrossfadeSec = Math.max(0.2, Math.min(3.0, Number(req.body.bgCrossfadeSec) || 1.0));
        const bgPlaybackRate = Math.max(0.5, Math.min(1.5, Number(req.body.bgPlaybackRate) || 1.0));

        const rawVoiceVol = Number(req.body.voiceVolume);
        const voiceVolume = Number.isFinite(rawVoiceVol)
          ? Math.max(0, Math.min(1, rawVoiceVol))
          : 1.0;
        const rawBgVol = Number(req.body.bgAudioVolume);
        const bgAudioVolume = Number.isFinite(rawBgVol)
          ? Math.max(0, Math.min(1, rawBgVol))
          : 0.25;
        const bgAudioSource: RenderJob['bgAudioSource'] =
          req.body.bgAudioSource === 'custom' ? 'custom' : 'video';

        const ext = format === 'prores4444' ? 'mov' : 'mp4';
        const rawName = String(req.body.projectName || 'kinetic-typography')
          .replace(/[^a-zA-Z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 48);
        const outputFilename = `${rawName || 'kinetic-typography'}_${format === 'prores4444' ? 'prores4444_alpha' : 'h264'}.${ext}`;

        const job: RenderJob = {
          id: jobId,
          dir: jobDir,
          framesDir,
          format,
          frameFormat,
          width,
          height,
          fps,
          totalFrames,
          durationSec,
          includeBackground,
          bgDimmer,
          bgBlur,
          bgLoopMode,
          bgCrossfadeSec,
          bgPlaybackRate,
          voiceVolume,
          bgAudioVolume,
          bgAudioSource,
          audioPath: audioFile ? audioFile.path : null,
          bgVideoPath: bgVideoFile ? bgVideoFile.path : null,
          bgAudioPath: bgAudioFile ? bgAudioFile.path : null,
          outputPath: null,
          outputFilename,
          status: 'uploading',
          progress: 0,
          receivedFrames: 0,
          error: null,
          createdAt: Date.now(),
        };

        jobs.set(jobId, job);
        res.json({ jobId, outputFilename });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize render job';
        res.status(500).json({ error: message });
      }
    }
  );

  // 1b. Chunked upload for large audio / background video / replacement audio (> 8MB)
  app.post(
    '/api/export/:jobId/asset/:field',
    express.raw({ type: 'application/octet-stream', limit: '16mb' }),
    async (req, res) => {
      const job = jobs.get(req.params.jobId);
      if (!job) {
        res.status(404).json({ error: 'Render job not found' });
        return;
      }

      const field = req.params.field;
      if (field !== 'audio' && field !== 'bgVideo' && field !== 'bgAudio') {
        res.status(400).json({ error: 'Invalid asset field' });
        return;
      }

      try {
        const chunk = req.body as Buffer;
        if (!Buffer.isBuffer(chunk)) {
          res.status(400).json({ error: 'Invalid binary chunk' });
          return;
        }

        const rawHeaderName = String(req.headers['x-filename'] || `${field}.bin`);
        let decodedName = rawHeaderName;
        try {
          decodedName = decodeURIComponent(rawHeaderName);
        } catch {
          // keep raw header
        }
        const safeExt = path.extname(decodedName).replace(/[^.a-zA-Z0-9]/g, '') || '.bin';
        const targetPath = path.join(job.dir, `${field}${safeExt}`);
        const chunkIndex = Math.max(0, Number(req.headers['x-chunk-index'] || 0));

        if (chunkIndex === 0) {
          await fs.promises.writeFile(targetPath, chunk);
          if (field === 'audio') job.audioPath = targetPath;
          if (field === 'bgVideo') job.bgVideoPath = targetPath;
          if (field === 'bgAudio') job.bgAudioPath = targetPath;
        } else {
          await fs.promises.appendFile(targetPath, chunk);
        }

        res.json({ ok: true, bytesWritten: chunk.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to store asset chunk';
        job.status = 'error';
        job.error = message;
        res.status(500).json({ error: message });
      }
    }
  );

  // 2. Upload packed binary frames: [uint32LE frameIndex, uint32LE byteLength, ...pngBytes]
  app.post(
    '/api/export/:jobId/frames',
    express.raw({ type: 'application/octet-stream', limit: '96mb' }),
    async (req, res) => {
      const job = jobs.get(req.params.jobId);
      if (!job) {
        res.status(404).json({ error: 'Render job not found' });
        return;
      }

      try {
        const buf = req.body as Buffer;
        if (!Buffer.isBuffer(buf) || buf.length < 8) {
          res.status(400).json({ error: 'Invalid frame payload' });
          return;
        }

        let offset = 0;
        let written = 0;
        const writes: Promise<void>[] = [];

        while (offset + 8 <= buf.length) {
          const frameIndex = buf.readUInt32LE(offset);
          const byteLength = buf.readUInt32LE(offset + 4);
          offset += 8;

          if (offset + byteLength > buf.length) {
            throw new Error('Truncated frame chunk in binary pack');
          }

          const frameSlice = buf.subarray(offset, offset + byteLength);
          offset += byteLength;

          const frameExt = job.frameFormat === 'jpg' ? 'jpg' : 'png';
          const frameName = `frame_${String(frameIndex).padStart(6, '0')}.${frameExt}`;
          writes.push(fs.promises.writeFile(path.join(job.framesDir, frameName), frameSlice));
          written++;
        }

        await Promise.all(writes);
        job.receivedFrames += written;
        res.json({ receivedFrames: job.receivedFrames });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to write frame batch';
        job.status = 'error';
        job.error = message;
        res.status(500).json({ error: message });
      }
    }
  );

  // 3. Finalize and trigger FFmpeg encoding
  app.post('/api/export/:jobId/finalize', async (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Render job not found' });
      return;
    }

    if (job.status === 'encoding' || job.status === 'done') {
      res.json({ status: job.status });
      return;
    }

    if (job.receivedFrames <= 0) {
      res.status(400).json({ error: 'Không có khung hình nào được gửi lên máy chủ' });
      return;
    }

    job.status = 'encoding';
    job.progress = 1;
    res.json({ status: 'encoding' });

    try {
      const ext = job.format === 'prores4444' ? 'mov' : 'mp4';
      const frameExt = job.frameFormat === 'jpg' ? 'jpg' : 'png';
      const outputPath = path.join(job.dir, `output.${ext}`);
      job.outputPath = outputPath;

      const args: string[] = ['-y'];
      const useServerBgVideo = Boolean(job.bgVideoPath && job.includeBackground);
      let preparedBg: { path: string; needsLoop: boolean } | null = null;

      if (useServerBgVideo && job.bgVideoPath) {
        preparedBg = await prepareSeamlessBackgroundVideo(job);
        if (preparedBg.needsLoop) {
          args.push('-stream_loop', '-1');
        }
        args.push('-i', preparedBg.path);
      }

      // Input (0 or 1): PNG or JPEG frame sequence
      const framesInputIdx = useServerBgVideo ? 1 : 0;
      args.push(
        '-framerate',
        String(job.fps),
        '-start_number',
        '0',
        '-i',
        path.join(job.framesDir, `frame_%06d.${frameExt}`)
      );

      let nextInputIdx = framesInputIdx + 1;

    // Optional Main Voice Audio Input
    let voiceInputIdx = -1;
    if (job.audioPath && job.voiceVolume > 0.005 && (await probeHasAudio(job.audioPath))) {
      voiceInputIdx = nextInputIdx++;
      args.push('-i', job.audioPath);
    }

    // Optional Custom Replacement Background Audio Input (looped to match video duration)
    let customBgAudioInputIdx = -1;
    if (
      useServerBgVideo &&
      job.bgAudioSource === 'custom' &&
      job.bgAudioPath &&
      job.bgAudioVolume > 0.005 &&
      (await probeHasAudio(job.bgAudioPath))
    ) {
      customBgAudioInputIdx = nextInputIdx++;
      args.push('-stream_loop', '-1', '-i', job.bgAudioPath);
    }

    const hasVideoBgAudio = Boolean(
      useServerBgVideo &&
        preparedBg &&
        job.bgAudioSource === 'video' &&
        job.bgAudioVolume > 0.005 &&
        (await probeHasAudio(preparedBg.path))
    );

    const filterParts: string[] = [];
    let videoMap = `${framesInputIdx}:v`;

    // Video filter graph
    if (useServerBgVideo) {
      const isPreNormalized = preparedBg && preparedBg.path !== job.bgVideoPath;
      const bgFilters: string[] = [];
      if (!isPreNormalized) {
        const rate = Math.max(0.5, Math.min(1.5, job.bgPlaybackRate || 1));
        if (Math.abs(rate - 1) > 0.01) {
          bgFilters.push(`setpts=PTS/${rate.toFixed(4)}`);
        }
        bgFilters.push(
          `scale=${job.width}:${job.height}:force_original_aspect_ratio=increase`,
          `crop=${job.width}:${job.height}`,
          `setsar=1`
        );
      }
      if (job.bgBlur > 0.2) {
        bgFilters.push(`gblur=sigma=${job.bgBlur.toFixed(1)}`);
      }
      if (job.bgDimmer > 0.01) {
        bgFilters.push(`drawbox=0:0:${job.width}:${job.height}:color=black@${job.bgDimmer.toFixed(2)}:t=fill`);
      }

      const overlayFormat = job.format === 'prores4444' ? 'rgb' : 'yuv420';
      const bgStep = bgFilters.length > 0 ? `[0:v]${bgFilters.join(',')}[bg];` : '';
      const bgLabel = bgFilters.length > 0 ? '[bg]' : '[0:v]';
      filterParts.push(`${bgStep}${bgLabel}[${framesInputIdx}:v]overlay=0:0:shortest=1:format=${overlayFormat}[vout]`);
      videoMap = '[vout]';
    }

    // Audio filter graph (Voice + Video BG / Custom BG Audio with normalize=0)
    const audioLabels: string[] = [];
    if (voiceInputIdx >= 0) {
      filterParts.push(
        `[${voiceInputIdx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${job.voiceVolume.toFixed(3)}[avoice]`
      );
      audioLabels.push('[avoice]');
    }

    if (customBgAudioInputIdx >= 0) {
      filterParts.push(
        `[${customBgAudioInputIdx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${job.bgAudioVolume.toFixed(3)}[abg]`
      );
      audioLabels.push('[abg]');
    } else if (hasVideoBgAudio && preparedBg) {
      const isPreNormalized = preparedBg.path !== job.bgVideoPath;
      const rate = Math.max(0.5, Math.min(1.5, job.bgPlaybackRate || 1));
      const tempoFilter =
        !isPreNormalized && Math.abs(rate - 1) > 0.01 ? `atempo=${rate.toFixed(4)},` : '';
      filterParts.push(
        `[0:a]${tempoFilter}aresample=48000,aformat=channel_layouts=stereo,volume=${job.bgAudioVolume.toFixed(3)}[abg]`
      );
      audioLabels.push('[abg]');
    }

    let audioMap: string | null = null;
    if (audioLabels.length === 2) {
      filterParts.push(
        `${audioLabels[0]}${audioLabels[1]}amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[aout]`
      );
      audioMap = '[aout]';
    } else if (audioLabels.length === 1) {
      audioMap = audioLabels[0];
    }

    if (filterParts.length > 0) {
      args.push('-filter_complex', filterParts.join(';'));
    }
    args.push('-map', videoMap);
    if (audioMap) {
      args.push('-map', audioMap);
    }

    // Codec settings
    const hasOutputAudio = audioMap !== null;
    if (job.format === 'prores4444') {
      args.push(
        '-c:v',
        'prores_ks',
        '-profile:v',
        '4444',
        '-vendor',
        'apl0',
        '-bits_per_mb',
        '8000',
        '-pix_fmt',
        'yuva444p10le',
        '-alpha_bits',
        '16'
      );
      if (hasOutputAudio) {
        args.push('-c:a', 'pcm_s16le', '-ar', '48000');
      }
    } else {
      args.push(
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart'
      );
      if (hasOutputAudio) {
        args.push('-c:a', 'aac', '-b:a', '320k', '-ar', '48000');
      }
    }

    args.push('-r', String(job.fps), '-t', job.durationSec.toFixed(3), outputPath);

    const ff = spawn('ffmpeg', args);
    let stderrTail = '';

    ff.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrTail = (stderrTail + text).slice(-4000);
      const match = text.match(/frame=\s*(\d+)/);
      if (match) {
        const frameNum = Number(match[1]);
        job.progress = Math.min(99, Math.max(1, Math.round((frameNum / job.totalFrames) * 100)));
      }
    });

    ff.on('error', (err) => {
      job.status = 'error';
      job.error = err.message;
    });

      ff.on('close', (code) => {
        // Remove rendered frames immediately to free disk space
        fs.rmSync(job.framesDir, { recursive: true, force: true });

        if (code === 0 && fs.existsSync(outputPath)) {
          job.status = 'done';
          job.progress = 100;
        } else {
          job.status = 'error';
          job.error = `FFmpeg exited with code ${code}: ${stderrTail.slice(-300)}`;
        }
      });
    } catch (err) {
      fs.rmSync(job.framesDir, { recursive: true, force: true });
      job.status = 'error';
      job.error = err instanceof Error ? err.message : 'FFmpeg pipeline failed';
    }
  });

  // 4. Poll job status
  app.get('/api/export/:jobId/status', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Render job not found' });
      return;
    }

    let fileSize = 0;
    if (job.status === 'done' && job.outputPath && fs.existsSync(job.outputPath)) {
      fileSize = fs.statSync(job.outputPath).size;
    }

    res.json({
      status: job.status,
      progress: job.progress,
      error: job.error,
      filename: job.outputFilename,
      fileSize,
    });
  });

  // 5a. Chunked file download (<= 4MB per request so Cloud Run 32MB limit is never hit)
  app.get('/api/export/:jobId/chunk', async (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job || job.status !== 'done' || !job.outputPath || !fs.existsSync(job.outputPath)) {
      res.status(404).json({ error: 'Rendered file not ready' });
      return;
    }

    let fh: fs.promises.FileHandle | null = null;
    try {
      job.createdAt = Date.now();
      const stat = await fs.promises.stat(job.outputPath);
      const totalSize = stat.size;
      const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
      const requestedLength = Math.floor(Number(req.query.length) || 4 * 1024 * 1024);
      const length = Math.max(1, Math.min(8 * 1024 * 1024, requestedLength));

      if (offset >= totalSize) {
        res.status(200);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('x-total-size', String(totalSize));
        res.send(Buffer.alloc(0));
        return;
      }

      const toRead = Math.min(length, totalSize - offset);
      const buf = Buffer.allocUnsafe(toRead);
      fh = await fs.promises.open(job.outputPath, 'r');
      const { bytesRead } = await fh.read(buf, 0, toRead, offset);

      res.status(200);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('x-total-size', String(totalSize));
      res.setHeader('Content-Length', String(bytesRead));
      res.send(bytesRead === toRead ? buf : buf.subarray(0, bytesRead));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read output chunk';
      res.status(500).json({ error: message });
    } finally {
      if (fh) {
        await fh.close().catch(() => {});
      }
    }
  });

  // 5b. Mark download finished and schedule deferred cleanup
  app.post('/api/export/:jobId/downloaded', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      res.json({ ok: true });
      return;
    }
    setTimeout(() => {
      fs.rmSync(job.dir, { recursive: true, force: true });
      jobs.delete(job.id);
    }, 60_000);
    res.json({ ok: true });
  });

  // 5c. Direct download with Range support (best for files <= 30MB)
  app.get('/api/export/:jobId/download', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job || job.status !== 'done' || !job.outputPath || !fs.existsSync(job.outputPath)) {
      res.status(404).json({ error: 'Rendered file not ready' });
      return;
    }

    try {
      job.createdAt = Date.now();
      const stat = fs.statSync(job.outputPath);
      const fileSize = stat.size;
      const mime = job.format === 'prores4444' ? 'video/quicktime' : 'video/mp4';

      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Disposition', `attachment; filename="${job.outputFilename}"`);
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'no-store');

      const rangeHeader = req.headers.range;
      if (rangeHeader) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
        if (!match) {
          res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
          return;
        }
        const start = Number(match[1]);
        const end = match[2] ? Math.min(fileSize - 1, Number(match[2])) : Math.min(fileSize - 1, start + 4 * 1024 * 1024 - 1);
        if (start >= fileSize || start > end) {
          res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
          return;
        }
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', String(end - start + 1));
        const stream = fs.createReadStream(job.outputPath, { start, end });
        stream.on('error', () => {
          if (!res.headersSent) res.status(500).end();
          else res.destroy();
        });
        stream.pipe(res);
        return;
      }

      res.setHeader('Content-Length', String(fileSize));
      const stream = fs.createReadStream(job.outputPath);
      stream.on('error', () => {
        if (!res.headersSent) res.status(500).end();
        else res.destroy();
      });
      stream.on('end', () => {
        setTimeout(() => {
          fs.rmSync(job.dir, { recursive: true, force: true });
          jobs.delete(job.id);
        }, 60_000);
      });
      stream.pipe(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stream rendered file';
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Kinetik Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
