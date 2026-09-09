export function readJsonResponse(response: Response, path?: string): Promise<any>;
export function requestJson(path: string, options?: RequestInit, fetcher?: (url: string, options?: RequestInit) => Promise<Response>): Promise<any>;
