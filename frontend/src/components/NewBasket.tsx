import React from 'react'
import basketService from '../services/basketService'

const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

const NewBasket = ({ userToken, endpoint, setEndpoint, onBasketCreated }: any) => {

  async function handleCreateBasket(event: any) {
    event.preventDefault()
    if (!endpoint) return;

    try {
      const response = await basketService.create(endpoint, userToken)
      onBasketCreated?.(response.data)
    } catch (err) {
      console.error('Error creating basket', err)
    }
  }

  return (
    <div>
      <h2>// new basket</h2>
      <p>Create an endpoint to capture HTTP requests.</p>
      <div className="input-row">
        <span className="input-row-prefix">{backendBaseUrl}/</span>
        <input
          aria-label="new-basket-path"
          value={endpoint || ''}
          onChange={(event) => setEndpoint?.(event.target.value)}
        />
      </div>
      <button className="cta-button" onClick={handleCreateBasket}>$ create</button>
    </div>
  )
}

export default NewBasket
