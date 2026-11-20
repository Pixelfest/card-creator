/** The ProblemDetails JSON the server returns for every error. */
export type Problem = { title?: string; detail?: string; status?: number }

export class ApiError extends Error {
  readonly status: number
  readonly problem: Problem | undefined

  constructor(status: number, problem: Problem | undefined) {
    super(problem?.title ?? `Request failed with status ${status}`)
    this.status = status
    this.problem = problem
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  // JSON bodies are strings; a FormData body gets its multipart Content-Type from the browser.
  const headers = new Headers(init?.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  if (typeof init?.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...init, headers })
  if (!response.ok) {
    let problem: Problem | undefined
    try {
      problem = (await response.json()) as Problem
    } catch {
      problem = undefined
    }
    throw new ApiError(response.status, problem)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
