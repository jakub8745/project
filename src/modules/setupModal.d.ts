export declare function setupModal(
  imagesMap: Record<
    string,
    {
      title: string;
      description?: string;
      author?: string;
      img?: { src: string };
    }
  >
): (userData: any) => void;

export declare function makeModalDraggable(
  popup: HTMLElement,
  handle?: HTMLElement
): void;
