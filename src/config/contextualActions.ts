import { compileRuntimeAsset, runtimeAssetCandidates } from './assetResolution';
import { isIpfsUri, getFilename } from '../utils/ipfs';
import { COMMON_ICONS } from '../data/galleryConfig';
import { normalizeConfigUrl, toSafeExternalUrl } from '../utils/url';
import { sanitizeSidebarHtml } from '../utils/sanitizeHtml';

export interface InfoItem {
  id: string;
  label: string;
  icon: string;
  content?: string;
  link?: string;
  pdfPath?: string;
  pdfOpenLabel?: string;
  videoPath?: string;
  videoType?: string;
  videoPoster?: string;
  iconCandidates?: string[];
  pdfCandidates?: string[];
  videoCandidates?: string[];
  videoPosterCandidates?: string[];
}

interface SidebarItemConfig {
  id: string;
  label: string;
  icon?: string;
  iconAsset?: string;
  target?: string;
  contentMedia?: string;
  content?: string;
  link?: string;
  pdfPath?: string;
  pdfOpenLabel?: string;
  openLabel?: string;
  videoPath?: string;
  videoType?: string;
  videoPoster?: string;
}

interface ExhibitConfigResponse {
  id?: string;
  metadata?: {
    description?: string;
  };
  assets?: Record<string, { uri?: string; sourceUri?: string; ipfsUri?: string | null; fallbackUris?: string[]; mimeType?: string }>;
  media?: Record<string, {
    kind?: string;
    description?: string;
    text?: string;
    document?: { asset?: string; uri?: string } | string;
    openUri?: string;
    openLabel?: string;
    sources?: Array<{ asset?: string }>;
    poster?: { asset?: string };
  }>;
  sidebar?: {
    items?: SidebarItemConfig[];
  };
}

function normalizePublicAssetUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('public/')) {
    return `/${trimmed.slice('public/'.length)}`;
  }
  if (isIpfsUri(trimmed)) return runtimeAssetCandidates(compileRuntimeAsset({ sourceUri: trimmed }))[0];
  return normalizeConfigUrl(trimmed);
}

function normalizePublicAssetCandidates(candidates: string[]): string[] {
  return [...new Set(candidates.map((candidate) => normalizePublicAssetUrl(candidate)).filter((url): url is string => Boolean(url)))];
}

function resolvePublicUriCandidates(uri: string | undefined): string[] {
  if (!uri) return [];
  return normalizePublicAssetCandidates(runtimeAssetCandidates(compileRuntimeAsset({ sourceUri: uri })));
}

function resolveConfigAssetCandidates(cfg: ExhibitConfigResponse, assetId: string | undefined): string[] {
  if (!assetId) return [];
  return normalizePublicAssetCandidates(runtimeAssetCandidates(compileRuntimeAsset(cfg.assets?.[assetId])));
}

function resolveSidebarMediaContent(cfg: ExhibitConfigResponse, mediaId: string | undefined): string | undefined {
  if (!mediaId) return undefined;
  const media = cfg.media?.[mediaId];
  if (!media) return undefined;
  if (media.kind === 'text') return media.text;
  return media.description;
}

function resolveSidebarDocumentPaths(cfg: ExhibitConfigResponse, mediaId: string | undefined): string[] {
  if (!mediaId) return [];
  const media = cfg.media?.[mediaId];
  if (!media || media.kind !== 'document') return [];
  const document = media.document;
  if (!document) return [];
  if (typeof document === 'string') return resolvePublicUriCandidates(document);
  if (document.asset) return resolveConfigAssetCandidates(cfg, document.asset);
  return resolvePublicUriCandidates(document.uri);
}

function resolveSidebarVideoPaths(cfg: ExhibitConfigResponse, mediaId: string | undefined): string[] {
  if (!mediaId) return [];
  const media = cfg.media?.[mediaId];
  if (!media || media.kind !== 'video') return [];
  return resolveConfigAssetCandidates(cfg, media.sources?.[0]?.asset);
}

function resolveSidebarPosterPaths(cfg: ExhibitConfigResponse, mediaId: string | undefined): string[] {
  if (!mediaId) return [];
  const media = cfg.media?.[mediaId];
  if (!media || media.kind !== 'video') return [];
  return resolveConfigAssetCandidates(cfg, media.poster?.asset);
}

/** Compile contextual actions once from the selected manifest's content. */
export function compileContextualActions(cfg: ExhibitConfigResponse): InfoItem[] {
  const sidebarItems = cfg.sidebar?.items ?? [];
  // Keep gallery-specific sidebar items, excluding the global help item
  // because help content is shown in the startup modal.
  const merged: Array<InfoItem | SidebarItemConfig> = sidebarItems.filter((item) => item.id !== 'help-icon');
  const normalized: InfoItem[] = merged.map((item) => {
    const mediaId =
      'contentMedia' in item && typeof item.contentMedia === 'string'
        ? item.contentMedia
        : 'target' in item && typeof item.target === 'string'
          ? item.target
          : undefined;
    const iconFromAssetCandidates =
      'iconAsset' in item && typeof item.iconAsset === 'string'
        ? resolveConfigAssetCandidates(cfg, item.iconAsset)
        : [];
    const baseIconCandidates = 'icon' in item && typeof item.icon === 'string'
      ? resolvePublicUriCandidates(item.icon)
      : iconFromAssetCandidates;
    const baseIcon = baseIconCandidates[0] ?? '';
    const link = 'link' in item ? item.link : undefined;
    const content =
      'content' in item && typeof item.content === 'string'
        ? item.content
        : resolveSidebarMediaContent(cfg, mediaId) ??
          (item.id === 'info-icon' ? cfg.metadata?.description : undefined);
    const pdfCandidates = 'pdfPath' in item && typeof item.pdfPath === 'string'
      ? resolvePublicUriCandidates(item.pdfPath)
      : resolveSidebarDocumentPaths(cfg, mediaId);
    const videoCandidates = 'videoPath' in item && typeof item.videoPath === 'string'
      ? resolvePublicUriCandidates(item.videoPath)
      : resolveSidebarVideoPaths(cfg, mediaId);
    const videoType = 'videoType' in item && typeof item.videoType === 'string' ? item.videoType : undefined;
    const videoPosterCandidates = 'videoPoster' in item && typeof item.videoPoster === 'string'
      ? resolvePublicUriCandidates(item.videoPoster)
      : resolveSidebarPosterPaths(cfg, mediaId);
    const pdfOpenLabel =
      'pdfOpenLabel' in item && typeof item.pdfOpenLabel === 'string'
        ? item.pdfOpenLabel
        : 'openLabel' in item && typeof item.openLabel === 'string'
          ? item.openLabel
          : mediaId && cfg.media?.[mediaId]?.openLabel
            ? cfg.media[mediaId].openLabel
          : undefined;
    // Prefer common icons for well-known ids
    let overrideIcon: string | undefined;
    if (item.id === 'info-icon') overrideIcon = COMMON_ICONS.info;
    // Also map by filename for shared assets regardless of id
    const resolvedBaseIcon = normalizePublicAssetUrl(baseIcon);
    const base = resolvedBaseIcon ? getFilename(resolvedBaseIcon) : '';
    if (!overrideIcon) {
      if (base === 'logo_BPA_256px.gif') overrideIcon = COMMON_ICONS.logoBpa;
      else if (base === 'info.png') overrideIcon = COMMON_ICONS.info;
    }
    // Fallback: BPA links use shared logo
    if (!overrideIcon && link && link.includes('bluepointart.uk')) {
      overrideIcon = COMMON_ICONS.logoBpa;
    }

    const resolvedIconCandidates = overrideIcon ? [overrideIcon] : baseIconCandidates;
    const resolvedIcon = resolvedIconCandidates[0] || resolvedBaseIcon;

    return {
      id: item.id,
      label: item.label,
      icon: resolvedIcon || COMMON_ICONS.info,
      iconCandidates: resolvedIconCandidates.length ? resolvedIconCandidates : [COMMON_ICONS.info],
      content,
      link: toSafeExternalUrl(link) ?? undefined,
      pdfPath: pdfCandidates[0],
      pdfCandidates,
      pdfOpenLabel,
      videoPath: videoCandidates[0],
      videoCandidates,
      videoType,
      videoPoster: videoPosterCandidates[0],
      videoPosterCandidates
    };
  });
  return normalized.map((item) => ({
    ...item,
    content: sanitizeSidebarHtml(item.content)
  }));
}
