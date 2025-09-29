export interface ModalUserData extends Record<string, unknown> {
  name?: string;
  title?: string;
  description?: string;
  author?: string;
  url?: string;
}

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
): (userData: ModalUserData) => void;

export declare function makeModalDraggable(
  popup: HTMLElement,
  handle?: HTMLElement
): void;
