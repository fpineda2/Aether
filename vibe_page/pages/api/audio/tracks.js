// pages/api/audio/tracks.js
// Lists the bundled demo tracks in public/audio so the visualizer's track
// picker has something to offer visitors without their own audio file.
// Reads the directory directly instead of a hardcoded list, so whatever is
// actually committed to public/audio is what shows up — nothing here needs
// to change when a track is added or removed.
import fs from "fs";
import path from "path";

const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".wav", ".ogg", ".flac", ".aac", ".webm"];

function prettify(filename) {
  const base = filename.replace(/\.[^.]+$/, "");
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function handler(req, res) {
  const dir = path.join(process.cwd(), "public", "audio");

  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    return res.status(200).json({ tracks: [] });
  }

  const tracks = files
    .filter((f) => AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .sort()
    .map((f) => ({ file: f, label: prettify(f) }));

  res.status(200).json({ tracks });
}
