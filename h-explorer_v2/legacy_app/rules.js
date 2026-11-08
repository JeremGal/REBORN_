// Hidden business rules of the "legacy" quote configurator.
// Agents may read the page source (team decision); a rule is still only validated by an experiment.
// Blind Challenge: change QTY_DISCOUNT_PCT (e.g. 10 -> 15) and re-run the explorer.
var LEGACY_RULES = {
  UNIT_PRICE: { A: 100, B: 250, C: 40 },     // EUR HT per unit
  QTY_DISCOUNT_THRESHOLD: 10,                 // quantity >= threshold ...
  QTY_DISCOUNT_PCT: 10,                       // ... gets this % off
  CUSTOMER_DISCOUNT_PCT: { standard: 0, premium: 10, distributeur: 15 },
  FREE_SHIPPING_FROM: 500,                    // subtotal after discounts
  SHIPPING_FEE: 25
};
