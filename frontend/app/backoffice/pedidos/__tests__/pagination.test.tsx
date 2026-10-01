import { beforeEach, describe, expect, it } from '@jest/globals'
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

const order = (orderNumber: string, customerName: string, status: 'pending_payment' | 'in_production' = 'pending_payment') => ({
  order_number: orderNumber,
  customer_name: customerName,
  customer_email: 'cliente@mimittos.test',
  city: 'Bogotá',
  status,
  total_amount: 250000,
  deposit_amount: 125000,
  created_at: '2026-04-01T10:00:00Z',
})

const page = (
  count: number,
  results: ReturnType<typeof order>[],
  previous: string | null,
  next: string | null,
) => ({ count, results, previous, next })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('PedidosAdminPage pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders first-page pagination from the response envelope', async () => {
    mockListOrders.mockResolvedValueOnce(page(
      201,
      [order('MIM-P1', 'Pedido página uno')],
      null,
      'https://api.example.test/orders/list/?page=2',
    ))

    render(<PedidosAdminPage />)

    await screen.findByTestId('order-row-MIM-P1')

    // Fails if the UI derives count or first-page navigation from local rows instead of the API envelope.
    expect(mockListOrders).toHaveBeenCalledWith(
      { page: 1, page_size: 100 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(screen.getByText(/— 201 pedido\(s\)/)).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument()
    expect(screen.getByTestId('order-row-MIM-P1')).toHaveTextContent('Pedido página uno')
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeEnabled()
  })

  it('replaces first-page rows after requesting the next page', async () => {
    mockListOrders
      .mockResolvedValueOnce(page(201, [order('MIM-P1', 'Pedido página uno')], null, 'https://api.example.test/orders/list/?page=2'))
      .mockResolvedValueOnce(page(201, [order('MIM-P2', 'Pedido página dos')], 'https://api.example.test/orders/list/?page=1', 'https://api.example.test/orders/list/?page=3'))
    const user = userEvent.setup()

    render(<PedidosAdminPage />)
    await screen.findByTestId('order-row-MIM-P1')
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))

    await screen.findByTestId('order-row-MIM-P2')

    // Fails if page changes skip the API, retain prior rows, or leave the current page announcement stale.
    expect(mockListOrders).toHaveBeenNthCalledWith(
      2,
      { page: 2, page_size: 100 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(screen.queryByTestId('order-row-MIM-P1')).not.toBeInTheDocument()
    expect(screen.getByTestId('order-row-MIM-P2')).toHaveTextContent('Pedido página dos')
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeEnabled()
  })

  it('hides page data while a page-one filter request is pending', async () => {
    const pageTwoRequest = deferred<ReturnType<typeof page>>()
    const filteredRequest = deferred<ReturnType<typeof page>>()
    mockListOrders
      .mockResolvedValueOnce(page(201, [order('MIM-P1', 'Pedido página uno')], null, 'https://api.example.test/orders/list/?page=2'))
      .mockReturnValueOnce(pageTwoRequest.promise)
      .mockReturnValueOnce(filteredRequest.promise)
    const user = userEvent.setup()

    render(<PedidosAdminPage />)
    await screen.findByTestId('order-row-MIM-P1')
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await waitFor(() => expect(mockListOrders).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('button', { name: 'En producción' }))
    await waitFor(() => expect(mockListOrders).toHaveBeenCalledTimes(3))

    // Fails if a pending filter retains page-two rows or metadata while the page-one request is active.
    expect(mockListOrders).toHaveBeenLastCalledWith(
      { status: 'in_production', page: 1, page_size: 100 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(screen.queryByTestId('order-row-MIM-P1')).not.toBeInTheDocument()
    expect(screen.queryByText(/— 201 pedido\(s\)/)).not.toBeInTheDocument()
    expect(screen.getByText('Página 1')).toBeInTheDocument()
  })

  it('keeps filtered page metadata when an obsolete page response resolves', async () => {
    const pageTwoRequest = deferred<ReturnType<typeof page>>()
    const filteredRequest = deferred<ReturnType<typeof page>>()
    mockListOrders
      .mockResolvedValueOnce(page(201, [order('MIM-P1', 'Pedido página uno')], null, 'https://api.example.test/orders/list/?page=2'))
      .mockReturnValueOnce(pageTwoRequest.promise)
      .mockReturnValueOnce(filteredRequest.promise)
    const user = userEvent.setup()

    render(<PedidosAdminPage />)
    await screen.findByTestId('order-row-MIM-P1')
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await waitFor(() => expect(mockListOrders).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('button', { name: 'En producción' }))
    await waitFor(() => expect(mockListOrders).toHaveBeenCalledTimes(3))

    await act(async () => {
      filteredRequest.resolve(page(1, [order('MIM-PROD', 'Pedido filtrado', 'in_production')], null, null))
      await Promise.resolve()
    })
    await act(async () => {
      pageTwoRequest.resolve(page(201, [order('MIM-P2', 'Pedido obsoleto')], 'https://api.example.test/orders/list/?page=1', 'https://api.example.test/orders/list/?page=3'))
      await Promise.resolve()
    })

    // Fails if a completed page-two response replaces the active filter's rows, count, or links.
    expect(screen.getByTestId('order-row-MIM-PROD')).toHaveTextContent('Pedido filtrado')
    expect(screen.queryByTestId('order-row-MIM-P2')).not.toBeInTheDocument()
    expect(screen.getByText(/— 1 pedido\(s\)/)).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled()
  })

  it('clears the active page after its request rejects', async () => {
    mockListOrders
      .mockResolvedValueOnce(page(201, [order('MIM-P1', 'Pedido página uno')], null, 'https://api.example.test/orders/list/?page=2'))
      .mockRejectedValueOnce(new Error('page two failed'))
    const user = userEvent.setup()

    render(<PedidosAdminPage />)
    await screen.findByTestId('order-row-MIM-P1')
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))

    await screen.findByRole('alert')

    // Fails if failed page navigation presents stale rows as current or leaves a direction usable.
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los pedidos.')
    expect(screen.queryByTestId('order-row-MIM-P1')).not.toBeInTheDocument()
    expect(screen.queryByText('Sin pedidos')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled()
  })
})
