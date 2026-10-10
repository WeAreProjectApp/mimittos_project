import { renderHook, act, waitFor } from '@testing-library/react'
import { useColorImageUpload } from '../useColorImageUpload'
import { uploadColorImageWithRetry } from '@/lib/services/colorImageUpload'
import { peluchAdminService } from '@/lib/services/peluchAdminService'

jest.mock('@/lib/services/colorImageUpload', () => ({ uploadColorImageWithRetry: jest.fn() }))
jest.mock('@/lib/services/peluchAdminService', () => ({
  peluchAdminService: { deleteColorImage: jest.fn() },
}))
jest.mock('@/lib/utils/imageCompressor', () => ({
  compressImage: jest.fn((f: File) => Promise.resolve(f)),
  ImageTooLargeError: class ImageTooLargeError extends Error {},
}))

const mockUpload = uploadColorImageWithRetry as jest.Mock
const mockDelete = peluchAdminService.deleteColorImage as jest.Mock
const file = () => new File(['x'], 'a.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  jest.clearAllMocks()
  mockDelete.mockReset()
  global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock')
  global.URL.revokeObjectURL = jest.fn()
})

it('marks an image as done after a successful upload', async () => {
  mockUpload.mockResolvedValue({ id: 9, color_id: 1, url: '/srv.jpg' })
  const { result } = renderHook(() =>
    useColorImageUpload({ resolveUploadSlug: async () => 'osito' }),
  )

  await act(async () => { await result.current.uploadFiles('rojo', [file()]) })

  await waitFor(() => {
    expect(result.current.colorGallery.rojo[0].status).toBe('done')
  })
  expect(result.current.colorGallery.rojo[0].id).toBe(9)
})

it('marks an image as failed when the upload throws', async () => {
  mockUpload.mockRejectedValue({ response: { status: 413 } })
  const { result } = renderHook(() =>
    useColorImageUpload({ resolveUploadSlug: async () => 'osito' }),
  )

  await act(async () => { await result.current.uploadFiles('rojo', [file()]) })

  await waitFor(() => {
    expect(result.current.colorGallery.rojo[0].status).toBe('failed')
  })
})

it('reports pending work while an image is failed', async () => {
  mockUpload.mockRejectedValue({ response: { status: 413 } })
  const { result } = renderHook(() =>
    useColorImageUpload({ resolveUploadSlug: async () => 'osito' }),
  )

  await act(async () => { await result.current.uploadFiles('rojo', [file()]) })

  await waitFor(() => expect(result.current.hasPendingWork).toBe(true))
})

it('retries a failed image and marks it done on success', async () => {
  mockUpload.mockRejectedValueOnce({ response: { status: 413 } })
  const { result } = renderHook(() =>
    useColorImageUpload({ resolveUploadSlug: async () => 'osito' }),
  )
  await act(async () => { await result.current.uploadFiles('rojo', [file()]) })
  await waitFor(() => expect(result.current.colorGallery.rojo[0].status).toBe('failed'))

  mockUpload.mockResolvedValue({ id: 5, color_id: 1, url: '/srv.jpg' })
  await act(async () => { await result.current.retryAll() })

  await waitFor(() => expect(result.current.colorGallery.rojo[0].status).toBe('done'))
})

const savedPhoto = { key: 'saved-photo', id: 9, url: '/srv.jpg', status: 'done' as const }

it.each([
  ['404', { response: { status: 404 } }],
  ['500', { response: { status: 500 } }],
  ['network failure', new Error('Network Error')],
])('preserves the persisted photo after deletion returns %s', async (_name, error) => {
  mockDelete.mockRejectedValue(error)
  const { result } = renderHook(() => useColorImageUpload({
    resolveUploadSlug: async () => 'osito',
    initialGallery: { rojo: [savedPhoto] },
  }))

  await act(async () => {
    await expect(result.current.removeImage('rojo', savedPhoto.key)).rejects.toEqual(error)
  })

  expect(result.current.colorGallery.rojo).toEqual([savedPhoto])
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
})

it('removes only the confirmed persisted photo', async () => {
  mockDelete.mockResolvedValue(undefined)
  const otherPhoto = { ...savedPhoto, key: 'other-photo', id: 10, url: '/other.jpg' }
  const { result } = renderHook(() => useColorImageUpload({
    resolveUploadSlug: async () => 'osito',
    initialGallery: { rojo: [savedPhoto, otherPhoto] },
  }))

  await act(async () => { await result.current.removeImage('rojo', savedPhoto.key) })

  expect(result.current.colorGallery.rojo).toEqual([otherPhoto])
  expect(mockDelete).toHaveBeenCalledWith('osito', 'rojo', 9)
})

it('removes a local photo without a persisted ID', async () => {
  const localPhoto = { key: 'local-photo', id: null, url: 'blob:local', status: 'failed' as const }
  const { result } = renderHook(() => useColorImageUpload({
    resolveUploadSlug: async () => 'osito',
    initialGallery: { rojo: [localPhoto] },
  }))

  await act(async () => { await result.current.removeImage('rojo', localPhoto.key) })

  expect(result.current.colorGallery.rojo).toEqual([])
  expect(mockDelete).not.toHaveBeenCalled()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local')
})
