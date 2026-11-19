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
  const response = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    let problem: Problem | undefined
    try {
      problem = (await response.json()) as Problem
    } catch {
      problem = undefined
    }
    throw new ApiError(response.status, problem)
  }
  return (await response.json()) as T
}
