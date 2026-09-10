export class AppError extends Error {
  status: number
  code: string
  fieldErrors?: Record<string, string>

  constructor(
    message: string,
    options: { status?: number; code?: string; fieldErrors?: Record<string, string> } = {},
  ) {
    super(message)
    this.name = 'AppError'
    this.status = options.status ?? 400
    this.code = options.code ?? 'bad_request'
    this.fieldErrors = options.fieldErrors
  }
}

export const notFound = (message = 'Мэдээлэл олдсонгүй') =>
  new AppError(message, { status: 404, code: 'not_found' })

export const forbidden = (message = 'Танд энэ үйлдлийг хийх эрх байхгүй') =>
  new AppError(message, { status: 403, code: 'forbidden' })

export const unauthorized = (message = 'Нэвтэрнэ үү') =>
  new AppError(message, { status: 401, code: 'unauthorized' })

export const conflict = (message: string) =>
  new AppError(message, { status: 409, code: 'conflict' })
