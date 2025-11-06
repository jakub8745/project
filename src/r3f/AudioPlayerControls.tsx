import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import {
  subscribeToAudioState,
  setAudioPlaying,
  setAudioVolume,
  getAudioState
} from '../modules/audioMeshManager.ts';

interface AudioStateSnapshot {
  available: boolean;
  isPlaying: boolean;
  volume: number;
}

function VolumeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 10v4a1 1 0 0 0 1 1h2.5L11.5 19a1 1 0 0 0 1.5-.86V5.86A1 1 0 0 0 11.5 5l-4 4H5a1 1 0 0 0-1 1Z" />
      <path d="M16.5 8.5a3.5 3.5 0 0 1 0 7" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

export function AudioPlayerControls() {
  const [state, setState] = useState<AudioStateSnapshot>(() => getAudioState());
  const [isWorking, setIsWorking] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    return subscribeToAudioState((next) => {
      setState(next);
      if (!next.available) {
        setIsExpanded(false);
      }
    });
  }, []);

  const handleToggle = useCallback(async () => {
    if (isWorking || !state.available) return;
    try {
      setIsWorking(true);
      await setAudioPlaying(!state.isPlaying);
    } finally {
      setIsWorking(false);
    }
  }, [isWorking, state.available, state.isPlaying]);

  const handleVolume = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setAudioVolume(Number.isFinite(value) ? value : 0);
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  if (!state.available) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-6 right-6 z-30 max-w-[90vw]">
      <div
        className={`pointer-events-auto flex items-center gap-3 rounded-full bg-black/80 text-white shadow-xl backdrop-blur transition-all duration-200 ${
          isExpanded ? 'px-4 py-3' : 'px-2 py-2'
        }`}
      >
        <button
          type="button"
          onClick={handleToggle}
          disabled={isWorking}
          aria-label={state.isPlaying ? 'Pause audio' : 'Play audio'}
          title={state.isPlaying ? 'Pause audio' : 'Play audio'}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <img
            src={state.isPlaying ? '/icons/ButtonPause.png' : '/icons/ButtonPlay.png'}
            alt=""
            className="h-7 w-7 select-none"
            draggable={false}
          />
        </button>

        {isExpanded ? (
          <div className="flex items-center gap-3 pr-1">
            <label className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/70">
              Volume
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={state.volume}
                onChange={handleVolume}
                className="h-1 w-32 max-w-[45vw] accent-white"
              />
            </label>
            <button
              type="button"
              onClick={toggleExpanded}
              aria-label="Hide volume control"
              title="Hide volume control"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={toggleExpanded}
            aria-label="Show volume control"
            title="Show volume control"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <VolumeIcon className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default AudioPlayerControls;
