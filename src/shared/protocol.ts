export type WebViewToUxpMessage =
  | {
      type: "REQUEST_ACTIVE_LAYER";
      maxPreviewDim?: number;
      purpose?: "PREVIEW" | "COMMIT";
      _msgId?: string;
    }
  | {
      type: "COMMIT_LAYER";
      name: string;
      width: number;
      height: number;
      blendMode: string;
      opacity: number;
      buffer: ArrayBuffer | Uint8Array | string;
      base64?: string;
      _msgId?: string;
    };

export type UxpToWebViewMessage =
  | {
      type: "LAYER_PIXELS";
      width: number;
      height: number;
      channels: number;
      buffer: Uint8Array;
      base64?: string;
      purpose?: "PREVIEW" | "COMMIT";
      docWidth?: number;
      docHeight?: number;
    }
  | { type: "COMMIT_DONE" }
  | { type: "ERROR"; message: string };
