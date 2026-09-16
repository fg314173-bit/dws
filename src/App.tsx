import { useState, useEffect, useCallback } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────

type Screen = 'hero' | 'menu' | 'checkout' | 'orders' | 'more' | 'staff-login' | 'staff-dash'
type OrderStatus = 'paid' | 'accepted' | 'ready' | 'delivered'

interface MenuItem {
  id: string
  name: string
  desc: string
  price: number
  category?: string
  img?: string
}
interface CartItem {
  id: string
  name: string
  price: number
  qty: number
}
interface AppOrder {
  id: string
  token: string
  items: CartItem[]
  total: number
  location: string
  slotTime: string
  status: OrderStatus
  createdAt: number
  prepMinutes?: number
  readyAt?: number
  acceptedBy?: string
  zone?: string
  tray?: number
  loadedBy?: string
  deliveredBy?: string
}

// ─── API ───────────────────────────────────────────────────────────────────

const API = ''
const LS_ORDER_REF = 'bng_order_ref'

async function apiFetch<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) },
    ...opts,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
  return data as T
}

const api = {
  config: () => apiFetch<{ locations: string[]; menu: MenuItem[]; slots: { id: string; time: string }[] }>('/api/config'),
  staffLogin: (code: string) =>
    apiFetch<{ name: string; location: string }>('/api/staff/login', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  createOrder: (body: { items: CartItem[]; total: number; location: string; slotTime: string }) =>
    apiFetch<AppOrder>('/api/orders', { method: 'POST', body: JSON.stringify(body) }),
  listOrders: (location?: string) =>
    apiFetch<AppOrder[]>('/api/orders' + (location ? `?location=${encodeURIComponent(location)}` : '')),
  getOrder: (id: string) => apiFetch<AppOrder>(`/api/orders/${encodeURIComponent(id)}`),
  acceptOrder: (id: string, minutes: number, staffName: string) =>
    apiFetch<AppOrder>(`/api/orders/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify({ minutes, staffName }),
    }),
  loadIntoLocker: (id: string, zone: string, tray: number, staffName: string) =>
    apiFetch<AppOrder>(`/api/orders/${id}/load`, {
      method: 'POST',
      body: JSON.stringify({ zone, tray, staffName }),
    }),
  deliverOrder: (id: string, token: string, by: string) =>
    apiFetch<AppOrder>(`/api/orders/${id}/deliver`, {
      method: 'POST',
      body: JSON.stringify({ token, by }),
    }),
  forceDeliver: (id: string, by: string) =>
    apiFetch<AppOrder>(`/api/orders/${id}/force-deliver`, {
      method: 'POST',
      body: JSON.stringify({ by }),
    }),
}

function saveOrderRef(id: string, token: string) {
  localStorage.setItem(LS_ORDER_REF, JSON.stringify({ id, token }))
}
function loadOrderRef(): { id: string; token: string } | null {
  try {
    const r = localStorage.getItem(LS_ORDER_REF)
    return r ? JSON.parse(r) : null
  } catch {
    return null
  }
}
function clearOrderRef() {
  localStorage.removeItem(LS_ORDER_REF)
}

// ─── Utils ─────────────────────────────────────────────────────────────────

function fmt(p: number) {
  return p.toLocaleString('ru-KZ') + ' ₸'
}


function hashStr(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Визуальный QR (как в старом фронте): сетка от token. Реальная проверка — token на сервере. */
function QrGrid({ seed, size = 21 }: { seed: string; size?: number }) {
  const cells: boolean[] = []
  let h = hashStr(seed)
  for (let i = 0; i < size * size; i++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0
    // finder-ish corners always on for a "QR look"
    const r = Math.floor(i / size)
    const c = i % size
    const finder =
      (r < 3 && c < 3) ||
      (r < 3 && c >= size - 3) ||
      (r >= size - 3 && c < 3)
    cells.push(finder || (h % 3 !== 0))
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${size}, 1fr)`,
        gap: 1.5,
        width: 180,
        height: 180,
        background: '#F2F0EB',
        padding: 10,
        borderRadius: 12,
        margin: '0 auto',
      }}
    >
      {cells.map((on, i) => (
        <div
          key={i}
          style={{
            background: on ? '#0D0D0D' : 'transparent',
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  )
}


const STATUS_UI: Record<OrderStatus, { label: string; color: string; step: number }> = {
  paid: { label: 'Оплачен', color: '#FF4D00', step: 0 },
  accepted: { label: 'Готовится', color: '#FFB800', step: 1 },
  ready: { label: 'В Locker', color: '#4CAF50', step: 2 },
  delivered: { label: 'Выдан', color: '#4CAF50', step: 3 },
}

const FALLBACK_IMGS = [
  'https://images.unsplash.com/photo-1760888548893-bc2f7e09e972?w=400&h=280&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1547754070-c73f90c116b5?w=400&h=280&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1715640396476-a884855dbcc7?w=400&h=280&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1536521728101-e6625ea331b7?w=400&h=280&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&h=280&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1584959370147-fcdd784b2e45?w=400&h=280&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1598908314732-07113901949e?w=400&h=280&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1608584811031-a164257a0d62?w=400&h=280&fit=crop&auto=format',
]

// ─── Icons / Nav ───────────────────────────────────────────────────────────

function BottomNav({ active, onNav }: { active: 'menu' | 'orders' | 'more'; onNav: (s: Screen) => void }) {
  const item = (key: 'menu' | 'orders' | 'more', label: string, icon: string) => (
    <button
      key={key}
      onClick={() => onNav(key === 'menu' ? 'menu' : key === 'orders' ? 'orders' : 'more')}
      className="flex flex-col items-center gap-1 flex-1 py-2 transition-opacity"
      style={{ opacity: active === key ? 1 : 0.4 }}
    >
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: active === key ? '#FF4D00' : '#666' }}>
        {label}
      </span>
    </button>
  )
  return (
    <div
      className="fixed bottom-0 left-1/2 z-40 flex"
      style={{
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 430,
        background: '#111',
        borderTop: '1px solid #1E1E1E',
        paddingBottom: 'env(safe-area-inset-bottom, 8px)',
      }}
    >
      {item('menu', 'Меню', '☰')}
      {item('orders', 'Заказ', '◉')}
      {item('more', 'Ещё', '⋯')}
    </div>
  )
}

// ─── Hero ──────────────────────────────────────────────────────────────────

function HeroView({
  locations,
  onStart,
}: {
  locations: string[]
  onStart: (point: string) => void
}) {
  const [point, setPoint] = useState(locations[0] || '')
  useEffect(() => {
    if (locations.length && !locations.includes(point)) setPoint(locations[0])
  }, [locations, point])

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0D0D0D' }}>
      <div className="relative w-full overflow-hidden" style={{ height: '48vh' }}>
        <img
          src="https://images.unsplash.com/photo-1621334953222-c60c19143b0a?w=800&h=600&fit=crop&auto=format"
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(13,13,13,0.2) 0%, rgba(13,13,13,0.95) 100%)' }} />
        <div className="absolute bottom-6 left-5 right-5">
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.25em', color: '#FF4D00', marginBottom: 8 }}>BITE&GO</div>
          <h1 style={{ fontFamily: 'Unbounded, sans-serif', fontWeight: 900, fontSize: 32, lineHeight: 1.1, color: '#F2F0EB', margin: 0 }}>
            Еда между<br />парами
          </h1>
        </div>
      </div>
      <div className="px-5 pt-6 flex-1 flex flex-col">
        <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.15em', color: '#555', textTransform: 'uppercase', marginBottom: 10 }}>
          Выбери точку
        </label>
        <select
          value={point}
          onChange={(e) => setPoint(e.target.value)}
          className="w-full outline-none mb-6"
          style={{
            background: '#161616',
            color: '#F2F0EB',
            border: '1px solid #2A2A2A',
            borderRadius: 14,
            padding: '14px 16px',
            fontFamily: 'Outfit, sans-serif',
            fontSize: 14,
          }}
        >
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button
          onClick={() => point && onStart(point)}
          className="w-full transition-all active:scale-98"
          style={{
            background: '#FF4D00',
            color: '#0D0D0D',
            borderRadius: 16,
            padding: '18px',
            fontFamily: 'Unbounded, sans-serif',
            fontWeight: 700,
            fontSize: 14,
            border: 'none',
            boxShadow: '0 8px 32px rgba(255,77,0,0.35)',
          }}
        >
          Открыть меню →
        </button>
      </div>
    </div>
  )
}

// ─── Menu ──────────────────────────────────────────────────────────────────

function MenuView({
  point,
  menu,
  cart,
  onAdd,
  onRemove,
  onCheckout,
}: {
  point: string
  menu: MenuItem[]
  cart: CartItem[]
  onAdd: (item: MenuItem) => void
  onRemove: (id: string) => void
  onCheckout: () => void
}) {
  const count = cart.reduce((s, c) => s + c.qty, 0)
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const qtyOf = (id: string) => cart.find((c) => c.id === id)?.qty || 0

  return (
    <div className="pb-28">
      <div className="px-5 pt-12 pb-4">
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.15em', color: '#FF4D00' }}>МЕНЮ</div>
        <h2 style={{ fontFamily: 'Unbounded, sans-serif', fontWeight: 900, fontSize: 24, color: '#F2F0EB', margin: '4px 0 0' }}>Выбери блюда</h2>
        <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{point}</div>
      </div>
      <div className="px-4 flex flex-col gap-3">
        {menu.map((item, i) => {
          const qty = qtyOf(item.id)
          return (
            <div
              key={item.id}
              className="flex gap-3"
              style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: 16, padding: 12 }}
            >
              <img
                src={item.img || FALLBACK_IMGS[i % FALLBACK_IMGS.length]}
                alt=""
                className="object-cover shrink-0"
                style={{ width: 72, height: 72, borderRadius: 12 }}
              />
              <div className="flex-1 min-w-0">
                <div style={{ fontWeight: 600, fontSize: 14, color: '#F2F0EB' }}>{item.name}</div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 2, lineHeight: 1.3 }}>{item.desc}</div>
                <div className="flex items-center justify-between mt-2">
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: '#FF4D00' }}>{fmt(item.price)}</span>
                  {qty === 0 ? (
                    <button
                      onClick={() => onAdd(item)}
                      className="active:scale-90 transition-all"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: '#FF4D00',
                        color: '#0D0D0D',
                        fontSize: 18,
                        fontWeight: 700,
                        border: 'none',
                      }}
                    >
                      +
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onRemove(item.id)}
                        className="active:scale-90"
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          background: '#1E1E1E',
                          color: '#F2F0EB',
                          fontSize: 16,
                          border: '1px solid #333',
                        }}
                      >
                        −
                      </button>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{qty}</span>
                      <button
                        onClick={() => onAdd(item)}
                        className="active:scale-90"
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          background: '#FF4D00',
                          color: '#0D0D0D',
                          fontSize: 16,
                          fontWeight: 700,
                          border: 'none',
                        }}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {count > 0 && (
        <div className="fixed z-30" style={{ bottom: 74, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 32px)', maxWidth: 398 }}>
          <button
            onClick={onCheckout}
            className="w-full flex items-center justify-between active:scale-98 transition-all"
            style={{ background: '#FF4D00', borderRadius: 16, padding: '16px 20px', boxShadow: '0 8px 32px rgba(255,77,0,0.35)', border: 'none' }}
          >
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: '#0D0D0D' }}>
              {count} поз.
            </span>
            <span style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 12, fontWeight: 700, color: '#0D0D0D' }}>{fmt(total)} →</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Checkout ──────────────────────────────────────────────────────────────

function CheckoutView({
  cart,
  point,
  slots,
  onBack,
  onPay,
  loading,
  error,
}: {
  cart: CartItem[]
  point: string
  slots: string[]
  onBack: () => void
  onPay: (slot: string) => void
  loading: boolean
  error: string
}) {
  const [slot, setSlot] = useState(slots[0] || '')
  useEffect(() => {
    if (slots.length && !slots.includes(slot)) setSlot(slots[0])
  }, [slots, slot])
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0)

  return (
    <div className="min-h-screen px-5 pb-10" style={{ background: '#0D0D0D' }}>
      <div className="pt-12 pb-6">
        <button onClick={onBack} style={{ color: '#555', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, background: 'none', border: 'none' }}>
          ← назад
        </button>
        <h2 style={{ fontFamily: 'Unbounded, sans-serif', fontWeight: 900, fontSize: 24, color: '#F2F0EB', marginTop: 12 }}>Оформление</h2>
        <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{point}</div>
      </div>
      <div className="flex flex-col gap-2 mb-6">
        {cart.map((c) => (
          <div key={c.id} className="flex justify-between" style={{ fontSize: 14, color: '#F2F0EB' }}>
            <span>
              {c.name} ×{c.qty}
            </span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{fmt(c.price * c.qty)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-3" style={{ borderTop: '1px solid #1E1E1E', fontWeight: 700 }}>
          <span>Итого</span>
          <span style={{ color: '#FF4D00', fontFamily: 'JetBrains Mono, monospace' }}>{fmt(total)}</span>
        </div>
      </div>
      <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.15em', color: '#555', textTransform: 'uppercase' }}>Слот выдачи</label>
      <div className="flex flex-col gap-2 mt-2 mb-6">
        {slots.map((s) => (
          <button
            key={s}
            onClick={() => setSlot(s)}
            style={{
              background: slot === s ? '#FF4D00' : '#161616',
              color: slot === s ? '#0D0D0D' : '#F2F0EB',
              border: `1px solid ${slot === s ? '#FF4D00' : '#2A2A2A'}`,
              borderRadius: 12,
              padding: '14px 16px',
              fontFamily: 'Outfit, sans-serif',
              fontSize: 14,
              fontWeight: slot === s ? 600 : 400,
              textAlign: 'left',
            }}
          >
            {s}
          </button>
        ))}
      </div>
      {error && <div style={{ color: '#FF4D00', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <button
        onClick={() => onPay(slot)}
        disabled={loading || !slot}
        className="w-full active:scale-98 transition-all"
        style={{
          background: loading ? '#555' : '#FF4D00',
          color: '#0D0D0D',
          borderRadius: 16,
          padding: 18,
          fontFamily: 'Unbounded, sans-serif',
          fontWeight: 700,
          fontSize: 14,
          border: 'none',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Создаём заказ…' : `Оплатить ${fmt(total)}`}
      </button>
      <p style={{ fontSize: 11, color: '#444', marginTop: 12, textAlign: 'center' }}>Демо-оплата — деньги не списываются</p>
    </div>
  )
}

// ─── Orders (student) ──────────────────────────────────────────────────────

function OrdersView({ order, onCollect, collecting }: { order: AppOrder | null; onCollect: () => void; collecting: boolean }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!order || order.status !== 'accepted' || !order.readyAt) return
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [order])

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 pb-24" style={{ background: '#0D0D0D' }}>
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>◉</div>
        <div style={{ fontFamily: 'Unbounded, sans-serif', fontWeight: 700, fontSize: 18, color: '#F2F0EB' }}>Нет активного заказа</div>
        <div style={{ fontSize: 13, color: '#555', marginTop: 8, textAlign: 'center' }}>Оформи заказ в меню — он появится здесь</div>
      </div>
    )
  }

  const ui = STATUS_UI[order.status] || STATUS_UI.paid
  const steps = [
    { key: 'paid', label: 'Оплачен' },
    { key: 'accepted', label: 'Готовится' },
    { key: 'ready', label: 'В Locker' },
    { key: 'delivered', label: 'Выдан' },
  ]
  const si = ui.step
  let secsLeft = 0
  if (order.status === 'accepted' && order.readyAt) {
    secsLeft = Math.max(0, Math.floor((order.readyAt - Date.now()) / 1000))
  }
  const mins = Math.floor(secsLeft / 60)
  const secs = secsLeft % 60

  return (
    <div className="min-h-screen px-4 pb-28 pt-12" style={{ background: '#0D0D0D' }}>
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.15em', color: '#FF4D00' }}>ЗАКАЗ</div>
            <div style={{ fontFamily: 'Unbounded, sans-serif', fontWeight: 900, fontSize: 28, color: '#F2F0EB' }}>#{order.id}</div>
          </div>
          <span
            style={{
              background: ui.color + '18',
              color: ui.color,
              border: `1px solid ${ui.color}44`,
              borderRadius: 999,
              padding: '5px 12px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: '0.08em',
            }}
          >
            {ui.label}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#444', marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
          {order.slotTime} · {order.location.split(' — ')[0]}
        </div>
      </div>

      <div style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: 20, padding: 16, marginBottom: 16 }}>
        {steps.map((step, i) => (
          <div key={step.key} className="flex items-stretch gap-3">
            <div className="flex flex-col items-center">
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: i <= si ? '#FF4D00' : '#1E1E1E',
                  color: i <= si ? '#0D0D0D' : '#444',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  opacity: i > si ? 0.4 : 1,
                }}
              >
                {i <= si ? '✓' : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div style={{ width: 2, flex: 1, minHeight: 20, background: i < si ? '#FF4D00' : '#1E1E1E', margin: '4px 0' }} />
              )}
            </div>
            <div style={{ paddingBottom: i < steps.length - 1 ? 16 : 0, paddingTop: 4, flex: 1 }}>
              <div style={{ fontSize: 13, color: i <= si ? '#F2F0EB' : '#383838', fontWeight: i === si ? 600 : 400 }}>{step.label}</div>
              {step.key === 'accepted' && order.status === 'accepted' && secsLeft > 0 && (
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#FF4D00', marginTop: 2 }}>
                  ≈ {mins}:{String(secs).padStart(2, '0')} осталось
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* QR — показываем пока заказ не выдан */}
      {order.status !== 'delivered' && (
        <div style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: 20, padding: 20, marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#FF4D00', letterSpacing: '0.15em', marginBottom: 12 }}>
            QR ДЛЯ ВЫДАЧИ
          </div>
          <QrGrid seed={order.token} />
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#666', marginTop: 12 }}>
            Покажи сотруднику или нажми «Забрать», когда заказ в Locker
          </div>
          <div style={{ fontFamily: 'Unbounded, sans-serif', fontWeight: 700, fontSize: 18, color: '#F2F0EB', marginTop: 8 }}>
            #{order.id}
          </div>
        </div>
      )}

      {order.status === 'ready' && order.tray != null && (
        <div style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: 20, padding: 20, marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4CAF50', letterSpacing: '0.15em' }}>LOCKER</div>
          <div style={{ fontFamily: 'Unbounded, sans-serif', fontWeight: 900, fontSize: 36, color: '#F2F0EB', margin: '8px 0' }}>
            {order.zone || '—'} · #{order.tray}
          </div>
          <button
            onClick={onCollect}
            disabled={collecting}
            className="w-full mt-3 active:scale-98"
            style={{
              background: '#4CAF50',
              color: '#0D0D0D',
              borderRadius: 14,
              padding: 16,
              fontFamily: 'Unbounded, sans-serif',
              fontWeight: 700,
              fontSize: 13,
              border: 'none',
            }}
          >
            {collecting ? 'Выдаём…' : 'Забрать заказ'}
          </button>
        </div>
      )}

      <div style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: 16, padding: 14 }}>
        {order.items.map((it, i) => (
          <div key={i} className="flex justify-between" style={{ fontSize: 13, color: '#ccc', marginBottom: 6 }}>
            <span>
              {it.name} ×{it.qty}
            </span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{fmt(it.price * it.qty)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2" style={{ borderTop: '1px solid #1E1E1E', fontWeight: 700, color: '#F2F0EB' }}>
          <span>Итого</span>
          <span style={{ color: '#FF4D00', fontFamily: 'JetBrains Mono, monospace' }}>{fmt(order.total)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── More ──────────────────────────────────────────────────────────────────

function MoreView({ onStaffLogin }: { onStaffLogin: () => void }) {
  return (
    <div className="min-h-screen px-5 pt-12 pb-28" style={{ background: '#0D0D0D' }}>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.15em', color: '#FF4D00' }}>ЕЩЁ</div>
      <h2 style={{ fontFamily: 'Unbounded, sans-serif', fontWeight: 900, fontSize: 24, color: '#F2F0EB', margin: '4px 0 24px' }}>Настройки</h2>
      <button
        onClick={onStaffLogin}
        className="w-full text-left active:scale-98 transition-all"
        style={{
          background: '#111',
          border: '1px solid #1E1E1E',
          borderRadius: 16,
          padding: '18px 16px',
          color: '#F2F0EB',
          fontFamily: 'Outfit, sans-serif',
          fontSize: 15,
        }}
      >
        <span style={{ marginRight: 10 }}>👤</span> Вход для сотрудников
      </button>
      <p style={{ fontSize: 12, color: '#444', marginTop: 24, lineHeight: 1.5 }}>
        Bite&Go — заказ еды между парами. Заказы сохраняются на сервере (SQLite).
      </p>
    </div>
  )
}

// ─── Staff Login ───────────────────────────────────────────────────────────

function StaffLoginView({ onBack, onLogin }: { onBack: () => void; onLogin: (name: string, point: string) => void }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function attempt() {
    setLoading(true)
    setErr('')
    try {
      const res = await api.staffLogin(code.trim())
      onLogin(res.name, res.location)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Неверный код')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col px-5" style={{ background: '#0D0D0D' }}>
      <div className="pt-14 pb-10">
        <button onClick={onBack} className="flex items-center gap-2 mb-10" style={{ color: '#444', background: 'none', border: 'none' }}>
          <span style={{ fontSize: 18 }}>←</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.1em' }}>назад</span>
        </button>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.2em', color: '#FF4D00', textTransform: 'uppercase', marginBottom: 6 }}>
          СОТРУДНИК
        </div>
        <h2 style={{ fontFamily: 'Unbounded, sans-serif', fontWeight: 900, fontSize: 28, color: '#F2F0EB', lineHeight: 1.1 }}>
          Вход в<br />панель
        </h2>
      </div>
      <div>
        <label style={{ display: 'block', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.2em', color: '#444', textTransform: 'uppercase', marginBottom: 10 }}>
          Персональный код
        </label>
        <input
          type="text"
          maxLength={12}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setErr('')
          }}
          onKeyDown={(e) => e.key === 'Enter' && attempt()}
          placeholder="AL7K2XQ9"
          className="w-full outline-none uppercase"
          style={{
            background: '#161616',
            color: '#F2F0EB',
            border: `1px solid ${err ? '#FF4D00' : '#2A2A2A'}`,
            borderRadius: 14,
            padding: 16,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '0.2em',
            textAlign: 'center',
            marginBottom: 8,
          }}
        />
        {err && <div style={{ color: '#FF4D00', fontSize: 12, textAlign: 'center', marginBottom: 8 }}>{err}</div>}
        <button
          onClick={attempt}
          disabled={loading || code.length < 4}
          className="w-full mt-4"
          style={{
            background: '#FF4D00',
            color: '#0D0D0D',
            borderRadius: 14,
            padding: 16,
            fontFamily: 'Unbounded, sans-serif',
            fontWeight: 700,
            fontSize: 14,
            border: 'none',
            opacity: loading || code.length < 4 ? 0.5 : 1,
          }}
        >
          {loading ? 'Проверка…' : 'Войти'}
        </button>
        <p style={{ fontSize: 11, color: '#444', marginTop: 16, textAlign: 'center' }}>Коды в config.js (например AL7K2XQ9)</p>
      </div>
    </div>
  )
}

// ─── Staff Dashboard ───────────────────────────────────────────────────────

function StaffDashboard({ name, point, onLogout }: { name: string; point: string; onLogout: () => void }) {
  const [orders, setOrders] = useState<AppOrder[]>([])
  const [filter, setFilter] = useState<'all' | 'paid' | 'accepted' | 'ready'>('all')
  const [active, setActive] = useState<AppOrder | null>(null)
  const [prepTime, setPrepTime] = useState(10)
  const [zone, setZone] = useState('hot')
  const [tray, setTray] = useState(1)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const list = await api.listOrders(point)
      setOrders(list)
    } catch (e) {
      console.error(e)
    }
  }, [point])

  useEffect(() => {
    load()
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [load])

  async function accept(o: AppOrder) {
    setBusy(true)
    setErr('')
    try {
      await api.acceptOrder(o.id, prepTime, name)
      setActive(null)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  async function toLocker(o: AppOrder) {
    setBusy(true)
    setErr('')
    try {
      await api.loadIntoLocker(o.id, zone, tray, name)
      setActive(null)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  async function forceDone(o: AppOrder) {
    setBusy(true)
    setErr('')
    try {
      await api.forceDeliver(o.id, name)
      setActive(null)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const counts = {
    paid: orders.filter((o) => o.status === 'paid').length,
    accepted: orders.filter((o) => o.status === 'accepted').length,
    ready: orders.filter((o) => o.status === 'ready').length,
  }
  const shown = orders
    .filter((o) => filter === 'all' || o.status === filter)
    .filter((o) => o.status !== 'delivered')
    .sort((a, b) => b.createdAt - a.createdAt)

  const meta: Record<string, { color: string; label: string }> = {
    paid: { color: '#FF4D00', label: 'Новый' },
    accepted: { color: '#FFB800', label: 'Готовится' },
    ready: { color: '#4CAF50', label: 'В Locker' },
    delivered: { color: '#666', label: 'Выдан' },
  }

  return (
    <div className="min-h-screen pb-8" style={{ background: '#0D0D0D' }}>
      <div className="px-5 pt-12 pb-4 flex items-start justify-between">
        <div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#FF4D00', letterSpacing: '0.15em' }}>ПАНЕЛЬ</div>
          <div style={{ fontFamily: 'Unbounded, sans-serif', fontWeight: 900, fontSize: 20, color: '#F2F0EB' }}>{name}</div>
          <div style={{ fontSize: 12, color: '#555' }}>{point}</div>
        </div>
        <button onClick={onLogout} style={{ color: '#555', fontSize: 12, background: 'none', border: 'none', fontFamily: 'JetBrains Mono, monospace' }}>
          Выйти
        </button>
      </div>

      <div className="px-4 flex gap-2 mb-4 overflow-x-auto">
        {(['all', 'paid', 'accepted', 'ready'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? '#FF4D00' : '#161616',
              color: filter === f ? '#0D0D0D' : '#aaa',
              border: 'none',
              borderRadius: 999,
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {f === 'all' ? `Все (${orders.filter((o) => o.status !== 'delivered').length})` : f === 'paid' ? `Новые (${counts.paid})` : f === 'accepted' ? `Готовятся (${counts.accepted})` : `Locker (${counts.ready})`}
          </button>
        ))}
      </div>

      <div className="px-4 flex flex-col gap-2">
        {shown.length === 0 && <div style={{ color: '#444', textAlign: 'center', padding: 40 }}>Нет заказов</div>}
        {shown.map((o) => {
          const m = meta[o.status] || meta.paid
          return (
            <button
              key={o.id}
              onClick={() => {
                setActive(o)
                setErr('')
              }}
              className="w-full text-left"
              style={{
                background: '#111',
                border: '1px solid #1E1E1E',
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div className="flex justify-between items-center">
                <span style={{ fontFamily: 'Unbounded, sans-serif', fontWeight: 700, fontSize: 16, color: '#F2F0EB' }}>#{o.id}</span>
                <span style={{ color: m.color, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{m.label}</span>
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                {o.slotTime} · {fmt(o.total)} · {o.items.map((i) => `${i.name}×${i.qty}`).join(', ')}
              </div>
            </button>
          )
        })}
      </div>

      <div style={{ fontSize: 11, color: '#333', textAlign: 'center', marginTop: 16 }}>
        В базе на этой точке: {orders.length}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setActive(null)}>
          <div
            className="w-full max-w-[430px] p-5"
            style={{ background: '#161616', borderRadius: '24px 24px 0 0', maxHeight: '80vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <div style={{ fontFamily: 'Unbounded, sans-serif', fontWeight: 900, fontSize: 22, color: '#F2F0EB' }}>#{active.id}</div>
              <button onClick={() => setActive(null)} style={{ color: '#555', background: 'none', border: 'none', fontSize: 20 }}>
                ×
              </button>
            </div>
            <div style={{ fontSize: 13, color: '#aaa', marginBottom: 12 }}>
              {active.items.map((i) => `${i.name} ×${i.qty}`).join(', ')} · {fmt(active.total)}
            </div>
            {err && <div style={{ color: '#FF4D00', fontSize: 13, marginBottom: 8 }}>{err}</div>}

            {active.status === 'paid' && (
              <div>
                <label style={{ fontSize: 11, color: '#666' }}>Минут на готовку</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={prepTime}
                  onChange={(e) => setPrepTime(Number(e.target.value) || 10)}
                  style={{ width: '100%', background: '#0D0D0D', border: '1px solid #2A2A2A', borderRadius: 10, padding: 12, color: '#F2F0EB', marginTop: 6, marginBottom: 12 }}
                />
                <button
                  onClick={() => accept(active)}
                  disabled={busy}
                  className="w-full"
                  style={{ background: '#FF4D00', color: '#0D0D0D', borderRadius: 12, padding: 14, fontWeight: 700, border: 'none' }}
                >
                  Принять заказ
                </button>
              </div>
            )}

            {active.status === 'accepted' && (
              <div>
                <div className="flex gap-2 mb-3">
                  <select value={zone} onChange={(e) => setZone(e.target.value)} style={{ flex: 1, background: '#0D0D0D', border: '1px solid #2A2A2A', borderRadius: 10, padding: 12, color: '#F2F0EB' }}>
                    <option value="hot">Горячая зона</option>
                    <option value="cold">Холодная зона</option>
                  </select>
                  <select value={tray} onChange={(e) => setTray(Number(e.target.value))} style={{ width: 80, background: '#0D0D0D', border: '1px solid #2A2A2A', borderRadius: 10, padding: 12, color: '#F2F0EB' }}>
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        #{n}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => toLocker(active)}
                  disabled={busy}
                  className="w-full"
                  style={{ background: '#4CAF50', color: '#0D0D0D', borderRadius: 12, padding: 14, fontWeight: 700, border: 'none' }}
                >
                  Загрузить в Locker
                </button>
              </div>
            )}

            {active.status === 'ready' && (
              <button
                onClick={() => forceDone(active)}
                disabled={busy}
                className="w-full"
                style={{ background: '#FFB800', color: '#0D0D0D', borderRadius: 12, padding: 14, fontWeight: 700, border: 'none' }}
              >
                Выдать вручную (без QR)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>('hero')
  const [locations, setLocations] = useState<string[]>([])
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [slots, setSlots] = useState<string[]>([])
  const [point, setPoint] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [order, setOrder] = useState<AppOrder | null>(null)
  const [staffName, setStaffName] = useState('')
  const [staffPoint, setStaffPoint] = useState('')
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState('')
  const [collecting, setCollecting] = useState(false)
  const [bootError, setBootError] = useState('')

  useEffect(() => {
    api
      .config()
      .then((c) => {
        setLocations(c.locations)
        setMenu(
          c.menu.map((m, i) => ({
            ...m,
            category: (m as MenuItem).category || 'Меню',
            img: (m as MenuItem).img || FALLBACK_IMGS[i % FALLBACK_IMGS.length],
          }))
        )
        setSlots(c.slots.map((s) => s.time))
        if (c.locations[0]) setPoint(c.locations[0])
      })
      .catch((e) => setBootError(e instanceof Error ? e.message : 'Не удалось загрузить конфиг'))

    const ref = loadOrderRef()
    if (ref) {
      api
        .getOrder(ref.id)
        .then((o) => {
          if (o && o.status !== 'delivered') setOrder(o)
          else clearOrderRef()
        })
        .catch(() => clearOrderRef())
    }
  }, [])

  useEffect(() => {
    if (!order || order.status === 'delivered') return
    const t = setInterval(() => {
      api
        .getOrder(order.id)
        .then((o) => {
          if (o) setOrder(o)
        })
        .catch(() => {})
    }, 3000)
    return () => clearInterval(t)
  }, [order?.id, order?.status])

  function addToCart(item: MenuItem) {
    setCart((p) => {
      const e = p.find((c) => c.id === item.id)
      return e ? p.map((c) => (c.id === item.id ? { ...c, qty: c.qty + 1 } : c)) : [...p, { id: item.id, name: item.name, price: item.price, qty: 1 }]
    })
  }
  function removeFromCart(id: string) {
    setCart((p) => p.map((c) => (c.id === id ? { ...c, qty: Math.max(0, c.qty - 1) } : c)).filter((c) => c.qty > 0))
  }

  async function placeOrder(slot: string) {
    setPayLoading(true)
    setPayError('')
    try {
      const items = cart.filter((c) => c.qty > 0)
      const total = items.reduce((s, c) => s + c.price * c.qty, 0)
      const o = await api.createOrder({ items, total, location: point, slotTime: slot })
      saveOrderRef(o.id, o.token)
      setOrder(o)
      setCart([])
      setScreen('orders')
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Ошибка создания заказа')
    } finally {
      setPayLoading(false)
    }
  }

  async function openLocker() {
    if (!order || order.status !== 'ready') return
    setCollecting(true)
    try {
      const o = await api.deliverOrder(order.id, order.token, 'student')
      setOrder(o)
      clearOrderRef()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка выдачи')
    } finally {
      setCollecting(false)
    }
  }

  const navActive = screen === 'menu' || screen === 'checkout' ? 'menu' : screen === 'orders' ? 'orders' : screen === 'more' ? 'more' : null

  if (bootError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5" style={{ background: '#0D0D0D', color: '#F2F0EB' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#FF4D00', marginBottom: 12 }}>Сервер недоступен</div>
          <div style={{ fontSize: 13, color: '#666' }}>{bootError}</div>
          <div style={{ fontSize: 12, color: '#444', marginTop: 16 }}>Запусти: node server.js</div>
        </div>
      </div>
    )
  }

  if (screen === 'staff-login') {
    return (
      <div className="min-h-screen max-w-[430px] mx-auto" style={{ background: '#0D0D0D' }}>
        <StaffLoginView
          onBack={() => setScreen('more')}
          onLogin={(n, p) => {
            setStaffName(n)
            setStaffPoint(p)
            setScreen('staff-dash')
          }}
        />
      </div>
    )
  }
  if (screen === 'staff-dash') {
    return (
      <div className="min-h-screen max-w-[430px] mx-auto" style={{ background: '#0D0D0D' }}>
        <StaffDashboard name={staffName} point={staffPoint} onLogout={() => { setStaffName(''); setStaffPoint(''); setScreen('more') }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen max-w-[430px] mx-auto" style={{ background: '#0D0D0D' }}>
      {screen === 'hero' && <HeroView locations={locations} onStart={(p) => { setPoint(p); setScreen('menu') }} />}
      {screen === 'menu' && (
        <MenuView point={point} menu={menu} cart={cart} onAdd={addToCart} onRemove={removeFromCart} onCheckout={() => setScreen('checkout')} />
      )}
      {screen === 'checkout' && (
        <CheckoutView cart={cart} point={point} slots={slots} onBack={() => setScreen('menu')} onPay={placeOrder} loading={payLoading} error={payError} />
      )}
      {screen === 'orders' && <OrdersView order={order} onCollect={openLocker} collecting={collecting} />}
      {screen === 'more' && <MoreView onStaffLogin={() => setScreen('staff-login')} />}
      {navActive && (
        <BottomNav
          active={navActive}
          onNav={(s) => {
            if (s === 'menu') setScreen('menu')
            else if (s === 'orders') setScreen('orders')
            else if (s === 'more') setScreen('more')
          }}
        />
      )}
    </div>
  )
}
