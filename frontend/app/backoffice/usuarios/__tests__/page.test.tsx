import { describe, expect, it, beforeEach } from '@jest/globals'
import { render, screen, within } from '@testing-library/react'

jest.mock('@/lib/services/userAdminService', () => ({
  userAdminService: {
    list: jest.fn(),
    update: jest.fn(),
  },
}))

import { userAdminService } from '@/lib/services/userAdminService'
import UsuariosAdminPage from '../page'

const mockList = userAdminService.list as jest.Mock

describe('UsuariosAdminPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockList.mockResolvedValue([])
  })

  it('renders the Usuarios h1 heading', async () => {
    render(<UsuariosAdminPage />)

    await screen.findByRole('table')

    // Falla si la página administrativa deja de identificar el recurso que gestiona.
    expect(screen.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeInTheDocument()
  })

  it('renders user count text after data loads', async () => {
    render(<UsuariosAdminPage />)

    // Falla si la respuesta de usuarios no actualiza el total visible del listado.
    expect(await screen.findByText('Cuentas registradas — 0 usuario(s)')).toBeInTheDocument()
  })

  it('displays the eligibility label assigned to each user', async () => {
    mockList.mockResolvedValue([
      {
        id: 1,
        email: 'inactive@mimittos.com',
        first_name: 'Sofía',
        last_name: 'Martínez',
        role: 'customer',
        is_staff: false,
        is_active: false,
        email_verified: true,
        date_joined: '2026-10-02T00:00:00Z',
      },
      {
        id: 2,
        email: 'pending@mimittos.com',
        first_name: 'Carlos',
        last_name: 'Pérez',
        role: 'customer',
        is_staff: false,
        is_active: true,
        email_verified: false,
        date_joined: '2026-10-02T00:00:00Z',
      },
      {
        id: 3,
        email: 'active@mimittos.com',
        first_name: 'Elena',
        last_name: 'Gómez',
        role: 'customer',
        is_staff: false,
        is_active: true,
        email_verified: true,
        date_joined: '2026-10-02T00:00:00Z',
      },
    ])

    render(<UsuariosAdminPage />)

    const inactiveRow = await screen.findByRole('row', { name: /inactive@mimittos\.com/i })
    const pendingRow = screen.getByRole('row', { name: /pending@mimittos\.com/i })
    const activeRow = screen.getByRole('row', { name: /^active@mimittos\.com\b/i })

    // Falla si el listado deja de distinguir cuentas activas, pendientes o inactivas.
    expect(within(inactiveRow).getByText('Inactivo')).toBeInTheDocument()
    expect(within(pendingRow).getByText('Correo pendiente')).toBeInTheDocument()
    expect(within(activeRow).getByText('Activo')).toBeInTheDocument()
  })
})
