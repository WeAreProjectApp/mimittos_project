import { StrictMode } from 'react'
import { describe, it, expect, beforeEach } from '@jest/globals'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('@/lib/services/contentService', () => ({
  contentService: {
    get: jest.fn(),
    update: jest.fn(),
    uploadHeroImage: jest.fn(),
  },
}))

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    const { fill: _f, unoptimized: _u, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />
  },
}))

import { contentService } from '@/lib/services/contentService'
import ConfiguracionPage from '../page'

const mockGet = contentService.get as jest.Mock
const mockUpdate = contentService.update as jest.Mock
const mockUpload = contentService.uploadHeroImage as jest.Mock

describe('ConfiguracionPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    if (typeof URL.createObjectURL === 'undefined') {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: jest.fn(() => 'blob:preview'),
      })
    }
  })

  it('renders the section heading', async () => {
    mockGet.mockResolvedValue({ content_json: {} })
    await act(async () => { render(<ConfiguracionPage />) })
    expect(screen.getByRole('heading', { level: 1, name: /Ajustes generales/i })).toBeInTheDocument()
  })

  it('loads the existing banner state from the content API', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'promo_banner') {
        return Promise.resolve({
          content_json: { is_active: true, message: '¡Envío gratis!', bg_color: '#1B2A4A', text_color: '#fff' },
        })
      }
      return Promise.resolve({ content_json: {} })
    })

    await act(async () => { render(<ConfiguracionPage />) })

    await waitFor(() => {
      expect(screen.getByDisplayValue('¡Envío gratis!')).toBeInTheDocument()
    })
    expect(screen.getByText(/Cinta activa/i)).toBeInTheDocument()
  })

  it('loads an existing hero image preview when the API returns an image_url', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'hero_image') {
        return Promise.resolve({ content_json: { image_url: 'https://example.com/hero.jpg' } })
      }
      return Promise.resolve({ content_json: {} })
    })

    await act(async () => { render(<ConfiguracionPage />) })

    await waitFor(() => {
      expect(screen.getByAltText('Hero preview')).toHaveAttribute('src', 'https://example.com/hero.jpg')
    })
  })

  it('toggles the banner active label when the switch is clicked', async () => {
    mockGet.mockResolvedValue({ content_json: {} })
    const user = userEvent.setup()
    await act(async () => { render(<ConfiguracionPage />) })

    await screen.findByText(/Cinta desactivada/i)
    const toggleSwitch = screen.getByTestId('banner-toggle')
    await waitFor(() => expect(toggleSwitch).toBeEnabled())
    await user.click(toggleSwitch)

    expect(screen.getByText(/Cinta activa — visible/i)).toBeInTheDocument()
  })

  it('saves the banner configuration with the typed message', async () => {
    mockGet.mockResolvedValue({ content_json: {} })
    mockUpdate.mockResolvedValue({})
    const user = userEvent.setup()
    await act(async () => { render(<ConfiguracionPage />) })

    const messageInput = await screen.findByPlaceholderText(/Envío gratis/i)
    await user.type(messageInput, 'Promo activa')
    await user.click(screen.getByRole('button', { name: /Guardar cinta/i }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('promo_banner', expect.objectContaining({ message: 'Promo activa' }))
    })
  })

  it('shows the success label after the banner save resolves', async () => {
    mockGet.mockResolvedValue({ content_json: {} })
    mockUpdate.mockResolvedValue({})
    const user = userEvent.setup()
    await act(async () => { render(<ConfiguracionPage />) })

    const saveBtn = await screen.findByRole('button', { name: /Guardar cinta/i })
    await user.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Guardado/i })).toBeInTheDocument()
    })
  })

  it('shows the upload error when uploadHeroImage rejects', async () => {
    mockGet.mockResolvedValue({ content_json: {} })
    mockUpload.mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    await act(async () => { render(<ConfiguracionPage />) })

    const fileInput = screen.getByTestId('hero-file-input') as HTMLInputElement
    const file = new File(['x'], 'hero.jpg', { type: 'image/jpeg' })
    await user.upload(fileInput, file)

    await user.click(screen.getByRole('button', { name: /Subir imagen/i }))

    await waitFor(() => {
      expect(screen.getByText(/Error al subir la imagen/i)).toBeInTheDocument()
    })
  })

  it('updates the hero preview after a successful upload', async () => {
    mockGet.mockResolvedValue({ content_json: {} })
    mockUpload.mockResolvedValue({ image_url: 'https://cdn/test.jpg' })
    const user = userEvent.setup()
    await act(async () => { render(<ConfiguracionPage />) })

    const fileInput = screen.getByTestId('hero-file-input') as HTMLInputElement
    const file = new File(['x'], 'hero.jpg', { type: 'image/jpeg' })
    await user.upload(fileInput, file)

    await user.click(screen.getByRole('button', { name: /Subir imagen/i }))

    await waitFor(() => {
      expect(screen.getByAltText('Hero preview')).toHaveAttribute('src', 'https://cdn/test.jpg')
    })
  })

  it('selects a preset background color when its swatch is clicked', async () => {
    mockGet.mockResolvedValue({ content_json: {} })
    mockUpdate.mockResolvedValue({})
    const user = userEvent.setup()
    await act(async () => { render(<ConfiguracionPage />) })

    const navySwatch = await screen.findByTitle('Navy')
    await user.click(navySwatch)
    await user.click(screen.getByRole('button', { name: /Guardar cinta/i }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('promo_banner', expect.objectContaining({ bg_color: '#1B2A4A', text_color: '#fff' }))
    })
  })
})


describe('banner loading recovery', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
    return { promise, resolve, reject }
  }

  const existingBanner = {
    content_json: { is_active: true, message: 'Promoción existente', bg_color: '#1B2A4A', text_color: '#fff' },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdate.mockResolvedValue({})
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:preview') })
  })

  function bannerRegion() {
    return within(screen.getByRole('region', { name: 'Cinta de promoción' }))
  }

  it('blocks every banner control while its initial read is pending', async () => {
    const request = deferred<typeof existingBanner>()
    mockGet.mockImplementation((key) => key === 'promo_banner' ? request.promise : Promise.resolve({ content_json: {} }))
    const user = userEvent.setup()
    await act(async () => { render(<ConfiguracionPage />) })
    const region = bannerRegion()

    expect(region.getByRole('status')).toHaveTextContent('Cargando cinta…')
    expect(region.getByRole('textbox')).toBeDisabled()
    expect(region.getByTestId('banner-toggle')).toBeDisabled()
    expect(region.getByTitle('Navy')).toBeDisabled()
    expect(screen.getByRole('region', { name: 'Cinta de promoción' }).querySelector('input[type="color"]')).toBeDisabled()
    const save = region.getByRole('button', { name: 'Guardar cinta' })
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(mockUpdate).not.toHaveBeenCalled()

    await act(async () => { request.resolve(existingBanner) })
    expect(region.getByRole('textbox')).toHaveValue('Promoción existente')
    expect(save).toBeEnabled()
    await user.clear(region.getByRole('textbox'))
    await user.type(region.getByRole('textbox'), 'Promoción editada')
    await user.click(save)
    expect(await region.findByRole('button', { name: '✓ Guardado' })).toBeVisible()
    expect(mockUpdate).toHaveBeenCalledWith('promo_banner', {
      ...existingBanner.content_json, message: 'Promoción editada',
    })
  })

  it('keeps the banner blocked after its initial read fails', async () => {
    mockGet.mockImplementation((key) => key === 'promo_banner' ? Promise.reject(new Error('read failure')) : Promise.resolve({ content_json: { image_url: 'https://cdn.test/existing-hero.jpg' } }))
    await act(async () => { render(<ConfiguracionPage />) })
    const region = bannerRegion()

    expect(await region.findByRole('alert')).toHaveTextContent('No se pudo cargar la cinta de promoción. Intenta de nuevo.')
    expect(region.getByRole('textbox')).toBeDisabled()
    expect(region.getByRole('button', { name: 'Guardar cinta' })).toBeDisabled()
    expect(region.getByRole('button', { name: 'Reintentar carga' })).toBeEnabled()
    expect(screen.getByAltText('Hero preview')).toHaveAttribute('src', 'https://cdn.test/existing-hero.jpg')
    expect(mockGet.mock.calls.filter(([key]) => key === 'promo_banner')).toHaveLength(1)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('keeps editing blocked while a manual retry is pending', async () => {
    const retry = deferred<typeof existingBanner>()
    const bannerGet = jest.fn().mockRejectedValueOnce(new Error('first failure')).mockReturnValueOnce(retry.promise)
    mockGet.mockImplementation((key) => key === 'promo_banner' ? bannerGet() : Promise.resolve({ content_json: {} }))
    const user = userEvent.setup()
    await act(async () => { render(<ConfiguracionPage />) })
    const region = bannerRegion()
    const retryButton = await region.findByRole('button', { name: 'Reintentar carga' })
    expect(bannerGet).toHaveBeenCalledTimes(1)
    await user.click(retryButton)

    expect(bannerGet).toHaveBeenCalledTimes(2)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(region.getByRole('status')).toHaveTextContent('Cargando cinta…')
    expect(region.queryByRole('alert')).not.toBeInTheDocument()
    expect(region.queryByRole('button', { name: 'Reintentar carga' })).not.toBeInTheDocument()
    expect(region.getByRole('textbox')).toBeDisabled()
    expect(region.getByRole('button', { name: 'Guardar cinta' })).toBeDisabled()

    await act(async () => { retry.resolve(existingBanner) })
    expect(region.getByRole('textbox')).toHaveValue('Promoción existente')
    expect(region.getByRole('textbox')).toBeEnabled()
    expect(region.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the banner blocked when the manual retry fails', async () => {
    mockGet.mockImplementation((key) => key === 'promo_banner' ? Promise.reject(new Error('read failure')) : Promise.resolve({ content_json: {} }))
    const user = userEvent.setup()
    await act(async () => { render(<ConfiguracionPage />) })
    const region = bannerRegion()
    await user.click(await region.findByRole('button', { name: 'Reintentar carga' }))

    expect(await region.findByRole('alert')).toBeVisible()
    expect(region.getByRole('textbox')).toBeDisabled()
    expect(region.getByRole('button', { name: 'Guardar cinta' })).toBeDisabled()
    expect(region.getByRole('button', { name: 'Reintentar carga' })).toBeEnabled()
  })

  it('allows saving defaults after a successful empty configuration read', async () => {
    mockGet.mockResolvedValue({ content_json: {} })
    const user = userEvent.setup()
    await act(async () => { render(<ConfiguracionPage />) })
    const region = bannerRegion()
    await waitFor(() => expect(region.getByRole('button', { name: 'Guardar cinta' })).toBeEnabled())

    await user.click(region.getByRole('button', { name: 'Guardar cinta' }))

    expect(await region.findByRole('button', { name: '✓ Guardado' })).toBeVisible()
    expect(mockUpdate).toHaveBeenCalledWith('promo_banner', {
      is_active: false, message: '', bg_color: '#D4848A', text_color: '#fff',
    })
  })

  it('preserves edits when a superseded initial read resolves late', async () => {
    const oldRequest = deferred<typeof existingBanner>()
    const currentRequest = deferred<typeof existingBanner>()
    const bannerGet = jest.fn().mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(currentRequest.promise)
    mockGet.mockImplementation((key) => key === 'promo_banner' ? bannerGet() : Promise.resolve({ content_json: {} }))
    const user = userEvent.setup()
    await act(async () => { render(<StrictMode><ConfiguracionPage /></StrictMode>) })
    await act(async () => { currentRequest.resolve(existingBanner) })
    const region = bannerRegion()
    await user.clear(region.getByRole('textbox'))
    await user.type(region.getByRole('textbox'), 'Edición vigente')

    await act(async () => { oldRequest.resolve({ content_json: { ...existingBanner.content_json, message: 'Obsoleta' } }) })

    expect(region.getByRole('textbox')).toHaveValue('Edición vigente')
    expect(region.getByRole('button', { name: 'Guardar cinta' })).toBeEnabled()
  })

  it('preserves the loaded banner after a superseded read rejects late', async () => {
    const oldRequest = deferred<typeof existingBanner>()
    const bannerGet = jest.fn().mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce(existingBanner)
    mockGet.mockImplementation((key) => key === 'promo_banner' ? bannerGet() : Promise.resolve({ content_json: {} }))
    await act(async () => { render(<StrictMode><ConfiguracionPage /></StrictMode>) })
    const region = bannerRegion()
    await waitFor(() => expect(region.getByRole('textbox')).toBeEnabled())

    await act(async () => { oldRequest.reject(new Error('obsolete failure')) })

    expect(region.queryByRole('alert')).not.toBeInTheDocument()
    expect(region.getByRole('textbox')).toHaveValue('Promoción existente')
    expect(region.getByRole('button', { name: 'Guardar cinta' })).toBeEnabled()
  })

  it('allows hero upload while the banner read is pending', async () => {
    const request = deferred<typeof existingBanner>()
    mockGet.mockImplementation((key) => key === 'promo_banner' ? request.promise : Promise.resolve({ content_json: {} }))
    mockUpload.mockResolvedValue({ image_url: 'https://cdn.test/hero.jpg' })
    const user = userEvent.setup()
    await act(async () => { render(<ConfiguracionPage />) })

    await user.upload(screen.getByTestId('hero-file-input'), new File(['image'], 'hero.jpg', { type: 'image/jpeg' }))
    await user.click(screen.getByRole('button', { name: 'Subir imagen' }))

    expect(await screen.findByRole('button', { name: '✓ Imagen actualizada' })).toBeVisible()
    expect(screen.getByAltText('Hero preview')).toHaveAttribute('src', 'https://cdn.test/hero.jpg')
    expect(bannerRegion().getByRole('button', { name: 'Guardar cinta' })).toBeDisabled()
    await act(async () => { request.resolve(existingBanner) })
  })
})
