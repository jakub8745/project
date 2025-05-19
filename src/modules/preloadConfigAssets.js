export async function preloadConfigAssets(config, onProgress) {
    let loaded = 0;
    let total = 0;

    const fetchAsBlob = async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url}`);
        return await response.blob();
    };

    const preloadImage = (url) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = url.startsWith('ipfs://') ? ipfsToHttp(url) : url;
            img.onload = () => {
                loaded++;
                if (onProgress) onProgress(loaded / total);
                resolve(img);
            };
            img.onerror = (e) => reject(e);
        });
    };

    function ipfsToHttp(ipfsUri, gateways = ['https://ipfs.io/ipfs', 'https://cloudflare-ipfs.com/ipfs']) {
        if (ipfsUri.startsWith('ipfs://')) {
            const cid = ipfsUri.slice(7);
            return `${gateways[0]}/${cid}`;
        }
        return ipfsUri;
    }

    // 🧠 Calculate total first:
    if (config.images) total += Object.keys(config.images).length;
    if (config.modelPath) total += 1;
    if (config.interactivesPath) total += 1;
    if (config.sidebar?.items) {
        total += config.sidebar.items.filter(item => item.icon).length;
    }

    if (total === 0) {
        if (onProgress) onProgress(1); // Immediately complete if no assets
        return;
    }

    // 🧠 Start preloading
    const preloadTasks = [];

    if (config.images) {
        const entries = Object.entries(config.images);
        preloadTasks.push(...entries.map(async ([key, meta]) => {
            meta.img = await preloadImage(meta.imagePath);
        }));
    }

    if (config.modelPath) {
        preloadTasks.push(fetchAsBlob(config.modelPath).then(blob => {
            config.modelBlob = blob;
            loaded++;
            if (onProgress) onProgress(loaded / total);
        }));
    }

    if (config.interactivesPath) {
        preloadTasks.push(fetchAsBlob(config.interactivesPath).then(blob => {
            config.interactivesBlob = blob;
            loaded++;
            if (onProgress) onProgress(loaded / total);
        }));
    }

    if (config.sidebar?.items) {
        preloadTasks.push(...config.sidebar.items.map(async (item) => {
            if (item.icon) {
                item.img = await preloadImage(item.icon);
            }
        }));
    }

    await Promise.all(preloadTasks);
}
