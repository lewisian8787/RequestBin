import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import basketService from '../services/basketService'

const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

function getEndpointFromBasketValue(basket: string) {
  try {
    const parsed = new URL(basket)
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop()
    return lastSegment || basket
  } catch (err) {
    const lastSegment = basket.split('/').filter(Boolean).pop()
    return lastSegment || basket
  }
}

function normalizeRequestRow(row: any, endpoint: string) {
  const datePart = row.request_date ? String(row.request_date).slice(0, 10) : ''
  const timePart = row.request_time ? String(row.request_time).split('.')[0] : ''
  const combinedDate = datePart && timePart ? `${datePart}T${timePart}` : new Date().toISOString()

  return {
    id: row.id || `${endpoint}-${combinedDate}`,
    method: row.method || 'UNKNOWN',
    headers: row.headers || {},
    body: row.mongoRequestBody?.requestPayload || row.body || '',
    path: row.path || `/${endpoint}`,
    date: combinedDate,
  }
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span className={`method-badge method-badge--${method.toLowerCase()}`}>
      {method}
    </span>
  )
}

const RequestsForBasket = ({ selectedBasket }: { selectedBasket: string }) => {
  const [selectedBasketRequests, setSelectedBasketRequests] = useState<any[]>([])
  const [selectedRequestIndex, setSelectedRequestIndex] = useState<number>(0)
  const [isLive, setIsLive] = useState(false)

  function handleRequestDelete(request: any) {
    const requestId = request.id
    basketService.deleteRequest(requestId)
    .then(() => setSelectedBasketRequests((prev) => prev.filter((r) => r !== request)))
    .catch(error => console.error(error))
  }

  useEffect(() => {
    const endpoint = getEndpointFromBasketValue(selectedBasket)
    setSelectedRequestIndex(0)

    async function loadRequests() {
      try {
        const response = await basketService.getRequests(endpoint)
        const rows = Array.isArray(response.data) ? response.data : []
        const normalizedRequests = rows
          .filter((row: any) => row?.id != null)
          .map((row: any) => normalizeRequestRow(row, endpoint))
        setSelectedBasketRequests(normalizedRequests)
      } catch (err) {
        console.error('Error fetching basket requests', err)
        setSelectedBasketRequests([])
      }
    }

    loadRequests()
  }, [selectedBasket])

  useEffect(() => {
    const endpoint = getEndpointFromBasketValue(selectedBasket)
    const socket = io(backendBaseUrl, {
      transports: ['websocket', 'polling'],
    })

    socket.on('connect', () => setIsLive(true))
    socket.on('disconnect', () => setIsLive(false))

    socket.on('newRequest', (payload: any) => {
      if (!payload || payload.endpoint !== endpoint) return

      const normalizedRequest = normalizeRequestRow(
        {
          ...payload.requestMetadata,
          body: payload.body,
        },
        endpoint
      )

      setSelectedBasketRequests((prev) => {
        if (prev.some((request) => request.id === normalizedRequest.id)) {
          return prev
        }
        return [normalizedRequest, ...prev]
      })
      setSelectedRequestIndex(0)
    })

    return () => {
      socket.disconnect()
      setIsLive(false)
    }
  }, [selectedBasket])

  return (
    <div className="requests-panel">
      <div className="requests-panel-header">
        <h2>// incoming requests</h2>
        <span className={`live-indicator ${isLive ? 'live-indicator--active' : ''}`}>
          <span className="live-dot" />
          {isLive ? 'live' : 'connecting...'}
        </span>
      </div>
      <div className="basket-url-row">
        <p className="basket-url">{selectedBasket}</p>
        <button className="copy-url-button" onClick={() => navigator.clipboard.writeText(selectedBasket)}>Copy URL</button>
      </div>
      <p className="request-total">Total Requests: {selectedBasketRequests.length}</p>
      <div className="requests-layout">
        <div className="request-history">
          {selectedBasketRequests.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-line"><span className="empty-prompt">$</span> waiting for requests...</p>
              <p className="empty-state-hint">send a request to the URL above to see it appear here<span className="cursor" /></p>
            </div>
          ) : (
            selectedBasketRequests.map((request, index) => (
              <div key={request.id || index} className="basket-list-row">
                <button
                  type="button"
                  className={`request-list-item ${selectedRequestIndex === index ? 'active' : ''}`}
                  onClick={() => setSelectedRequestIndex(index)}
                >
                  <MethodBadge method={request.method} />
                  <span className="request-path">{request.path}</span>
                  <span className="request-date">{new Date(request.date).toLocaleString()}</span>
                </button>
                <button className="basket-delete-button" onClick={() => handleRequestDelete(request)}>Delete</button>
              </div>
            ))
          )}
        </div>

        <div className="request-detail-card">
          {selectedBasketRequests[selectedRequestIndex] ? (
            <>
              <p><strong>Method:</strong> <MethodBadge method={selectedBasketRequests[selectedRequestIndex].method} /></p>
              <p><strong>Path:</strong> {selectedBasketRequests[selectedRequestIndex].path}</p>
              <p><strong>Date:</strong> {selectedBasketRequests[selectedRequestIndex].date}</p>
              <p><strong>Headers:</strong></p>
              <pre>{JSON.stringify(selectedBasketRequests[selectedRequestIndex].headers, null, 2)}</pre>
              <p><strong>Body:</strong></p>
              <pre>
                {typeof selectedBasketRequests[selectedRequestIndex].body === "string"
                  ? selectedBasketRequests[selectedRequestIndex].body
                  : JSON.stringify(selectedBasketRequests[selectedRequestIndex].body, null, 2)}
              </pre>
            </>
          ) : (
            <div className="empty-state">
              <p className="empty-state-line"><span className="empty-prompt">$</span> no request selected</p>
              <p className="empty-state-hint">click a request on the left to inspect it<span className="cursor" /></p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default RequestsForBasket
