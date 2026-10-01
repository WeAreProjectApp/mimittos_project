import { describe, it, expect, beforeEach } from '@jest/globals'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('@/lib/services/orderService', () => ({
  orderService: {
    listOrders: jest.fn(),
    updateStatus: jest.fn(),
    updateTracking: jest.fn(),
    getOrderDetail: jest.fn(),
  },
}))

import { orderService } from '@/lib/services/orderService'
import PedidosAdminPage from '../page'

const mockListOrders = orderService.listOrders as jest.Mock
const mockUpdateStatus = orderService.updateStatus as jest.Mock
const mockUpdateTracking = orderService.updateTracking as jest.Mock
const mockGetOrderDetail = orderService.getOrderDetail as jest.Mock

const sampleOrder = {
  order_number: 'MIM-001',
  customer_name: 'María García',
  customer_email: 'maria@example.com',
  city: 'Bogotá',
  status: 'pending_payment' as const,
  total_amount: 250000,
  deposit_amount: 125000,
  created_at: '2026-04-01T10:00:00Z',
}

const sampleOrderDetail = {
  ...sampleOrder,
  department: 'Cundinamarca',
  customer_phone: '3001234567',
  address: 'Calle 1 #2-3',
  postal_code: '110111',
  balance_amount: 125000,
  shipping_amount: 0,
  discount_amount: 0,
  payment_mode: 'deposit' as const,
  amount_paid_now: 125000,
  tracking_number: '',
  shipping_carrier: '',
  notes: '',
  updated_at: '2026-04-01T10:00:00Z',
  status_history: [],
  payment: { reference: 'REF-1', status: 'APPROVED', payment_method_type: 'CARD', checkout_url: '', created_at: '2026-04-01T10:00:00Z' },
  items: [
    {
      id: 1,
      peluch_title: 'Osito Coral',
      peluch_slug: 'osito-coral',
      size: { id: 1, label: 'Mediano', slug: 'mediano', cm: '35cm', sort_order: 1 },
      color: { id: 1, name: 'Rosa Coral', slug: 'rosa-coral', hex_code: '#D4848A', sort_order: 1 },
      quantity: 1,
      unit_price: 128000,
      personalization_cost: 20000,
      line_total: 148000,
      has_huella: false,
      huella_type: '',
      huella_text: '',
      huella_media_url: null,
      has_corazon: false,
      corazon_phrase: '',
      has_audio: true,
      audio_media_url: 'http://example.com/audio/1.mp3',
      audio_duration_sec: 14.2,
      audio_size_kb: 90,
      configuration_snapshot: {},
    },
  ],
}

type OrdersPage = {
  count: number
  next: string | null
  previous: string | null
  results: typeof sampleOrder[]
}

function ordersPage(results: typeof sampleOrder[], overrides: Partial<OrdersPage> = {}): OrdersPage {
  return { count: results.length, next: null, previous: null, results, ...overrides }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('PedidosAdminPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockListOrders.mockResolvedValue(ordersPage([]))
    mockUpdateStatus.mockResolvedValue({})
    mockUpdateTracking.mockResolvedValue({})
    mockGetOrderDetail.mockResolvedValue(sampleOrderDetail)
  })

  it('renders the Pedidos h1 heading', async () => {
    render(<PedidosAdminPage />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByRole('heading', { level: 1, name: 'Pedidos' })).toBeInTheDocument()
  })

  it('renders empty table row after orders load', async () => {
    render(<PedidosAdminPage />)
    await waitFor(() => {
      expect(screen.getByText('Sin pedidos')).toBeInTheDocument()
    })
  })

  it('shows the error message when listOrders rejects', async () => {
    mockListOrders.mockRejectedValueOnce(new Error('boom'))
    render(<PedidosAdminPage />)
    await waitFor(() => {
      expect(screen.getByText(/No se pudieron cargar los pedidos/i)).toBeInTheDocument()
    })

    // Fails if an active request rejection leaves its loading indicator visible.
    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument()
  })

  it('renders one row per order returned by the service', async () => {
    mockListOrders.mockResolvedValueOnce(ordersPage([sampleOrder]))
    render(<PedidosAdminPage />)
    await waitFor(() => {
      expect(screen.getByText('MIM-001')).toBeInTheDocument()
    })
    expect(screen.getByText('María García')).toBeInTheDocument()
    expect(screen.getByText('Bogotá')).toBeInTheDocument()
  })

  it('refetches with status filter when a filter button is clicked', async () => {
    render(<PedidosAdminPage />)
    await waitFor(() => expect(mockListOrders).toHaveBeenCalledTimes(1))

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'En producción' }))

    await waitFor(() => expect(mockListOrders).toHaveBeenCalledTimes(2))
    expect(mockListOrders).toHaveBeenLastCalledWith(
      { status: 'in_production', page: 1, page_size: 100 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('keeps the newest status results when superseded requests resolve late', async () => {
    const initialRequest = deferred<OrdersPage>()
    const productionRequest = deferred<OrdersPage>()
    const shippedRequest = deferred<OrdersPage>()
    mockListOrders
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(productionRequest.promise)
      .mockReturnValueOnce(shippedRequest.promise)
    const user = userEvent.setup()
    render(<PedidosAdminPage />)

    await waitFor(() => expect(mockListOrders).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'En producción' }))
    await waitFor(() => expect(mockListOrders).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('button', { name: 'Despachado' }))
    await waitFor(() => expect(mockListOrders).toHaveBeenCalledTimes(3))

    const [, initialOptions] = mockListOrders.mock.calls[0]
    const [, productionOptions] = mockListOrders.mock.calls[1]
    expect(initialOptions.signal.aborted).toBe(true)
    expect(productionOptions.signal.aborted).toBe(true)

    await act(async () => {
      shippedRequest.resolve(ordersPage([{ ...sampleOrder, order_number: 'MIM-SHIP-NEW', customer_name: 'Pedido vigente' }]))
      await Promise.resolve()
    })
    await act(async () => {
      initialRequest.resolve(ordersPage([{ ...sampleOrder, order_number: 'MIM-OLD', customer_name: 'Pedido antiguo' }]))
      await Promise.resolve()
    })

    // Fails if a late pre-filter response overwrites the active status result.
    expect(screen.getByTestId('order-row-MIM-SHIP-NEW')).toHaveTextContent('Pedido vigente')
    expect(screen.queryByText('Pedido antiguo')).not.toBeInTheDocument()
  })

  it('keeps loading when an obsolete request rejects during an active request', async () => {
    const initialRequest = deferred<OrdersPage>()
    const activeRequest = deferred<OrdersPage>()
    mockListOrders
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(activeRequest.promise)
    const user = userEvent.setup()
    render(<PedidosAdminPage />)

    await waitFor(() => expect(mockListOrders).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'En producción' }))
    await waitFor(() => expect(mockListOrders).toHaveBeenCalledTimes(2))

    await act(async () => {
      initialRequest.reject(new Error('obsolete failure'))
      await Promise.resolve()
    })

    // Fails if an obsolete catch or finally clears loading for the pending status filter.
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
    expect(screen.queryByText('No se pudieron cargar los pedidos.')).not.toBeInTheDocument()

    await act(async () => {
      activeRequest.resolve(ordersPage([{ ...sampleOrder, order_number: 'MIM-PROD-NEW', customer_name: 'Producción vigente' }]))
      await Promise.resolve()
    })

    expect(screen.getByTestId('order-row-MIM-PROD-NEW')).toHaveTextContent('Producción vigente')
    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument()
  })

  it('aborts the active order request when the page unmounts', async () => {
    const activeRequest = deferred<OrdersPage>()
    mockListOrders.mockReturnValue(activeRequest.promise)
    const { unmount } = render(<PedidosAdminPage />)

    await waitFor(() => expect(mockListOrders).toHaveBeenCalledTimes(1))
    const [, options] = mockListOrders.mock.calls[0]
    unmount()

    // Fails if navigating away leaves the active orders request in flight.
    expect(options.signal.aborted).toBe(true)
  })

  it('updates the order status optimistically when the select changes', async () => {
    mockListOrders.mockResolvedValueOnce(ordersPage([sampleOrder]))
    const user = userEvent.setup()
    render(<PedidosAdminPage />)

    await waitFor(() => expect(screen.getByText('MIM-001')).toBeInTheDocument())

    const statusSelect = screen.getByRole('combobox') as HTMLSelectElement
    await user.selectOptions(statusSelect, 'shipped')

    await waitFor(() => expect(mockUpdateStatus).toHaveBeenCalledWith('MIM-001', 'shipped'))
  })

  it('submits the tracking number when the confirm button is clicked', async () => {
    mockListOrders.mockResolvedValueOnce(ordersPage([sampleOrder]))
    const user = userEvent.setup()
    render(<PedidosAdminPage />)

    const trackingInput = await screen.findByPlaceholderText('Guía...')
    await user.type(trackingInput, 'GUIA-7777')
    await user.click(screen.getByRole('button', { name: '✓' }))

    await waitFor(() => expect(mockUpdateTracking).toHaveBeenCalledWith('MIM-001', 'GUIA-7777'))
  })

  it('does not submit tracking when the input is empty', async () => {
    // quality: allow-mock-only (not calling the tracking service is the validation contract for an empty input)
    mockListOrders.mockResolvedValueOnce(ordersPage([sampleOrder]))
    const user = userEvent.setup()
    render(<PedidosAdminPage />)

    await waitFor(() => expect(screen.getByText('MIM-001')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '✓' }))

    expect(mockUpdateTracking).not.toHaveBeenCalled()
  })

  it('alerts when updateStatus rejects', async () => {
    mockListOrders.mockResolvedValueOnce(ordersPage([sampleOrder]))
    mockUpdateStatus.mockRejectedValueOnce(new Error('nope'))
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<PedidosAdminPage />)

    await waitFor(() => expect(screen.getByText('MIM-001')).toBeInTheDocument())
    await user.selectOptions(screen.getByRole('combobox'), 'cancelled')

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('No se pudo actualizar el estado.'))
    alertSpy.mockRestore()
  })

  it('alerts when updateTracking rejects', async () => {
    mockListOrders.mockResolvedValueOnce(ordersPage([sampleOrder]))
    mockUpdateTracking.mockRejectedValueOnce(new Error('nope'))
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<PedidosAdminPage />)

    const trackingInput = await screen.findByPlaceholderText('Guía...')
    await user.type(trackingInput, 'X-1')
    await user.click(screen.getByRole('button', { name: '✓' }))

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('No se pudo actualizar la guía.'))
    alertSpy.mockRestore()
  })

  it('opens the order detail modal when a row is clicked', async () => {
    mockListOrders.mockResolvedValueOnce(ordersPage([sampleOrder]))
    const user = userEvent.setup()
    render(<PedidosAdminPage />)

    await waitFor(() => expect(screen.getByTestId('order-row-MIM-001')).toBeInTheDocument())
    await user.click(screen.getByTestId('order-row-MIM-001'))

    await waitFor(() => expect(mockGetOrderDetail).toHaveBeenCalledWith('MIM-001'))
    expect(await screen.findByRole('dialog', { name: /Detalle del pedido MIM-001/i })).toBeInTheDocument()
  })

  it('renders the item size and color in the detail modal', async () => {
    mockListOrders.mockResolvedValueOnce(ordersPage([sampleOrder]))
    const user = userEvent.setup()
    render(<PedidosAdminPage />)

    await waitFor(() => expect(screen.getByTestId('order-row-MIM-001')).toBeInTheDocument())
    await user.click(screen.getByTestId('order-row-MIM-001'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Osito Coral')
    expect(dialog).toHaveTextContent('Mediano')
    expect(dialog).toHaveTextContent('Rosa Coral')
  })

  it('renders an audio player with the uploaded audio URL in the detail modal', async () => {
    mockListOrders.mockResolvedValueOnce(ordersPage([sampleOrder]))
    const user = userEvent.setup()
    render(<PedidosAdminPage />)

    await waitFor(() => expect(screen.getByTestId('order-row-MIM-001')).toBeInTheDocument())
    await user.click(screen.getByTestId('order-row-MIM-001'))

    await screen.findByTestId('item-audio')
    expect(screen.getByTestId('audio-player')).toHaveAttribute('src', 'http://example.com/audio/1.mp3')
  })

  it('shows an error in the detail modal when getOrderDetail rejects', async () => {
    mockListOrders.mockResolvedValueOnce(ordersPage([sampleOrder]))
    mockGetOrderDetail.mockRejectedValueOnce(new Error('boom'))
    const user = userEvent.setup()
    render(<PedidosAdminPage />)

    await waitFor(() => expect(screen.getByTestId('order-row-MIM-001')).toBeInTheDocument())
    await user.click(screen.getByTestId('order-row-MIM-001'))

    expect(await screen.findByText(/No se pudo cargar el detalle del pedido/i)).toBeInTheDocument()
  })

  it('does not open the detail modal when the status select is changed', async () => {
    // quality: allow-mock-only (changing status must not request order details; the service boundary is the contract)
    mockListOrders.mockResolvedValueOnce(ordersPage([sampleOrder]))
    const user = userEvent.setup()
    render(<PedidosAdminPage />)

    await waitFor(() => expect(screen.getByText('MIM-001')).toBeInTheDocument())
    await user.selectOptions(screen.getByRole('combobox'), 'shipped')

    expect(mockGetOrderDetail).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
