import { useEffect, useState } from 'react';
import {
  getAudioPlaybackSnapshot,
  type AudioSubtitleCue,
  type AudioSubtitleTrack as AudioSubtitleLanguageTrack
} from '../modules/audioMeshManager.ts';

interface AudioSubtitleAudioTrack {
  id: string;
  subtitleTracks?: AudioSubtitleLanguageTrack[];
}

interface AudioSubtitlesProps {
  tracks?: AudioSubtitleAudioTrack[];
  language?: string | null;
}

function findActiveCue(cues: AudioSubtitleCue[], currentTime: number): AudioSubtitleCue | undefined {
  return cues.find((cue) => currentTime >= cue.start && currentTime < cue.end);
}

export function AudioSubtitles({ tracks, language }: AudioSubtitlesProps) {
  const [activeText, setActiveText] = useState<string | null>(null);

  useEffect(() => {
    const subtitleTracks = language
      ? (tracks ?? [])
          .map((track) => {
            const selectedTrack = track.subtitleTracks?.find((subtitleTrack) => subtitleTrack.language === language);
            return selectedTrack ? { id: track.id, cues: selectedTrack.cues } : null;
          })
          .filter((track): track is { id: string; cues: AudioSubtitleCue[] } => track !== null && track.cues.length > 0)
      : [];
    if (subtitleTracks.length === 0) {
      setActiveText(null);
      return undefined;
    }

    let frameId = 0;
    const updateSubtitle = () => {
      let nextText: string | null = null;

      for (const track of subtitleTracks) {
        const snapshot = getAudioPlaybackSnapshot(track.id);
        if (!snapshot?.isPlaying) continue;
        const cue = findActiveCue(track.cues, snapshot.currentTime);
        if (cue) {
          nextText = cue.text;
          break;
        }
      }

      setActiveText((current) => (current === nextText ? current : nextText));
      frameId = requestAnimationFrame(updateSubtitle);
    };

    frameId = requestAnimationFrame(updateSubtitle);
    return () => cancelAnimationFrame(frameId);
  }, [language, tracks]);

  if (!activeText) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-28 z-30 flex justify-center">
      <p className="max-w-4xl whitespace-pre-line rounded-md bg-black/85 px-4 py-2 text-center text-base leading-relaxed text-white shadow-2xl backdrop-blur-sm sm:text-lg">
        {activeText}
      </p>
    </div>
  );
}

export default AudioSubtitles;
