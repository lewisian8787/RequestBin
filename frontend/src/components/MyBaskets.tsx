import React from 'react'
import basketService from '../services/basketService'

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

const MyBaskets = (props:any) => {

  async function handleDeleteBasket(basket: string) {
    const endpoint = getEndpointFromBasketValue(basket)
    basketService.deleteBasket(endpoint)
      .then(() => { props.onBasketDelete(basket)})
      .catch(error => {console.error(error)})
  }
  
  return (
    <div>
      <h2>// my baskets</h2>
      <p className="subtle-text">Select an endpoint to inspect its requests.</p>
      {props.baskets.map((basket: any) => {
        return (
          <p key={String(basket)} className="basket-list-row">
              <button className="basket-link" type="button" onClick={() => props.onBasketClick(basket)}>
                {basket}
              </button>
              <button className="basket-delete-button" onClick={() => handleDeleteBasket(basket)}>Delete</button>
          </p>  
        )
      })}
    </div>
  )
}

export default MyBaskets
