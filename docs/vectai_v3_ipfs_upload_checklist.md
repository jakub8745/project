# VECT-AI v3 IPFS Upload Checklist

Generated for `vectai_krakow_032026` on 2026-06-11.

Upload every asset below to IPFS, then replace the matching `assets.<id>.ipfsUri` values in `public/configs/vectai_krakow_032026_config_v3.json`. Also update the NFT token metadata template fields `image`, `animation_url`, `properties.manifest`, and `properties.files[]`.

## Upload Order

1. Upload all media/model/document assets except `manifest_v3_json`.
2. Replace all asset `ipfsUri` placeholders in the v3 config.
3. Fill missing rights/license fields.
4. Freeze the v3 manifest.
5. Upload the final v3 manifest itself as `manifest_v3_json`.
6. Export/upload final NFT metadata JSON pointing to the manifest, preview image, and scene model CIDs.

## Local Assets Available in This Repo (18)

| id | kind | source | local path | bytes | sha256 | placeholder IPFS URI |
|---|---|---|---|---:|---|---|
| manifest_v3_json | manifest | /configs/vectai_krakow_032026_config_v3.json | public/configs/vectai_krakow_032026_config_v3.json |  |  | ipfs://CID_FOR_manifest_v3_json |
| scene_model | model | /models/vectai_room.glb | public/models/vectai_room.glb | 15057924 | 8446cba22eb06ea22aa2a09e156d331ce7027fe79a8ab3a8c122c031c04ef657 | ipfs://CID_FOR_scene_model |
| og_image | image | /textures/vectai/og_image_vectai.jpg | public/textures/vectai/og_image_vectai.jpg | 120799 | 005e79048f910ce7c574013af7256b683aa0c662c26f743fac04a2e3dd002bd9 | ipfs://CID_FOR_og_image |
| manual_thumb | image | /textures/thubm_PeknieciaSensu.jpg | public/textures/thubm_PeknieciaSensu.jpg | 67627 | 198cc7edfc5abd9ba59c9062221cbcc3788f615cc9c88551e0daafb10bba1a51 | ipfs://CID_FOR_manual_thumb |
| manual_pl_pdf | document | /pdfs/pekniecia_sensu.pdf | public/pdfs/pekniecia_sensu.pdf | 7147232 | 1d2bbf3316dc07ef106d3d17fea215b38c708b7de6a70a9f4fd36c8ce998003f | ipfs://CID_FOR_manual_pl_pdf |
| manual_en_pdf | document | /pdfs/CRACKS OF MEANING_ENG.pdf | public/pdfs/CRACKS OF MEANING_ENG.pdf | 267930 | edf634d638711b5969685dc74da6578726974ede9fbd599856d1cdb40d7bf3da | ipfs://CID_FOR_manual_en_pdf |
| poster_obowiazki | image | /textures/vectai/cracks_title.png | public/textures/vectai/cracks_title.png | 404815 | c0f8cf88dc492cf952280633845e49fed2101336bec97363a03a74ffca723644 | ipfs://CID_FOR_poster_obowiazki |
| scanning01_image | image | /textures/vectai/skanowanie01.jpeg | public/textures/vectai/skanowanie01.jpeg | 273447 | c8e428d3057cbc3fe1bbbe69b343fb6d0643215da3f2ca18420278c4f7d9f48d | ipfs://CID_FOR_scanning01_image |
| second_day_image | image | /textures/vectai/2dzien.jpeg | public/textures/vectai/2dzien.jpeg | 171591 | 474e3e3db174a1b4e6d9124bb21d096dabf444d5b8f4c65febb3f5d7c9f2fcbf | ipfs://CID_FOR_second_day_image |
| zajac_image | image | /textures/vectai/zajac_g4.jpg | public/textures/vectai/zajac_g4.jpg | 58630 | 20882d7b663f71dbbc75d310b9d19205fcb4b62dcda1554f51f0c56c6c005aaf | ipfs://CID_FOR_zajac_image |
| parasol_image | image | /textures/vectai/parasol.jpg | public/textures/vectai/parasol.jpg | 67447 | 291eb20eeb0c9ff2d05579ccd796387ed4690b6960f5750bffd614b3cac4aed1 | ipfs://CID_FOR_parasol_image |
| snake_image | image | /textures/vectai/waz.jpg | public/textures/vectai/waz.jpg | 39584 | 3c49783457a874e8d279dec6fe3ae6b380f410d32d659e16a1bcbdb2c91f0d0a | ipfs://CID_FOR_snake_image |
| baletnica_image | image | /textures/vectai/baletnica.jpg | public/textures/vectai/baletnica.jpg | 40473 | 1015e128caee054e4e632ccac609a4f0d395120878d34cfcad4ef0d7f6456cb8 | ipfs://CID_FOR_baletnica_image |
| text_layer_01 | image | /textures/vectai/kartka01.jpg | public/textures/vectai/kartka01.jpg | 218488 | a3d346a0342d0018a302f58982009ae22f18215be863357bccae36c50e450924 | ipfs://CID_FOR_text_layer_01 |
| text_layer_02 | image | /textures/vectai/kartka02.jpg | public/textures/vectai/kartka02.jpg | 211942 | 0da796118b85ff59a284ef6d942107f227f3bdde75f02c2a3180c7f51ed46462 | ipfs://CID_FOR_text_layer_02 |
| text_layer_03 | image | /textures/vectai/kartka03.jpg | public/textures/vectai/kartka03.jpg | 286459 | b90b06c869091dad68b408129e52b9ffec4501e90c998d5e20297bb009fb3ac2 | ipfs://CID_FOR_text_layer_03 |
| audio_intro_mp3 | audio | /audio/introduction_Cracks of Meaning.mp3 | public/audio/introduction_Cracks of Meaning.mp3 | 929375 | 94c1945577f42ca72c694b630941f288e629da9105afde9de8a2828669a6f2f7 | ipfs://CID_FOR_audio_intro_mp3 |
| audio_intro_subtitles | subtitle | /audio/vectai_intro_subtitles.json | public/audio/vectai_intro_subtitles.json | 6584 | b6e2d09c1f58e9c4f211c5fa3db33ecd1df536ed50087b2e2d3c4844763e82ec | ipfs://CID_FOR_audio_intro_subtitles |

## Remote-Only Assets to Download or Pin (8)

These are currently referenced through OCI object-storage URLs. For minting, do not rely only on these mutable HTTP URLs. Download them, verify their MIME type/duration/size, upload to IPFS, and fill `byteSize` and `sha256` in v3.

| id | kind | source | local path | bytes | sha256 | placeholder IPFS URI |
|---|---|---|---|---:|---|---|
| left_screen_poster | image | https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/vectai/o/lewy.jpg |  |  |  | ipfs://CID_FOR_left_screen_poster |
| middle_screen_poster | image | https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/vectai/o/srodek.jpg |  |  |  | ipfs://CID_FOR_middle_screen_poster |
| right_screen_poster | image | https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/vectai/o/prawy.jpg |  |  |  | ipfs://CID_FOR_right_screen_poster |
| left_screen_video | video | https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/vectai/o/lewy_ekran.mp4 |  |  |  | ipfs://CID_FOR_left_screen_video |
| middle_screen_video | video | https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/vectai/o/srodek_ekran.mp4 |  |  |  | ipfs://CID_FOR_middle_screen_video |
| right_screen_video | video | https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/vectai/o/prawy_ekran.mp4 |  |  |  | ipfs://CID_FOR_right_screen_video |
| audio_left_mp3 | audio | https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/vectai/o/left_audio.mp3 |  |  |  | ipfs://CID_FOR_audio_left_mp3 |
| audio_right_mp3 | audio | https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/vectai/o/right_audio.mp3 |  |  |  | ipfs://CID_FOR_audio_right_mp3 |

## Required Final URI Replacements

- `assets.*.ipfsUri`: replace every `null` with `ipfs://<CID>`.
- `nft.tokenMetadataTemplate.image`: use `assets.og_image.ipfsUri`.
- `nft.tokenMetadataTemplate.animation_url`: use `assets.scene_model.ipfsUri` or a packaged viewer URI if preferred by the minting platform.
- `nft.tokenMetadataTemplate.properties.manifest`: use `assets.manifest_v3_json.ipfsUri`.
- `nft.tokenMetadataTemplate.properties.files[]`: replace every placeholder URI with the matching asset CID.
