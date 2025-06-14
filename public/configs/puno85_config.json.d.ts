interface InfoItem {
  id: string;
  label: string;
  icon: string;
  content: string;
}

declare module 'puno85_config.json' {
  const galleryConfig: {
    sidebar: {
      items: InfoItem[];
    };
  };
  export default galleryConfig;
}