'use client'

import { useEffect, useState } from 'react'

import { userAdminService } from '@/lib/services/userAdminService'
import type { UserListItem } from '@/lib/types'

export default function UsuariosAdminPage() {
  const [users, setUsers] = useState<UserListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<number | null>(null)

  useEffect(() => {
    userAdminService.list()
      .then(setUsers)
      .finally(() => setLoading(false))
  }, [])

  async function toggleRole(user: UserListItem) {
    const newRole = user.role === 'admin' ? 'customer' : 'admin'
    const newIsStaff = newRole === 'admin'
    setUpdating(user.id)
    try {
      const updated = await userAdminService.update(user.id, { role: newRole, is_staff: newIsStaff })
      setUsers((prev) => prev.map((u) => u.id === user.id ? updated : u))
    } catch {
      alert('No se pudo actualizar el rol.')
    } finally {
      setUpdating(null)
    }
  }

  async function toggleActive(user: UserListItem) {
    setUpdating(user.id)
    try {
      const updated = await userAdminService.update(user.id, { is_active: !user.is_active })
      setUsers((prev) => prev.map((u) => u.id === user.id ? updated : u))
    } catch {
      alert('No se pudo actualizar el estado.')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div style={{ padding: '30px 40px 60px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 28, color: 'var(--navy)', marginBottom: 4 }}>Usuarios</h1>
        <p style={{ color: 'var(--gray-warm)', fontSize: 14 }}>Cuentas registradas — {users.length} usuario(s)</p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--gray-warm)' }}>Cargando...</p>
      ) : (
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--cream-warm)', borderBottom: '1px dashed rgba(212,132,138,.2)' }}>
                {['Email', 'Nombre', 'Rol', 'Estado', 'Fecha registro', 'Acciones'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px dashed rgba(212,132,138,.12)', opacity: updating === u.id ? .5 : 1 }}>
                  <td style={tdStyle}><span style={{ fontWeight: 600, color: 'var(--navy)' }}>{u.email}</span></td>
                  <td style={{ ...tdStyle, color: 'var(--gray-warm)' }}>{u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : '—'}</td>
                  <td style={tdStyle}>
                    <span style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: u.role === 'admin' ? '#E8F5E9' : 'var(--cream-warm)', color: u.role === 'admin' ? '#2E7D32' : 'var(--navy)' }}>
                      {u.role === 'admin' ? 'Admin' : 'Cliente'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: !u.is_active ? '#C62828' : u.email_verified ? '#2E7D32' : '#E65100', fontWeight: 600 }}>
                      {!u.is_active ? 'Inactivo' : u.email_verified ? 'Activo' : 'Correo pendiente'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--gray-warm)', whiteSpace: 'nowrap' }}>
                    {u.date_joined ? new Date(u.date_joined).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => toggleRole(u)} disabled={updating === u.id} style={btnEdit}>
                        {u.role === 'admin' ? 'Hacer cliente' : 'Hacer admin'}
                      </button>
                      <button onClick={() => toggleActive(u)} disabled={updating === u.id} style={u.is_active ? btnWarn : btnSuccess}>
                        {u.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr><td colSpan={6} style={{ padding: '40px 14px', textAlign: 'center', color: 'var(--gray-warm)' }}>Sin usuarios</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = { padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--navy)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }
const tdStyle: React.CSSProperties = { padding: '10px 14px' }
const btnEdit: React.CSSProperties = { padding: '6px 14px', background: 'var(--cream-warm)', color: 'var(--navy)', border: '1px solid rgba(27,42,74,.1)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }
const btnWarn: React.CSSProperties = { padding: '6px 14px', background: '#FFF3E0', color: '#E65100', border: '1px solid #FFE0B2', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }
const btnSuccess: React.CSSProperties = { padding: '6px 14px', background: '#E8F5E9', color: '#2E7D32', border: '1px solid #C8E6C9', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }
