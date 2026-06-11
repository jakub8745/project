import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { DoubleSide, Group } from 'three';

import {
  getAudioPlaybackSnapshot,
  type AudioSubtitleCue,
  type AudioSubtitleTrack
} from '../modules/audioMeshManager.ts';

export function XrAudioSubtitlePanel({
  tracks,
  language
}: {
  tracks?: Array<{ id: string; subtitleTracks?: AudioSubtitleTrack[] }>;
  language?: string | null;
}) {
  const { camera, gl } = useThree();
  const groupRef = useRef<Group | null>(null);
  const activeTextRef = useRef<string | null>(null);
  const [activeText, setActiveText] = useState<string | null>(null);
  const subtitleTracks = useMemo(() => {
    if (!language) return [];
    return (tracks ?? [])
      .map((track) => {
        const selectedTrack = track.subtitleTracks?.find((subtitleTrack) => subtitleTrack.language === language);
        return selectedTrack ? { id: track.id, cues: selectedTrack.cues } : null;
      })
      .filter((track): track is { id: string; cues: AudioSubtitleCue[] } => track !== null && track.cues.length > 0);
  }, [language, tracks]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return undefined;
    camera.add(group);
    return () => {
      group.removeFromParent();
    };
  }, [camera]);

  useEffect(() => {
    activeTextRef.current = null;
    setActiveText(null);
  }, [subtitleTracks]);

  useFrame(() => {
    let nextText: string | null = null;
    if (gl.xr.isPresenting && subtitleTracks.length > 0) {
      for (const track of subtitleTracks) {
        const snapshot = getAudioPlaybackSnapshot(track.id);
        if (!snapshot?.isPlaying) continue;
        const cue = track.cues.find((entry) => snapshot.currentTime >= entry.start && snapshot.currentTime < entry.end);
        if (cue) {
          nextText = cue.text;
          break;
        }
      }
    }

    if (activeTextRef.current !== nextText) {
      activeTextRef.current = nextText;
      setActiveText(nextText);
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.58, -2.15]} visible={Boolean(activeText)}>
      <mesh renderOrder={2000}>
        <planeGeometry args={[2.25, 0.42]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.78}
          depthTest={false}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <Text
        position={[0, 0, 0.018]}
        fontSize={0.065}
        maxWidth={1.95}
        lineHeight={1.15}
        anchorX="center"
        anchorY="middle"
        textAlign="center"
        renderOrder={2001}
      >
        {activeText ?? ''}
        <meshBasicMaterial color="#ffffff" depthTest={false} depthWrite={false} />
      </Text>
    </group>
  );
}
