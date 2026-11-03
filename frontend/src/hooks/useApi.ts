import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'

interface Result<T> {
  path: string | null
  request: string // which path + reload the result belongs to
  data: T | null
  error: ApiError | null
}

/** GET `path` (skipped while null) and re-fetch on `reload()`. A reload keeps showing the last data; a new path doesn't. */
export function useApi<T>(path: string | null) {
  const [nonce, setNonce] = useState(0)
  const [result, setResult] = useState<Result<T>>({ path: null, request: '', data: null, error: null })
  const request = `${nonce}:${path}`

  useEffect(() => {
    if (path === null) return
    let live = true
    api<T>('GET', path).then(
      (data) => live && setResult({ path, request, data, error: null }),
      (error: ApiError) => live && setResult({ path, request, data: null, error }),
    )
    return () => {
      live = false
    }
  }, [path, request])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const settled = path === null || result.request === request
  return {
    data: result.path === path ? result.data : null,
    error: settled && path !== null ? result.error : null,
    loading: !settled,
    reload,
  }
}
