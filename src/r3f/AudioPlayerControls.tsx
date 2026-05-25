import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
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
  labelPlaying: string;
  labelPaused: string;
}

interface AudioPlayerControlsProps {
  labelPlaying?: string;
  labelPaused?: string;
  subtitleLanguages?: AudioSubtitleLanguageOption[];
  subtitleLanguage?: string | null;
  onSubtitleLanguageChange?: (language: string | null) => void;
}

export interface AudioSubtitleLanguageOption {
  value: string;
  label: string;
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

type ExpandedPanel = 'captions' | 'volume' | null;

export function AudioPlayerControls({
  labelPlaying,
  labelPaused,
  subtitleLanguages = [],
  subtitleLanguage,
  onSubtitleLanguageChange
}: AudioPlayerControlsProps) {
  const [state, setState] = useState<AudioStateSnapshot>(() => getAudioState());
  const [isWorking, setIsWorking] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const playingLabel = typeof labelPlaying === 'string' && labelPlaying.trim() ? labelPlaying : state.labelPlaying;
  const pausedLabel = typeof labelPaused === 'string' && labelPaused.trim() ? labelPaused : state.labelPaused;
  const label = state.isPlaying ? playingLabel : pausedLabel;
  const shouldFlashIntro = !state.isPlaying && pausedLabel.trim().toLowerCase() === 'play intro';
  const hasSubtitleLanguages = subtitleLanguages.length > 0 && typeof onSubtitleLanguageChange === 'function';
  const selectedSubtitleLabel = subtitleLanguages.find((language) => language.value === subtitleLanguage)?.label;

  useEffect(() => {
    return subscribeToAudioState((next) => {
      setState(next);
      if (!next.available) {
        setExpandedPanel(null);
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

  const toggleCaptions = useCallback(() => {
    setExpandedPanel((current) => (current === 'captions' ? null : 'captions'));
  }, []);

  const toggleVolume = useCallback(() => {
    setExpandedPanel((current) => (current === 'volume' ? null : 'volume'));
  }, []);

  const closeExpanded = useCallback(() => {
    setExpandedPanel(null);
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && controlsRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
  }, []);

  if (!state.available) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-6 right-6 z-30 max-w-[90vw]">
      <div
        ref={controlsRef}
        onPointerLeave={closeExpanded}
        className={`pointer-events-auto flex items-center gap-3 rounded-full bg-black/80 text-white shadow-xl backdrop-blur transition-all duration-200 ${
          expandedPanel ? 'px-4 py-3' : 'px-2 py-2'
        }`}
      >
        <button
          type="button"
          onClick={handleToggle}
          disabled={isWorking}
          aria-label={state.isPlaying ? 'Pause audio' : 'Play audio'}
          title={label}
          className={`flex h-12 min-w-[156px] items-center gap-2 rounded-full bg-white/10 px-3 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60 ${
            shouldFlashIntro ? 'audio-intro-soft-flash-button' : ''
          }`}
        >
          <img
            src={state.isPlaying ? '/icons/ButtonPause.png' : '/icons/ButtonPlay.png'}
            alt=""
            className={`h-7 w-7 select-none ${shouldFlashIntro ? 'audio-intro-soft-flash-icon' : ''}`}
            draggable={false}
          />
          <span className="whitespace-nowrap text-sm font-medium tracking-wide">
            {label}
          </span>
        </button>

        {expandedPanel === 'captions' && hasSubtitleLanguages ? (
          <div className="flex items-center gap-2 pr-1">
            <span className="text-[11px] uppercase tracking-wide text-white/70">
              Subtitles
            </span>
            <button
              type="button"
              onClick={() => onSubtitleLanguageChange?.(null)}
              aria-pressed={!subtitleLanguage}
              className={`h-9 rounded-full px-3 text-xs font-medium transition ${
                !subtitleLanguage ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              Off
            </button>
            {subtitleLanguages.map((language) => (
              <button
                key={language.value}
                type="button"
                onClick={() => onSubtitleLanguageChange?.(language.value)}
                aria-pressed={subtitleLanguage === language.value}
                className={`h-9 rounded-full px-3 text-xs font-medium transition ${
                  subtitleLanguage === language.value ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {language.label}
              </button>
            ))}
            <button
              type="button"
              onClick={toggleCaptions}
              aria-label="Hide subtitle languages"
              title="Hide subtitle languages"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ) : expandedPanel === 'volume' ? (
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
              onClick={toggleVolume}
              aria-label="Hide volume control"
              title="Hide volume control"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            {hasSubtitleLanguages ? (
              <button
                type="button"
                onClick={toggleCaptions}
                aria-label={`Select subtitle language${selectedSubtitleLabel ? `, ${selectedSubtitleLabel} selected` : ''}`}
                title={selectedSubtitleLabel ? `Subtitles: ${selectedSubtitleLabel}` : 'Subtitles off'}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                  subtitleLanguage ? 'bg-white/20 hover:bg-white/30' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                <img
                  src="/icons/CC_icon.png"
                  alt=""
                  className="h-5 w-6 object-contain"
                  draggable={false}
                />
              </button>
            ) : null}
            <button
              type="button"
              onClick={toggleVolume}
              aria-label="Show volume control"
              title="Show volume control"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <VolumeIcon className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default AudioPlayerControls;
