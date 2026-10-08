import { describe, it, expect, beforeEach } from '@jest/globals'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PeluchDetailPage from '../page'
import { peluchService } from '../../../../lib/services/peluchService'
import { mediaService } from '../../../../lib/services/mediaService'
import { useAuthStore } from '../../../../lib/stores/authStore'
import { useCartStore } from '../../../../lib/stores/cartStore'

jest.mock('../../../../lib/services/peluchService', () => ({
  peluchService: {
    getPeluchBySlug: jest.fn(),
    getReviews: jest.fn(),
  },
}))

jest.mock('../../../../lib/services/http', () => ({
  api: { post: jest.fn().mockResolvedValue({ data: {} }) },
}))

jest.mock('../../../../lib/services/mediaService', () => ({
  mediaService: { uploadImage: jest.fn(), uploadAudio: jest.fn() },
}))

jest.mock('../../../../lib/stores/authStore', () => ({
  useAuthStore: jest.fn(),
}))

jest.mock('../../../../lib/stores/cartStore', () => ({
  useCartStore: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ slug: 'osito-coral' })),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  usePathname: jest.fn(() => '/peluches/osito-coral'),
}))

const mockPeluchService = peluchService as jest.Mocked<typeof peluchService>
const mockMediaService = mediaService as jest.Mocked<typeof mediaService>
const mockUseAuthStore = useAuthStore as unknown as jest.Mock
const mockUseCartStore = useCartStore as unknown as jest.Mock

const mockPeluchDetail = {
  id: 1, title: 'Osito Coral', slug: 'osito-coral',
  category_name: 'Osito clásico', category_slug: 'osito-clasico',
  category: { id: 1, name: 'Osito clásico', slug: 'osito-clasico', description: '', display_order: 1, is_active: true, is_featured: false, image_url: null },
  lead_description: 'El oseznito más querido',
  description: ['Un osito adorable hecho a mano'],
  badge: 'bestseller' as const,
  is_active: true,
  is_featured: true,
  discount_pct: 0,
  display_order: 100,
  min_price: 85000,
  discounted_min_price: 85000,
  available_colors: [{ id: 1, name: 'Rosa Coral', slug: 'rosa-coral', hex_code: '#D4848A', sort_order: 1, preview_url: null, image_count: 0, images: [] }],
  gallery_urls: ['http://example.com/img1.jpg', 'http://example.com/img2.jpg'],
  average_rating: 4.9, review_count: 184,
  has_huella: true, has_corazon: true, has_audio: false,
  size_prices: [
    { id: 1, size: { id: 1, label: 'Pequeño', slug: 'pequeno', cm: '20cm', sort_order: 1 }, price: 85000, is_available: true, deposit_percentage: 50, full_payment_discount_pct: 0, free_shipping: false, shipping_cost: 0 },
    { id: 2, size: { id: 2, label: 'Mediano', slug: 'mediano', cm: '35cm', sort_order: 2 }, price: 128000, is_available: true, deposit_percentage: 50, full_payment_discount_pct: 0, free_shipping: false, shipping_cost: 0 },
  ],
  specifications: { material: 'Algodón 100%', relleno: 'Fibra hipoalergénica' },
  care_instructions: ['Lavar a mano', 'No exponer al sol'],
  view_count: 512,
  huella_extra_cost: 15000, corazon_extra_cost: 10000, audio_extra_cost: 20000,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
}

describe('PeluchDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAuthStore.mockReturnValue({ isAuthenticated: false })
    mockUseCartStore.mockImplementation((selector: (s: any) => unknown) =>
      selector({ addToCart: jest.fn(), items: [] })
    )
    mockPeluchService.getReviews.mockResolvedValue([])
  })

  it('hides the review form when the response identifies an owned review', async () => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: true, user: { email: 'buyer@example.com' } })
    mockPeluchService.getPeluchBySlug.mockResolvedValue(mockPeluchDetail)
    mockPeluchService.getReviews.mockResolvedValue([{
      id: 1, is_mine: true, user_name: 'Ana', rating: 5,
      comment: 'Excelente peluche', created_at: '2026-10-08T12:00:00Z',
    }])
    render(<PeluchDetailPage />)

    expect(await screen.findByText('Excelente peluche')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publicar reseña' })).not.toBeInTheDocument()
  })

  it('shows the review form when displayed reviews belong to someone else', async () => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: true, user: { email: 'buyer@example.com' } })
    mockPeluchService.getPeluchBySlug.mockResolvedValue(mockPeluchDetail)
    mockPeluchService.getReviews.mockResolvedValue([{
      id: 1, is_mine: false, user_name: 'Ana', rating: 5,
      comment: 'Excelente peluche', created_at: '2026-10-08T12:00:00Z',
    }])
    render(<PeluchDetailPage />)

    expect(await screen.findByText('Excelente peluche')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Cuéntanos cómo fue tu experiencia con este peluche... (mínimo 10 caracteres)')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Publicar reseña' })).toBeDisabled()
  })

  it('renders loading state initially', () => {
    mockPeluchService.getPeluchBySlug.mockReturnValue(new Promise(() => {}))
    render(<PeluchDetailPage />)
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('renders peluch title after loading', async () => {
    mockPeluchService.getPeluchBySlug.mockResolvedValue(mockPeluchDetail)
    render(<PeluchDetailPage />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Osito Coral' })).toBeInTheDocument()
    })
  })

  it('renders bestseller badge', async () => {
    mockPeluchService.getPeluchBySlug.mockResolvedValue(mockPeluchDetail)
    render(<PeluchDetailPage />)
    await waitFor(() => {
      expect(screen.getByText('Más vendido')).toBeInTheDocument()
    })
  })

  it('renders size options from size_prices', async () => {
    mockPeluchService.getPeluchBySlug.mockResolvedValue(mockPeluchDetail)
    render(<PeluchDetailPage />)
    await waitFor(() => {
      expect(screen.getByText('Pequeño')).toBeInTheDocument()
      expect(screen.getByText('Mediano')).toBeInTheDocument()
    })
  })

  it('renders color section header', async () => {
    mockPeluchService.getPeluchBySlug.mockResolvedValue(mockPeluchDetail)
    render(<PeluchDetailPage />)
    await waitFor(() => {
      expect(screen.getByText('Color del peluche')).toBeInTheDocument()
    })
  })

  it('renders huella personalization section when has_huella is true', async () => {
    mockPeluchService.getPeluchBySlug.mockResolvedValue(mockPeluchDetail)
    render(<PeluchDetailPage />)
    await waitFor(() => {
      expect(screen.getByText(/Huella/i)).toBeInTheDocument()
    })
  })

  it('renders corazón personalization section when has_corazon is true', async () => {
    mockPeluchService.getPeluchBySlug.mockResolvedValue(mockPeluchDetail)
    render(<PeluchDetailPage />)
    await waitFor(() => {
      expect(screen.getByText(/Corazón/i)).toBeInTheDocument()
    })
  })

  it('does not render audio section when has_audio is false', async () => {
    mockPeluchService.getPeluchBySlug.mockResolvedValue(mockPeluchDetail)
    render(<PeluchDetailPage />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Osito Coral' })).toBeInTheDocument()
      expect(screen.queryByText(/Audio personalizado/i)).not.toBeInTheDocument()
    })
  })

  it('renders audio section when has_audio is true', async () => {
    const withAudio = { ...mockPeluchDetail, has_audio: true }
    mockPeluchService.getPeluchBySlug.mockResolvedValue(withAudio)
    render(<PeluchDetailPage />)
    await waitFor(() => {
      expect(screen.getByText(/Audio personalizado/i)).toBeInTheDocument()
    })
  })

  it('renders error message when peluch fetch fails', async () => {
    mockPeluchService.getPeluchBySlug.mockRejectedValue(new Error('Network error'))
    render(<PeluchDetailPage />)
    await waitFor(() => {
      expect(screen.getByText('No encontramos este peluche.')).toBeInTheDocument()
    })
  })

  it('renders add to cart button', async () => {
    mockPeluchService.getPeluchBySlug.mockResolvedValue(mockPeluchDetail)
    render(<PeluchDetailPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Agregar/i })).toBeInTheDocument()
    })
  })

  it('shows an error alert when the audio upload fails', async () => {
    mockPeluchService.getPeluchBySlug.mockResolvedValue({ ...mockPeluchDetail, has_audio: true })
    mockMediaService.uploadAudio.mockRejectedValue({ response: { data: { detail: 'Formato de audio no soportado.' } } })
    render(<PeluchDetailPage />)
    await waitFor(() => expect(screen.getByText(/Audio personalizado/i)).toBeInTheDocument())

    const input = screen.getByTestId('audio-upload-input') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], 'mi-audio.wav', { type: 'audio/wav' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Formato de audio no soportado.')
  })

  it('shows the confirmation and an audio player after a successful upload', async () => {
    mockPeluchService.getPeluchBySlug.mockResolvedValue({ ...mockPeluchDetail, has_audio: true })
    mockMediaService.uploadAudio.mockResolvedValue({ media_id: 7, media_token: 'audio-capability-7', file_url: 'http://example.com/audio/7.mp3', duration_sec: 12.3, file_size_kb: 80 })
    render(<PeluchDetailPage />)
    await waitFor(() => expect(screen.getByText(/Audio personalizado/i)).toBeInTheDocument())

    const input = screen.getByTestId('audio-upload-input') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], 'mi-audio.mp3', { type: 'audio/mpeg' }))

    const card = await screen.findByTestId('audio-uploaded')
    expect(card).toHaveTextContent('Audio listo')
    expect(screen.getByTestId('audio-player')).toHaveAttribute('src', 'http://example.com/audio/7.mp3')
  })

  it('adds the audio cost to the price breakdown after a successful upload', async () => {
    mockPeluchService.getPeluchBySlug.mockResolvedValue({ ...mockPeluchDetail, has_audio: true })
    mockMediaService.uploadAudio.mockResolvedValue({ media_id: 7, media_token: 'audio-capability-7', file_url: 'http://example.com/audio/7.mp3', duration_sec: 5, file_size_kb: 40 })
    render(<PeluchDetailPage />)
    await waitFor(() => expect(screen.getByText(/Audio personalizado/i)).toBeInTheDocument())

    const input = screen.getByTestId('audio-upload-input') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], 'mi-audio.mp3', { type: 'audio/mpeg' }))

    const breakdown = await screen.findByTestId('personalization-breakdown')
    expect(breakdown).toHaveTextContent('Audio personalizado')
    expect(breakdown).toHaveTextContent('+$20.000')
  })

  it('uses the generic gallery for a color with no images', async () => {
    const peluch = {
      ...mockPeluchDetail,
      gallery_urls: ['http://example.com/generic.jpg'],
      available_colors: [
        { id: 1, name: 'Algodón', slug: 'algodon', hex_code: '#EEEEEE', sort_order: 0, preview_url: null, image_count: 0, images: [] },
      ],
    }
    mockPeluchService.getPeluchBySlug.mockResolvedValue(peluch)
    render(<PeluchDetailPage />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Osito Coral' })).toBeInTheDocument())

    expect(screen.getByAltText('Osito Coral')).toHaveAttribute('src', 'http://example.com/generic.jpg')
  })

  it('shows a color\'s own images after selecting that color', async () => {
    const peluch = {
      ...mockPeluchDetail,
      gallery_urls: ['http://example.com/generic.jpg'],
      available_colors: [
        { id: 1, name: 'Algodón', slug: 'algodon', hex_code: '#EEEEEE', sort_order: 0, preview_url: null, image_count: 0, images: [] },
        { id: 2, name: 'Rubí rojo', slug: 'rubi-rojo', hex_code: '#C0182B', sort_order: 1, preview_url: 'http://example.com/rojo.jpg', image_count: 1, images: [{ id: 9, url: 'http://example.com/rojo.jpg' }] },
      ],
    }
    mockPeluchService.getPeluchBySlug.mockResolvedValue(peluch)
    render(<PeluchDetailPage />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Osito Coral' })).toBeInTheDocument())

    await userEvent.click(screen.getByText('Rubí rojo'))

    expect(screen.getByAltText('Osito Coral')).toHaveAttribute('src', 'http://example.com/rojo.jpg')
  })
})
