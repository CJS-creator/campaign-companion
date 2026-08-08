declare module "@react-email/render" {
  export function render(element: React.ReactElement, options?: { plainText?: boolean }): Promise<string>;
}

declare module "@lovable.dev/email-js" {
  export class EmailAPIError extends Error {
    code: string;
    status: number;
  }
  export function sendLovableEmail(payload: any, options: { apiKey: string; sendUrl?: string | undefined }): Promise<any>;
}
