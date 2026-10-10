import { describe, it, expect, beforeEach } from '@jest/globals'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

jest.mock('@/lib/services/peluchService', () => ({
  peluchService: {
    getCategories: jest.fn(),
    getColors: jest.fn(),
    getSizes: jest.fn(),
  },
}))

jest.mock('@/lib/services/peluchAdminService', () => ({
  peluchAdminService: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    uploadColorImage: jest.fn(),
    deleteColorImage: jest.fn(),
  },
}))

jest.mock('@/lib/services/globalPresetService', () => ({
  globalPresetService: {
    createColor: jest.fn(),
    createSize: jest.fn(),
    deleteColor: jest.fn(),
    deleteSize: jest.fn(),
    getColorUsage: jest.fn(),
    getSizeUsage: jest.fn(),
  },
}))

jest.mock('@/lib/utils/imageCompressor', () => ({
  compressImage: jest.fn((file: File) => Promise.resolve(file)),
  ImageTooLargeError: class ImageTooLargeError extends Error {},
}))

jest.mock('@/lib/services/colorImageUpload', () => ({
  uploadColorImageWithRetry: jest.fn(),
}))

jest.mock('@/lib/utils/confirmDelete', () => ({
  confirmDangerousDelete: jest.fn(),
  buildColorImpact: jest.fn(() => []),
  buildSizeImpact: jest.fn(() => []),
  notifyDeleteError: jest.fn(),
}))

import { useRouter } from 'next/navigation'
import { peluchService } from '@/lib/services/peluchService'
import { peluchAdminService } from '@/lib/services/peluchAdminService'
import { uploadColorImageWithRetry } from '@/lib/services/colorImageUpload'
import { globalPresetService } from '@/lib/services/globalPresetService'
import { confirmDangerousDelete } from '@/lib/utils/confirmDelete'
import { PeluchForm } from '../PeluchForm'
import type { PeluchDetail } from '@/lib/types'

const mockUseRouter = useRouter as unknown as jest.Mock

const mockCategories = [{
  id: 1,
  name: 'Ositos',
  slug: 'ositos',
  description: '',
  display_order: 1,
  is_active: true,
  is_featured: false,
  image_url: null,
}]
const mockColors = [{ id: 1, name: 'Coral', slug: 'coral', hex_code: '#FF6B6B', sort_order: 1 }]
const mockSizes = [{ id: 1, label: 'S', slug: 's', cm: '20cm', sort_order: 1 }]

const mockExisting: PeluchDetail = {
  id: 1,
  title: 'Osito Coral',
  slug: 'osito-coral',
  category_name: 'Ositos',
  category_slug: 'ositos',
  category: {
    id: 1,
    name: 'Ositos',
    slug: 'ositos',
    description: '',
    display_order: 1,
    is_active: true,
    is_featured: false,
    image_url: null,
  },
  lead_description: 'El oseznito más querido',
  badge: 'bestseller',
  is_active: true,
  is_featured: true,
  discount_pct: 0,
  display_order: 100,
  min_price: 85000,
  discounted_min_price: 85000,
  available_colors: [{ id: 1, name: 'Coral', slug: 'coral', hex_code: '#FF6B6B', sort_order: 1, preview_url: null, image_count: 0, images: [] }],
  gallery_urls: [],
  average_rating: 4.9,
  review_count: 10,
  has_huella: false,
  has_corazon: false,
  has_audio: false,
  description: ['Párrafo 1'],
  specifications: { Material: 'Felpa' },
  care_instructions: ['Lavar a mano'],
  size_prices: [],
  view_count: 50,
  huella_extra_cost: 0,
  corazon_extra_cost: 0,
  audio_extra_cost: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
}

const photoDeletionError = 'No pudimos confirmar la eliminación de la imagen. Intenta de nuevo.'
const existingWithPhotos: PeluchDetail = {
  ...mockExisting,
  available_colors: [{
    ...mockExisting.available_colors[0],
    image_count: 2,
    images: [{ id: 9, url: '/saved.jpg' }, { id: 10, url: '/other.jpg' }],
  }],
}

describe('PeluchForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(peluchAdminService.deleteColorImage as jest.Mock).mockReset()
    mockUseRouter.mockReturnValue({ push: jest.fn() })
    ;(peluchService.getCategories as jest.Mock).mockResolvedValue(mockCategories)
    ;(peluchService.getColors as jest.Mock).mockResolvedValue(mockColors)
    ;(peluchService.getSizes as jest.Mock).mockResolvedValue(mockSizes)
    global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock')
    global.URL.revokeObjectURL = jest.fn()
  })

  it.each([
    ['404', { response: { status: 404 } }],
    ['500', { response: { status: 500 } }],
    ['network failure', new Error('Network Error')],
  ])('reports an unconfirmed photo deletion after %s', async (_name, error) => {
    ;(peluchAdminService.deleteColorImage as jest.Mock).mockRejectedValue(error)
    render(<PeluchForm existing={existingWithPhotos} />)
    const removeButtons = await screen.findAllByTestId('peluch-color-photo-remove')

    await userEvent.click(removeButtons[0])

    expect(await screen.findByText(photoDeletionError)).toBeVisible()
    expect(screen.getAllByTestId('peluch-color-photo')).toHaveLength(2)
    expect(screen.getAllByTestId('peluch-color-photo')[0].querySelector('img')).toHaveAttribute('src', '/saved.jpg')
  })

  it('recovers a failed photo deletion on the next confirmed attempt', async () => {
    let finishDelete!: () => void
    const pendingDelete = new Promise<void>((resolve) => { finishDelete = resolve })
    ;(peluchAdminService.deleteColorImage as jest.Mock)
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockReturnValueOnce(pendingDelete)
    render(<PeluchForm existing={existingWithPhotos} />)
    const removeButtons = await screen.findAllByTestId('peluch-color-photo-remove')
    await userEvent.click(removeButtons[0])
    await screen.findByText(photoDeletionError)

    await userEvent.click(screen.getAllByTestId('peluch-color-photo-remove')[0])

    expect(screen.queryByText(photoDeletionError)).not.toBeInTheDocument()
    expect(screen.getAllByTestId('peluch-color-photo')).toHaveLength(2)
    await act(async () => { finishDelete(); await pendingDelete })
    await waitFor(() => expect(screen.getAllByTestId('peluch-color-photo')).toHaveLength(1))
    expect(screen.getByTestId('peluch-color-photo').querySelector('img')).toHaveAttribute('src', '/other.jpg')
    expect(screen.queryByText(photoDeletionError)).not.toBeInTheDocument()
  })

  it('renders "Crear peluche" submit button in create mode', async () => {
    render(<PeluchForm />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Crear peluche' })).toBeInTheDocument()
    })
  })

  it('deletes a color after the SweetAlert2 confirmation resolves true', async () => {
    ;(globalPresetService.getColorUsage as jest.Mock).mockResolvedValue({ products: 2, photos: 3, orders: 0 })
    ;(confirmDangerousDelete as jest.Mock).mockResolvedValue(true)
    ;(globalPresetService.deleteColor as jest.Mock).mockResolvedValue(undefined)

    render(<PeluchForm />)

    const deleteButton = await screen.findByTitle('Eliminar este color globalmente')
    await userEvent.click(deleteButton)

    await waitFor(() => {
      expect(globalPresetService.getColorUsage).toHaveBeenCalledWith(1)
      expect(confirmDangerousDelete).toHaveBeenCalled()
      expect(globalPresetService.deleteColor).toHaveBeenCalledWith(1)
    })
  })

  it('does not delete a color when the confirmation resolves false', async () => {
    // quality: allow-mock-only (declining confirmation must prevent the delete service call)
    ;(globalPresetService.getColorUsage as jest.Mock).mockResolvedValue({ products: 0, photos: 0, orders: 0 })
    ;(confirmDangerousDelete as jest.Mock).mockResolvedValue(false)

    render(<PeluchForm />)

    const deleteButton = await screen.findByTitle('Eliminar este color globalmente')
    await userEvent.click(deleteButton)

    await waitFor(() => expect(confirmDangerousDelete).toHaveBeenCalled())
    expect(globalPresetService.deleteColor).not.toHaveBeenCalled()
  })

  it('renders "Guardar cambios" submit button in edit mode', async () => {
    render(<PeluchForm existing={mockExisting} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    })
  })

  it('populates title field with existing title in edit mode', async () => {
    render(<PeluchForm existing={mockExisting} />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('Osito Coral')).toBeInTheDocument()
    })
  })

  it('auto-generates slug from title when not manually set', async () => {
    render(<PeluchForm />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Crear peluche' })).toBeInTheDocument()
    })
    const titleInput = screen.getByPlaceholderText('Osito Suave Premium')
    await userEvent.type(titleInput, 'Mi Osito')
    await waitFor(() => {
      expect(screen.getByDisplayValue('mi-osito')).toBeInTheDocument()
    })
  })

  it('shows validation error when required fields are empty on submit', async () => {
    render(<PeluchForm />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Crear peluche' })).toBeInTheDocument()
    })
    const form = screen.getByRole('button', { name: 'Crear peluche' }).closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText('Título, slug y categoría son obligatorios.')).toBeInTheDocument()
    })
  })

  it('shows JSON error when description textarea contains invalid JSON', async () => {
    render(<PeluchForm />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Crear peluche' })).toBeInTheDocument()
    })
    const descTextarea = screen.getByPlaceholderText(/Párrafo 1 de la descripción/i)
    await userEvent.clear(descTextarea)
    await userEvent.type(descTextarea, 'not valid json')
    await waitFor(() => {
      expect(screen.getByText(/JSON inválido/i)).toBeInTheDocument()
    })
  })

  it('opens color modal when "Añadir nuevo color" button is clicked', async () => {
    render(<PeluchForm />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Añadir nuevo color/i })).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /Añadir nuevo color/i }))
    await waitFor(() => {
      expect(screen.getByText('Nuevo color')).toBeInTheDocument()
    })
  })

  it('opens size modal when "Añadir nueva talla" button is clicked', async () => {
    render(<PeluchForm />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Añadir nueva talla/i })).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /Añadir nueva talla/i }))
    await waitFor(() => {
      expect(screen.getByText('Nueva talla')).toBeInTheDocument()
    })
  })

  it('calls peluchAdminService.update when form is submitted in edit mode', async () => {
    const mockPush = jest.fn()
    mockUseRouter.mockReturnValue({ push: mockPush })
    ;(peluchAdminService.update as jest.Mock).mockResolvedValue(mockExisting)

    render(<PeluchForm existing={mockExisting} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => {
      expect(peluchAdminService.update).toHaveBeenCalledWith('osito-coral', expect.any(Object))
    })
  })

  it.each([
    { name: 'inactive', isActive: false, expected: false },
    { name: 'published', isActive: true, expected: true },
    { name: 'legacy response without publication state', isActive: undefined, expected: true },
  ])('preserves visibility when saving an $name product', async ({ isActive, expected }) => {
    const existing = { ...mockExisting, is_active: isActive } as PeluchDetail
    ;(peluchAdminService.update as jest.Mock).mockResolvedValue(existing)
    render(<PeluchForm existing={existing} />)
    const visibility = await screen.findByRole('checkbox', { name: 'Activo (visible en tienda)' })
    await waitFor(() => expect(visibility).toHaveProperty('checked', expected))

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(peluchAdminService.update).toHaveBeenCalledWith(
      existing.slug, expect.objectContaining({ is_active: expected }),
    ))
  })

  it('coalesces concurrent first-upload calls into a single draft peluche create', async () => {
    ;(peluchService.getCategories as jest.Mock).mockResolvedValue([
      { id: 1, name: 'Ositos', slug: 'ositos', description: '', display_order: 1, is_active: true, is_featured: false, image_url: null },
    ])
    ;(peluchService.getSizes as jest.Mock).mockResolvedValue([])
    ;(peluchService.getColors as jest.Mock).mockResolvedValue([
      { id: 1, name: 'Coral', slug: 'coral', hex_code: '#FF6B6B', sort_order: 1 },
    ])
    // Back the create with a manually-controlled promise so both uploads race
    // before the draft slug is available.
    let resolveCreate!: (v: { slug: string; available_colors: never[] }) => void
    ;(peluchAdminService.create as jest.Mock).mockImplementation(
      () => new Promise((res) => { resolveCreate = res }),
    )
    ;(peluchAdminService.update as jest.Mock).mockResolvedValue({})
    ;(uploadColorImageWithRetry as jest.Mock).mockResolvedValue({ id: 1, color_id: 1, url: '/srv.jpg' })

    render(<PeluchForm />)

    // Fill minimum fields
    await userEvent.type(await screen.findByPlaceholderText('Osito Suave Premium'), 'Osito Coral')
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], '1')
    // Select the color so the gallery section renders
    await userEvent.click(screen.getByRole('button', { name: /Coral/ }))
    // Open the file input via the "+Foto" button
    await userEvent.click(await screen.findByRole('button', { name: /Foto/i }))
    // Upload TWO files in a single change event (input has `multiple`).
    // Both files feed into the same uploadFiles() call which runs uploadOne()
    // concurrently via Promise.all — each uploadOne calls resolveUploadSlug.
    const fileInput = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement
    await userEvent.upload(fileInput, [
      new File(['a'], 'photo1.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'photo2.jpg', { type: 'image/jpeg' }),
    ])

    // Resolve the deferred create — only one call should have been made
    await act(async () => {
      resolveCreate({ slug: 'osito-coral', available_colors: [] })
    })

    await waitFor(() => expect(peluchAdminService.create).toHaveBeenCalledTimes(1))
  })

  it('disables the submit button while an image upload is pending', async () => {
    ;(peluchService.getCategories as jest.Mock).mockResolvedValue([
      { id: 1, name: 'Ositos', slug: 'ositos', description: '', display_order: 1, is_active: true, is_featured: false, image_url: null },
    ])
    ;(peluchService.getSizes as jest.Mock).mockResolvedValue([])
    ;(peluchService.getColors as jest.Mock).mockResolvedValue([
      { id: 1, name: 'Coral', slug: 'coral', hex_code: '#FF6B6B', sort_order: 1 },
    ])
    ;(peluchAdminService.create as jest.Mock).mockResolvedValue({ slug: 'osito-coral', available_colors: [] })
    ;(peluchAdminService.update as jest.Mock).mockResolvedValue({})
    // Make the upload fail so the item ends up in 'failed' status → hasPendingWork = true
    ;(uploadColorImageWithRetry as jest.Mock).mockRejectedValue(new Error('upload failed'))

    render(<PeluchForm />)
    await userEvent.type(await screen.findByPlaceholderText('Osito Suave Premium'), 'Osito Coral')
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], '1')
    await userEvent.click(screen.getByRole('button', { name: /Coral/ }))
    // Click "+Foto" to set uploadingColorSlug before the file input fires
    await userEvent.click(await screen.findByRole('button', { name: /Foto/i }))
    const fileInput = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement
    await userEvent.upload(fileInput, new File(['x'], 'p.jpg', { type: 'image/jpeg' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Crear peluche/ })).toBeDisabled()
    })
  })

  it('creates a draft peluche on the first color image upload', async () => {
    ;(peluchService.getCategories as jest.Mock).mockResolvedValue([
      { id: 1, name: 'Ositos', slug: 'ositos', description: '', display_order: 1, is_active: true, is_featured: false, image_url: null },
    ])
    ;(peluchService.getSizes as jest.Mock).mockResolvedValue([])
    ;(peluchService.getColors as jest.Mock).mockResolvedValue([
      { id: 1, name: 'Coral', slug: 'coral', hex_code: '#FF6B6B', sort_order: 1 },
    ])
    ;(peluchAdminService.create as jest.Mock).mockResolvedValue({ slug: 'osito-coral', available_colors: [] })
    ;(peluchAdminService.update as jest.Mock).mockResolvedValue({})
    ;(uploadColorImageWithRetry as jest.Mock).mockResolvedValue({ id: 1, color_id: 1, url: '/srv.jpg' })

    render(<PeluchForm />)

    // fill the minimum fields the draft create needs
    await userEvent.type(await screen.findByPlaceholderText('Osito Suave Premium'), 'Osito Coral')
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], '1')
    // select the color so its gallery section renders
    await userEvent.click(screen.getByRole('button', { name: /Coral/ }))
    // click the "+Foto" button to set uploadingColorSlug and trigger the file input
    await userEvent.click(await screen.findByRole('button', { name: /Foto/i }))
    // upload a file to that color (file input is now active with the correct colorSlug)
    const fileInput = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement
    await userEvent.upload(fileInput, new File(['x'], 'p.jpg', { type: 'image/jpeg' }))

    await waitFor(() => {
      expect(peluchAdminService.create).toHaveBeenCalledTimes(1)
      expect((peluchAdminService.create as jest.Mock).mock.calls[0][0].is_active).toBe(false)
    })
  })

  it('deletes the draft peluche when cancelling after upload', async () => {
    ;(peluchService.getCategories as jest.Mock).mockResolvedValue([
      { id: 1, name: 'Ositos', slug: 'ositos', description: '', display_order: 1, is_active: true, is_featured: false, image_url: null },
    ])
    ;(peluchService.getSizes as jest.Mock).mockResolvedValue([])
    ;(peluchService.getColors as jest.Mock).mockResolvedValue([
      { id: 1, name: 'Coral', slug: 'coral', hex_code: '#FF6B6B', sort_order: 1 },
    ])
    ;(peluchAdminService.create as jest.Mock).mockResolvedValue({ slug: 'osito-coral', available_colors: [] })
    ;(peluchAdminService.update as jest.Mock).mockResolvedValue({})
    ;(peluchAdminService.delete as jest.Mock).mockResolvedValue(undefined)
    ;(uploadColorImageWithRetry as jest.Mock).mockResolvedValue({ id: 1, color_id: 1, url: '/srv.jpg' })

    const mockPush = jest.fn()
    mockUseRouter.mockReturnValue({ push: mockPush })

    render(<PeluchForm />)

    // Fill minimum fields so the draft create succeeds
    await userEvent.type(await screen.findByPlaceholderText('Osito Suave Premium'), 'Osito Coral')
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], '1')
    // Select the color so the gallery section renders
    await userEvent.click(screen.getByRole('button', { name: /Coral/ }))
    // Click "+Foto" to set uploadingColorSlug before the file input fires
    await userEvent.click(await screen.findByRole('button', { name: /Foto/i }))
    const fileInput = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement
    await userEvent.upload(fileInput, new File(['x'], 'p.jpg', { type: 'image/jpeg' }))

    // Wait for the draft to be created
    await waitFor(() => expect(peluchAdminService.create).toHaveBeenCalledTimes(1))

    // Stub window.confirm to simulate the user confirming discard
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)

    await userEvent.click(screen.getByRole('button', { name: /Cancelar/ }))

    await waitFor(() => expect(peluchAdminService.delete).toHaveBeenCalledWith('osito-coral'))

    confirmSpy.mockRestore()
  })
})
