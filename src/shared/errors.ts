export type ErrorCode
  = | 'UNKNOWN'
    | 'SPACE_NOT_FOUND'
    | 'SPACE_BUSY'
    | 'SCRIPT_NOT_FOUND'
    | 'SCRIPT_EXISTS'
    | 'INVALID_SCRIPT_NAME'
    | 'UNSUPPORTED_SCRIPT'
    | 'NO_NODE_VERSION'
    | 'RUNTIME_NOT_INSTALLED'
    | 'RUNTIME_INSTALLING'
    | 'VERSION_NOT_FOUND'
    | 'DOWNLOAD_FAILED'
    | 'CHECKSUM_MISMATCH'
    | 'DEPS_BUSY'
    | 'BUILD_FAILED'
    | 'RUN_NOT_FOUND'
    | 'PROJECT_NOT_FOUND'
    | 'PROJECT_ALREADY_IMPORTED'
    | 'INVALID_PROJECT'
    | 'PACKAGE_MANAGER_NOT_FOUND'

export interface SerializedError {
  code: ErrorCode
  message: string
  params?: Record<string, string | number>
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
    public readonly params?: Record<string, string | number>,
  ) {
    super(message ?? code)
    this.name = 'AppError'
  }
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof AppError)
    return { code: error.code, message: error.message, params: error.params }
  return { code: 'UNKNOWN', message: error instanceof Error ? error.message : String(error) }
}
