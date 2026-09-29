import { runtimeAssetCandidates, type RuntimeAsset } from '../config/assetResolution';

/** Browser image caching may reuse bytes, but each open keeps canonical delivery order. */
export function materialModalCandidates(meta: { imageAsset?: RuntimeAsset; pdfAsset?: RuntimeAsset }): { type: 'image' | 'pdf'; candidates: string[] } {
  const pdf = runtimeAssetCandidates(meta.pdfAsset);
  return pdf.length ? { type: 'pdf', candidates: [...pdf] } : { type: 'image', candidates: [...runtimeAssetCandidates(meta.imageAsset)] };
}
